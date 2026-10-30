/**
 * Campaign Compliance Studio — shared domain engine (pure, dependency-free).
 *
 * This module is imported by BOTH the Express backend and the React client so the
 * rules for claim extraction, cross-channel consistency and release readiness are
 * identical in both places. It never invents evidence: every evidence reference is
 * resolved against a caller-supplied evidence index that the server loads from
 * Firestore.
 */
import { Finding, KnowledgeItem, WorkspaceRole } from '../types/brandlens';
import {
  Campaign,
  CampaignApproval,
  CampaignAsset,
  CampaignChannel,
  CampaignClaim,
  CampaignFinding,
  CampaignReadiness,
  CrossChannelConflict,
  CrossChannelReport,
  ReadinessBlocker,
  ResolvedEvidence,
} from '../types/campaign';
import { runDeterministicPreflight } from './engine';

/* ------------------------------------------------------------------ *
 * Stable hashing (no node:crypto) — used for staleness fingerprints.
 * ------------------------------------------------------------------ */
export function hashString(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);
    h1 ^= code;
    h1 = Math.imul(h1, 16777619) >>> 0;
    h2 = (Math.imul(h2 ^ code, 2246822519) + i) >>> 0;
  }
  return `${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`;
}

/** Canonical content fingerprint for a set of assets. */
export function fingerprintAssets(assets: CampaignAsset[]): string {
  const canonical = assets
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((a) => `${a.id}|${a.channel}|${a.version}|${normalizeWhitespace(a.title)}|${normalizeWhitespace(a.content)}`)
    .join('\n');
  return `fp_${hashString(canonical)}`;
}

export function normalizeWhitespace(value: string): string {
  return (value || '').replace(/\s+/g, ' ').trim();
}

/* ------------------------------------------------------------------ *
 * Evidence resolution — the ONLY source of truth for "supported".
 * ------------------------------------------------------------------ */
export function buildEvidenceIndex(items: KnowledgeItem[]): Record<string, ResolvedEvidence> {
  const index: Record<string, ResolvedEvidence> = {};
  for (const item of items) {
    if (!item || typeof item.id !== 'string') continue;
    index[item.id] = {
      id: item.id,
      title: item.title || '(untitled source)',
      type: item.type || 'fact',
      status: item.status || 'archived',
      sourceName: item.sourceName || item.title || '(unnamed source)',
      sourceText: item.sourceText || item.body || '',
      expiresAt: item.expiresAt || null,
      exists: true,
    };
  }
  return index;
}

export type EvidenceState = 'supported' | 'valid' | 'expired_source' | 'missing';

export function resolveEvidenceState(
  evidenceIds: string[],
  index: Record<string, ResolvedEvidence>,
  now: Date
): EvidenceState {
  const ids = (evidenceIds || []).filter((id) => typeof id === 'string' && id.length > 0);
  if (ids.length === 0) return 'missing';
  let sawValid = false;
  for (const id of ids) {
    const record = index[id];
    if (!record) continue;
    const expired =
      record.status === 'expired' ||
      record.status === 'archived' ||
      (record.expiresAt ? new Date(record.expiresAt).getTime() < now.getTime() : false);
    if (!expired) sawValid = true;
  }
  if (sawValid) return 'valid';
  return 'expired_source';
}

/* ------------------------------------------------------------------ *
 * Claim extraction
 * ------------------------------------------------------------------ */
interface TopicRule {
  topic: string;
  comparable: boolean;
  severity: 'high' | 'medium' | 'low';
  match: RegExp;
  extract: (sentence: string, match: RegExpMatchArray) => string;
}

