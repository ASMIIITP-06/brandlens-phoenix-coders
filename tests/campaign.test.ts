/**
 * Campaign Compliance Studio — server-side verification suite.
 *
 * These tests exercise the real CampaignService against the in-memory store and
 * a real Express router (with a static test token verifier), so authentication,
 * membership resolution, role enforcement, compliance gating, the cross-channel
 * engine and the SHA-256 release manifest are all covered end to end.
 */
import assert from 'node:assert/strict';
import test, { describe, after } from 'node:test';
import type { Server } from 'node:http';
import express from 'express';
import { CampaignService, type ActorContext, type AiAssetReviewer } from '../server/campaignService';
import { InMemoryCampaignStore, StoreError } from '../server/campaignStore';
import { createStaticTestVerifier, sha256Hex, readBearerToken } from '../server/auth';
import { createCampaignRouter } from '../server/campaignRoutes';
import { ApiError } from '../server/validation';
import type { KnowledgeItem, WorkspaceRole } from '../src/types/brandlens';
import type { CampaignChannel } from '../src/types/campaign';

const WS = 'ws_campaign_test';

const EVIDENCE: KnowledgeItem[] = [
  {
    id: 'ev_price_49',
    workspaceId: WS,
    type: 'fact',
    title: 'Approved pricing sheet',
    sourceName: '2026 approved pricing sheet',
    sourceText: 'The Pro plan costs $49 per month. Delivery within 2 days.',
    status: 'active',
    createdAt: '2026-01-02T00:00:00.000Z',
  },
  {
    id: 'ev_expired_price',
    workspaceId: WS,
    type: 'fact',
    title: 'Archived 2024 pricing',
    sourceName: 'Archived 2024 pricing sheet',
    sourceText: 'The Pro plan costs $39 per month.',
    status: 'expired',
    createdAt: '2024-01-02T00:00:00.000Z',
  },
];

const MEMBERS: { uid: string; role: WorkspaceRole; displayName: string }[] = [
  { uid: 'user_creator', role: 'creator', displayName: 'Cara Creator' },
  { uid: 'user_specialist', role: 'specialist_reviewer', displayName: 'Sam Specialist' },
  { uid: 'user_manager', role: 'brand_manager', displayName: 'Mia Manager' },
  { uid: 'user_publisher', role: 'publish_owner', displayName: 'Pat Publisher' },
  { uid: 'user_suspended', role: 'creator', displayName: 'Sid Suspended' },
];

function actorOf(uid: string): ActorContext {
  const member = MEMBERS.find((m) => m.uid === uid);
  if (!member) throw new Error(`unknown member ${uid}`);
  return { uid: member.uid, displayName: member.displayName, workspaceId: WS, role: member.role };
}

interface Harness {
  store: InMemoryCampaignStore;
  service: CampaignService;
  actor: (uid: string) => ActorContext;
  advance: (ms: number) => void;
  now: () => Date;
}

function makeHarness(aiReviewer: AiAssetReviewer | null = null): Harness {
  const store = new InMemoryCampaignStore();
  for (const member of MEMBERS) {
    store.seedMember(WS, {
      uid: member.uid,
      role: member.role,
      displayName: member.displayName,
      status: member.uid === 'user_suspended' ? 'suspended' : 'active',
    });
  }
  store.seedEvidence(WS, EVIDENCE);

  let seq = 0;
  let clock = new Date('2026-02-01T09:00:00.000Z');
  const service = new CampaignService({
    store,
    now: () => clock,
    newId: (prefix: string) => `${prefix}_${String(++seq).padStart(3, '0')}`,
    aiReviewer,
  });

  return {
    store,
    service,
    actor: actorOf,
    advance: (ms: number) => {
      clock = new Date(clock.getTime() + ms);
    },
    now: () => clock,
  };
}

async function expectApiError(
  run: () => Promise<unknown>,
  expectation: { status: number; code?: string }
): Promise<ApiError> {
  try {
    await run();
  } catch (error) {
    assert.ok(error instanceof ApiError, `expected ApiError, received: ${String(error)}`);
    assert.equal(error.status, expectation.status, `unexpected status for ${error.code}`);
    if (expectation.code) assert.equal(error.code, expectation.code);
    return error;
  }
  assert.fail(`expected request to fail with ${expectation.status} ${expectation.code ?? ''}`);
}

