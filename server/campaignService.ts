import {
  ApprovalDecision,
  AssetReviewStatus,
  Campaign,
  CampaignApproval,
  CampaignAsset,
  CampaignAssetVersion,
  CampaignAuditEvent,
  CampaignChannel,
  CampaignClaim,
  CampaignFinding,
  CampaignReadiness,
  CampaignStatus,
  CrossChannelReport,
  ResolvedEvidence,
} from '../src/types/campaign';
import { KnowledgeItem, WorkspaceRole } from '../src/types/brandlens';
import {
  analyzeCrossChannel,
  approvalSatisfiesRole,
  buildAssetClaims,
  buildEvidenceIndex,
  evaluateCampaignReadiness,
  fingerprintAssets,
  hasPendingApproval,
  mergeFindings,
  REQUIRED_APPROVAL_ROLES,
  runAssetClaimGuard,
  validateAiFindings,
} from '../src/services/campaignEngine';
import { buildManifest, verifyManifest } from './manifest';
import { CampaignStore } from './campaignStore';
import {
  ApiError,
  assertDateRange,
  parseCampaignStatus,
  parseChannels,
  parseEvidenceIds,
  requireString,
} from './validation';

export interface WorkspaceUser {
  uid: string;
  displayName: string;
}

export interface ActorContext extends WorkspaceUser {
  workspaceId: string;
  role: WorkspaceRole;
}

export type EngineMode = 'Rules-only mode' | 'Source-grounded AI + Rules enabled';

/** Server-side Gemini reviewer. Model output is never trusted directly. */
export interface AiAssetReviewer {
  reviewAsset(input: {
    title: string;
    channel: CampaignChannel;
    content: string;
    evidence: ResolvedEvidence[];
  }): Promise<unknown>;
}

export interface CampaignServiceDeps {
  store: CampaignStore;
  now?: () => Date;
  newId?: (prefix: string) => string;
  aiReviewer?: AiAssetReviewer | null;
}

export interface CampaignInput {
  name: string;
  description: string;
  objective: string;
  targetAudience: string;
  ownerId?: string;
  startDate: string;
  endDate: string;
  status?: unknown;
  channels: unknown;
}

export interface AssetInput {
  title: string;
  channel: string;
  content: string;
  evidenceIds?: unknown;
  reviewerId?: string | null;
  changeSummary?: string;
}

export interface CampaignDetail {
  campaign: Campaign;
  assets: CampaignAsset[];
  readiness: CampaignReadiness;
  auditEvents: CampaignAuditEvent[];
  manifestVerification: {
    present: boolean;
    intact: boolean;
    tamperedAssets: string[];
    missingAssets: string[];
    removedAssets: string[];
    recomputedManifestHash: string | null;
  };
}

const EDIT_CAMPAIGN_ROLES: WorkspaceRole[] = ['creator', 'brand_manager', 'admin'];
const REVIEW_ROLES: WorkspaceRole[] = ['specialist_reviewer', 'brand_manager', 'admin'];
const RELEASE_ROLES: WorkspaceRole[] = ['publish_owner', 'admin'];
const CONFLICT_RESOLVER_ROLES: WorkspaceRole[] = ['brand_manager', 'admin', 'publish_owner'];

const ASSET_EDITABLE_STATUSES: AssetReviewStatus[] = ['draft', 'changes_requested'];

function hasRole(role: WorkspaceRole, allowed: WorkspaceRole[]): boolean {
  return role === 'admin' || allowed.includes(role);
}

function forbid(message: string): never {
  throw new ApiError(message, 403, 'forbidden');
}

function conflict(message: string, code = 'state_conflict', details: string[] = []): never {
  throw new ApiError(message, 409, code, details);
}

export class CampaignService {
  private store: CampaignStore;
  private now: () => Date;
  private newId: (prefix: string) => string;
  private aiReviewer: AiAssetReviewer | null;

