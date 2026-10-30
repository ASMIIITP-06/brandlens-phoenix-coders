import { NextFunction, Request, Response, Router } from 'express';
import { AuthError, IdTokenVerifier, readBearerToken, VerifiedUser } from './auth';
import { CampaignStore, StoreError } from './campaignStore';
import { ActorContext, AiAssetReviewer, CampaignService } from './campaignService';
import { ApiError, assertDocumentId } from './validation';
import { ApprovalDecision } from '../src/types/campaign';

interface AuthedRequest extends Request {
  campaignAuth?: { user: VerifiedUser; idToken: string; workspaceId: string };
}

export interface CampaignRouterDeps {
  verifier: IdTokenVerifier;
  /** Builds a store bound to the caller's ID token (Firestore rules stay authoritative). */
  createStore(params: { workspaceId: string; idToken: string }): CampaignStore;
  aiReviewer?: AiAssetReviewer | null;
  now?: () => Date;
  newId?: (prefix: string) => string;
}

function asyncHandler(
  fn: (req: AuthedRequest, res: Response) => Promise<void>
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    fn(req as AuthedRequest, res).catch(next);
  };
}

function parseDecision(value: unknown): ApprovalDecision {
  if (value === 'approved' || value === 'changes_requested') return value;
  throw new ApiError('decision must be "approved" or "changes_requested"', 400, 'invalid_decision');
}

function optionalNote(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new ApiError('note must be a string', 400, 'validation_failed');
  return value.trim().slice(0, 1000) || null;
}

/**
 * Campaign Compliance Studio API.
 * Mounted at `/api/workspaces/:workspaceId/campaigns`.
 *
 * Every route: verifies the Firebase ID token, re-resolves the workspace role
 * from the membership document on the server, then delegates to CampaignService.
 * Client-supplied workspace ids, roles, evidence ids and approvals are never trusted.
 */