const baseCampaign = {
  name: 'Spring Pro Launch',
  description: 'Multi-channel launch of the Pro plan for spring.',
  objective: 'Drive qualified Pro plan signups',
  targetAudience: 'SMB marketing teams',
  startDate: '2026-03-01',
  endDate: '2026-04-15',
  channels: ['instagram', 'linkedin'],
  status: 'draft',
};

const IG_COPY = 'Our Pro plan costs $49 per month. Delivery within 2 days.';
const LI_COPY = 'The Pro plan costs $49 per month. Delivery within 2 days.';

/** Creates a campaign with two verified, approved assets ready for approval. */
async function readyCampaign(h: Harness, liCopy = LI_COPY) {
  const creator = h.actor('user_creator');
  const specialist = h.actor('user_specialist');
  const campaign = await h.service.createCampaign(creator, baseCampaign);

  const ig = await h.service.saveAsset(creator, campaign.id, null, {
    title: 'Instagram launch creative',
    channel: 'instagram',
    content: IG_COPY,
    evidenceIds: ['ev_price_49'],
  });
  const li = await h.service.saveAsset(creator, campaign.id, null, {
    title: 'LinkedIn launch post',
    channel: 'linkedin',
    content: liCopy,
    evidenceIds: ['ev_price_49'],
  });

  for (const asset of [ig, li]) {
    await h.service.verifyAsset(creator, campaign.id, asset.id);
    await h.service.submitAsset(creator, campaign.id, asset.id);
    h.advance(1000);
    await h.service.reviewAsset(specialist, campaign.id, asset.id, 'approved', 'Copy matches approved source.');
    h.advance(1000);
  }

  return { campaignId: campaign.id, igAssetId: ig.id, liAssetId: li.id };
}

/* ================================================================== *
 * 1. Campaign creation + validation
 * ================================================================== */
describe('campaign creation', () => {
  test('persists a campaign with every requested field and an audit event', async () => {
    const h = makeHarness();
    const campaign = await h.service.createCampaign(h.actor('user_creator'), baseCampaign);

    assert.equal(campaign.name, baseCampaign.name);
    assert.equal(campaign.objective, baseCampaign.objective);
    assert.equal(campaign.targetAudience, baseCampaign.targetAudience);
    assert.equal(campaign.workspaceId, WS);
    assert.equal(campaign.ownerId, 'user_creator');
    assert.deepEqual(campaign.channels, ['instagram', 'linkedin']);
    assert.equal(campaign.status, 'draft');
    assert.equal(campaign.startDate, '2026-03-01');

    const stored = await h.store.getCampaign(WS, campaign.id);
    assert.ok(stored, 'campaign must actually be persisted');
    assert.equal(stored?.id, campaign.id);

    const audit = await h.service.listAuditEvents(h.actor('user_creator'), campaign.id);
    assert.ok(audit.some((event) => event.action === 'campaign.created'));
  });

  test('rejects missing required fields', async () => {
    const h = makeHarness();
    await expectApiError(
      () => h.service.createCampaign(h.actor('user_creator'), { ...baseCampaign, name: '  ' }),
      { status: 400, code: 'validation_failed' }
    );
  });

  test('rejects an inverted date range', async () => {
    const h = makeHarness();
    await expectApiError(
      () =>
        h.service.createCampaign(h.actor('user_creator'), {
          ...baseCampaign,
          startDate: '2026-05-01',
          endDate: '2026-04-01',
        }),
      { status: 400 }
    );
  });

  test('rejects unsupported channels', async () => {
    const h = makeHarness();
    await expectApiError(
      () => h.service.createCampaign(h.actor('user_creator'), { ...baseCampaign, channels: ['tiktok'] }),
      { status: 400 }
    );
  });

  test('enforces roles on campaign creation', async () => {
    const h = makeHarness();
    await expectApiError(
      () => h.service.createCampaign(h.actor('user_specialist'), baseCampaign),
      { status: 403, code: 'forbidden' }
    );
  });

  test('only brand managers or admins may assign another owner', async () => {
    const h = makeHarness();
    await expectApiError(
      () =>
        h.service.createCampaign(h.actor('user_creator'), {
          ...baseCampaign,
          ownerId: 'user_manager',
        }),
      { status: 403, code: 'forbidden' }
    );

    const assigned = await h.service.createCampaign(h.actor('user_manager'), {
      ...baseCampaign,
      ownerId: 'user_creator',
    });
    assert.equal(assigned.ownerId, 'user_creator');
  });
});