  constructor(deps: CampaignServiceDeps) {
    this.store = deps.store;
    this.now = deps.now || (() => new Date());
    this.newId =
      deps.newId ||
      ((prefix: string) => {
        const cryptoApi = globalThis.crypto as Crypto | undefined;
        if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
          return `${prefix}-${cryptoApi.randomUUID()}`;
        }
        return `${prefix}-${Math.random().toString(36).slice(2, 12)}`;
      });
    this.aiReviewer = deps.aiReviewer || null;
  }

  /* ---------------------------------------------------------------- *
   * Authorization helpers
   * ---------------------------------------------------------------- */
  private assertRole(ctx: ActorContext, roles: WorkspaceRole[], message: string): void {
    if (!hasRole(ctx.role, roles)) forbid(message);
  }

  private async loadCampaign(ctx: ActorContext, campaignId: string): Promise<Campaign> {
    const campaign = await this.store.getCampaign(ctx.workspaceId, campaignId);
    if (!campaign) throw new ApiError('Campaign not found', 404, 'campaign_not_found');
    if (campaign.workspaceId !== ctx.workspaceId) {
      throw new ApiError('Campaign not found', 404, 'campaign_not_found');
    }
    return campaign;
  }

  private async loadAsset(ctx: ActorContext, campaignId: string, assetId: string): Promise<CampaignAsset> {
    const asset = await this.store.getAsset(ctx.workspaceId, campaignId, assetId);
    if (!asset) throw new ApiError('Asset not found', 404, 'asset_not_found');
    return asset;
  }

  private async audit(
    ctx: ActorContext,
    campaignId: string,
    action: string,
    options: {
      assetId?: string | null;
      reason?: string | null;
      metadata?: Record<string, string | number | boolean | null>;
    } = {}
  ): Promise<void> {
    const event: CampaignAuditEvent = {
      id: this.newId('aud'),
      workspaceId: ctx.workspaceId,
      campaignId,
      assetId: options.assetId ?? null,
      actorId: ctx.uid,
      actorName: ctx.displayName,
      actorRole: ctx.role,
      action,
      reason: options.reason ?? null,
      createdAt: this.now().toISOString(),
      metadata: options.metadata || {},
    };
    await this.store.appendAuditEvent(event);
  }

  private async evidenceIndex(ctx: ActorContext): Promise<{
    items: KnowledgeItem[];
    index: Record<string, ResolvedEvidence>;
  }> {
    const items = await this.store.listEvidence(ctx.workspaceId);
    return { items, index: buildEvidenceIndex(items) };
  }

  private async touchCampaign(campaign: Campaign, assets?: CampaignAsset[]): Promise<Campaign> {
    const list = assets || (await this.store.listAssets(campaign.workspaceId, campaign.id));
    const updated: Campaign = {
      ...campaign,
      assetCount: list.length,
      updatedAt: this.now().toISOString(),
    };
    await this.store.saveCampaign(updated);
    return updated;
  }

  private manifestState(
    campaign: Campaign,
    assets: CampaignAsset[],
    fingerprint: string
  ): { state: CampaignReadiness['checks']['manifestState']; verification: CampaignDetail['manifestVerification'] } {
    if (!campaign.manifest) {
      return {
        state: 'missing',
        verification: {
          present: false,
          intact: false,
          tamperedAssets: [],
          missingAssets: [],
          removedAssets: [],
          recomputedManifestHash: null,
        },
      };
    }
    const result = verifyManifest(campaign.manifest, campaign, assets);
    const state: CampaignReadiness['checks']['manifestState'] = !result.intact
      ? 'tampered'
      : campaign.manifest.contentFingerprint !== fingerprint
        ? 'stale'
        : 'current';
    return {
      state,
      verification: {
        present: true,
        intact: result.intact,
        tamperedAssets: result.tamperedAssets,
        missingAssets: result.missingAssets,
        removedAssets: result.removedAssets,
        recomputedManifestHash: result.recomputedManifestHash,
      },
    };
  }

  /* ---------------------------------------------------------------- *
   * Campaigns
   * ---------------------------------------------------------------- */
  async createCampaign(ctx: ActorContext, input: CampaignInput): Promise<Campaign> {
    this.assertRole(ctx, EDIT_CAMPAIGN_ROLES, 'Your role cannot create campaigns');

    const name = requireString(input.name, 'name', { max: 160 });
    const description = requireString(input.description, 'description', { max: 2000 });
    const objective = requireString(input.objective, 'objective', { max: 1000 });
    const targetAudience = requireString(input.targetAudience, 'targetAudience', { max: 500 });
    const { startDate, endDate } = assertDateRange(input.startDate, input.endDate);
    const channels = parseChannels(input.channels);
    const status = parseCampaignStatus(input.status, 'draft');

    let ownerId = ctx.uid;
    let ownerName = ctx.displayName;
    if (input.ownerId && input.ownerId !== ctx.uid) {
      this.assertRole(ctx, ['brand_manager', 'admin'], 'Only brand managers or admins may assign another owner');
      const membership = await this.store.getMembership(ctx.workspaceId, input.ownerId);
      if (!membership || membership.status !== 'active') {
        throw new ApiError('Selected campaign owner is not an active workspace member', 400, 'invalid_owner');
      }
      ownerId = membership.uid;
      ownerName = membership.displayName;
    }

    const nowIso = this.now().toISOString();
    const campaign: Campaign = {
      id: this.newId('cmp'),
      workspaceId: ctx.workspaceId,
      name,
      description,
      objective,
      targetAudience,
      ownerId,
      ownerName,
      startDate,
      endDate,
      status,
      channels,
      createdBy: ctx.uid,
      createdByName: ctx.displayName,
      createdAt: nowIso,
      updatedAt: nowIso,
      assetCount: 0,
      approvals: [],
      crossChannelReport: null,
      manifest: null,
      releasedAt: null,
    };

    await this.store.saveCampaign(campaign);
    await this.audit(ctx, campaign.id, 'campaign.created', {
      metadata: { name, channels: channels.join(','), status },
    });
    return campaign;
  }

  async listCampaigns(
    ctx: ActorContext,
    filters: { status?: string; channel?: string; search?: string } = {}
  ): Promise<Campaign[]> {
    let campaigns = await this.store.listCampaigns(ctx.workspaceId);
    if (filters.status) campaigns = campaigns.filter((c) => c.status === filters.status);
    if (filters.channel) campaigns = campaigns.filter((c) => c.channels.includes(filters.channel as CampaignChannel));
    if (filters.search) {
      const needle = filters.search.trim().toLowerCase();
      campaigns = campaigns.filter(
        (c) =>
          c.name.toLowerCase().includes(needle) ||
          c.description.toLowerCase().includes(needle) ||
          c.objective.toLowerCase().includes(needle)
      );
    }
    return campaigns;
  }

  async getCampaignDetail(ctx: ActorContext, campaignId: string): Promise<CampaignDetail> {
    const campaign = await this.loadCampaign(ctx, campaignId);
    const [assets, auditEvents, evidence] = await Promise.all([
      this.store.listAssets(ctx.workspaceId, campaignId),
      this.store.listAuditEvents(ctx.workspaceId, campaignId),
      this.evidenceIndex(ctx),
    ]);
    const fingerprint = fingerprintAssets(assets);
    const manifest = this.manifestState(campaign, assets, fingerprint);
    const readiness = evaluateCampaignReadiness({
      campaign,
      assets,
      evidenceIndex: evidence.index,
      manifestState: manifest.state,
      now: this.now(),
    });
    return {
      campaign,
      assets,
      readiness,
      auditEvents,
      manifestVerification: manifest.verification,
    };
  }

  async updateCampaign(ctx: ActorContext, campaignId: string, input: Partial<CampaignInput>): Promise<Campaign> {
    const campaign = await this.loadCampaign(ctx, campaignId);
    const isOwner = campaign.ownerId === ctx.uid || campaign.createdBy === ctx.uid;
    if (!isOwner) this.assertRole(ctx, ['brand_manager', 'admin'], 'You cannot edit this campaign');
    if (campaign.status === 'released' && !hasRole(ctx.role, ['admin'])) {
      conflict('Released campaigns are immutable. Archive and re-open a new campaign instead.', 'campaign_released');
    }

    const next: Campaign = { ...campaign };
    if (input.name !== undefined) next.name = requireString(input.name, 'name', { max: 160 });
    if (input.description !== undefined) next.description = requireString(input.description, 'description', { max: 2000 });
    if (input.objective !== undefined) next.objective = requireString(input.objective, 'objective', { max: 1000 });
    if (input.targetAudience !== undefined) {
      next.targetAudience = requireString(input.targetAudience, 'targetAudience', { max: 500 });
    }
    if (input.startDate !== undefined || input.endDate !== undefined) {
      const range = assertDateRange(input.startDate ?? campaign.startDate, input.endDate ?? campaign.endDate);
      next.startDate = range.startDate;
      next.endDate = range.endDate;
    }
    if (input.channels !== undefined) next.channels = parseChannels(input.channels);
    if (input.status !== undefined) {
      const status = parseCampaignStatus(input.status, campaign.status as CampaignStatus);
      if (status !== campaign.status) {
        if (status === 'released') {
          conflict('Use the release manifest endpoint to release a campaign', 'use_manifest_endpoint');
        }
        if (status === 'archived' && !hasRole(ctx.role, ['brand_manager', 'admin'])) {
          forbid('Only brand managers or admins may archive a campaign');
        }
        next.status = status;
      }
    }
    next.updatedAt = this.now().toISOString();
    await this.store.saveCampaign(next);
    await this.audit(ctx, campaignId, 'campaign.updated', {
      metadata: { status: next.status, channels: next.channels.join(',') },
    });
    return next;
  }

  /* ---------------------------------------------------------------- *
   * Assets
   * ---------------------------------------------------------------- */
  private async resolveEvidenceIds(ctx: ActorContext, raw: unknown): Promise<string[]> {
    const ids = parseEvidenceIds(raw);
    if (ids.length === 0) return ids;
    const evidence = await this.store.listEvidence(ctx.workspaceId);
    const known = new Set(evidence.map((item) => item.id));
    const unknown = ids.filter((id) => !known.has(id));
    if (unknown.length > 0) {
      throw new ApiError(
        `Unknown evidence reference(s): ${unknown.join(', ')}. Evidence must exist in the governance library.`,
        400,
        'unknown_evidence',
        unknown
      );
    }
    return ids;
  }

  private assertAssetEditable(asset: CampaignAsset, ctx: ActorContext): void {
    const isCreator = asset.createdBy === ctx.uid;
    if (!isCreator) this.assertRole(ctx, ['brand_manager', 'admin'], 'You are not the owner of this asset');
    if (!ASSET_EDITABLE_STATUSES.includes(asset.status)) {
      conflict(
        `Asset is "${asset.status}" and cannot be edited. Create a new version from a draft or requested-changes asset.`,
        'asset_locked'
      );
    }
  }

  async saveAsset(
    ctx: ActorContext,
    campaignId: string,
    assetId: string | null,
    input: AssetInput
  ): Promise<CampaignAsset> {
    const campaign = await this.loadCampaign(ctx, campaignId);
    if (campaign.status === 'released' || campaign.status === 'archived') {
      conflict('Campaign is closed for edits. Reopen the campaign before changing assets.', 'campaign_locked');
    }
    this.assertRole(ctx, EDIT_CAMPAIGN_ROLES, 'Your role cannot manage campaign assets');

    const title = requireString(input.title, 'title', { max: 200 });
    const content = requireString(input.content, 'content', { min: 10, max: 20000 });
    const channel = requireString(input.channel, 'channel', { max: 40 }) as CampaignChannel;
    if (!campaign.channels.includes(channel)) {
      throw new ApiError(
        `Channel "${channel}" is not enabled for this campaign`,
        400,
        'channel_not_in_campaign'
      );
    }
    const evidenceIds = await this.resolveEvidenceIds(ctx, input.evidenceIds);

    let reviewerId = input.reviewerId ?? null;
    let reviewerName: string | null = null;
    if (reviewerId) {
      if (reviewerId === ctx.uid) {
        throw new ApiError('You cannot assign yourself as the reviewer', 400, 'self_review_not_allowed');
      }
      const membership = await this.store.getMembership(ctx.workspaceId, reviewerId);
      if (!membership || membership.status !== 'active') {
        throw new ApiError('Assigned reviewer is not an active workspace member', 400, 'invalid_reviewer');
      }
      if (!hasRole(membership.role, ['specialist_reviewer', 'brand_manager'])) {
        throw new ApiError('Assigned reviewer does not hold a review role', 400, 'invalid_reviewer_role');
      }
      reviewerId = membership.uid;
      reviewerName = membership.displayName;
    }

    const nowIso = this.now().toISOString();
    const evidenceIndex = (await this.evidenceIndex(ctx)).index;

    if (!assetId) {
      const asset: CampaignAsset = {
        id: this.newId('ast'),
        workspaceId: ctx.workspaceId,
        campaignId,
        title,
        channel,
        content,
        claims: buildAssetClaims(content, evidenceIds, evidenceIndex, this.now()),
        evidenceIds,
        version: 1,
        status: 'draft',
        reviewerId,
        reviewerName,
        createdBy: ctx.uid,
        createdByName: ctx.displayName,
        createdAt: nowIso,
        updatedAt: nowIso,
        submittedAt: null,
        lastVerifiedAt: null,
        engineMode: null,
        findings: [],
        versions: [
          {
            version: 1,
            title,
            channel,
            content,
            savedAt: nowIso,
            savedBy: ctx.uid,
            savedByName: ctx.displayName,
            changeSummary: requireString(input.changeSummary ?? 'Initial draft', 'changeSummary', { max: 300 }),
            status: 'draft',
          },
        ],
      };
      await this.store.saveAsset(asset);
      await this.audit(ctx, campaignId, 'asset.created', {
        assetId: asset.id,
        metadata: { channel, version: 1 },
      });
      await this.touchCampaign(campaign);
      return asset;
    }

    const existing = await this.loadAsset(ctx, campaignId, assetId);
    this.assertAssetEditable(existing, ctx);

    const contentChanged =
      existing.title !== title || existing.content !== content || existing.channel !== channel;
    const version = existing.version + 1;
    const versionSnapshot: CampaignAssetVersion = {
      version,
      title,
      channel,
      content,
      savedAt: nowIso,
      savedBy: ctx.uid,
      savedByName: ctx.displayName,
      changeSummary: requireString(
        input.changeSummary ?? (contentChanged ? 'Content revision' : 'Metadata update'),
        'changeSummary',
        { max: 300 }
      ),
      status: 'draft',
    };

    const updated: CampaignAsset = {
      ...existing,
      title,
      channel,
      content,
      evidenceIds,
      claims: buildAssetClaims(content, evidenceIds, evidenceIndex, this.now()),
      version,
      status: 'draft',
      reviewerId,
      reviewerName,
      updatedAt: nowIso,
      findings: [],
      lastVerifiedAt: null,
      engineMode: null,
      versions: [...existing.versions, versionSnapshot],
    };
    await this.store.saveAsset(updated);
    await this.audit(ctx, campaignId, 'asset.updated', {
      assetId,
      metadata: { version, contentChanged },
    });
    await this.touchCampaign(campaign);
    return updated;
  }

  async deleteAsset(ctx: ActorContext, campaignId: string, assetId: string): Promise<{ deleted: true }> {
    const campaign = await this.loadCampaign(ctx, campaignId);
    const asset = await this.loadAsset(ctx, campaignId, assetId);
    if (campaign.status === 'released' || campaign.status === 'archived') {
      conflict('Released or archived campaigns keep their assets for the audit trail.', 'campaign_locked');
    }
    this.assertAssetEditable(asset, ctx);
    if (asset.status === 'submitted' || asset.status === 'in_review') {
      conflict('Submitted assets cannot be deleted while review is pending.', 'asset_in_review');
    }
    await this.store.deleteAsset(ctx.workspaceId, campaignId, assetId);
    await this.audit(ctx, campaignId, 'asset.deleted', {
      assetId,
      reason: 'Draft asset deleted by authorised owner',
      metadata: { version: asset.version, channel: asset.channel },
    });
    await this.touchCampaign(campaign);
    return { deleted: true };
  }

  async submitAsset(ctx: ActorContext, campaignId: string, assetId: string): Promise<CampaignAsset> {
    const campaign = await this.loadCampaign(ctx, campaignId);
    const asset = await this.loadAsset(ctx, campaignId, assetId);
    this.assertAssetEditable(asset, ctx);
    if (asset.status === 'submitted' || asset.status === 'in_review') {
      conflict('This asset is already submitted for review.', 'duplicate_submission');
    }
    if (!asset.lastVerifiedAt) {
      conflict('Run the compliance analysis before submitting this asset for review.', 'verification_required');
    }
    const nowIso = this.now().toISOString();
    const updated: CampaignAsset = {
      ...asset,
      status: 'submitted',
      submittedAt: nowIso,
      updatedAt: nowIso,
      versions: [
        ...asset.versions,
        {
          version: asset.version,
          title: asset.title,
          channel: asset.channel,
          content: asset.content,
          savedAt: nowIso,
          savedBy: ctx.uid,
          savedByName: ctx.displayName,
          changeSummary: 'Submitted for compliance review',
          status: 'submitted',
        },
      ],
    };
    await this.store.saveAsset(updated);
    await this.audit(ctx, campaignId, 'asset.submitted', {
      assetId,
      metadata: { version: asset.version, findings: asset.findings.length },
    });
    await this.touchCampaign(campaign);
    return updated;
  }

  async reviewAsset(
    ctx: ActorContext,
    campaignId: string,
    assetId: string,
    decision: ApprovalDecision,
    note: string | null
  ): Promise<CampaignAsset> {
    this.assertRole(ctx, REVIEW_ROLES, 'Your role cannot record review decisions');
    const campaign = await this.loadCampaign(ctx, campaignId);
    const asset = await this.loadAsset(ctx, campaignId, assetId);
    if (asset.createdBy === ctx.uid) {
      forbid('You cannot review an asset you created (self-approval is blocked).');
    }
    if (asset.status === 'draft' || asset.status === 'changes_requested') {
      conflict('Only submitted assets can be reviewed.', 'asset_not_submitted');
    }
    const auditEvents = await this.store.listAuditEvents(ctx.workspaceId, campaignId);
    const alreadyDecided = auditEvents.some(
      (event) =>
        event.assetId === assetId &&
        event.actorId === ctx.uid &&
        event.action === `asset.${decision}` &&
        event.metadata.version === asset.version
    );
    if (alreadyDecided) {
      conflict('You already recorded this decision for the current asset version.', 'duplicate_decision');
    }

    const nowIso = this.now().toISOString();
    const updated: CampaignAsset = {
      ...asset,
      status: decision === 'approved' ? 'approved' : 'changes_requested',
      reviewerId: ctx.uid,
      reviewerName: ctx.displayName,
      updatedAt: nowIso,
      versions: [
        ...asset.versions,
        {
          version: asset.version,
          title: asset.title,
          channel: asset.channel,
          content: asset.content,
          savedAt: nowIso,
          savedBy: ctx.uid,
          savedByName: ctx.displayName,
          changeSummary:
            decision === 'approved' ? 'Approved by reviewer' : 'Changes requested by reviewer',
          status: decision === 'approved' ? 'approved' : 'changes_requested',
        },
      ],
    };
    await this.store.saveAsset(updated);
    await this.audit(ctx, campaignId, `asset.${decision}`, {
      assetId,
      reason: note,
      metadata: { version: asset.version },
    });
    await this.touchCampaign(campaign);
    return updated;
  }

  /* ---------------------------------------------------------------- *
   * Claim verification (Claim Guard reuse + server-side AI validation)
   * ---------------------------------------------------------------- */
  async verifyAsset(
    ctx: ActorContext,
    campaignId: string,
    assetId: string
  ): Promise<{
    asset: CampaignAsset;
    engineMode: EngineMode;
    rejectedAiFindings: { reason: string; excerpt: string }[];
  }> {
    const asset = await this.loadAsset(ctx, campaignId, assetId);
    const evidence = await this.evidenceIndex(ctx);

    const deterministic = runAssetClaimGuard({
      workspaceId: ctx.workspaceId,
      assetId: asset.id,
      channel: asset.channel,
      title: asset.title,
      content: asset.content,
      evidence: evidence.items,
    });

    let aiFindings: CampaignFinding[] = [];
    let engineMode: EngineMode = 'Rules-only mode';
    let rejectedAiFindings: { reason: string; excerpt: string }[] = [];

    if (this.aiReviewer) {
      try {
        const raw = await this.aiReviewer.reviewAsset({
          title: asset.title,
          channel: asset.channel,
          content: asset.content,
          evidence: Object.values(evidence.index),
        });
        const validated = validateAiFindings({
          rawFindings: raw,
          content: asset.content,
          evidenceIndex: evidence.index,
          now: this.now(),
          assetId: asset.id,
          workspaceId: ctx.workspaceId,
        });
        aiFindings = validated.accepted;
        rejectedAiFindings = validated.rejected.map((r) => ({ reason: r.reason, excerpt: r.excerpt }));
        engineMode = 'Source-grounded AI + Rules enabled';
      } catch (error) {
        console.warn('AI claim verification failed, falling back to deterministic rules:', error);
        engineMode = 'Rules-only mode';
      }
    }

    const nowIso = this.now().toISOString();
    const updated: CampaignAsset = {
      ...asset,
      findings: mergeFindings(deterministic, aiFindings),
      claims: buildAssetClaims(asset.content, asset.evidenceIds, evidence.index, this.now()),
      lastVerifiedAt: nowIso,
      engineMode,
      updatedAt: nowIso,
    };
    await this.store.saveAsset(updated);
    await this.audit(ctx, campaignId, 'asset.verified', {
      assetId,
      metadata: {
        findings: updated.findings.length,
        critical: updated.findings.filter((f) => f.severity === 'high').length,
        engineMode,
        rejectedAiFindings: rejectedAiFindings.length,
      },
    });
    return { asset: updated, engineMode, rejectedAiFindings };
  }

  /* ---------------------------------------------------------------- *
   * Cross-channel consistency
   * ---------------------------------------------------------------- */
  async runCrossChannel(ctx: ActorContext, campaignId: string): Promise<CrossChannelReport> {
    const campaign = await this.loadCampaign(ctx, campaignId);
    const assets = await this.store.listAssets(ctx.workspaceId, campaignId);
    if (assets.length === 0) {
      throw new ApiError('Add at least one asset before running the cross-channel report', 400, 'no_assets');
    }
    const evidence = await this.evidenceIndex(ctx);
    const previous: Record<string, { resolution: string; resolvedBy: string; resolvedAt: string }> = {};
    for (const existing of campaign.crossChannelReport?.conflicts || []) {
      if (existing.resolved && existing.resolution) {
        previous[existing.id] = {
          resolution: existing.resolution,
          resolvedBy: existing.resolvedBy || 'unknown',
          resolvedAt: existing.resolvedAt || this.now().toISOString(),
        };
      }
    }

    const report = analyzeCrossChannel({
      campaign: { id: campaign.id, name: campaign.name, workspaceId: campaign.workspaceId },
      assets,
      evidenceIndex: evidence.index,
      now: this.now(),
      generatedBy: ctx.uid,
      engineMode: assets.some((a) => a.engineMode === 'Source-grounded AI + Rules enabled')
        ? 'Source-grounded AI + Rules enabled'
        : 'Rules-only mode',
      previousResolutions: previous,
    });

    const updated: Campaign = {
      ...campaign,
      crossChannelReport: report,
      updatedAt: this.now().toISOString(),
    };
    await this.store.saveCampaign(updated);
    await this.audit(ctx, campaignId, 'campaign.cross_channel_analyzed', {
      metadata: {
        assets: assets.length,
        conflicts: report.conflicts.length,
        critical: report.conflicts.filter((c) => c.severity === 'high').length,
      },
    });
    return report;
  }

  async resolveConflict(
    ctx: ActorContext,
    campaignId: string,
    conflictId: string,
    resolution: string
  ): Promise<CrossChannelReport> {
    this.assertRole(ctx, CONFLICT_RESOLVER_ROLES, 'Your role cannot resolve cross-channel conflicts');
    const campaign = await this.loadCampaign(ctx, campaignId);
    const report = campaign.crossChannelReport;
    if (!report) throw new ApiError('Run the cross-channel report first', 400, 'report_missing');
    const target = report.conflicts.find((c) => c.id === conflictId);
    if (!target) throw new ApiError('Conflict not found', 404, 'conflict_not_found');
    if (target.resolved) conflict('This conflict is already resolved.', 'already_resolved');

    const text = requireString(resolution, 'resolution', { min: 5, max: 1000 });
    const nowIso = this.now().toISOString();
    const conflicts = report.conflicts.map((c) =>
      c.id === conflictId
        ? { ...c, resolved: true, resolution: text, resolvedBy: ctx.uid, resolvedAt: nowIso }
        : c
    );
    const updatedReport: CrossChannelReport = { ...report, conflicts };
    await this.store.saveCampaign({ ...campaign, crossChannelReport: updatedReport, updatedAt: nowIso });
    await this.audit(ctx, campaignId, 'campaign.conflict_resolved', {
      reason: text,
      metadata: { conflictId, kind: target.kind, topic: target.topic },
    });
    return updatedReport;
  }

  /* ---------------------------------------------------------------- *
   * Approval lane
   * ---------------------------------------------------------------- */
  async decideCampaign(
    ctx: ActorContext,
    campaignId: string,
    decision: ApprovalDecision,
    note: string | null
  ): Promise<{ campaign: Campaign; readiness: CampaignReadiness }> {
    this.assertRole(ctx, REVIEW_ROLES, 'Your role cannot record campaign approvals');
    const campaign = await this.loadCampaign(ctx, campaignId);
    const assets = await this.store.listAssets(ctx.workspaceId, campaignId);
    if (campaign.createdBy === ctx.uid || campaign.ownerId === ctx.uid) {
      forbid('Campaign owners cannot approve their own campaign.');
    }
    if (assets.some((asset) => asset.createdBy === ctx.uid)) {
      forbid('You authored an asset in this campaign, so you cannot approve it.');
    }
    if (campaign.status === 'released') conflict('This campaign has already been released.', 'campaign_released');

    const fingerprint = fingerprintAssets(assets);
    if (hasPendingApproval(campaign.approvals, ctx.uid, fingerprint)) {
      conflict('You already recorded an approval for the current content.', 'duplicate_approval');
    }

    const evidence = await this.evidenceIndex(ctx);
    const manifest = this.manifestState(campaign, assets, fingerprint);
    const preReadiness = evaluateCampaignReadiness({
      campaign,
      assets,
      evidenceIndex: evidence.index,
      manifestState: manifest.state,
      now: this.now(),
    });

    if (decision === 'changes_requested') {
      const approval: CampaignApproval = {
        id: this.newId('apr'),
        actorId: ctx.uid,
        actorName: ctx.displayName,
        role: ctx.role,
        decision,
        note: note ? requireString(note, 'note', { max: 1000 }) : null,
        createdAt: this.now().toISOString(),
        contentFingerprint: fingerprint,
      };
      const updated: Campaign = {
        ...campaign,
        approvals: [...campaign.approvals, approval],
        status: 'in_review',
        updatedAt: this.now().toISOString(),
      };
      await this.store.saveCampaign(updated);
      await this.audit(ctx, campaignId, 'campaign.changes_requested', { reason: approval.note });
      return { campaign: updated, readiness: preReadiness };
    }

    // Content gate: ignore approval/manifest blockers (this decision is what creates them).
    const blocking = preReadiness.blockers.filter(
      (b) => !['incomplete_approvals', 'approval_stale', 'manifest_missing', 'manifest_stale'].includes(b.code)
    );
    if (blocking.length > 0) {
      throw new ApiError(
        'Campaign is not ready for approval. Resolve the blocking issues first.',
        409,
        'readiness_blocked',
        blocking.map((b) => `${b.code}: ${b.message}`)
      );
    }

    const approval: CampaignApproval = {
      id: this.newId('apr'),
      actorId: ctx.uid,
      actorName: ctx.displayName,
      role: ctx.role,
      decision,
      note: note ? requireString(note, 'note', { max: 1000 }) : null,
      createdAt: this.now().toISOString(),
      contentFingerprint: fingerprint,
    };
    const approvals = [...campaign.approvals, approval];
    const satisfiedRoles = REQUIRED_APPROVAL_ROLES.filter((required) =>
      approvals.some(
        (a) =>
          a.contentFingerprint === fingerprint &&
          a.decision === 'approved' &&
          approvalSatisfiesRole(a.role, required)
      )
    );

    const postReadiness = evaluateCampaignReadiness({
      campaign: { ...campaign, approvals },
      assets,
      evidenceIndex: evidence.index,
      manifestState: manifest.state,
      now: this.now(),
    });

    const updated: Campaign = {
      ...campaign,
      approvals,
      status: satisfiedRoles.length === REQUIRED_APPROVAL_ROLES.length && postReadiness.ready === true
        ? 'approved'
        : 'in_review',
      updatedAt: this.now().toISOString(),
    };
    await this.store.saveCampaign(updated);
    await this.audit(ctx, campaignId, 'campaign.approved', {
      reason: approval.note,
      metadata: { role: ctx.role, satisfiedRoles: satisfiedRoles.join(',') },
    });
    return { campaign: updated, readiness: postReadiness };
  }

  /* ---------------------------------------------------------------- *
   * Release manifest
   * ---------------------------------------------------------------- */
  async generateManifest(
    ctx: ActorContext,
    campaignId: string
  ): Promise<{ campaign: Campaign; manifest: NonNullable<Campaign['manifest']> }> {
    this.assertRole(ctx, RELEASE_ROLES, 'Only release owners or admins may create a release manifest');
    const campaign = await this.loadCampaign(ctx, campaignId);
    const assets = await this.store.listAssets(ctx.workspaceId, campaignId);
    const evidence = await this.evidenceIndex(ctx);
    const fingerprint = fingerprintAssets(assets);
    const manifest = this.manifestState(campaign, assets, fingerprint);

    const readiness = evaluateCampaignReadiness({
      campaign,
      assets,
      evidenceIndex: evidence.index,
      manifestState: manifest.state,
      now: this.now(),
    });
    if (!readiness.ready) {
      throw new ApiError(
        'Release is blocked until every compliance gate passes.',
        409,
        'readiness_blocked',
        readiness.blockers.map((b) => `${b.code}: ${b.message}`)
      );
    }

    const previousHash = campaign.manifest?.manifestHash ?? null;
    const built = buildManifest({
      campaign,
      assets,
      contentFingerprint: fingerprint,
      actorId: ctx.uid,
      actorName: ctx.displayName,
      manifestId: this.newId('mf'),
      now: this.now(),
      previousManifestHash: previousHash,
    });

    const updated: Campaign = {
      ...campaign,
      status: 'released',
      releasedAt: built.createdAt,
      manifest: {
        ...built,
        status: 'current',
        integrityNote: `SHA-256 over ${built.files.length} asset revision(s); hash chained to the previous manifest.`,
      },
      updatedAt: built.createdAt,
    };
    await this.store.saveCampaign(updated);
    await this.audit(ctx, campaignId, 'campaign.released', {
      metadata: {
        manifestId: built.manifestId,
        manifestHash: built.manifestHash,
        files: built.files.length,
      },
    });
    return { campaign: updated, manifest: updated.manifest! };
  }

  async verifyManifestIntegrity(ctx: ActorContext, campaignId: string): Promise<CampaignDetail['manifestVerification']> {
    const campaign = await this.loadCampaign(ctx, campaignId);
    const assets = await this.store.listAssets(ctx.workspaceId, campaignId);
    return this.manifestState(campaign, assets, fingerprintAssets(assets)).verification;
  }

  async listAuditEvents(ctx: ActorContext, campaignId: string): Promise<CampaignAuditEvent[]> {
    await this.loadCampaign(ctx, campaignId);
    return this.store.listAuditEvents(ctx.workspaceId, campaignId);
  }
}

/** Shared declarations re-exported for route-layer typing. */
export type { CampaignClaim, KnowledgeItem };