const TOPIC_RULES: TopicRule[] = [
  {
    topic: 'price',
    comparable: true,
    severity: 'high',
    match: /(?:[$€£]\s?\d+(?:[.,]\d{1,2})?|\b\d+(?:[.,]\d{1,2})?\s?(?:usd|eur|gbp|dollars|euros)\b)/i,
    extract: (s) => {
      const m = s.match(/([$€£])\s?(\d+(?:[.,]\d{1,2})?)/);
      if (m) return `${m[1]}${m[2].replace(',', '.')}`;
      const alt = s.match(/(\d+(?:[.,]\d{1,2})?)\s?(usd|eur|gbp|dollars|euros)/i);
      return alt ? `${alt[1].replace(',', '.')}${alt[2].toLowerCase()}` : '';
    },
  },
  {
    topic: 'discount',
    comparable: true,
    severity: 'high',
    match: /\b\d{1,2}\s?%\s?(?:off|discount|savings?)\b/i,
    extract: (s) => {
      const m = s.match(/\b(\d{1,2})\s?%/);
      return m ? `${m[1]}%off` : '';
    },
  },
  {
    topic: 'delivery_time',
    comparable: true,
    severity: 'high',
    match: /\b(?:deliver\w*|ship\w*|arriv\w*|fulfil\w*)\b[^.]{0,40}\b(?:\d+|one|two|three|four|five|seven|ten)\b[^.]{0,20}\b(?:hours?|days?|business days?|weeks?)\b/i,
    extract: (s) => {
      const m = s.match(/\b(\d+|one|two|three|four|five|seven|ten)\b[^.]{0,10}?\b(hours?|days?|business days?|weeks?)\b/i);
      if (!m) return '';
      const n = wordToNumber(m[1]);
      const unit = m[2].toLowerCase().replace(/s$/, '');
      return `${n}${unit === 'business day' ? 'bd' : unit === 'hour' ? 'h' : unit === 'day' ? 'd' : 'w'}`;
    },
  },
  {
    topic: 'uptime',
    comparable: true,
    severity: 'high',
    match: /\b\d{1,3}(?:[.,]\d+)?\s?%\s?(?:uptime|availability|sla)\b/i,
    extract: (s) => {
      const m = s.match(/\b(\d{1,3}(?:[.,]\d+)?)\s?%/);
      return m ? `${m[1].replace(',', '.')}%` : '';
    },
  },
  {
    topic: 'free_trial',
    comparable: true,
    severity: 'medium',
    match: /\b(?:\d{1,3}[- ]day\s+free trial|free trial|try\s+\w+\s+free)\b/i,
    extract: (s) => {
      const m = s.match(/\b(\d{1,3})[- ]day\s+free trial\b/i);
      return m ? `${m[1]}d-trial` : 'trial-unspecified';
    },
  },
  {
    topic: 'guarantee',
    comparable: true,
    severity: 'high',
    match: /\b(?:guarantee[sd]?|guaranteed|money[- ]back|risk[- ]free|refund within \d+ days)\b/i,
    extract: (s) => {
      const m = s.match(/refund within (\d+) days/i);
      if (m) return `refund-${m[1]}d`;
      return 'absolute-guarantee';
    },
  },
  {
    topic: 'support_availability',
    comparable: true,
    severity: 'medium',
    match: /\b(?:24\/7|round[- ]the[- ]clock|always[- ]on)\s*(?:support|customer care|service)?\b/i,
    extract: () => '24-7',
  },
  {
    topic: 'product_availability',
    comparable: true,
    severity: 'high',
    match: /\b(?:no longer available|discontinued|deprecated|sunset(?:ted)?|coming soon|now available|generally available|is available|is included)\b/i,
    extract: (s) => {
      const neg = /no longer|discontinued|deprecated|sunset/i.test(s);
      const future = /coming soon/i.test(s);
      return neg ? 'unavailable' : future ? 'announced' : 'available';
    },
  },
  {
    topic: 'response_time',
    comparable: true,
    severity: 'medium',
    match: /\bwithin\s+\d+\s*(?:minutes?|hours?)\b/i,
    extract: (s) => {
      const m = s.match(/within\s+(\d+)\s*(minutes?|hours?)/i);
      return m ? `${m[1]}${m[2].toLowerCase().startsWith('min') ? 'min' : 'h'}` : '';
    },
  },
];