/* ================================================================== *
 * 2. Asset management
 * ================================================================== */
describe('multi-channel asset management', () => {
  test('saves assets with channel, claims, evidence and version history', async () => {
    const h = makeHarness();
    const creator = h.actor('user_creator');
    const campaign = await h.service.createCampaign(creator, baseCampaign);

    const asset = await h.service.saveAsset(creator, campaign.id, null, {
      title: 'Instagram creative v1',
      channel: 'instagram',
      content: IG_COPY,
      evidenceIds: ['ev_price_49'],
    });
    assert.equal(asset.version, 1);
    assert.equal(asset.status, 'draft');
    assert.deepEqual(asset.evidenceIds, ['ev_price_49']);
    assert.equal(asset.versions.length, 1);

    h.advance(60_000);
    const updated = await h.service.saveAsset(creator, campaign.id, asset.id, {
      title: 'Instagram creative v2',
      channel: 'instagram',
      content: `${IG_COPY} Start your 14 day rollout today.`,
      evidenceIds: ['ev_price_49'],
      changeSummary: 'Added rollout note',
    });
    assert.equal(updated.version, 2);
    assert.equal(updated.versions.length, 2);
    assert.equal(updated.versions[0].title, 'Instagram creative v1');

    const history = await h.store.listAssets(WS, campaign.id);
    assert.equal(history.length, 1);
    assert.equal(history[0].version, 2);
  });

  test('rejects assets on channels the campaign does not publish to', async () => {
    const h = makeHarness();
    const creator = h.actor('user_creator');
    const campaign = await h.service.createCampaign(creator, baseCampaign);
    await expectApiError(
      () =>
        h.service.saveAsset(creator, campaign.id, null, {
          title: 'Email blast',
          channel: 'email',
          content: 'Our Pro plan costs $49 per month.',
        }),
      { status: 400, code: 'channel_not_in_campaign' }
    );
  });

  test('rejects evidence references that do not exist in the workspace', async () => {
    const h = makeHarness();
    const creator = h.actor('user_creator');
    const campaign = await h.service.createCampaign(creator, baseCampaign);
    await expectApiError(
      () =>
        h.service.saveAsset(creator, campaign.id, null, {
          title: 'Instagram creative',
          channel: 'instagram',
          content: IG_COPY,
          evidenceIds: ['ev_does_not_exist'],
        }),
      { status: 400, code: 'unknown_evidence' }
    );
  });

  test('deletes drafts for authorized editors and blocks non-editors', async () => {
    const h = makeHarness();
    const creator = h.actor('user_creator');
    const campaign = await h.service.createCampaign(creator, baseCampaign);
    const asset = await h.service.saveAsset(creator, campaign.id, null, {
      title: 'Draft creative',
      channel: 'instagram',
      content: IG_COPY,
      evidenceIds: ['ev_price_49'],
    });

    await expectApiError(() => h.service.deleteAsset(h.actor('user_specialist'), campaign.id, asset.id), {
      status: 403,
    });

    await h.service.deleteAsset(creator, campaign.id, asset.id);
    assert.equal(await h.store.getAsset(WS, campaign.id, asset.id), null);
  });

  test('blocks deleting an asset that is already under review', async () => {
    const h = makeHarness();
    const creator = h.actor('user_creator');
    const campaign = await h.service.createCampaign(creator, baseCampaign);
    const asset = await h.service.saveAsset(creator, campaign.id, null, {
      title: 'Instagram creative',
      channel: 'instagram',
      content: IG_COPY,
      evidenceIds: ['ev_price_49'],
    });
    await h.service.verifyAsset(creator, campaign.id, asset.id);
    await h.service.submitAsset(creator, campaign.id, asset.id);

    await expectApiError(() => h.service.deleteAsset(creator, campaign.id, asset.id), { status: 409 });
  });

  test('requires a compliance scan before submission and blocks duplicate submissions', async () => {
    const h = makeHarness();
    const creator = h.actor('user_creator');
    const campaign = await h.service.createCampaign(creator, baseCampaign);
    const asset = await h.service.saveAsset(creator, campaign.id, null, {
      title: 'Instagram creative',
      channel: 'instagram',
      content: IG_COPY,
      evidenceIds: ['ev_price_49'],
    });

    await expectApiError(() => h.service.submitAsset(creator, campaign.id, asset.id), {
      status: 409,
      code: 'verification_required',
    });

    await h.service.verifyAsset(creator, campaign.id, asset.id);
    const submitted = await h.service.submitAsset(creator, campaign.id, asset.id);
    assert.equal(submitted.status, 'submitted');

    await expectApiError(() => h.service.submitAsset(creator, campaign.id, asset.id), {
      status: 409,
      code: 'duplicate_submission',
    });
  });
});

