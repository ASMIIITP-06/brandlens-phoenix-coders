import { Campaign, CampaignAsset, ReleaseManifest } from '../src/types/campaign';
import { sha256Hex } from './auth';

/** Deterministic JSON: keys sorted, whitespace removed. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.keys(value as Record<string, unknown>)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`);
  return `{${entries.join(',')}}`;
}

export function hashAssetContent(asset: Pick<CampaignAsset, 'id' | 'channel' | 'version' | 'title' | 'content'>): string {
  return sha256Hex(
    canonicalJson({
      assetId: asset.id,
      channel: asset.channel,
      version: asset.version,
      title: asset.title,
      content: asset.content,
    })
  );
}

export function computeManifestHash(manifest: Pick<ReleaseManifest, 'campaignId' | 'files' | 'contentFingerprint'>): string {
  return sha256Hex(
    canonicalJson({
      campaignId: manifest.campaignId,
      contentFingerprint: manifest.contentFingerprint,
      files: manifest.files
        .slice()
        .sort((a, b) => a.assetId.localeCompare(b.assetId))
        .map((file) => ({
          assetId: file.assetId,
          channel: file.channel,
          version: file.version,
          sha256: file.sha256,
        })),
    })
  );
}

/** Tamper detection: recompute every file hash from the CURRENT assets. */
export function verifyManifest(
  manifest: ReleaseManifest,
  campaign: Campaign,
  assets: CampaignAsset[]
): { intact: boolean; tamperedAssets: string[]; missingAssets: string[]; removedAssets: string[]; recomputedManifestHash: string } {
  const tamperedAssets: string[] = [];
  const missingAssets: string[] = [];
  const presentIds = new Set<string>();

  for (const file of manifest.files) {
    const asset = assets.find((a) => a.id === file.assetId);
    if (!asset) {
      missingAssets.push(file.assetId);
      continue;
    }
    presentIds.add(asset.id);
    const currentHash = hashAssetContent(asset);
    if (currentHash !== file.sha256) tamperedAssets.push(file.assetId);
  }

  const removedAssets = assets.filter((a) => !presentIds.has(a.id)).map((a) => a.id);
  const recomputedManifestHash = computeManifestHash({
    campaignId: campaign.id,
    files: manifest.files,
    contentFingerprint: manifest.contentFingerprint,
  });

  return {
    intact:
      tamperedAssets.length === 0 &&
      missingAssets.length === 0 &&
      removedAssets.length === 0 &&
      recomputedManifestHash === manifest.manifestHash,
    tamperedAssets,
    missingAssets,
    removedAssets,
    recomputedManifestHash,
  };
}

export function buildManifest(params: {
  campaign: Campaign;
  assets: CampaignAsset[];
  contentFingerprint: string;
  actorId: string;
  actorName: string;
  manifestId: string;
  now: Date;
  previousManifestHash: string | null;
}): ReleaseManifest {
  const files = params.assets
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((asset) => ({
      assetId: asset.id,
      title: asset.title,
      channel: asset.channel,
      version: asset.version,
      sha256: hashAssetContent(asset),
    }));

  const manifestHash = computeManifestHash({
    campaignId: params.campaign.id,
    files,
    contentFingerprint: params.contentFingerprint,
  });

  return {
    manifestId: params.manifestId,
    campaignId: params.campaign.id,
    workspaceId: params.campaign.workspaceId,
    algorithm: 'sha256',
    createdAt: params.now.toISOString(),
    createdBy: params.actorId,
    createdByName: params.actorName,
    files,
    manifestHash,
    previousManifestHash: params.previousManifestHash,
    contentFingerprint: params.contentFingerprint,
    status: 'current',
    integrityNote:
      'SHA-256 over canonical JSON of every asset revision. Any post-release edit changes the recomputed hash.',
  };
}