function wordToNumber(word: string): string {
  const map: Record<string, string> = {
    one: '1',
    two: '2',
    three: '3',
    four: '4',
    five: '5',
    seven: '7',
    ten: '10',
  };
  return map[word.toLowerCase()] || word;
}

const CLAIM_MARKERS =
  /(\d|%|[$€£]|\bguarantee|\bguaranteed\b|\bbest\b|\bfastest\b|\bnumber one\b|#1|\balways\b|\bnever\b|\bfree\b|\bunlimited\b|\bonly\b|\baward|\bcertified\b|\bproven\b)/i;

export interface ExtractedClaim {
  text: string;
  topic: string | null;
  topicSeverity: 'high' | 'medium' | 'low';
  comparable: boolean;
  normalizedValue: string | null;
}

/**
 * Extract factual claims from raw asset copy. Stylistic sentences (tone, emoji,
 * rhetorical copy) are deliberately not treated as claims so the cross-channel
 * engine never flags a difference in voice.
 */
export function extractClaims(content: string): ExtractedClaim[] {
  const sentences = (content || '')
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => normalizeWhitespace(s))
    .filter((s) => s.length > 3);

  const claims: ExtractedClaim[] = [];
  for (const sentence of sentences) {
    if (!CLAIM_MARKERS.test(sentence)) continue;
    let assigned: ExtractedClaim | null = null;
    for (const rule of TOPIC_RULES) {
      const m = sentence.match(rule.match);
      if (!m) continue;
      const value = rule.extract(sentence, m);
      if (!value) continue;
      assigned = {
        text: sentence,
        topic: rule.topic,
        topicSeverity: rule.severity,
        comparable: rule.comparable,
        normalizedValue: value,
      };
      break;
    }
    if (!assigned) {
      assigned = {
        text: sentence,
        topic: null,
        topicSeverity: 'low',
        comparable: false,
        normalizedValue: null,
      };
    }
    claims.push(assigned);
  }
  return claims;
}

/* ------------------------------------------------------------------ *
 * Claim Guard bridge (reuses the existing deterministic engine)
 * ------------------------------------------------------------------ */
export interface ClaimGuardInput {
  workspaceId: string;
  assetId: string;
  channel: CampaignChannel;
  title: string;
  content: string;
  evidence: KnowledgeItem[];
}

/** Runs the existing Source-Linked Claim Guard (deterministic half) on an asset. */
export function runAssetClaimGuard(input: ClaimGuardInput): CampaignFinding[] {
  const text = `${input.title ? `${input.title}\n` : ''}${input.content || ''}`;
  if (!normalizeWhitespace(text)) return [];
  const result = runDeterministicPreflight(
    text,
    input.channel,
    input.evidence,
    input.assetId,
    input.workspaceId
  );
  return result.findings.map((finding) => ({
    ...finding,
    id: `${finding.id}-${input.assetId}`,
    reviewId: input.assetId,
    source: 'deterministic' as const,
  }));
}

const VALID_CATEGORIES = new Set([
  'Tone & Voice',
  'Terminology',
  'Facts & Freshness',
  'Promotional Claims',
  'Visual Consistency',
  'Accessibility',
]);

const VALID_SEVERITIES = new Set(['high', 'medium', 'low']);
const VALID_EVIDENCE_STATUS = new Set(['supported', 'unsupported', 'expired_source', 'conflict']);

/**
 * Validates model output against REAL Firestore evidence.
 *
 * Rules enforced here (server-side, never trusting the model or the client):
 *  - the quoted excerpt must actually appear in the asset copy,
 *  - every evidence id must exist in the server-fetched evidence index,
 *  - "supported" is downgraded to "unsupported" when no valid id survives,
 *  - evidence that is expired/archived forces "expired_source".
 */