/* ================================================================== *
 * 3. Claim Guard reuse + AI validation
 * ================================================================== */
describe('claim verification', () => {
  test('flags an unsupported claim and links supported claims to real evidence', async () => {
    const h = makeHarness();
    const creator = h.actor('user_creator');
    const campaign = await h.service.createCampaign(creator, baseCampaign);
    const asset = await h.service.saveAsset(creator, campaign.id, null, {
      title: 'Instagram creative',
      channel: 'instagram',
      content: `${IG_COPY} We guarantee the fastest onboarding in the industry.`,
      evidenceIds: ['ev_price_49'],
    });

    const result = await h.service.verifyAsset(creator, campaign.id, asset.id);
    assert.equal(result.engineMode, 'Rules-only mode');
    assert.ok(result.asset.findings.length > 0, 'deterministic Claim Guard must produce findings');
    assert.ok(result.asset.lastVerifiedAt, 'verification timestamp must be stored');

    const open = result.asset.findings.filter((f) => f.status === 'open');
    assert.ok(open.some((f) => f.evidenceStatus !== 'supported'));
    for (const finding of open) {
      if (finding.evidenceStatus === 'supported') {
        assert.ok((finding.evidenceIds || []).length > 0);
      }
      assert.ok(finding.excerpt.length > 0);
      assert.ok(finding.suggestedRevision.length > 0);
    }
  });

  test('reports expired evidence as expired rather than supported', async () => {
    const h = makeHarness();
    const creator = h.actor('user_creator');
    const campaign = await h.service.createCampaign(creator, baseCampaign);
    const asset = await h.service.saveAsset(creator, campaign.id, null, {
      title: 'Legacy price post',
      channel: 'instagram',
      content: 'The Pro plan costs $39 per month.',
      evidenceIds: ['ev_expired_price'],
    });

    const result = await h.service.verifyAsset(creator, campaign.id, asset.id);
    assert.ok(
      result.asset.findings.some((f) => f.evidenceStatus === 'expired_source' || f.evidenceStatus === 'unsupported'),
      'expired evidence must never be reported as supported'
    );

    const detail = await h.service.getCampaignDetail(creator, campaign.id);
    assert.ok(
      detail.readiness.blockers.some((b) => b.code === 'missing_evidence'),
      `expected a missing_evidence blocker, got ${detail.readiness.blockers.map((b) => b.code).join(', ')}`
    );
  });

  test('discards AI findings whose excerpt or evidence is fabricated', async () => {
    const fabricated: AiAssetReviewer = {
      async reviewAsset() {
        return [
          {
            category: 'Facts & Freshness',
            severity: 'high',
            excerpt: 'This sentence does not exist in the asset copy at all.',
            evidenceIds: ['ev_price_49'],
            evidenceStatus: 'supported',
            rationale: 'Hallucinated finding.',
          },
          {
            category: 'Facts & Freshness',
            severity: 'medium',
            excerpt: 'Our Pro plan costs $49 per month.',
            evidenceIds: ['ev_invented_source'],
            evidenceStatus: 'supported',
            rationale: 'Real excerpt but invented evidence.',
            suggestedRevision: 'Cite the approved pricing sheet.',
            confidence: 0.8,
          },
        ];
      },
    };

    const h = makeHarness(fabricated);
    const creator = h.actor('user_creator');
    const campaign = await h.service.createCampaign(creator, baseCampaign);
    const asset = await h.service.saveAsset(creator, campaign.id, null, {
      title: 'Instagram creative',
      channel: 'instagram',
      content: IG_COPY,
      evidenceIds: ['ev_price_49'],
    });

    const result = await h.service.verifyAsset(creator, campaign.id, asset.id);
    assert.equal(result.engineMode, 'Source-grounded AI + Rules enabled');
    assert.ok(result.rejectedAiFindings.length >= 1, 'fabricated findings must be rejected');

    const aiFindings = result.asset.findings.filter((f) => f.source === 'ai');
    for (const finding of aiFindings) {
      assert.ok(IG_COPY.toLowerCase().includes(finding.excerpt.toLowerCase()));
      for (const id of finding.evidenceIds) {
        assert.ok(EVIDENCE.some((item) => item.id === id), `evidence ${id} must exist in Firestore`);
      }
      assert.notEqual(finding.evidenceStatus, 'supported', 'invented evidence cannot be supported');
    }
  });
});

