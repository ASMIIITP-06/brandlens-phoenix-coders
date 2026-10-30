import express, { NextFunction, Request, Response } from 'express';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import mammoth from 'mammoth';
import { runDeterministicPreflight } from './src/services/engine';
import { Finding, KnowledgeItem } from './src/types/brandlens';
import { createFirebaseTokenVerifier } from './server/auth';
import { FirestoreRestStore } from './server/firestoreStore';
import { CampaignStore } from './server/campaignStore';
import { campaignErrorHandler, createCampaignRouter } from './server/campaignRoutes';
import { createGeminiAssetReviewer } from './server/geminiReviewer';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
// Cloud Run injects PORT; 3000 stays the local default.
const PORT = Number(process.env.PORT || 3000);

app.disable('x-powered-by');
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});
app.use(express.json({ limit: '25mb' }));

const geminiApiKey = process.env.GEMINI_API_KEY || '';
let aiClient: GoogleGenAI | null = null;
if (geminiApiKey) {
  try {
    aiClient = new GoogleGenAI({ apiKey: geminiApiKey });
  } catch (err) {
    console.warn('Failed to initialize GoogleGenAI client:', err);
  }
}

/* ------------------------------------------------------------------ *
 * Campaign Compliance Studio API
 * ------------------------------------------------------------------ */
interface FirebaseWebConfig {
  projectId?: string;
  firestoreDatabaseId?: string;
}

function loadFirebaseWebConfig(): FirebaseWebConfig {
  try {
    const raw = fs.readFileSync(path.resolve(__dirname, 'firebase-applet-config.json'), 'utf8');
    return JSON.parse(raw) as FirebaseWebConfig;
  } catch {
    return {};
  }
}

const firebaseWebConfig = loadFirebaseWebConfig();
const firebaseProjectId = process.env.FIREBASE_PROJECT_ID || firebaseWebConfig.projectId || '';
const firestoreDatabaseId =
  process.env.FIRESTORE_DATABASE_ID || firebaseWebConfig.firestoreDatabaseId || '(default)';

let campaignAiReviewer = null as ReturnType<typeof createGeminiAssetReviewer> | null;
if (geminiApiKey) {
  try {
    campaignAiReviewer = createGeminiAssetReviewer(geminiApiKey);
  } catch (err) {
    console.warn('Campaign AI reviewer unavailable, deterministic rules only:', err);
  }
}

if (firebaseProjectId) {
  const verifier = createFirebaseTokenVerifier(firebaseProjectId);
  const createStore = (params: { workspaceId: string; idToken: string }): CampaignStore =>
    new FirestoreRestStore(
      { projectId: firebaseProjectId, databaseId: firestoreDatabaseId },
      params.idToken
    );

  app.use(
    '/api/workspaces/:workspaceId/campaigns',
    createCampaignRouter({ verifier, createStore, aiReviewer: campaignAiReviewer })
  );
  app.use('/api/workspaces/:workspaceId/campaigns', campaignErrorHandler);
} else {
  console.warn(
    'Campaign Compliance Studio API disabled: firebase project id not configured (FIREBASE_PROJECT_ID).'
  );
}

// 1. Engine status endpoint
app.get('/api/engine-status', (_req: Request, res: Response) => {
  res.json({
    status: 'online',
    aiEnabled: Boolean(geminiApiKey && aiClient),
    model: geminiApiKey ? 'gemini-3.8-flash' : 'none (deterministic rules active)',
    engineMode: geminiApiKey ? 'Source-grounded AI + Rules enabled' : 'Rules-only mode',
    campaignStudio: Boolean(firebaseProjectId),
    supportedFileTypes: ['.txt', '.docx'],
    version: '2.0.0-mvp'
  });
});