export function validateAiFindings(params: {
  rawFindings: unknown;
  content: string;
  evidenceIndex: Record<string, ResolvedEvidence>;
  now: Date;
  assetId: string;
  workspaceId: string;
}): { accepted: CampaignFinding[]; rejected: { reason: string; excerpt: string }[] } {
  const accepted: CampaignFinding[] = [];
  const rejected: { reason: string; excerpt: string }[] = [];
  const list = Array.isArray(params.rawFindings) ? params.rawFindings : [];
  const haystack = normalizeWhitespace(params.content).toLowerCase();

  list.forEach((raw, index) => {
    if (!raw || typeof raw !== 'object') {
      rejected.push({ reason: 'Model returned a non-object finding', excerpt: '' });
      return;
    }
    const candidate = raw as Record<string, unknown>;
    const excerpt = normalizeWhitespace(String(candidate.excerpt ?? ''));
    if (excerpt.length < 3) {
      rejected.push({ reason: 'Missing excerpt', excerpt });
      return;
    }
    if (!haystack.includes(excerpt.toLowerCase())) {
      rejected.push({ reason: 'Excerpt is not present in the asset copy (possible hallucination)', excerpt });
      return;
    }

    const requestedIds = Array.isArray(candidate.evidenceIds)
      ? (candidate.evidenceIds as unknown[]).filter((id): id is string => typeof id === 'string')
      : [];
    const validIds = requestedIds.filter((id) => Boolean(params.evidenceIndex[id]));
    const failedIds = requestedIds.filter((id) => !params.evidenceIndex[id]);
    if (failedIds.length > 0) {
      rejected.push({
        reason: `Discarded unknown evidence id(s): ${failedIds.join(', ')}`,
        excerpt,
      });
    }

    let evidenceStatus = String(candidate.evidenceStatus ?? 'unsupported');
    if (!VALID_EVIDENCE_STATUS.has(evidenceStatus)) evidenceStatus = 'unsupported';
    if (evidenceStatus === 'supported') {
      const state = resolveEvidenceState(validIds, params.evidenceIndex, params.now);
      if (state === 'missing') {
        evidenceStatus = 'unsupported';
      } else if (state === 'expired_source') {
        evidenceStatus = 'expired_source';
      }
    }
    if (validIds.length === 0 && evidenceStatus === 'supported') evidenceStatus = 'unsupported';

    const category = VALID_CATEGORIES.has(String(candidate.category))
      ? (String(candidate.category) as Finding['category'])
      : 'Promotional Claims';
    const severity = VALID_SEVERITIES.has(String(candidate.severity))
      ? (String(candidate.severity) as Finding['severity'])
      : 'medium';
    const confidenceRaw = Number(candidate.confidence);
    const confidence = Number.isFinite(confidenceRaw)
      ? Math.min(1, Math.max(0, confidenceRaw))
      : 0.5;

    const primaryEvidence = validIds.length > 0 ? params.evidenceIndex[validIds[0]] : null;

    accepted.push({
      id: `fnd-ai-${params.assetId}-${index}`,
      reviewId: params.assetId,
      workspaceId: params.workspaceId,
      category,
      severity,
      excerpt,
      rationale: normalizeWhitespace(String(candidate.rationale ?? 'Flagged by AI review.')) || 'Flagged by AI review.',
      evidenceStatus: evidenceStatus as Finding['evidenceStatus'],
      evidenceIds: validIds,
      evidenceSourceName: primaryEvidence
        ? primaryEvidence.sourceName
        : 'No approved evidence found',
      evidenceSourceText: primaryEvidence
        ? primaryEvidence.sourceText
        : 'No approved Firestore evidence record backs this claim.',
      suggestedRevision:
        normalizeWhitespace(String(candidate.suggestedRevision ?? '')) ||
        'Rewrite the claim so it is supported by an approved source.',
      confidence,
      status: 'open',
      createdAt: params.now.toISOString(),
      source: 'ai' as const,
    });
  });

  return { accepted, rejected };
}