/* ================================================================== *
 * 4. Cross-channel consistency engine
 * ================================================================== */
describe('cross-channel consistency', () => {
  test('detects contradictory factual claims between channels', async () => {
    const h = makeHarness();
    const creator = h.actor('user_creator');
    const campaign = await h.service.createCampaign(creator, baseCampaign);
    await h.service.saveAsset(creator, campaign.id, null, {
      title: 'Instagram creative',
      channel: 'instagram',
      content: IG_COPY,
      evidenceIds: ['ev_price_49'],
    });
    await h.service.saveAsset(creator, campaign.id, null, {
      title: 'LinkedIn post',
      channel: 'linkedin',
      content: 'The Pro plan costs $59 per month. Delivery within 2 days.',
      evidenceIds: ['ev_price_49'],
    });

    const report = await h.service.runCrossChannel(creator, campaign.id);
    assert.ok(report.conflicts.length > 0, 'a $49 vs $59 price difference must be detected');
    const priceConflict = report.conflicts.find((c) => c.topic === 'price');
    assert.ok(priceConflict, 'expected a price conflict');
    assert.equal(priceConflict?.values.length >= 2, true);
    assert.equal(priceConflict?.resolved, false);
  });

  test('ignores stylistic differences between channels', async () => {
    const h = makeHarness();
    const creator = h.actor('user_creator');
    const campaign = await h.service.createCampaign(creator, baseCampaign);
    await h.service.saveAsset(creator, campaign.id, null, {
      title: 'Instagram creative',
      channel: 'instagram',
      content: 'Our Pro plan costs $49 per month. Delivery within 2 days. 🔥 Loud, bold, unmissable energy!!!',
      evidenceIds: ['ev_price_49'],
    });
    await h.service.saveAsset(creator, campaign.id, null, {
      title: 'LinkedIn post',
      channel: 'linkedin',
      content: 'The Pro plan costs $49 per month. Delivery within 2 days. A measured, professional tone for finance teams.',
      evidenceIds: ['ev_price_49'],
    });

    const report = await h.service.runCrossChannel(creator, campaign.id);
    assert.equal(
      report.conflicts.filter((c) => c.kind === 'value_mismatch').length,
      0,
      `stylistic differences must not be reported as factual conflicts: ${JSON.stringify(report.conflicts)}`
    );
  });

  test('conflict resolution is role-gated and recorded once', async () => {
    const h = makeHarness();
    const creator = h.actor('user_creator');
    const campaign = await h.service.createCampaign(creator, baseCampaign);
    await h.service.saveAsset(creator, campaign.id, null, {
      title: 'Instagram creative',
      channel: 'instagram',
      content: IG_COPY,
      evidenceIds: ['ev_price_49'],
    });
    await h.service.saveAsset(creator, campaign.id, null, {
      title: 'LinkedIn post',
      channel: 'linkedin',
      content: 'The Pro plan costs $59 per month. Delivery within 2 days.',
      evidenceIds: ['ev_price_49'],
    });
    const report = await h.service.runCrossChannel(creator, campaign.id);
    const conflict = report.conflicts[0];
    assert.ok(conflict);

    await expectApiError(
      () => h.service.resolveConflict(creator, campaign.id, conflict.id, 'Align everything to $49.'),
      { status: 403 }
    );

    const resolved = await h.service.resolveConflict(
      h.actor('user_manager'),
      campaign.id,
      conflict.id,
      'Align every channel to the approved $49 price.'
    );
    assert.equal(resolved.conflicts.find((c) => c.id === conflict.id)?.resolved, true);

    await expectApiError(
      () => h.service.resolveConflict(h.actor('user_manager'), campaign.id, conflict.id, 'Again please.'),
      { status: 409, code: 'already_resolved' }
    );
  });
});

/* ================================================================== *
 * 5. Approval lane
 * ================================================================== */
