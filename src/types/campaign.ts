import { Finding, FindingSeverity, WorkspaceRole } from './brandlens';

/** Channels supported by Campaign Compliance Studio (section 2 of the feature spec). */
export type CampaignChannel = 'instagram' | 'linkedin' | 'google_ads' | 'email' | 'website';

export const CAMPAIGN_CHANNELS: CampaignChannel[] = [
  'instagram',
  'linkedin',
  'google_ads',
  'email',
  'website',
];

export const CAMPAIGN_CHANNEL_LABELS: Record<CampaignChannel, string> = {
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  google_ads: 'Google Ads',
  email: 'Email',
  website: 'Website',
};

export type CampaignStatus = 'draft' | 'in_review' | 'approved' | 'released' | 'archived';

export type AssetReviewStatus =
  | 'draft'
  | 'submitted'
  | 'in_review'
  | 'changes_requested'
  | 'approved';

/** A single factual claim extracted from an asset (server-authoritative). */
export interface CampaignClaim {
  id: string;
  text: string;
  /** Semantic bucket used by the cross-channel engine (price, delivery, uptime …). */
  topic: string | null;
  normalizedValue: string | null;
  evidenceIds: string[];
  evidenceStatus: 'supported' | 'unsupported' | 'expired_source' | 'conflict' | 'unchecked';
}

/** Claim-Guard finding for a campaign asset: reuses the existing Finding shape. */
export interface CampaignFinding extends Finding {
  source: 'deterministic' | 'ai';
}

export interface CampaignAssetVersion {
  version: number;
  title: string;
  channel: CampaignChannel;
  content: string;
  savedAt: string;
  savedBy: string;
  savedByName: string;
  changeSummary: string;
  status: AssetReviewStatus;
}

export interface CampaignAsset {
  id: string;
  workspaceId: string;
  campaignId: string;
  title: string;
  channel: CampaignChannel;
  content: string;
  claims: CampaignClaim[];
  evidenceIds: string[];
  version: number;
  status: AssetReviewStatus;
  reviewerId: string | null;
  reviewerName: string | null;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  lastVerifiedAt: string | null;
  engineMode: 'Rules-only mode' | 'Source-grounded AI + Rules enabled' | null;
  findings: CampaignFinding[];
  versions: CampaignAssetVersion[];
}

export type CrossChannelConflictKind =
  | 'value_mismatch'
  | 'unsupported_guarantee'
  | 'stale_claim'
  | 'missing_evidence';

export interface CrossChannelConflict {
  id: string;
  kind: CrossChannelConflictKind;
  severity: FindingSeverity;
  /** Semantic fact bucket, e.g. "price" — never a stylistic dimension. */
  topic: string;
  summary: string;
  assetIds: string[];
  channels: CampaignChannel[];
  /** channel -> exact quoted evidence from that channel's asset. */
  excerpts: { assetId: string; channel: CampaignChannel; quote: string }[];
  evidenceStatus: 'supported' | 'unsupported' | 'expired_source' | 'conflict';
  evidenceIds: string[];
  evidenceSourceName: string;
  recommendedResolution: string;
  resolved: boolean;
  resolution: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
}

export interface CrossChannelReport {
  generatedAt: string;
  generatedBy: string;
  engineMode: 'Rules-only mode' | 'Source-grounded AI + Rules enabled';
  checkedAssetIds: string[];
  /** Hash of the exact content that was analysed — used for staleness detection. */
  contentFingerprint: string;
  conflicts: CrossChannelConflict[];
  /** Facts compared across channels (transparency for reviewers). */
  comparedFacts: { topic: string; values: { channel: CampaignChannel; value: string }[] }[];
  ignoredStyleNotes: string[];
}

export type ApprovalDecision = 'approved' | 'changes_requested';

export interface CampaignApproval {
  id: string;
  actorId: string;
  actorName: string;
  role: WorkspaceRole;
  decision: ApprovalDecision;
  note: string | null;
  createdAt: string;
  /** Fingerprint of the content that was approved — proves later edits were re-reviewed. */
  contentFingerprint: string;
}

export interface ReleaseManifestFile {
  assetId: string;
  title: string;
  channel: CampaignChannel;
  version: number;
  sha256: string;
}

export interface ReleaseManifest {
  manifestId: string;
  campaignId: string;
  workspaceId: string;
  algorithm: 'sha256';
  createdAt: string;
  createdBy: string;
  createdByName: string;
  files: ReleaseManifestFile[];
  /** sha256 of the canonical manifest body (files + campaign identity). */
  manifestHash: string;
  previousManifestHash: string | null;
  contentFingerprint: string;
  status: 'current' | 'superseded';
  integrityNote: string;
}

export interface Campaign {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  objective: string;
  targetAudience: string;
  ownerId: string;
  ownerName: string;
  startDate: string;
  endDate: string;
  status: CampaignStatus;
  channels: CampaignChannel[];
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  assetCount: number;
  approvals: CampaignApproval[];
  crossChannelReport: CrossChannelReport | null;
  manifest: ReleaseManifest | null;
  releasedAt: string | null;
}

export interface CampaignAuditEvent {
  id: string;
  workspaceId: string;
  campaignId: string;
  assetId: string | null;
  actorId: string;
  actorName: string;
  actorRole: WorkspaceRole;
  action: string;
  reason: string | null;
  createdAt: string;
  metadata: Record<string, string | number | boolean | null>;
}

export type ReadinessBlockerCode =
  | 'no_assets'
  | 'missing_assets_for_channel'
  | 'asset_not_approved'
  | 'asset_no_findings_scan'
  | 'unresolved_critical_findings'
  | 'missing_evidence'
  | 'expired_evidence'
  | 'unresolved_cross_channel_conflict'
  | 'cross_channel_report_stale'
  | 'incomplete_approvals'
  | 'approval_stale'
  | 'manifest_missing'
  | 'manifest_stale'
  | 'manifest_tampered';

export interface ReadinessBlocker {
  code: ReadinessBlockerCode;
  message: string;
  severity: 'critical' | 'warning';
  assetId?: string;
}

export interface CampaignReadiness {
  ready: boolean;
  blockers: ReadinessBlocker[];
  checks: {
    totalAssets: number;
    approvedAssets: number;
    openCriticalFindings: number;
    unresolvedConflicts: number;
    requiredRoles: WorkspaceRole[];
    satisfiedRoles: WorkspaceRole[];
    evidenceExpired: string[];
    evidenceMissing: string[];
    manifestState: 'missing' | 'stale' | 'current' | 'tampered';
  };
  contentFingerprint: string;
}

/** Evidence record as resolved from Firestore (server-side only path). */
export interface ResolvedEvidence {
  id: string;
  title: string;
  type: string;
  status: 'active' | 'expiring' | 'expired' | 'archived';
  sourceName: string;
  sourceText: string;
  expiresAt: string | null;
  exists: boolean;
}
