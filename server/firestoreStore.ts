import { KnowledgeItem, WorkspaceRole } from '../src/types/brandlens';
import { Campaign, CampaignAsset, CampaignAuditEvent } from '../src/types/campaign';
import { CampaignStore, StoreError, WorkspaceMembership } from './campaignStore';

/* ------------------------------------------------------------------ *
 * Firestore REST <-> plain JS value mapping
 * ------------------------------------------------------------------ */
type FsValue =
  | { nullValue: null }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number }
  | { stringValue: string }
  | { timestampValue: string }
  | { arrayValue: { values?: FsValue[] } }
  | { mapValue: { fields?: Record<string, FsValue> } };

function toFsValue(value: unknown): FsValue {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (typeof value === 'string') return { stringValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toFsValue) } };
  return {
    mapValue: {
      fields: Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, toFsValue(v)])
      ),
    },
  };
}

function fromFsValue(value: FsValue | undefined): unknown {
  if (!value || typeof value !== 'object') return null;
  if ('nullValue' in value) return null;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('stringValue' in value) return value.stringValue;
  if ('timestampValue' in value) return value.timestampValue;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(fromFsValue);
  if ('mapValue' in value) {
    const fields = value.mapValue.fields || {};
    return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, fromFsValue(v)]));
  }
  return null;
}

function toFsDocument(doc: Record<string, unknown>) {
  return {
    fields: Object.fromEntries(
      Object.entries(doc)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, toFsValue(v)])
    ),
  };
}

function fromFsDocument(doc: { fields?: Record<string, FsValue> } | null | undefined): Record<string, unknown> {
  if (!doc || !doc.fields) return {};
  return Object.fromEntries(Object.entries(doc.fields).map(([k, v]) => [k, fromFsValue(v)]));
}

/* ------------------------------------------------------------------ */
export interface FirestoreConfig {
  projectId: string;
  databaseId: string;
}

/**
 * Firestore REST store. Every request carries the caller's Firebase ID token, so
 * `firestore.rules` (membership + role checks) still gate each read and write.
 * The server never uses an admin/service credential that would bypass rules.
 */
export class FirestoreRestStore implements CampaignStore {
  constructor(
    private config: FirestoreConfig,
    private tokenProvider: (idToken: string) => string
  ) {}

  private base(): string {
    const db = encodeURIComponent(this.config.databaseId);
    return `https://firestore.googleapis.com/v1/projects/${this.config.projectId}/databases/${db}/documents`;
  }