describe('approval lane', () => {
  test('blocks self-approval by the asset creator', async () => {
    const h = makeHarness();
    const creator = h.actor('user_creator');
    const campaign = await h.service.createCampaign(creator, baseCampaign);
    const asset = await h.service.saveAsset(creator, campaign.id, null, {
      title: 'Instagram creative',
      channel: 'instagram',
      content: IG_COPY,
      evidenceIds: ['ev_price_49'],
    });
    await h.service.verifyAsset(creator, campaign.id, asset.id);
    await h.service.submitAsset(creator, campaign.id, asset.id);

    const selfApproval = await expectApiError(
      () => h.service.reviewAsset(creator, campaign.id, asset.id, 'approved', 'Looks good to me.'),
      { status: 403, code: 'forbidden' }
    );
    assert.match(selfApproval.message, /self-approval/i);
  });

  test('blocks a reviewer from deciding twice on the same version', async () => {
    const h = makeHarness();
    const creator = h.actor('user_creator');
    const specialist = h.actor('user_specialist');
    const campaign = await h.service.createCampaign(creator, baseCampaign);
    const asset = await h.service.saveAsset(creator, campaign.id, null, {
      title: 'Instagram creative',
      channel: 'instagram',
      content: IG_COPY,
      evidenceIds: ['ev_price_49'],
    });
    await h.service.verifyAsset(creator, campaign.id, asset.id);
    await h.service.submitAsset(creator, campaign.id, asset.id);
    await h.service.reviewAsset(specialist, campaign.id, asset.id, 'approved', 'Approved.');

    await expectApiError(
      () => h.service.reviewAsset(specialist, campaign.id, asset.id, 'approved', 'Approved again.'),
      { status: 409, code: 'duplicate_decision' }
    );
  });

  test('blocks campaign owners and asset authors from approving the campaign', async () => {
    const h = makeHarness();
    const { campaignId } = await readyCampaign(h);

    await expectApiError(() => h.service.decideCampaign(h.actor('user_creator'), campaignId, 'approved', null), {
      status: 403,
    });
  });

  test('blocks approval while critical findings remain open', async () => {
    const h = makeHarness();
    const creator = h.actor('user_creator');
    const specialist = h.actor('user_specialist');
    const campaign = await h.service.createCampaign(creator, baseCampaign);
    const asset = await h.service.saveAsset(creator, campaign.id, null, {
      title: 'Instagram guarantee creative',
      channel: 'instagram',
      content: 'We guarantee a full refund within 30 days. Our Pro plan costs $49 per month.',
      evidenceIds: ['ev_price_49'],
    });
    await h.service.verifyAsset(creator, campaign.id, asset.id);
    await h.service.submitAsset(creator, campaign.id, asset.id);
    await h.service.reviewAsset(specialist, campaign.id, asset.id, 'approved', 'Copy reviewed.');

    const error = await expectApiError(
      () => h.service.decideCampaign(specialist, campaign.id, 'approved', null),
      { status: 409, code: 'readiness_blocked' }
    );
    assert.ok(
      (error.details || []).some((detail) => detail.includes('unresolved_critical_findings')),
      `expected unresolved_critical_findings, got ${JSON.stringify(error.details)}`
    );
  });

  test('blocks duplicate campaign approvals for the same content', async () => {
    const h = makeHarness();
    const { campaignId } = await readyCampaign(h);
    await h.service.runCrossChannel(h.actor('user_creator'), campaignId);

    const specialist = h.actor('user_specialist');
    await h.service.decideCampaign(specialist, campaignId, 'approved', 'Compliant.');
    await expectApiError(() => h.service.decideCampaign(specialist, campaignId, 'approved', 'Again.'), {
      status: 409,
      code: 'duplicate_approval',
    });
  });
});

/* ================================================================== *
 * 6. Release manifest + tamper detection
 * ================================================================== */
