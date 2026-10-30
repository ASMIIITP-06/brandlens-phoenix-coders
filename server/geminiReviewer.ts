import { GoogleGenAI } from '@google/genai';
import { AiAssetReviewer } from './campaignService';
import { ResolvedEvidence } from '../src/services/campaignEngine';
import { CampaignChannel } from '../src/types/campaign';

const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';

const RESPONSE_SHAPE = `{
  "findings": [
    {
      "category": "Tone & Voice" | "Terminology" | "Facts & Freshness" | "Promotional Claims" | "Visual Consistency" | "Accessibility",
      "severity": "high" | "medium" | "low",
      "excerpt": "<exact substring copied from the asset content>",
      "rationale": "<why it is a compliance problem>",
      "evidenceIds": ["<id from the PROVIDED EVIDENCE list only>"],
      "suggestedRevision": "<corrected sentence>",
      "confidence": 0.0
    }
  ]
}`;

function evidenceBlock(evidence: ResolvedEvidence[]): string {
  if (evidence.length === 0) return '(no evidence records exist for this workspace)';
  return evidence
    .map((item) => {
      const body = (item.sourceText || '').replace(/\s+/g, ' ').slice(0, 400);
      return [
        `- id: ${item.id}`,
        `  title: ${item.title}`,
        `  status: ${item.status}`,
        `  expiresAt: ${item.expiresAt || 'none'}`,
        `  sourceName: ${item.sourceName}`,
        `  excerpt: ${body}`,
      ].join('\n');
    })
    .join('\n');
}

/**
 * Server-side Gemini claim reviewer for campaign assets.
 *
 * The model only PROPOSES findings. `validateAiFindings` in
 * `src/services/campaignEngine.ts` then rejects anything that quotes text not
 * present in the asset, cites an evidence id that does not exist in Firestore,
 * or contradicts the resolved evidence status. Evidence is never invented by
 * the server and never taken from the request body.
 */
export function createGeminiAssetReviewer(apiKey: string, model = DEFAULT_MODEL): AiAssetReviewer {
  if (!apiKey) throw new Error('A Gemini API key is required to create the AI reviewer');
  const client = new GoogleGenAI({ apiKey });

  return {
    async reviewAsset(input: {
      title: string;
      channel: CampaignChannel;
      content: string;
      evidence: ResolvedEvidence[];
    }): Promise<unknown> {
      const prompt = [
        'You are a brand compliance reviewer. Verify the factual claims in one marketing asset.',
        '',
        'RULES:',
        '1. Only report problems you can quote verbatim from the ASSET CONTENT.',
        '2. Only cite evidence ids from the PROVIDED EVIDENCE list. Never invent a source, id or URL.',
        '3. If a claim has no matching evidence, report it with an empty evidenceIds array and explain that no approved source supports it.',
        '4. If a cited source status is "expired" or "archived", report an "Facts & Freshness" finding.',
        '5. Do not report tone, length, emoji, punctuation or formatting differences.',
        '6. Return ONLY JSON matching this shape:',
        RESPONSE_SHAPE,
        '',
        `ASSET CHANNEL: ${input.channel}`,
        `ASSET TITLE: ${input.title}`,
        'ASSET CONTENT:',
        '"""',
        input.content,
        '"""',
        '',
        'PROVIDED EVIDENCE:',
        evidenceBlock(input.evidence),
      ].join('\n');

      const response = await client.models.generateContent({
        model,
        contents: prompt,
        config: { responseMimeType: 'application/json', temperature: 0.1 },
      });

      const text = response.text ?? '';
      if (!text.trim()) throw new Error('Gemini returned an empty response');
      const parsed = JSON.parse(text) as unknown;
      if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { findings?: unknown }).findings)) {
        return (parsed as { findings: unknown }).findings;
      }
      return parsed;
    },
  };
}