  private async request(path: string, idToken: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
    const url = `${this.base()}${path}`;
    const response = await fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.tokenProvider(idToken)}`,
        ...(init.headers || {}),
      },
    });
    const text = await response.text();
    let parsed: unknown = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }
    }
    if (!response.ok) {
      const errorBody = parsed as { error?: { status?: string; message?: string } } | null;
      const message = errorBody?.error?.message || `Firestore request failed (${response.status})`;
      const status = response.status === 403 || response.status === 401 ? 403 : response.status;
      throw new StoreError(message, status, errorBody?.error?.status || 'firestore_error');
    }
    return (parsed as Record<string, unknown>) || {};
  }

  private async getDoc(path: string, idToken: string): Promise<Record<string, unknown> | null> {
    try {
      const doc = await this.request(path, idToken);
      return fromFsDocument(doc as { fields?: Record<string, FsValue> });
    } catch (error) {
      if (error instanceof StoreError && error.status === 404) return null;
      throw error;
    }
  }

  private async listCollection(path: string, idToken: string, pageSize = 200): Promise<Record<string, unknown>[]> {
    const docs: Record<string, unknown>[] = [];
    let pageToken: string | undefined;
    do {
      const query = new URLSearchParams({ pageSize: String(pageSize) });
      if (pageToken) query.set('pageToken', pageToken);
      const page = await this.request(`${path}?${query.toString()}`, idToken);
      const documents = (page.documents as { fields?: Record<string, FsValue> }[] | undefined) || [];
      for (const doc of documents) docs.push(fromFsDocument(doc));
      pageToken = page.nextPageToken as string | undefined;
    } while (pageToken);
    return docs;
  }

  private async patchDoc(path: string, body: Record<string, unknown>, idToken: string): Promise<void> {
    await this.request(path, idToken, {
      method: 'PATCH',
      body: JSON.stringify(toFsDocument(body)),
    });
  }

  private async createDoc(
    collectionPath: string,
    documentId: string,
    body: Record<string, unknown>,
    idToken: string
  ): Promise<void> {
    await this.request(`${collectionPath}?documentId=${encodeURIComponent(documentId)}`, idToken, {
      method: 'POST',
      body: JSON.stringify(toFsDocument(body)),
    });
  }

  private async deleteDoc(path: string, idToken: string): Promise<void> {
    await this.request(path, idToken, { method: 'DELETE' });
  }

  async getMembership(workspaceId: string, uid: string): Promise<WorkspaceMembership | null> {
    const doc = await this.getDoc(`/workspaces/${workspaceId}/members/${uid}`, this.currentToken());
    if (!doc) return null;
    return {
      uid,
      role: (doc.role as WorkspaceRole) || 'creator',
      displayName: (doc.displayName as string) || uid,
      status: (doc.status as WorkspaceMembership['status']) || 'active',
    };
  }

  private tokenRef = '';
  /** Set per request by the router before invoking store methods. */
  private currentToken(): string {
    return this.tokenRef;
  }
  withToken(idToken: string): this {
    this.tokenRef = idToken;
    return this;
  }

  async listCampaigns(workspaceId: string): Promise<Campaign[]> {
    const docs = await this.listCollection(`/workspaces/${workspaceId}/campaigns`, this.currentToken());
    return docs.map((doc) => this.toCampaign(doc)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getCampaign(workspaceId: string, campaignId: string): Promise<Campaign | null> {
    const docs = await this.listCollection(
      `/workspaces/${workspaceId}/campaigns/${campaignId}`,
      this.currentToken(),
      1
    );
    const doc = docs.find((d) => d.id === campaignId) || null;
    if (doc) return this.toCampaign(doc);
    const single = await this.getDoc(`/workspaces/${workspaceId}/campaigns/${campaignId}`, this.currentToken());
    return single ? this.toCampaign(single) : null;
  }

  private toCampaign(doc: Record<string, unknown>): Campaign {
    return { ...(doc as unknown as Campaign) };
  }

  async saveCampaign(campaign: Campaign): Promise<void> {
    await this.patchDoc(
      `/workspaces/${campaign.workspaceId}/campaigns/${campaign.id}`,
      campaign as unknown as Record<string, unknown>,
      this.currentToken()
    );
  }

  async deleteCampaign(workspaceId: string, campaignId: string): Promise<void> {
    await this.deleteDoc(`/workspaces/${workspaceId}/campaigns/${campaignId}`, this.currentToken());
  }

  async listAssets(workspaceId: string, campaignId: string): Promise<CampaignAsset[]> {
    const docs = await this.listCollection(
      `/workspaces/${workspaceId}/campaigns/${campaignId}/assets`,
      this.currentToken()
    );
    return docs
      .map((doc) => doc as unknown as CampaignAsset)
      .filter((asset) => Boolean(asset.id))
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  }

  async getAsset(workspaceId: string, campaignId: string, assetId: string): Promise<CampaignAsset | null> {
    const doc = await this.getDoc(
      `/workspaces/${workspaceId}/campaigns/${campaignId}/assets/${assetId}`,
      this.currentToken()
    );
    return doc ? (doc as unknown as CampaignAsset) : null;
  }

  async saveAsset(asset: CampaignAsset): Promise<void> {
    await this.patchDoc(
      `/workspaces/${asset.workspaceId}/campaigns/${asset.campaignId}/assets/${asset.id}`,
      asset as unknown as Record<string, unknown>,
      this.currentToken()
    );
  }

  async deleteAsset(workspaceId: string, campaignId: string, assetId: string): Promise<void> {
    await this.deleteDoc(
      `/workspaces/${workspaceId}/campaigns/${campaignId}/assets/${assetId}`,
      this.currentToken()
    );
  }

  async listEvidence(workspaceId: string): Promise<KnowledgeItem[]> {
    const docs = await this.listCollection(`/workspaces/${workspaceId}/knowledgeItems`, this.currentToken());
    return docs as unknown as KnowledgeItem[];
  }

  async appendAuditEvent(event: CampaignAuditEvent): Promise<void> {
    // POST with documentId is create-only: an existing id yields 409, which
    // guarantees the audit trail stays append-only without update rights.
    await this.createDoc(
      `/workspaces/${event.workspaceId}/campaigns/${event.campaignId}/auditEvents`,
      event.id,
      event as unknown as Record<string, unknown>,
      this.currentToken()
    );
  }

  async listAuditEvents(workspaceId: string, campaignId: string): Promise<CampaignAuditEvent[]> {
    const docs = await this.listCollection(
      `/workspaces/${workspaceId}/campaigns/${campaignId}/auditEvents`,
      this.currentToken()
    );
    return (docs as unknown as CampaignAuditEvent[]).sort((a, b) =>
      String(b.createdAt).localeCompare(String(a.createdAt))
    );
  }
}
