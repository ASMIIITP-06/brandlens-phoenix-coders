export type WorkspaceRole = 'creator' | 'brand_manager' | 'specialist_reviewer' | 'publish_owner' | 'admin';

export type ReviewStatus = 'draft' | 'in_review' | 'changes_requested' | 'approved' | 'published';

export type FindingCategory =
  | 'Tone & Voice'
  | 'Terminology'
  | 'Facts & Freshness'
  | 'Promotional Claims'
  | 'Visual Consistency'
  | 'Accessibility';

export type FindingSeverity = 'high' | 'medium' | 'low';

export type EvidenceStatus = 'supported' | 'unsupported' | 'expired_source' | 'conflict';

export type FindingStatus = 'open' | 'accepted' | 'edited' | 'dismissed' | 'resolved';

export interface WorkspaceMember {
  uid: string;
  role: WorkspaceRole;
  displayName: string;
  email?: string;
  status: 'active' | 'invited' | 'suspended';
  joinedAt: string;
}

export interface KnowledgeItem {
  id: string;
  workspaceId: string;
  type: 'fact' | 'glossary' | 'tone' | 'guideline' | 'asset';
  title: string;
  body?: string;
  preferredTerm?: string;
  prohibitedTerms?: string[];
  sourceName?: string;
  sourceUrl?: string;
  sourceText?: string;
  ownerUid?: string;
  validFrom?: string;
  expiresAt?: string;
  status: 'active' | 'expiring' | 'expired' | 'archived';
  version?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface Finding {
  id: string;
  reviewId: string;
  workspaceId: string;
  category: FindingCategory;
  severity: FindingSeverity;
  excerpt: string;
  startOffset?: number;
  endOffset?: number;
  ruleId?: string;
  rationale: string;
  evidenceStatus: EvidenceStatus;
  evidenceIds: string[];
  evidenceSourceName?: string;
  evidenceSourceText?: string;
  suggestedRevision: string;
  confidence: number;
  status: FindingStatus;
  dismissReason?: string;
  assignedTo?: string;
  updatedBy?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface ReviewVersion {
  id: string;
  reviewId: string;
  versionNumber: number;
  text: string;
  changeSummary: string;
  createdBy: string;
  basedOnVersion?: number;
  createdAt: string;
}

export interface ReviewComment {
  id: string;
  reviewId: string;
  authorUid: string;
  authorName: string;
  body: string;
  linkedFindingId?: string;
  createdAt: string;
}

export interface Review {
  id: string;
  workspaceId: string;
  title: string;
  channel: 'website' | 'social' | 'email' | 'paid_campaign' | 'product_page' | 'other';
  status: ReviewStatus;
  createdBy: string;
  assignedTo?: string;
  originalText: string;
  currentText: string;
  contentVersion: number;
  riskLevel: 'low' | 'medium' | 'high';
  fileMetadata?: {
    fileName: string;
    fileSize: number;
    mimeType: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface AuditEvent {
  id: string;
  workspaceId: string;
  reviewId?: string;
  actorUid: string;
  actorName: string;
  actorRole: string;
  action: string;
  versionId?: number;
  oldStatus?: string;
  newStatus?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface TestCase {
  id: string;
  label: string;
  category: FindingCategory | 'Clean (Passing)';
  inputText: string;
  expectedOutcome: string;
  expectedEvidenceState: string;
  notes: string;
}
