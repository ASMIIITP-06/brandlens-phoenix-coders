import { KnowledgeItem, WorkspaceRole } from '../src/types/brandlens';
import { Campaign, CampaignAsset, CampaignAuditEvent } from '../src/types/campaign';

export interface WorkspaceMembership {
  uid: string;
  role: WorkspaceRole;
  displayName: string;
  status: 'active' | 'invited' | 'suspended';
}

/**
 * Storage abstraction. Production uses the Firestore REST implementation
 * (`server/firestoreStore.ts`) which forwards the CALLER's ID token so Firestore
 * security rules remain the final authorization layer. Tests use the in-memory
 * implementation below.
 */
export interface CampaignStore {
  getMembership(workspaceId: string, uid: string): Promise<WorkspaceMembership | null>;
  listCampaigns(workspaceId: string): Promise<Campaign[]>;
  getCampaign(workspaceId: string, campaignId: string): Promise<Campaign | null>;
  saveCampaign(campaign: Campaign): Promise<void>;
  deleteCampaign(workspaceId: string, campaignId: string): Promise<void>;
  listAssets(workspaceId: string, campaignId: string): Promise<CampaignAsset[]>;
  getAsset(workspaceId: string, campaignId: string, assetId: string): Promise<CampaignAsset | null>;
  saveAsset(asset: CampaignAsset): Promise<void>;
  deleteAsset(workspaceId: string, campaignId: string, assetId: string): Promise<void>;
  listEvidence(workspaceId: string): Promise<KnowledgeItem[]>;
  appendAuditEvent(event: CampaignAuditEvent): Promise<void>;
  listAuditEvents(workspaceId: string, campaignId: string): Promise<CampaignAuditEvent[]>;
}

export class StoreError extends Error {
  status: number;
  code: string;
  constructor(message: string, status = 500, code = 'store_error') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Deterministic in-memory store used by the automated test-suite. */
export class InMemoryCampaignStore implements CampaignStore {
  members = new Map<string, WorkspaceMembership>();
  campaigns = new Map<string, Campaign>();
  assets = new Map<string, CampaignAsset>();
  evidence = new Map<string, KnowledgeItem>();
  audit: CampaignAuditEvent[] = [];

  private campaignKey(workspaceId: string, campaignId: string) {
    return `${workspaceId}/${campaignId}`;
  }

  private assetKey(workspaceId: string, campaignId: string, assetId: string) {
    return `${workspaceId}/${campaignId}/${assetId}`;
  }

  seedMember(membership: WorkspaceMembership) {
    this.members.set(membership.uid, { ...membership });
  }

  seedEvidence(item: KnowledgeItem) {
    this.evidence.set(item.id, { ...item });
  }

  async getMembership(workspaceId: string, uid: string): Promise<WorkspaceMembership | null> {
    return this.members.get(uid) || null;
  }

  async listCampaigns(workspaceId: string): Promise<Campaign[]> {
    return Array.from(this.campaigns.values())
      .filter((c) => c.workspaceId === workspaceId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getCampaign(workspaceId: string, campaignId: string): Promise<Campaign | null> {
    return this.campaigns.get(this.campaignKey(workspaceId, campaignId)) || null;
  }

  async saveCampaign(campaign: Campaign): Promise<void> {
    this.campaigns.set(this.campaignKey(campaign.workspaceId, campaign.id), campaign);
  }

  async deleteCampaign(workspaceId: string, campaignId: string): Promise<void> {
    this.campaigns.delete(this.campaignKey(workspaceId, campaignId));
    for (const key of Array.from(this.assets.keys())) {
      if (key.startsWith(`${workspaceId}/${campaignId}/`)) this.assets.delete(key);
    }
  }

  async listAssets(workspaceId: string, campaignId: string): Promise<CampaignAsset[]> {
    return Array.from(this.assets.values())
      .filter((a) => a.workspaceId === workspaceId && a.campaignId === campaignId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async getAsset(workspaceId: string, campaignId: string, assetId: string): Promise<CampaignAsset | null> {
    return this.assets.get(this.assetKey(workspaceId, campaignId, assetId)) || null;
  }

  async saveAsset(asset: CampaignAsset): Promise<void> {
    this.assets.set(this.assetKey(asset.workspaceId, asset.campaignId, asset.id), asset);
  }

  async deleteAsset(workspaceId: string, campaignId: string, assetId: string): Promise<void> {
    this.assets.delete(this.assetKey(workspaceId, campaignId, assetId));
  }

  async listEvidence(workspaceId: string): Promise<KnowledgeItem[]> {
    return Array.from(this.evidence.values()).filter((item) => item.workspaceId === workspaceId);
  }

  async appendAuditEvent(event: CampaignAuditEvent): Promise<void> {
    if (this.audit.some((e) => e.id === event.id)) {
      throw new StoreError('Duplicate audit event id', 409, 'duplicate_audit');
    }
    this.audit.push(event);
  }

  async listAuditEvents(workspaceId: string, campaignId: string): Promise<CampaignAuditEvent[]> {
    return this.audit
      .filter((e) => e.workspaceId === workspaceId && e.campaignId === campaignId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}
