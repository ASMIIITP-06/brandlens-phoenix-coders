import { auth } from './firebase';
import {
  ApprovalDecision,
  Campaign,
  CampaignAsset,
  CampaignAuditEvent,
  CampaignChannel,
  CrossChannelReport,
} from '../types/campaign';

/**
 * Thin, typed client for the Campaign Compliance Studio API.
 *
 * The browser never talks to Firestore directly for campaign data: every call
 * carries the caller's Firebase ID token to `/api/workspaces/:workspaceId/campaigns`,
 * where the server re-verifies the token, resolves the workspace role and
 * enforces authorization. Nothing here can grant roles or fabricate evidence.
 */

export class CampaignApiError extends Error {
  status: number;
  code: string;
  details: string[];

  constructor(message: string, status: number, code = 'request_failed', details: string[] = []) {
    super(message);
    this.name = 'CampaignApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export interface CampaignManifestVerification {
  present: boolean;
  intact: boolean;
  tamperedAssets: string[];
  missingAssets: string[];
  removedAssets: string[];
  recomputedManifestHash: string | null;
}

export interface CampaignReadinessSummary {
  ready: boolean;
  blockingReasons: string[];
  warnings: string[];
  satisfiedRoles: string[];
  requiredRoles: string[];
  unresolvedCriticalFindings: number;
  unresolvedConflicts: number;
  missingEvidenceAssets: number;
  expiredEvidenceAssets: number;
  approvals: { actorId: string; actorName: string; role: string; decision: string }[];
}

export interface CampaignDetail {
  campaign: Campaign;
  assets: CampaignAsset[];
  readiness: CampaignReadinessSummary;
  auditEvents: CampaignAuditEvent[];
  manifestVerification: CampaignManifestVerification;
}

export interface CampaignListFilters {
  search?: string;
  status?: string;
  channel?: string;
}

export interface CampaignInput {
  name: string;
  description: string;
  objective: string;
  targetAudience: string;
  ownerId: string;
  ownerName: string;
  startDate: string;
  endDate: string;
  status: string;
  channels: CampaignChannel[];
}

export interface AssetInput {
  title: string;
  channel: CampaignChannel;
  content: string;
  evidenceIds: string[];
  changeSummary: string;
}

export interface ManifestResult {
  manifest: Campaign['manifest'];
  verification: CampaignManifestVerification;
}

async function authorizationHeader(): Promise<string> {
  const user = auth.currentUser;
  if (!user) {
    throw new CampaignApiError(
      'Sign in to use the Campaign Compliance Studio — campaign data requires an authenticated workspace member.',
      401,
      'unauthenticated'
    );
  }
  const token = await user.getIdToken();
  return `Bearer ${token}`;
}

function basePath(workspaceId: string): string {
  return `/api/workspaces/${encodeURIComponent(workspaceId)}/campaigns`;
}

async function request<T>(
  workspaceId: string,
  path: string,
  init: { method?: string; body?: unknown } = {}
): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: await authorizationHeader(),
    Accept: 'application/json',
  };
  if (init.body !== undefined) headers['Content-Type'] = 'application/json';

  let response: Response;
  try {
    response = await fetch(`${basePath(workspaceId)}${path}`, {
      method: init.method || 'GET',
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch (networkError) {
    throw new CampaignApiError(
      `Could not reach the campaign API: ${networkError instanceof Error ? networkError.message : String(networkError)}`,
      0,
      'network_error'
    );
  }

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const errorPayload = (payload || {}) as { error?: string; code?: string; details?: string[] };
    throw new CampaignApiError(
      errorPayload.error || `Request failed with status ${response.status}`,
      response.status,
      errorPayload.code || 'request_failed',
      Array.isArray(errorPayload.details) ? errorPayload.details : []
    );
  }

  return (payload || {}) as T;
}

export const campaignRepository = {
  async list(workspaceId: string, filters: CampaignListFilters = {}): Promise<Campaign[]> {
    const params = new URLSearchParams();
    if (filters.search) params.set('search', filters.search);
    if (filters.status && filters.status !== 'all') params.set('status', filters.status);
    if (filters.channel && filters.channel !== 'all') params.set('channel', filters.channel);
    const query = params.toString();
    const data = await request<{ campaigns: Campaign[] }>(workspaceId, query ? `?${query}` : '');
    return data.campaigns || [];
  },

  create(workspaceId: string, input: CampaignInput): Promise<Campaign> {
    return request<{ campaign: Campaign }>(workspaceId, '', { method: 'POST', body: input }).then(
      (r) => r.campaign
    );
  },

  detail(workspaceId: string, campaignId: string): Promise<CampaignDetail> {
    return request<CampaignDetail>(workspaceId, `/${campaignId}`);
  },

  update(workspaceId: string, campaignId: string, patch: Record<string, unknown>): Promise<Campaign> {
    return request<{ campaign: Campaign }>(workspaceId, `/${campaignId}`, {
      method: 'PATCH',
      body: patch,
    }).then((r) => r.campaign);
  },

  createAsset(workspaceId: string, campaignId: string, input: AssetInput): Promise<CampaignAsset> {
    return request<{ asset: CampaignAsset }>(workspaceId, `/${campaignId}/assets`, {
      method: 'POST',
      body: input,
    }).then((r) => r.asset);
  },

  saveAsset(
    workspaceId: string,
    campaignId: string,
    assetId: string,
    input: AssetInput
  ): Promise<CampaignAsset> {
    return request<{ asset: CampaignAsset }>(workspaceId, `/${campaignId}/assets/${assetId}`, {
      method: 'PUT',
      body: input,
    }).then((r) => r.asset);
  },

  deleteAsset(workspaceId: string, campaignId: string, assetId: string): Promise<{ deleted: boolean }> {
    return request<{ deleted: boolean }>(workspaceId, `/${campaignId}/assets/${assetId}`, {
      method: 'DELETE',
    });
  },

  submitAsset(workspaceId: string, campaignId: string, assetId: string): Promise<CampaignAsset> {
    return request<{ asset: CampaignAsset }>(
      workspaceId,
      `/${campaignId}/assets/${assetId}/submit`,
      { method: 'POST', body: {} }
    ).then((r) => r.asset);
  },

  reviewAsset(
    workspaceId: string,
    campaignId: string,
    assetId: string,
    decision: ApprovalDecision,
    note: string | null
  ): Promise<CampaignAsset> {
    return request<{ asset: CampaignAsset }>(
      workspaceId,
      `/${campaignId}/assets/${assetId}/review`,
      { method: 'POST', body: { decision, note } }
    ).then((r) => r.asset);
  },

  verifyAsset(
    workspaceId: string,
    campaignId: string,
    assetId: string
  ): Promise<{
    asset: CampaignAsset;
    engineMode: string;
    rejectedAiFindings: { reason: string; excerpt: string }[];
  }> {
    return request(workspaceId, `/${campaignId}/assets/${assetId}/verify`, {
      method: 'POST',
      body: {},
    });
  },

  crossChannel(workspaceId: string, campaignId: string): Promise<CrossChannelReport> {
    return request<{ report: CrossChannelReport }>(workspaceId, `/${campaignId}/cross-channel`, {
      method: 'POST',
      body: {},
    }).then((r) => r.report);
  },

  resolveConflict(
    workspaceId: string,
    campaignId: string,
    conflictId: string,
    resolution: string
  ): Promise<CrossChannelReport> {
    return request<{ report: CrossChannelReport }>(
      workspaceId,
      `/${campaignId}/cross-channel/${conflictId}/resolve`,
      { method: 'POST', body: { resolution } }
    ).then((r) => r.report);
  },

  decide(
    workspaceId: string,
    campaignId: string,
    decision: ApprovalDecision,
    note: string | null
  ): Promise<{ campaign: Campaign; readiness: CampaignReadinessSummary }> {
    return request(workspaceId, `/${campaignId}/approvals`, {
      method: 'POST',
      body: { decision, note },
    });
  },

  generateManifest(workspaceId: string, campaignId: string): Promise<ManifestResult> {
    return request(workspaceId, `/${campaignId}/manifest`, { method: 'POST', body: {} });
  },

  verifyManifest(workspaceId: string, campaignId: string): Promise<CampaignManifestVerification> {
    return request<{ verification: CampaignManifestVerification }>(
      workspaceId,
      `/${campaignId}/manifest/verify`
    ).then((r) => r.verification);
  },

  audit(workspaceId: string, campaignId: string): Promise<CampaignAuditEvent[]> {
    return request<{ events: CampaignAuditEvent[] }>(workspaceId, `/${campaignId}/audit`).then(
      (r) => r.events || []
    );
  },
};