// 2. Document parser endpoint
app.post('/api/parse-doc', async (req: Request, res: Response) => {
  try {
    const { fileName, base64Content, mimeType } = req.body;
    if (!base64Content || !fileName) {
      res.status(400).json({ error: 'Missing fileName or base64Content' });
      return;
    }

    const buffer = Buffer.from(base64Content, 'base64');
    const lowerName = fileName.toLowerCase();

    if (lowerName.endsWith('.txt') || mimeType === 'text/plain') {
      const text = buffer.toString('utf-8');
      res.json({ text, fileName, charCount: text.length });
      return;
    }

    if (lowerName.endsWith('.docx') || mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const result = await mammoth.extractRawText({ buffer });
      res.json({ text: result.value, fileName, charCount: result.value.length, warnings: result.messages });
      return;
    }

    res.status(400).json({
      error: `Unsupported file type "${path.extname(fileName)}". BrandLens currently accepts .txt and .docx. Please paste text directly or provide a supported document format.`
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Doc parse error:', message);
    res.status(500).json({ error: `Document extraction failed: ${message}` });
  }
});

// 3. Content review preflight check endpoint
app.post('/api/check-content', async (req: Request, res: Response) => {
  try {
    const { text, channel = 'website', knowledgeItems = [], reviewId = 'rev-temp', workspaceId = 'demo-workspace' } = req.body;

    if (!text || typeof text !== 'string') {
      res.status(400).json({ error: 'Draft text is required' });
      return;
    }

    // Always run deterministic checks first
    const deterministicResult = runDeterministicPreflight(
      text,
      channel,
      knowledgeItems as KnowledgeItem[],
      reviewId,
      workspaceId
    );

    let finalFindings: Finding[] = [...deterministicResult.findings];
    let activeEngineMode: 'Rules-only mode' | 'Source-grounded AI + Rules enabled' = 'Rules-only mode';

    // If Gemini API is available, augment with source-grounded LLM review
    if (aiClient && geminiApiKey) {
      activeEngineMode = 'Source-grounded AI + Rules enabled';
      try {
        const knowledgeSummaries = (knowledgeItems as KnowledgeItem[]).map((k) => ({
          id: k.id,
          type: k.type,
          title: k.title,
          sourceName: k.sourceName,
          sourceText: k.sourceText || k.body,
          status: k.status,
          expiresAt: k.expiresAt
        }));

        const prompt = `You are the BrandLens preflight governance engine.
Analyze the submitted draft copy against the APPROVED KNOWLEDGE BASE below.
Draft Copy:
"""
${text}
"""
Publishing Channel: ${channel}

Approved Knowledge Base:
${JSON.stringify(knowledgeSummaries, null, 2)}

STRICT RULES:
1. Identify any claims that contradict the approved knowledge base, use prohibited terms, state universal unverified guarantees, or lack approved evidence.
2. If a claim has no matching evidence in the approved knowledge base, you MUST set evidenceStatus to "unsupported", evidenceIds to [], and evidenceSourceName to "No approved evidence found". NEVER fabricate or imagine a source ID.
3. Suggest a realistic, professional brand revision that preserves human editorial intent.
4. Return ONLY a valid JSON array of findings with this exact schema:
[
  {
    "category": "Tone & Voice" | "Terminology" | "Facts & Freshness" | "Promotional Claims" | "Visual Consistency" | "Accessibility",
    "severity": "high" | "medium" | "low",
    "excerpt": "exact phrase from text",
    "rationale": "plain explanation of why flagged",
    "evidenceStatus": "supported" | "unsupported" | "expired_source" | "conflict",
    "evidenceIds": ["only valid IDs from the provided knowledge base, or empty if unsupported"],
    "evidenceSourceName": "sourceName or 'No approved evidence found'",
    "evidenceSourceText": "exact quote from source or explanation",
    "suggestedRevision": "improved compliant replacement phrase",
    "confidence": 0.95
  }
]`;

        const response = await aiClient.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
          },
        });

        if (response && response.text) {
          const parsed = JSON.parse(response.text);
          if (Array.isArray(parsed)) {
            // Validate evidence IDs against supplied knowledge items
            const validIds = new Set((knowledgeItems as KnowledgeItem[]).map((k) => k.id));
            const aiFindings: Finding[] = parsed.map((item, idx) => {
              const safeEvidenceIds = Array.isArray(item.evidenceIds)
                ? item.evidenceIds.filter((id: string) => validIds.has(id))
                : [];
              const isSupported = safeEvidenceIds.length > 0 && item.evidenceStatus !== 'unsupported';

              return {
                id: `fnd-ai-${Date.now()}-${idx}`,
                reviewId,
                workspaceId,
                category: item.category || 'Promotional Claims',
                severity: item.severity || 'medium',
                excerpt: item.excerpt || text.slice(0, 50),
                ruleId: item.ruleId || 'rule-ai-grounded',
                rationale: item.rationale || 'Flagged during source-grounded governance analysis.',
                evidenceStatus: isSupported ? item.evidenceStatus : 'unsupported',
                evidenceIds: safeEvidenceIds,
                evidenceSourceName: isSupported ? (item.evidenceSourceName || 'Approved Knowledge Base') : 'No approved evidence found',
                evidenceSourceText: item.evidenceSourceText || (isSupported ? '' : 'No approved knowledge item supports this assertion in the workspace.'),
                suggestedRevision: item.suggestedRevision || '',
                confidence: typeof item.confidence === 'number' ? item.confidence : 0.9,
                status: 'open',
                createdAt: new Date().toISOString(),
              };
            });

            // Deduplicate with deterministic findings
            for (const aiF of aiFindings) {
              const alreadyFound = finalFindings.some(
                (df) => df.excerpt.toLowerCase().includes(aiF.excerpt.toLowerCase()) ||
                        aiF.excerpt.toLowerCase().includes(df.excerpt.toLowerCase())
              );
              if (!alreadyFound) {
                finalFindings.push(aiF);
              }
            }
          }
        }
      } catch (aiErr) {
        console.warn('AI preflight check encountered an error, keeping deterministic findings:', aiErr);
      }
    }

    res.json({
      findings: finalFindings,
      engineMode: activeEngineMode,
      executionTimeMs: deterministicResult.executionTimeMs,
      stats: {
        total: finalFindings.length,
        high: finalFindings.filter((f) => f.severity === 'high').length,
        medium: finalFindings.filter((f) => f.severity === 'medium').length,
        low: finalFindings.filter((f) => f.severity === 'low').length,
        supportedCount: finalFindings.filter((f) => f.evidenceStatus === 'supported').length,
        unsupportedCount: finalFindings.filter((f) => f.evidenceStatus === 'unsupported').length,
      }
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `Preflight execution failed: ${message}` });
  }
});

// Setup Vite middleware in dev or static files in production
async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`BrandLens full-stack server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