describe('release manifest', () => {
  test('builds a SHA-256 manifest after all approvals and detects tampering', async () => {
    const h = makeHarness();
    const { campaignId, igAssetId } = await readyCampaign(h);
    const creator = h.actor('user_creator');

    await h.service.runCrossChannel(creator, campaignId);
    await h.service.decideCampaign(h.actor('user_specialist'), campaignId, 'approved', 'Specialist sign-off.');
    const decided = await h.service.decideCampaign(
      h.actor('user_manager'),
      campaignId,
      'approved',
      'Brand sign-off.'
    );
    assert.equal(decided.campaign.status, 'approved');

    await expectApiError(
      () => h.service.generateManifest(h.actor('user_specialist'), campaignId),
      { status: 403, code: 'forbidden' }
    );

    const released = await h.service.generateManifest(h.actor('user_publisher'), campaignId);
    assert.equal(released.campaign.status, 'released');
    assert.match(released.manifest.manifestHash, /^[a-f0-9]{64}$/);
    assert.equal(released.manifest.files.length, 2);
    for (const file of released.manifest.files) {
      assert.match(file.sha256, /^[a-f0-9]{64}$/);
      assert.equal(file.sha256, sha256Hex(
        JSON.stringify({
          assetId: file.assetId,
          version: file.version,
          title: file.title,
          channel: file.channel,
          content: file.content,
        })
      ));
    }
    assert.equal(released.manifest.previousManifestHash, null);

    const intact = await h.service.verifyManifestIntegrity(creator, campaignId);
    assert.equal(intact.present, true);
    assert.equal(intact.intact, true);
    assert.deepEqual(intact.tamperedAssets, []);

    // Tamper with a released asset revision directly in storage.
    const stored = await h.store.getAsset(WS, campaignId, igAssetId);
    assert.ok(stored);
    await h.store.saveAsset({ ...stored!, content: 'Our Pro plan costs $19 per month. Delivery within 2 days.' });

    const tampered = await h.service.verifyManifestIntegrity(creator, campaignId);
    assert.equal(tampered.intact, false);
    assert.deepEqual(tampered.tamperedAssets, [igAssetId]);
    assert.notEqual(tampered.recomputedManifestHash, released.manifest.manifestHash);
  });

  test('blocks manifest generation while content gates are still open', async () => {
    const h = makeHarness();
    const creator = h.actor('user_creator');
    const campaign = await h.service.createCampaign(creator, baseCampaign);
    await expectApiError(
      () => h.service.generateManifest(h.actor('user_publisher'), campaign.id),
      { status: 409, code: 'readiness_blocked' }
    );
  });
});

/* ================================================================== *
 * 7. Audit trail
 * ================================================================== */
describe('audit trail', () => {
  test('records an append-only history of campaign activity', async () => {
    const h = makeHarness();
    const { campaignId } = await readyCampaign(h);
    const events = await h.service.listAuditEvents(h.actor('user_creator'), campaignId);

    const actions = events.map((event) => event.action);
    for (const expected of [
      'campaign.created',
      'asset.created',
      'asset.verified',
      'asset.submitted',
      'asset.approved',
    ]) {
      assert.ok(actions.includes(expected), `missing audit action ${expected} in ${actions.join(', ')}`);
    }
    assert.ok(events.every((event) => event.workspaceId === WS && event.campaignId === campaignId));
    assert.ok(events.every((event) => typeof event.actorRole === 'string' && event.actorRole.length > 0));

    // Duplicate audit ids are refused by the store, so history cannot be rewritten.
    const duplicate = { ...events[0], action: 'tampered' };
    await assert.rejects(
      () => h.store.appendAuditEvent(duplicate),
      (error: unknown) => error instanceof StoreError && error.status === 409
    );

    const after = await h.service.listAuditEvents(h.actor('user_creator'), campaignId);
    assert.equal(after.length, events.length);
  });
});

/* ================================================================== *
 * 8. HTTP API: token verification + membership resolution
 * ================================================================== */
interface ApiHandle {
  url: string;
  close: () => Promise<void>;
}