/** Merges deterministic + AI findings, de-duplicating by excerpt + category. */
export function mergeFindings(
  deterministic: CampaignFinding[],
  ai: CampaignFinding[]
): CampaignFinding[] {
  const seen = new Set(
    deterministic.map((f) => `${f.category}::${f.excerpt.toLowerCase().slice(0, 60)}`)
  );
  const merged = [...deterministic];
  for (const finding of ai) {
    const key = `${finding.category}::${finding.excerpt.toLowerCase().slice(0, 60)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(finding);
  }
  return merged;
}

export function buildAssetClaims(
  content: string,
  evidenceIds: string[],
  evidenceIndex: Record<string, ResolvedEvidence>,
  now: Date
): CampaignClaim[] {
  const state = resolveEvidenceState(evidenceIds, evidenceIndex, now);
  return extractClaims(content).map((claim, index) => ({
    id: `clm-${index}`,
    text: claim.text,
    topic: claim.topic,
    normalizedValue: claim.normalizedValue,
    evidenceIds,
    evidenceStatus:
      state === 'missing'
        ? 'unsupported'
        : state === 'expired_source'
          ? 'expired_source'
          : 'supported',
  }));
}

/* ------------------------------------------------------------------ *
 * Cross-channel consistency engine
 * ------------------------------------------------------------------ */
const ABSOLUTE_GUARANTEE = /\b(guarantee\w*|guaranteed|every customer|always|never|100%|risk[- ]free)\b/i;

export interface CrossChannelInput {
  campaign: Pick<Campaign, 'id' | 'name' | 'workspaceId'>;
  assets: CampaignAsset[];
  evidenceIndex: Record<string, ResolvedEvidence>;
  now: Date;
  generatedBy: string;
  engineMode: CrossChannelReport['engineMode'];
  /** Previously resolved conflict ids so resolutions survive re-analysis. */
  previousResolutions?: Record<string, { resolution: string; resolvedBy: string; resolvedAt: string }>;
}

/**
 * Detects FACTUAL inconsistency across channels. Deliberately ignores:
 * tone, length, emoji, punctuation, capitalization, formatting and CTAs —
 * those are stylistic differences, not compliance conflicts.
 */
export function analyzeCrossChannel(input: CrossChannelInput): CrossChannelReport {
  const assets = input.assets || [];
  const conflicts: CrossChannelConflict[] = [];
  const compared: Record<string, { channel: CampaignChannel; value: string }[]> = {};

  const perAsset = assets.map((asset) => {
    const claims = extractClaims(`${asset.title ? `${asset.title}. ` : ''}${asset.content || ''}`);
    return { asset, claims };
  });

  // 1. Factual value comparison per topic.
  for (const { asset, claims } of perAsset) {
    for (const claim of claims) {
      if (!claim.topic || !claim.comparable || !claim.normalizedValue) continue;
      const bucket = compared[claim.topic] || (compared[claim.topic] = []);
      if (!bucket.some((entry) => entry.value === claim.normalizedValue)) {
        bucket.push({ channel: asset.channel, value: claim.normalizedValue });
      }
    }
  }

  for (const [topic, values] of Object.entries(compared)) {
    const distinct = Array.from(new Set(values.map((v) => v.value)));
    if (distinct.length < 2) continue;
    const channels = Array.from(new Set(values.map((v) => v.channel)));
    if (channels.length < 2) continue;

    const excerpts = perAsset
      .filter(({ claims }) => claims.some((c) => c.topic === topic && c.normalizedValue))
      .map(({ asset, claims }) => {
        const claim = claims.find((c) => c.topic === topic && c.normalizedValue);
        return {
          assetId: asset.id,
          channel: asset.channel,
          quote: claim ? claim.text : '',
        };
      })
      .filter((entry) => entry.quote);

    const rule = TOPIC_RULES.find((r) => r.topic === topic);
    const severity = rule ? rule.severity : 'medium';
    const conflictId = `cc-${topic}-${hashString(`${topic}|${distinct.join('|')}`)}`;

    conflicts.push({
      id: conflictId,
      kind: 'value_mismatch',
      severity,
      topic,
      summary: `Channels disagree on ${topic.replace(/_/g, ' ')}: ${values
        .map((v) => `${v.channel} = ${v.value}`)
        .join(', ')}.`,
      assetIds: excerpts.map((e) => e.assetId),
      channels,
      excerpts,
      evidenceStatus: 'conflict',
      evidenceIds: [],
      evidenceSourceName: 'Cross-channel comparison (no single approved source)',
      recommendedResolution: `Align every channel on one approved ${topic.replace(/_/g, ' ')} value before release.`,
      resolved: false,
      resolution: null,
      resolvedBy: null,
      resolvedAt: null,
    });

    const previous = input.previousResolutions?.[conflictId];
    if (previous) {
      const created = conflicts[conflicts.length - 1];
      created.resolved = true;
      created.resolution = previous.resolution;
      created.resolvedBy = previous.resolvedBy;
      created.resolvedAt = previous.resolvedAt;
    }
  }

  // 2. Per-channel factual integrity issues that affect campaign consistency.
  for (const { asset, claims } of perAsset) {
    const assetState = resolveEvidenceState(asset.evidenceIds, input.evidenceIndex, input.now);

    for (const claim of claims) {
      const absoluteGuarantee = ABSOLUTE_GUARANTEE.test(claim.text);
      if (absoluteGuarantee && (assetState === 'missing' || assetState === 'expired_source')) {
        const conflictId = `cc-guarantee-${hashString(`${asset.id}|${claim.text}`)}`;
        conflicts.push({
          id: conflictId,
          kind: assetState === 'expired_source' ? 'stale_claim' : 'unsupported_guarantee',
          severity: 'high',
          topic: 'guarantee',
          summary:
            assetState === 'expired_source'
              ? `${asset.channel} asset "${asset.title}" repeats an absolute promise backed only by expired or archived evidence.`
              : `${asset.channel} asset "${asset.title}" makes an absolute promise with no approved evidence reference.`,
          assetIds: [asset.id],
          channels: [asset.channel],
          excerpts: [{ assetId: asset.id, channel: asset.channel, quote: claim.text }],
          evidenceStatus: assetState === 'expired_source' ? 'expired_source' : 'unsupported',
          evidenceIds: assetState === 'expired_source' ? asset.evidenceIds : [],
          evidenceSourceName:
            assetState === 'expired_source'
              ? 'Referenced evidence is expired or archived'
              : 'No approved evidence found',
          recommendedResolution:
            'Replace the absolute promise with wording supported by an approved, unexpired source on every channel.',
          resolved: false,
          resolution: null,
          resolvedBy: null,
          resolvedAt: null,
        });
        const previous = input.previousResolutions?.[conflictId];
        if (previous) {
          const created = conflicts[conflicts.length - 1];
          created.resolved = true;
          created.resolution = previous.resolution;
          created.resolvedBy = previous.resolvedBy;
          created.resolvedAt = previous.resolvedAt;
        }
      }
    }

    if (asset.evidenceIds.length === 0 && (asset.content || '').trim().length > 0) {
      const conflictId = `cc-noevidence-${hashString(asset.id)}`;
      conflicts.push({
        id: conflictId,
        kind: 'missing_evidence',
        severity: 'medium',
        topic: 'evidence_linkage',
        summary: `${asset.channel} asset "${asset.title}" publishes factual copy without linking any approved evidence.`,
        assetIds: [asset.id],
        channels: [asset.channel],
        excerpts: [{ assetId: asset.id, channel: asset.channel, quote: normalizeWhitespace(asset.content).slice(0, 160) }],
        evidenceStatus: 'unsupported',
        evidenceIds: [],
        evidenceSourceName: 'No approved evidence linked',
        recommendedResolution: 'Link at least one approved knowledge item to this asset.',
        resolved: false,
        resolution: null,
        resolvedBy: null,
        resolvedAt: null,
      });
      const previous = input.previousResolutions?.[conflictId];
      if (previous) {
        const created = conflicts[conflicts.length - 1];
        created.resolved = true;
        created.resolution = previous.resolution;
        created.resolvedBy = previous.resolvedBy;
        created.resolvedAt = previous.resolvedAt;
      }
    }
  }

  const ignoredStyleNotes: string[] = [];
  if (assets.length > 1) {
    const lengths = assets.map((a) => normalizeWhitespace(a.content).length);
    if (Math.max(...lengths) - Math.min(...lengths) > 120) {
      ignoredStyleNotes.push(
        'Channel copy length differs significantly — treated as stylistic variance, not a factual conflict.'
      );
    }
    const emojiUsers = assets.filter((a) => /[\u{1F300}-\u{1FAFF}]/u.test(a.content)).map((a) => a.channel);
    if (emojiUsers.length > 0 && emojiUsers.length < assets.length) {
      ignoredStyleNotes.push(
        `Emoji/hashtag usage differs between channels (present: ${emojiUsers.join(', ')}) — ignored by design.`
      );
    }
    ignoredStyleNotes.push('Tone, punctuation and CTA phrasing are excluded from factual comparison.');
  }

  return {
    generatedAt: input.now.toISOString(),
    generatedBy: input.generatedBy,
    engineMode: input.engineMode,
    checkedAssetIds: assets.map((a) => a.id),
    contentFingerprint: fingerprintAssets(assets),
    conflicts,
    comparedFacts: Object.entries(compared).map(([topic, values]) => ({ topic, values })),
    ignoredStyleNotes,
  };
}

/* ------------------------------------------------------------------ *
 * Approval + release readiness
 * ------------------------------------------------------------------ */
export const REQUIRED_APPROVAL_ROLES: WorkspaceRole[] = ['specialist_reviewer', 'brand_manager'];

export function approvalSatisfiesRole(approvalRole: WorkspaceRole, required: WorkspaceRole): boolean {
  if (approvalRole === required) return true;
  // Admins are authorised to act in the brand-manager lane.
  if (required === 'brand_manager' && approvalRole === 'admin') return true;
  return false;
}

export interface ReadinessInput {
  campaign: Campaign;
  assets: CampaignAsset[];
  evidenceIndex: Record<string, ResolvedEvidence>;
  manifestState?: CampaignReadiness['checks']['manifestState'];
  now: Date;
}

export function evaluateCampaignReadiness(input: ReadinessInput): CampaignReadiness {
  const { campaign, assets, evidenceIndex, now } = input;
  const blockers: ReadinessBlocker[] = [];
  const fingerprint = fingerprintAssets(assets);

  if (assets.length === 0) {
    blockers.push({
      code: 'no_assets',
      message: 'Campaign has no assets yet.',
      severity: 'critical',
    });
  }

  for (const channel of campaign.channels || []) {
    if (!assets.some((a) => a.channel === channel)) {
      blockers.push({
        code: 'missing_assets_for_channel',
        message: `No asset exists for the selected channel "${channel}".`,
        severity: 'warning',
      });
    }
  }

  let openCritical = 0;
  const evidenceMissing: string[] = [];
  const evidenceExpired: string[] = [];

  for (const asset of assets) {
    if (asset.status !== 'approved') {
      blockers.push({
        code: 'asset_not_approved',
        message: `Asset "${asset.title}" is still ${asset.status.replace(/_/g, ' ')}.`,
        severity: 'critical',
        assetId: asset.id,
      });
    }
    if (!asset.lastVerifiedAt) {
      blockers.push({
        code: 'asset_no_findings_scan',
        message: `Asset "${asset.title}" has never been claim-verified.`,
        severity: 'critical',
        assetId: asset.id,
      });
    }
    const criticalFindings = (asset.findings || []).filter(
      (f) => f.severity === 'high' && (f.status === 'open' || f.status === 'edited')
    );
    openCritical += criticalFindings.length;
    for (const finding of criticalFindings) {
      blockers.push({
        code: 'unresolved_critical_findings',
        message: `High-severity finding unresolved on "${asset.title}": ${finding.excerpt.slice(0, 80)}`,
        severity: 'critical',
        assetId: asset.id,
      });
    }

    const state = resolveEvidenceState(asset.evidenceIds, evidenceIndex, now);
    if (state === 'missing') {
      evidenceMissing.push(asset.id);
      blockers.push({
        code: 'missing_evidence',
        message: `Asset "${asset.title}" has no linked approved evidence.`,
        severity: 'critical',
        assetId: asset.id,
      });
    } else if (state === 'expired_source') {
      evidenceExpired.push(asset.id);
      blockers.push({
        code: 'expired_evidence',
        message: `Asset "${asset.title}" relies on expired or archived evidence.`,
        severity: 'critical',
        assetId: asset.id,
      });
    }
  }

  const report = campaign.crossChannelReport;
  const unresolvedConflicts = (report?.conflicts || []).filter((c) => !c.resolved);
  if (report) {
    for (const conflict of unresolvedConflicts) {
      blockers.push({
        code: 'unresolved_cross_channel_conflict',
        message: `Unresolved cross-channel conflict (${conflict.topic}): ${conflict.summary}`,
        severity: conflict.severity === 'high' ? 'critical' : 'warning',
      });
    }
    if (report.contentFingerprint !== fingerprint) {
      blockers.push({
        code: 'cross_channel_report_stale',
        message: 'Assets changed after the last cross-channel analysis — re-run the report.',
        severity: 'critical',
      });
    }
  } else if (assets.length > 0) {
    blockers.push({
      code: 'cross_channel_report_stale',
      message: 'Cross-channel consistency has never been analysed for this campaign.',
      severity: 'critical',
    });
  }

  const approvals = campaign.approvals || [];
  const satisfiedRoles: WorkspaceRole[] = [];
  for (const required of REQUIRED_APPROVAL_ROLES) {
    const hit = approvals.find(
      (a) =>
        a.decision === 'approved' &&
        approvalSatisfiesRole(a.role, required) &&
        a.contentFingerprint === fingerprint
    );
    if (hit) {
      satisfiedRoles.push(required);
    } else {
      blockers.push({
        code: 'incomplete_approvals',
        message: `Missing a current approval from the ${required.replace(/_/g, ' ')} lane for this asset revision.`,
        severity: 'critical',
      });
    }
  }

  for (const approval of approvals) {
    if (approval.decision === 'approved' && approval.contentFingerprint !== fingerprint) {
      blockers.push({
        code: 'approval_stale',
        message: `Approval by ${approval.actorName} was recorded against a previous revision and must be re-confirmed.`,
        severity: 'critical',
      });
    }
  }

  let manifestState: CampaignReadiness['checks']['manifestState'] = input.manifestState || 'missing';
  if (!campaign.manifest) {
    manifestState = 'missing';
    blockers.push({
      code: 'manifest_missing',
      message: 'No release manifest exists for this campaign revision.',
      severity: 'critical',
    });
  } else if (campaign.manifest.contentFingerprint !== fingerprint) {
    manifestState = 'stale';
    blockers.push({
      code: 'manifest_stale',
      message: 'Release manifest was generated for a previous revision of the campaign.',
      severity: 'critical',
    });
  }

  return {
    ready: blockers.filter((b) => b.severity === 'critical').length === 0,
    blockers,
    checks: {
      totalAssets: assets.length,
      approvedAssets: assets.filter((a) => a.status === 'approved').length,
      openCriticalFindings: openCritical,
      unresolvedConflicts: unresolvedConflicts.length,
      requiredRoles: REQUIRED_APPROVAL_ROLES,
      satisfiedRoles,
      evidenceExpired,
      evidenceMissing,
      manifestState,
    },
    contentFingerprint: fingerprint,
  };
}

/** Duplicate-submission guard: is there already a pending approval by this actor? */
export function hasPendingApproval(approvals: CampaignApproval[], actorId: string, fingerprint: string): boolean {
  return approvals.some(
    (a) => a.actorId === actorId && a.contentFingerprint === fingerprint && a.decision === 'approved'
  );
}