export function createCampaignRouter(deps: CampaignRouterDeps): Router {
  const router = Router({ mergeParams: true });

  const serviceFor = (req: AuthedRequest): CampaignService => {
    const auth = req.campaignAuth;
    if (!auth) throw new AuthError('Unauthenticated request', 401, 'unauthenticated');
    return new CampaignService({
      store: deps.createStore({ workspaceId: auth.workspaceId, idToken: auth.idToken }),
      now: deps.now,
      newId: deps.newId,
      aiReviewer: deps.aiReviewer ?? null,
    });
  };

  // 1. Authentication + workspace membership resolution (server-side role).
  router.use((rawReq: Request, res: Response, next: NextFunction) => {
    const req = rawReq as AuthedRequest;
    void (async () => {
      const urlWorkspaceId = assertDocumentId(req.params.workspaceId, 'workspaceId');
      const idToken = readBearerToken(req.headers.authorization);
      const user = await deps.verifier.verify(idToken);

      const store = deps.createStore({ workspaceId: urlWorkspaceId, idToken });
      const membership = await store.getMembership(urlWorkspaceId, user.uid);
      if (!membership) {
        throw new AuthError(
          'You are not a member of this workspace',
          403,
          'workspace_membership_required'
        );
      }
      if (membership.status !== 'active') {
        throw new AuthError(
          `Your workspace membership is "${membership.status}"`,
          403,
          'membership_inactive'
        );
      }

      req.campaignAuth = { user, idToken, workspaceId: urlWorkspaceId };
      res.setHeader('Cache-Control', 'no-store');
      next();
    })
  );

  /** Resolves the actor context, reading the authoritative role from Firestore. */
  const actorOf = async (req: AuthedRequest): Promise<ActorContext> => {
    const auth = req.campaignAuth!;
    const store = deps.createStore({ workspaceId: auth.workspaceId, idToken: auth.idToken });
    const membership = await store.getMembership(auth.workspaceId, auth.user.uid);
    if (!membership || membership.status !== 'active') {
      throw new AuthError('Workspace membership is required', 403, 'workspace_membership_required');
    }
    return {
      uid: auth.user.uid,
      displayName: membership.displayName || auth.user.displayName || auth.user.uid,
      workspaceId: auth.workspaceId,
      role: membership.role,
    };
  };

  /* ------------------------------ Campaigns ------------------------------ */

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const actor = await actorOf(req);
      const service = serviceFor(req);
      const campaigns = await service.listCampaigns(actor, {
        status: typeof req.query.status === 'string' ? req.query.status : undefined,
        channel: typeof req.query.channel === 'string' ? req.query.channel : undefined,
        search: typeof req.query.search === 'string' ? req.query.search : undefined,
      });
      res.json({ campaigns });
    })
  );

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const actor = await actorOf(req);
      const service = serviceFor(req);
      const campaign = await service.createCampaign(actor, req.body || {});
      res.status(201).json({ campaign });
    })
  );

  router.get(
    '/:campaignId',
    asyncHandler(async (req, res) => {
      const actor = await actorOf(req);
      const service = serviceFor(req);
      const campaignId = assertDocumentId(req.params.campaignId, 'campaignId');
      const detail = await service.getCampaignDetail(actor, campaignId);
      res.json(detail);
    })
  );

  router.patch(
    '/:campaignId',
    asyncHandler(async (req, res) => {
      const actor = await actorOf(req);
      const service = serviceFor(req);
      const campaignId = assertDocumentId(req.params.campaignId, 'campaignId');
      const campaign = await service.updateCampaign(actor, campaignId, req.body || {});
      res.json({ campaign });
    })
  );

  /* -------------------------------- Assets ------------------------------- */

  router.post(
    '/:campaignId/assets',
    asyncHandler(async (req, res) => {
      const actor = await actorOf(req);
      const service = serviceFor(req);
      const campaignId = assertDocumentId(req.params.campaignId, 'campaignId');
      const asset = await service.saveAsset(actor, campaignId, null, req.body || {});
      res.status(201).json({ asset });
    })
  );

  router.put(
    '/:campaignId/assets/:assetId',
    asyncHandler(async (req, res) => {
      const actor = await actorOf(req);
      const service = serviceFor(req);
      const campaignId = assertDocumentId(req.params.campaignId, 'campaignId');
      const assetId = assertDocumentId(req.params.assetId, 'assetId');
      const asset = await service.saveAsset(actor, campaignId, assetId, req.body || {});
      res.json({ asset });
    })
  );

  router.delete(
    '/:campaignId/assets/:assetId',
    asyncHandler(async (req, res) => {
      const actor = await actorOf(req);
      const service = serviceFor(req);
      const campaignId = assertDocumentId(req.params.campaignId, 'campaignId');
      const assetId = assertDocumentId(req.params.assetId, 'assetId');
      const result = await service.deleteAsset(actor, campaignId, assetId);
      res.json(result);
    })
  );

  router.post(
    '/:campaignId/assets/:assetId/submit',
    asyncHandler(async (req, res) => {
      const actor = await actorOf(req);
      const service = serviceFor(req);
      const campaignId = assertDocumentId(req.params.campaignId, 'campaignId');
      const assetId = assertDocumentId(req.params.assetId, 'assetId');
      const asset = await service.submitAsset(actor, campaignId, assetId);
      res.json({ asset });
    })
  );

  router.post(
    '/:campaignId/assets/:assetId/review',
    asyncHandler(async (req, res) => {
      const actor = await actorOf(req);
      const service = serviceFor(req);
      const campaignId = assertDocumentId(req.params.campaignId, 'campaignId');
      const assetId = assertDocumentId(req.params.assetId, 'assetId');
      const decision = parseDecision(req.body?.decision);
      const asset = await service.reviewAsset(actor, campaignId, assetId, decision, optionalNote(req.body?.note));
      res.json({ asset });
    })
  );

  router.post(
    '/:campaignId/assets/:assetId/verify',
    asyncHandler(async (req, res) => {
      const actor = await actorOf(req);
      const service = serviceFor(req);
      const campaignId = assertDocumentId(req.params.campaignId, 'campaignId');
      const assetId = assertDocumentId(req.params.assetId, 'assetId');
      const result = await service.verifyAsset(actor, campaignId, assetId);
      res.json(result);
    })
  );

  /* --------------------------- Cross-channel ----------------------------- */

  router.post(
    '/:campaignId/cross-channel',
    asyncHandler(async (req, res) => {
      const actor = await actorOf(req);
      const service = serviceFor(req);
      const campaignId = assertDocumentId(req.params.campaignId, 'campaignId');
      const report = await service.runCrossChannel(actor, campaignId);
      res.json({ report });
    })
  );

  router.post(
    '/:campaignId/cross-channel/:conflictId/resolve',
    asyncHandler(async (req, res) => {
      const actor = await actorOf(req);
      const service = serviceFor(req);
      const campaignId = assertDocumentId(req.params.campaignId, 'campaignId');
      const conflictId = assertDocumentId(req.params.conflictId, 'conflictId');
      const resolution = req.body?.resolution;
      if (typeof resolution !== 'string') {
        throw new ApiError('resolution is required', 400, 'validation_failed');
      }
      const report = await service.resolveConflict(actor, campaignId, conflictId, resolution);
      res.json({ report });
    })
  );

  /* ------------------------ Approvals and release ------------------------ */

  router.post(
    '/:campaignId/approvals',
    asyncHandler(async (req, res) => {
      const actor = await actorOf(req);
      const service = serviceFor(req);
      const campaignId = assertDocumentId(req.params.campaignId, 'campaignId');
      const decision = parseDecision(req.body?.decision);
      const result = await service.decideCampaign(actor, campaignId, decision, optionalNote(req.body?.note));
      res.json(result);
    })
  );

  router.post(
    '/:campaignId/manifest',
    asyncHandler(async (req, res) => {
      const actor = await actorOf(req);
      const service = serviceFor(req);
      const campaignId = assertDocumentId(req.params.campaignId, 'campaignId');
      const result = await service.generateManifest(actor, campaignId);
      res.status(201).json(result);
    })
  );

  router.get(
    '/:campaignId/manifest/verify',
    asyncHandler(async (req, res) => {
      const actor = await actorOf(req);
      const service = serviceFor(req);
      const campaignId = assertDocumentId(req.params.campaignId, 'campaignId');
      const verification = await service.verifyManifestIntegrity(actor, campaignId);
      res.json({ verification });
    })
  );

  router.get(
    '/:campaignId/audit',
    asyncHandler(async (req, res) => {
      const actor = await actorOf(req);
      const service = serviceFor(req);
      const campaignId = assertDocumentId(req.params.campaignId, 'campaignId');
      const events = await service.listAuditEvents(actor, campaignId);
      res.json({ events });
    })
  );

  return router;
}

/** Error translator for the campaign router (mount with `app.use`). */
export function campaignErrorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  next: NextFunction
): void {
  if (res.headersSent) {
    next(error);
    return;
  }
  if (error instanceof ApiError) {
    res.status(error.status).json({ error: error.message, code: error.code, details: error.details });
    return;
  }
  if (error instanceof AuthError) {
    res.status(error.status).json({ error: error.message, code: error.code });
    return;
  }
  if (error instanceof StoreError) {
    res.status(error.status).json({ error: error.message, code: error.code });
    return;
  }
  const message = error instanceof Error ? error.message : 'Unexpected server error';
  console.error('Campaign API error:', error);
  res.status(500).json({ error: message, code: 'internal_error' });
}