const servers: Server[] = [];
after(async () => {
  await Promise.all(servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

async function startApi(): Promise<ApiHandle & { store: InMemoryCampaignStore }> {
  const store = new InMemoryCampaignStore();
  for (const member of MEMBERS) {
    store.seedMember(WS, {
      uid: member.uid,
      role: member.role,
      displayName: member.displayName,
      status: member.uid === 'user_suspended' ? 'suspended' : 'active',
    });
  }
  store.seedEvidence(WS, EVIDENCE);

  const app = express();
  app.use(express.json());
  app.use(
    '/api/workspaces/:workspaceId/campaigns',
    createCampaignRouter({
      verifier: createStaticTestVerifier(),
      createStore: () => store,
      newId: (prefix: string) => `${prefix}_api`,
    })
  );
  app.use(
    (error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      const err = error as { status?: number; statusCode?: number; code?: string; message?: string };
      res.status(err.status ?? err.statusCode ?? 500).json({
        error: { code: err.code ?? 'internal_error', message: err.message ?? 'error' },
      });
    }
  );

  const server = app.listen(0, '127.0.0.1');
  servers.push(server);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('test server did not bind');
  return {
    url: `http://127.0.0.1:${address.port}/api/workspaces/${WS}/campaigns`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
    store,
  };
}

const token = (uid: string) => `test:${uid}:${uid}@brandlens.test`;

describe('campaign API security', () => {
  test('rejects requests without a bearer token', async () => {
    const api = await startApi();
    const response = await fetch(api.url);
    assert.equal(response.status, 401);
    const body = (await response.json()) as { error: { code: string } };
    assert.equal(body.error.code, 'unauthenticated');
    await api.close();
  });

  test('rejects tokens for non-members of the workspace', async () => {
    const api = await startApi();
    const response = await fetch(api.url, { headers: { authorization: `Bearer ${token('user_stranger')}` } });
    assert.equal(response.status, 403);
    const body = (await response.json()) as { error: { code: string } };
    assert.equal(body.error.code, 'workspace_membership_required');
    await api.close();
  });

  test('rejects suspended memberships', async () => {
    const api = await startApi();
    const response = await fetch(api.url, { headers: { authorization: `Bearer ${token('user_suspended')}` } });
    assert.equal(response.status, 403);
    const body = (await response.json()) as { error: { code: string } };
    assert.equal(body.error.code, 'membership_inactive');
    await api.close();
  });

  test('serves campaigns to verified members and persists the created campaign', async () => {
    const api = await startApi();
    const create = await fetch(api.url, {
      method: 'POST',
      headers: { authorization: `Bearer ${token('user_creator')}`, 'content-type': 'application/json' },
      body: JSON.stringify(baseCampaign),
    });
    assert.equal(create.status, 201);
    const created = (await create.json()) as { campaign: { id: string; name: string } };
    assert.equal(created.campaign.name, baseCampaign.name);

    const list = await fetch(api.url, { headers: { authorization: `Bearer ${token('user_specialist')}` } });
    assert.equal(list.status, 200);
    const listed = (await list.json()) as { campaigns: { id: string }[] };
    assert.ok(listed.campaigns.some((item) => item.id === created.campaign.id));
    assert.ok(await api.store.getCampaign(WS, created.campaign.id));
    await api.close();
  });

  test('rejects malformed tokens and ignores client-supplied roles', async () => {
    const api = await startApi();
    const response = await fetch(api.url, { headers: { authorization: 'Bearer not-a-real-token' } });
    assert.equal(response.status, 401);
    await api.close();

    assert.throws(() => readBearerToken(undefined), (error: unknown) => error instanceof ApiError);
  });

  test('server resolves the role and ignores a spoofed role field in the body', async () => {
    const api = await startApi();
    const create = await fetch(api.url, {
      method: 'POST',
      headers: { authorization: `Bearer ${token('user_creator')}`, 'content-type': 'application/json' },
      body: JSON.stringify({ ...baseCampaign, ownerId: 'user_creator', role: 'admin', workspaceId: 'ws_other' }),
    });
    assert.equal(create.status, 201);
    const created = (await create.json()) as { campaign: { workspaceId: string; ownerId: string } };
    assert.equal(created.campaign.workspaceId, WS);
    assert.equal(created.campaign.ownerId, 'user_creator');
    await api.close();
  });
});

/* ================================================================== *
 * 9. Dashboard listing filters
 * ================================================================== */
describe('campaign dashboard listing', () => {
  test('filters by status, channel and search text using stored data', async () => {
    const h = makeHarness();
    const creator = h.actor('user_creator');
    const spring = await h.service.createCampaign(creator, baseCampaign);
    await h.service.createCampaign(creator, {
      ...baseCampaign,
      name: 'Summer Email Push',
      description: 'Lifecycle email campaign',
      objective: 'Retention',
      channels: ['email' as CampaignChannel],
    });

    assert.equal((await h.service.listCampaigns(creator)).length, 2);
    assert.deepEqual(
      (await h.service.listCampaigns(creator, { status: 'draft' })).map((c) => c.id).sort(),
      [(await h.service.listCampaigns(creator)).find((c) => c.name === 'Summer Email Push')!.id, spring.id].sort()
    );
    const emailOnly = await h.service.listCampaigns(creator, { channel: 'email' });
    assert.equal(emailOnly.length, 1);
    assert.equal(emailOnly[0].name, 'Summer Email Push');
    const searched = await h.service.listCampaigns(creator, { search: 'spring' });
    assert.equal(searched.length, 1);
    assert.equal(searched[0].id, spring.id);
    assert.equal((await h.service.listCampaigns(creator, { search: 'nothing-matches' })).length, 0);
  });
});
