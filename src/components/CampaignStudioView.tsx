import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  FileSignature,
  History,
  Layers3,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  CAMPAIGN_CHANNELS,
  CAMPAIGN_CHANNEL_LABELS,
  Campaign,
  CampaignAsset,
  CampaignChannel,
  CampaignFinding,
} from '../types/campaign';
import { WorkspaceRole } from '../types/brandlens';
import {
  CampaignApiError,
  CampaignDetail,
  campaignRepository,
} from '../services/campaignRepository';

interface CampaignStudioViewProps {
  workspaceId: string;
  userRole: WorkspaceRole;
  userEmail?: string;
  onToast: (message: string) => void;
}

type StudioTab = 'assets' | 'compliance' | 'cross-channel' | 'approvals' | 'audit';

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  in_review: 'In review',
  approved: 'Approved',
  released: 'Released',
  archived: 'Archived',
};

const ASSET_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  in_review: 'In review',
  changes_requested: 'Changes requested',
  approved: 'Approved',
  rejected: 'Rejected',
};

const SEVERITY_STYLES: Record<string, string> = {
  high: 'bg-[#FB7185]/15 text-[#FB7185] border-[#FB7185]/40',
  medium: 'bg-[#FFD166]/15 text-[#FFD166] border-[#FFD166]/40',
  low: 'bg-[#75D9F5]/15 text-[#75D9F5] border-[#75D9F5]/40',
};

const emptyForm = {
  name: '',
  description: '',
  objective: '',
  targetAudience: '',
  ownerName: '',
  startDate: '',
  endDate: '',
  status: 'draft',
  channels: ['instagram', 'linkedin'] as CampaignChannel[],
};

function errorMessage(error: unknown): string {
  if (error instanceof CampaignApiError) {
    return error.details.length ? `${error.message} (${error.details.join('; ')})` : error.message;
  }
  return error instanceof Error ? error.message : 'Unexpected error';
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const CampaignStudioView: React.FC<CampaignStudioViewProps> = ({
  workspaceId,
  userRole,
  userEmail,
  onToast,
}) => {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [channelFilter, setChannelFilter] = useState('all');

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CampaignDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [tab, setTab] = useState<StudioTab>('assets');
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const [assetForm, setAssetForm] = useState<{
    assetId: string | null;
    title: string;
    channel: CampaignChannel;
    content: string;
  } | null>(null);

  const loadCampaigns = useCallback(async () => {
    setIsLoadingList(true);
    setListError(null);
    try {
      const results = await campaignRepository.list(workspaceId, {
        search: search.trim() || undefined,
        status: statusFilter,
        channel: channelFilter,
      });
      setCampaigns(results);
    } catch (error) {
      setListError(errorMessage(error));
      setCampaigns([]);
    } finally {
      setIsLoadingList(false);
    }
  }, [workspaceId, search, statusFilter, channelFilter]);

  useEffect(() => {
    void loadCampaigns();
  }, [loadCampaigns]);

  const loadDetail = useCallback(
    async (campaignId: string) => {
      setDetailLoading(true);
      setDetailError(null);
      try {
        const result = await campaignRepository.detail(workspaceId, campaignId);
        setDetail(result);
      } catch (error) {
        setDetailError(errorMessage(error));
        setDetail(null);
      } finally {
        setDetailLoading(false);
      }
    },
    [workspaceId]
  );

  useEffect(() => {
    if (activeId) void loadDetail(activeId);
  }, [activeId, loadDetail]);

  const runAction = async (label: string, action: () => Promise<void>) => {
    setBusyAction(label);
    try {
      await action();
    } catch (error) {
      onToast(`${label}: ${errorMessage(error)}`);
    } finally {
      setBusyAction(null);
    }
  };

  const toggleChannel = (channel: CampaignChannel) => {
    setForm((prev) => ({
      ...prev,
      channels: prev.channels.includes(channel)
        ? prev.channels.filter((c) => c !== channel)
        : [...prev.channels, channel],
    }));
  };

  const submitCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);

    if (!form.name.trim() || !form.description.trim() || !form.objective.trim()) {
      setFormError('Campaign name, description and objective are required.');
      return;
    }
    if (!form.targetAudience.trim() || !form.ownerName.trim()) {
      setFormError('Target audience and campaign owner are required.');
      return;
    }
    if (!form.startDate || !form.endDate) {
      setFormError('Start and end dates are required.');
      return;
    }
    if (new Date(form.endDate) <= new Date(form.startDate)) {
      setFormError('The end date must be after the start date.');
      return;
    }
    if (form.channels.length === 0) {
      setFormError('Select at least one publishing channel.');
      return;
    }

    setIsSaving(true);
    try {
      const created = await campaignRepository.create(workspaceId, {
        name: form.name.trim(),
        description: form.description.trim(),
        objective: form.objective.trim(),
        targetAudience: form.targetAudience.trim(),
        ownerId: '',
        ownerName: form.ownerName.trim(),
        startDate: new Date(form.startDate).toISOString(),
        endDate: new Date(form.endDate).toISOString(),
        status: form.status,
        channels: form.channels,
      });
      onToast(`Campaign "${created.name}" created.`);
      setShowCreate(false);
      setForm({ ...emptyForm });
      await loadCampaigns();
      setActiveId(created.id);
      setTab('assets');
    } catch (error) {
      setFormError(errorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const campaign = detail?.campaign || null;

  const allFindings: { asset: CampaignAsset; finding: CampaignFinding }[] = useMemo(() => {
    if (!detail) return [];
    return detail.assets.flatMap((asset) =>
      asset.findings.map((finding) => ({ asset, finding }))
    );
  }, [detail]);

  const openAssetForm = (asset?: CampaignAsset) => {
    setAssetForm({
      assetId: asset ? asset.id : null,
      title: asset ? asset.title : '',
      channel: asset ? asset.channel : 'instagram',
      content: asset ? asset.content : '',
    });
  };

  const saveAsset = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!assetForm || !activeId) return;
    if (!assetForm.title.trim() || !assetForm.content.trim()) {
      onToast('Asset title and content are required.');
      return;
    }
    await runAction(assetForm.assetId ? 'Save asset' : 'Create asset', async () => {
      const payload = {
        title: assetForm.title.trim(),
        channel: assetForm.channel,
        content: assetForm.content,
        evidenceIds: [] as string[],
        changeSummary: assetForm.assetId ? 'Content updated in Campaign Studio' : 'Initial asset draft',
      };
      if (assetForm.assetId) {
        await campaignRepository.saveAsset(workspaceId, activeId, assetForm.assetId, payload);
        onToast('Asset draft saved as a new version.');
      } else {
        await campaignRepository.createAsset(workspaceId, activeId, payload);
        onToast('Asset added to the campaign.');
      }
      setAssetForm(null);
      await loadDetail(activeId);
      await loadCampaigns();
    });
  };

  /* ------------------------------ Detail view ------------------------------ */

  const renderDetail = () => {
    if (!detail || !campaign) return null;
    const readiness = detail.readiness;

    return (
      <div className="space-y-5">
        <button
          onClick={() => {
            setActiveId(null);
            setDetail(null);
          }}
          className="inline-flex items-center gap-2 text-xs text-[#9AABC5] hover:text-[#EEF3FF] cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to campaign dashboard
        </button>

        <div className="p-5 rounded-2xl bg-[#10192C] border border-[#283650] space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-[#EEF3FF]">{campaign.name}</h2>
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-[#75D9F5]/15 text-[#75D9F5]">
                  {STATUS_LABELS[campaign.status] || campaign.status}
                </span>
              </div>
              <p className="text-xs text-[#9AABC5] mt-1 max-w-3xl">{campaign.description}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => activeId && void loadDetail(activeId)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-[#151F35] border border-[#283650] text-[#9AABC5] hover:text-[#EEF3FF] cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Refresh
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-[#151F35] border border-[#283650]">
              <p className="text-[10px] uppercase font-mono text-[#9AABC5]">Owner</p>
              <p className="text-[#EEF3FF] mt-1 truncate">{campaign.ownerName}</p>
            </div>
            <div className="p-3 rounded-xl bg-[#151F35] border border-[#283650]">
              <p className="text-[10px] uppercase font-mono text-[#9AABC5]">Window</p>
              <p className="text-[#EEF3FF] mt-1">
                {formatDate(campaign.startDate)} → {formatDate(campaign.endDate)}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-[#151F35] border border-[#283650]">
              <p className="text-[10px] uppercase font-mono text-[#9AABC5]">Channels</p>
              <p className="text-[#EEF3FF] mt-1">
                {campaign.channels.map((c) => CAMPAIGN_CHANNEL_LABELS[c]).join(' · ')}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-[#151F35] border border-[#283650]">
              <p className="text-[10px] uppercase font-mono text-[#9AABC5]">Readiness</p>
              <p className={`mt-1 font-semibold ${readiness.ready ? 'text-[#46E3C1]' : 'text-[#FFD166]'}`}>
                {readiness.ready ? 'Ready for release' : `${readiness.blockingReasons.length} blocker(s)`}
              </p>
            </div>
          </div>

          <div className="grid gap-2">
            <p className="text-[10px] uppercase font-mono text-[#9AABC5]">Objective</p>
            <p className="text-xs text-[#EEF3FF]">{campaign.objective}</p>
            <p className="text-[10px] uppercase font-mono text-[#9AABC5]">Target audience</p>
            <p className="text-xs text-[#EEF3FF]">{campaign.targetAudience}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ['assets', `Assets (${detail.assets.length})`],
              ['compliance', `Compliance (${allFindings.length})`],
              ['cross-channel', 'Cross-channel report'],
              ['approvals', 'Approval lane'],
              ['audit', `Audit (${detail.auditEvents.length})`],
            ] as [StudioTab, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                tab === id
                  ? 'bg-[#46E3C1]/15 text-[#46E3C1] border border-[#46E3C1]/40'
                  : 'bg-[#10192C] text-[#9AABC5] border border-[#283650] hover:text-[#EEF3FF]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ------------------------------- Assets ------------------------------- */}
        {tab === 'assets' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#EEF3FF]">Campaign assets</h3>
              <button
                onClick={() => openAssetForm()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-[#46E3C1]/15 text-[#46E3C1] border border-[#46E3C1]/40 hover:bg-[#46E3C1]/25 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Add asset
              </button>
            </div>

            {assetForm && (
              <form onSubmit={saveAsset} className="p-4 rounded-xl bg-[#10192C] border border-[#283650] space-y-3">
                <div className="grid md:grid-cols-2 gap-3">
                  <label className="text-xs text-[#9AABC5] space-y-1 block">
                    Asset title
                    <input
                      value={assetForm.title}
                      onChange={(e) => setAssetForm({ ...assetForm, title: e.target.value })}
                      className="w-full mt-1 px-3 py-2 rounded-lg bg-[#151F35] border border-[#283650] text-[#EEF3FF] text-xs outline-hidden focus:border-[#46E3C1]"
                      placeholder="Instagram launch caption"
                    />
                  </label>
                  <label className="text-xs text-[#9AABC5] space-y-1 block">
                    Channel
                    <select
                      value={assetForm.channel}
                      onChange={(e) =>
                        setAssetForm({ ...assetForm, channel: e.target.value as CampaignChannel })
                      }
                      className="w-full mt-1 px-3 py-2 rounded-lg bg-[#151F35] border border-[#283650] text-[#EEF3FF] text-xs outline-hidden focus:border-[#46E3C1]"
                    >
                      {CAMPAIGN_CHANNELS.map((channel) => (
                        <option key={channel} value={channel}>
                          {CAMPAIGN_CHANNEL_LABELS[channel]}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="text-xs text-[#9AABC5] block">
                  Content
                  <textarea
                    value={assetForm.content}
                    onChange={(e) => setAssetForm({ ...assetForm, content: e.target.value })}
                    rows={6}
                    className="w-full mt-1 px-3 py-2 rounded-lg bg-[#151F35] border border-[#283650] text-[#EEF3FF] text-xs outline-hidden focus:border-[#46E3C1]"
                    placeholder="Paste the exact channel copy. Claims are verified against the workspace governance library."
                  />
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    disabled={busyAction !== null}
                    className="px-3 py-1.5 rounded-lg text-xs bg-[#46E3C1] text-[#0B1020] font-semibold disabled:opacity-50 cursor-pointer"
                  >
                    {busyAction ? 'Saving…' : assetForm.assetId ? 'Save new version' : 'Create draft'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAssetForm(null)}
                    className="px-3 py-1.5 rounded-lg text-xs bg-[#151F35] border border-[#283650] text-[#9AABC5] cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {detail.assets.length === 0 && !assetForm && (
              <div className="p-8 text-center rounded-xl border border-dashed border-[#283650] text-xs text-[#9AABC5]">
                No assets yet. Add Instagram, LinkedIn, Google Ads, Email or Website copy to start the compliance review.
              </div>
            )}

            <div className="space-y-3">
              {detail.assets.map((asset) => {
                const open = asset.findings.filter((f) => f.status === 'open');
                return (
                  <div key={asset.id} className="p-4 rounded-xl bg-[#10192C] border border-[#283650] space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-[#EEF3FF]">{asset.title}</p>
                        <p className="text-[11px] text-[#9AABC5]">
                          {CAMPAIGN_CHANNEL_LABELS[asset.channel]} · v{asset.version} ·{' '}
                          {ASSET_STATUS_LABELS[asset.status] || asset.status} · reviewer:{' '}
                          {asset.reviewerName || 'unassigned'}
                        </p>
                        <p className="text-[10px] text-[#9AABC5]/70 font-mono mt-0.5">
                          updated {formatDate(asset.updatedAt)} · verified {formatDate(asset.lastVerifiedAt)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                            open.length
                              ? 'bg-[#FB7185]/10 text-[#FB7185] border-[#FB7185]/40'
                              : 'bg-[#46E3C1]/10 text-[#46E3C1] border-[#46E3C1]/40'
                          }`}
                        >
                          {open.length} open finding(s)
                        </span>
                      </div>
                    </div>

                    <pre className="whitespace-pre-wrap text-xs text-[#C7D3E7] bg-[#0B1020] rounded-lg p-3 border border-[#283650]/70 max-h-40 overflow-y-auto">
                      {asset.content}
                    </pre>

                    <div className="flex flex-wrap gap-1.5">
                      <button
                        onClick={() => openAssetForm(asset)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] bg-[#151F35] border border-[#283650] text-[#9AABC5] hover:text-[#EEF3FF] cursor-pointer"
                      >
                        <Pencil className="w-3 h-3" /> Edit
                      </button>
                      <button
                        onClick={() =>
                          activeId &&
                          void runAction('Verify claims', async () => {
                            const result = await campaignRepository.verifyAsset(
                              workspaceId,
                              activeId,
                              asset.id
                            );
                            onToast(
                              `Claim Guard (${result.engineMode}) found ${result.asset.findings.length} finding(s).`
                            );
                            await loadDetail(activeId);
                          })
                        }
                        disabled={busyAction !== null}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] bg-[#A78BFA]/15 border border-[#A78BFA]/40 text-[#A78BFA] disabled:opacity-50 cursor-pointer"
                      >
                        <Sparkles className="w-3 h-3" /> Verify claims
                      </button>
                      <button
                        onClick={() =>
                          activeId &&
                          void runAction('Submit asset', async () => {
                            await campaignRepository.submitAsset(workspaceId, activeId, asset.id);
                            onToast('Asset submitted for compliance review.');
                            await loadDetail(activeId);
                          })
                        }
                        disabled={busyAction !== null}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] bg-[#75D9F5]/15 border border-[#75D9F5]/40 text-[#75D9F5] disabled:opacity-50 cursor-pointer"
                      >
                        <Upload className="w-3 h-3" /> Submit
                      </button>
                      <button
                        onClick={() =>
                          activeId &&
                          void runAction('Approve asset', async () => {
                            await campaignRepository.reviewAsset(
                              workspaceId,
                              activeId,
                              asset.id,
                              'approved',
                              null
                            );
                            onToast('Asset approved.');
                            await loadDetail(activeId);
                          })
                        }
                        disabled={busyAction !== null}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] bg-[#46E3C1]/15 border border-[#46E3C1]/40 text-[#46E3C1] disabled:opacity-50 cursor-pointer"
                      >
                        <CheckCircle2 className="w-3 h-3" /> Approve
                      </button>
                      <button
                        onClick={() =>
                          activeId &&
                          void runAction('Request changes', async () => {
                            await campaignRepository.reviewAsset(
                              workspaceId,
                              activeId,
                              asset.id,
                              'changes_requested',
                              'Changes requested from Campaign Studio'
                            );
                            onToast('Changes requested on asset.');
                            await loadDetail(activeId);
                          })
                        }
                        disabled={busyAction !== null}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] bg-[#FFD166]/15 border border-[#FFD166]/40 text-[#FFD166] disabled:opacity-50 cursor-pointer"
                      >
                        <AlertTriangle className="w-3 h-3" /> Request changes
                      </button>
                      <button
                        onClick={() =>
                          activeId &&
                          void runAction('Delete asset', async () => {
                            await campaignRepository.deleteAsset(workspaceId, activeId, asset.id);
                            onToast('Asset deleted (audit event retained).');
                            await loadDetail(activeId);
                          })
                        }
                        disabled={busyAction !== null}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] bg-[#FB7185]/10 border border-[#FB7185]/40 text-[#FB7185] disabled:opacity-50 cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" /> Delete
                      </button>
                    </div>

                    {asset.versions.length > 0 && (
                      <details className="text-[11px] text-[#9AABC5]">
                        <summary className="cursor-pointer">
                          Version history ({asset.versions.length})
                        </summary>
                        <ul className="mt-2 space-y-1">
                          {asset.versions.map((version) => (
                            <li key={version.version} className="font-mono">
                              v{version.version} · {formatDate(version.savedAt)} · {version.savedByName} ·{' '}
                              {version.changeSummary}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ----------------------------- Compliance ----------------------------- */}
        {tab === 'compliance' && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-[#EEF3FF]">
              Source-linked claim verification
            </h3>
            {allFindings.length === 0 && (
              <div className="p-8 text-center rounded-xl border border-dashed border-[#283650] text-xs text-[#9AABC5]">
                No findings recorded. Run “Verify claims” on an asset to check it against the workspace evidence library.
              </div>
            )}
            {allFindings.map(({ asset, finding }) => (
              <div key={`${asset.id}-${finding.id}`} className="p-4 rounded-xl bg-[#10192C] border border-[#283650] space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${SEVERITY_STYLES[finding.severity] || SEVERITY_STYLES.low}`}>
                    {finding.severity.toUpperCase()}
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#151F35] text-[#9AABC5] border border-[#283650]">
                    {finding.category}
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#151F35] text-[#9AABC5] border border-[#283650]">
                    {finding.source === 'ai' ? 'AI + rules' : 'deterministic'}
                  </span>
                  <span className="text-[11px] text-[#9AABC5]">
                    {CAMPAIGN_CHANNEL_LABELS[asset.channel]} · {asset.title}
                  </span>
                </div>
                <p className="text-xs text-[#EEF3FF]">“{finding.excerpt}”</p>
                <p className="text-xs text-[#9AABC5]">{finding.rationale}</p>
                <p className="text-[11px] text-[#9AABC5]">
                  Evidence: <span className="text-[#75D9F5]">{finding.evidenceStatus}</span> ·{' '}
                  {finding.evidenceSourceName || 'No approved evidence found'}
                </p>
                {finding.suggestedRevision && (
                  <p className="text-[11px] text-[#46E3C1]">
                    Suggested revision: “{finding.suggestedRevision}”
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* --------------------------- Cross-channel --------------------------- */}
        {tab === 'cross-channel' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#EEF3FF]">Cross-channel consistency</h3>
              <button
                onClick={() =>
                  activeId &&
                  void runAction('Cross-channel analysis', async () => {
                    const report = await campaignRepository.crossChannel(workspaceId, activeId);
                    onToast(
                      `Cross-channel analysis complete: ${report.conflicts.length} conflict(s), ${report.ignoredStyleNotes.length} stylistic difference(s) ignored.`
                    );
                    await loadDetail(activeId);
                  })
                }
                disabled={busyAction !== null}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-[#A78BFA]/15 border border-[#A78BFA]/40 text-[#A78BFA] disabled:opacity-50 cursor-pointer"
              >
                <Layers3 className="w-3.5 h-3.5" /> Run analysis
              </button>
            </div>

            {!campaign.crossChannelReport && (
              <div className="p-8 text-center rounded-xl border border-dashed border-[#283650] text-xs text-[#9AABC5]">
                No cross-channel report yet. The engine compares factual values (price, dates, guarantees, features) across channels and ignores purely stylistic wording.
              </div>
            )}

            {campaign.crossChannelReport && (
              <div className="space-y-3">
                <div className="p-3 rounded-xl bg-[#151F35] border border-[#283650] text-[11px] text-[#9AABC5]">
                  Generated {formatDate(campaign.crossChannelReport.generatedAt)} by{' '}
                  {campaign.crossChannelReport.generatedBy} · engine:{' '}
                  {campaign.crossChannelReport.engineMode} · fingerprint{' '}
                  <span className="font-mono text-[#75D9F5]">
                    {campaign.crossChannelReport.contentFingerprint.slice(0, 16)}…
                  </span>
                </div>

                {campaign.crossChannelReport.conflicts.length === 0 && (
                  <div className="p-4 rounded-xl bg-[#46E3C1]/5 border border-[#46E3C1]/30 text-xs text-[#46E3C1]">
                    No factual inconsistencies detected between channels.
                  </div>
                )}

                {campaign.crossChannelReport.conflicts.map((conflict) => (
                  <div key={conflict.id} className="p-4 rounded-xl bg-[#10192C] border border-[#283650] space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${SEVERITY_STYLES[conflict.severity] || SEVERITY_STYLES.low}`}>
                        {conflict.severity.toUpperCase()}
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#151F35] border border-[#283650] text-[#9AABC5]">
                        {conflict.kind}
                      </span>
                      <span className="text-[11px] text-[#EEF3FF]">
                        {conflict.topic} · {conflict.channels.map((c) => CAMPAIGN_CHANNEL_LABELS[c]).join(' vs ')}
                      </span>
                      {conflict.resolved && (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#46E3C1]/15 text-[#46E3C1]">
                          resolved
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#9AABC5]">{conflict.summary}</p>
                    <ul className="space-y-1">
                      {conflict.excerpts.map((excerpt, idx) => (
                        <li key={`${conflict.id}-${idx}`} className="text-[11px] text-[#C7D3E7]">
                          <span className="text-[#75D9F5]">{CAMPAIGN_CHANNEL_LABELS[excerpt.channel]}:</span>{' '}
                          “{excerpt.quote}”
                        </li>
                      ))}
                    </ul>
                    <p className="text-[11px] text-[#9AABC5]">
                      Recommended resolution: {conflict.recommendedResolution}
                    </p>
                    {conflict.resolved ? (
                      <p className="text-[11px] text-[#46E3C1]">
                        Resolved by {conflict.resolvedBy}: {conflict.resolution}
                      </p>
                    ) : (
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          const data = new FormData(event.currentTarget);
                          const resolution = String(data.get('resolution') || '').trim();
                          if (!resolution || !activeId) return;
                          void runAction('Resolve conflict', async () => {
                            await campaignRepository.resolveConflict(
                              workspaceId,
                              activeId,
                              conflict.id,
                              resolution
                            );
                            onToast('Conflict resolution recorded.');
                            await loadDetail(activeId);
                          });
                        }}
                        className="flex gap-2"
                      >
                        <input
                          name="resolution"
                          placeholder="Record how this inconsistency was resolved…"
                          className="flex-1 px-3 py-1.5 rounded-lg bg-[#151F35] border border-[#283650] text-[#EEF3FF] text-xs outline-hidden focus:border-[#46E3C1]"
                        />
                        <button
                          type="submit"
                          disabled={busyAction !== null}
                          className="px-3 py-1.5 rounded-lg text-xs bg-[#151F35] border border-[#283650] text-[#EEF3FF] disabled:opacity-50 cursor-pointer"
                        >
                          Resolve
                        </button>
                      </form>
                    )}
                  </div>
                ))}

                {campaign.crossChannelReport.comparedFacts.length > 0 && (
                  <div className="p-4 rounded-xl bg-[#10192C] border border-[#283650]">
                    <p className="text-xs font-semibold text-[#EEF3FF] mb-2">Facts compared</p>
                    <ul className="space-y-1 text-[11px] text-[#9AABC5]">
                      {campaign.crossChannelReport.comparedFacts.map((fact) => (
                        <li key={fact.topic}>
                          <span className="text-[#EEF3FF]">{fact.topic}</span>:{' '}
                          {fact.values
                            .map((v) => `${CAMPAIGN_CHANNEL_LABELS[v.channel]}=${v.value}`)
                            .join(' · ')}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {campaign.crossChannelReport.ignoredStyleNotes.length > 0 && (
                  <div className="p-4 rounded-xl bg-[#151F35] border border-[#283650]">
                    <p className="text-xs font-semibold text-[#EEF3FF] mb-1">Stylistic differences ignored</p>
                    <ul className="list-disc list-inside space-y-0.5 text-[11px] text-[#9AABC5]">
                      {campaign.crossChannelReport.ignoredStyleNotes.map((note) => (
                        <li key={note}>{note}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ----------------------------- Approvals ----------------------------- */}
        {tab === 'approvals' && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-[#EEF3FF]">Guided Approval Lane</h3>

            <div className={`p-4 rounded-xl border ${readiness.ready ? 'bg-[#46E3C1]/5 border-[#46E3C1]/40' : 'bg-[#FFD166]/5 border-[#FFD166]/40'}`}>
              <p className={`text-xs font-semibold ${readiness.ready ? 'text-[#46E3C1]' : 'text-[#FFD166]'}`}>
                {readiness.ready ? 'Campaign satisfies the release gate' : 'Release gate blocked'}
              </p>
              {readiness.blockingReasons.length > 0 && (
                <ul className="mt-2 list-disc list-inside space-y-0.5 text-[11px] text-[#C7D3E7]">
                  {readiness.blockingReasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-[11px] text-[#9AABC5]">
                Required approval roles: {readiness.requiredRoles.join(', ')} · satisfied:{' '}
                {readiness.satisfiedRoles.length ? readiness.satisfiedRoles.join(', ') : 'none'}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() =>
                  activeId &&
                  void runAction('Record approval', async () => {
                    await campaignRepository.decide(workspaceId, activeId, 'approved', null);
                    onToast('Approval recorded.');
                    await loadDetail(activeId);
                  })
                }
                disabled={busyAction !== null}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-[#46E3C1] text-[#0B1020] font-semibold disabled:opacity-50 cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" /> Approve campaign
              </button>
              <button
                onClick={() =>
                  activeId &&
                  void runAction('Request changes', async () => {
                    await campaignRepository.decide(
                      workspaceId,
                      activeId,
                      'changes_requested',
                      'Campaign requires revision'
                    );
                    onToast('Changes requested on campaign.');
                    await loadDetail(activeId);
                  })
                }
                disabled={busyAction !== null}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-[#FFD166]/15 border border-[#FFD166]/40 text-[#FFD166] disabled:opacity-50 cursor-pointer"
              >
                <AlertTriangle className="w-3.5 h-3.5" /> Request changes
              </button>
              <button
                onClick={() =>
                  activeId &&
                  void runAction('Generate manifest', async () => {
                    const result = await campaignRepository.generateManifest(workspaceId, activeId);
                    onToast(
                      `Release manifest generated (SHA-256 ${result.manifest?.manifestHash.slice(0, 12) ?? '—'}…).`
                    );
                    await loadDetail(activeId);
                  })
                }
                disabled={busyAction !== null}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-[#75D9F5]/15 border border-[#75D9F5]/40 text-[#75D9F5] disabled:opacity-50 cursor-pointer"
              >
                <FileSignature className="w-3.5 h-3.5" /> Generate manifest
              </button>
              <button
                onClick={() =>
                  activeId &&
                  void runAction('Verify manifest', async () => {
                    const verification = await campaignRepository.verifyManifest(workspaceId, activeId);
                    onToast(
                      verification.present
                        ? verification.intact
                          ? 'Manifest intact — no tampering detected.'
                          : `Tampering detected: ${verification.tamperedAssets.length} modified, ${verification.missingAssets.length + verification.removedAssets.length} missing.`
                        : 'No release manifest has been generated yet.'
                    );
                    await loadDetail(activeId);
                  })
                }
                disabled={busyAction !== null}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-[#151F35] border border-[#283650] text-[#EEF3FF] disabled:opacity-50 cursor-pointer"
              >
                <ShieldCheck className="w-3.5 h-3.5" /> Verify integrity
              </button>
            </div>

            <div className="p-4 rounded-xl bg-[#10192C] border border-[#283650] space-y-2">
              <p className="text-xs font-semibold text-[#EEF3FF]">Approval decisions</p>
              {campaign.approvals.length === 0 && (
                <p className="text-[11px] text-[#9AABC5]">No approvals recorded yet.</p>
              )}
              <ul className="space-y-1">
                {campaign.approvals.map((approval) => (
                  <li key={approval.id} className="text-[11px] text-[#9AABC5]">
                    <span className="text-[#EEF3FF]">{approval.actorName}</span> ({approval.role}) ·{' '}
                    {approval.decision} · {formatDate(approval.createdAt)}
                    {approval.note ? ` · “${approval.note}”` : ''}
                  </li>
                ))}
              </ul>
            </div>

            <div className="p-4 rounded-xl bg-[#10192C] border border-[#283650] space-y-2">
              <p className="text-xs font-semibold text-[#EEF3FF]">Release manifest</p>
              {!campaign.manifest && (
                <p className="text-[11px] text-[#9AABC5]">
                  No manifest generated. The manifest assigns a SHA-256 hash to every approved asset version so any later edit is detectable.
                </p>
              )}
              {campaign.manifest && (
                <>
                  <p className="text-[11px] text-[#9AABC5]">
                    Manifest {campaign.manifest.manifestId} · {campaign.manifest.algorithm} ·{' '}
                    {formatDate(campaign.manifest.createdAt)} · {campaign.manifest.createdByName}
                  </p>
                  <p className="text-[11px] font-mono text-[#75D9F5] break-all">
                    {campaign.manifest.manifestHash}
                  </p>
                  {detail.manifestVerification.present && (
                    <p className={`text-[11px] ${detail.manifestVerification.intact ? 'text-[#46E3C1]' : 'text-[#FB7185]'}`}>
                      {detail.manifestVerification.intact
                        ? 'Integrity verified against current assets.'
                        : `Tampered assets: ${detail.manifestVerification.tamperedAssets.length}, missing: ${detail.manifestVerification.missingAssets.length}, removed: ${detail.manifestVerification.removedAssets.length}`}
                    </p>
                  )}
                  <ul className="space-y-0.5">
                    {campaign.manifest.files.map((file) => (
                      <li key={file.assetId} className="text-[10px] font-mono text-[#9AABC5]">
                        {CAMPAIGN_CHANNEL_LABELS[file.channel]} · {file.title} · v{file.version} ·{' '}
                        {file.sha256.slice(0, 16)}…
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </div>
        )}

        {/* ------------------------------- Audit -------------------------------- */}
        {tab === 'audit' && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-[#EEF3FF]">Campaign audit history</h3>
            {detail.auditEvents.length === 0 && (
              <div className="p-8 text-center rounded-xl border border-dashed border-[#283650] text-xs text-[#9AABC5]">
                No audit events recorded yet.
              </div>
            )}
            <ul className="space-y-1.5">
              {detail.auditEvents.map((event) => (
                <li key={event.id} className="p-3 rounded-lg bg-[#10192C] border border-[#283650] text-[11px] text-[#9AABC5]">
                  <span className="font-mono text-[#75D9F5]">{event.action}</span> ·{' '}
                  <span className="text-[#EEF3FF]">{event.actorName}</span> ({event.actorRole}) ·{' '}
                  {formatDate(event.createdAt)}
                  {event.reason ? ` · ${event.reason}` : ''}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  };

  /* ------------------------------ Dashboard ------------------------------ */

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-[#EEF3FF]">Campaign Compliance Studio</h1>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#A78BFA]/15 text-[#A78BFA]">
              MULTI-CHANNEL
            </span>
          </div>
          <p className="text-xs text-[#9AABC5] mt-1 max-w-2xl">
            Govern every channel from one campaign: Source-Linked Claim Guard, cross-channel consistency,
            the Guided Approval Lane and SHA-256 release manifests. Signed in as {userEmail || 'workspace member'} ({userRole}).
          </p>
        </div>
        {!activeId && (
          <button
            onClick={() => setShowCreate((prev) => !prev)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#46E3C1] text-[#0B1020] cursor-pointer"
          >
            {showCreate ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            {showCreate ? 'Close' : 'Create campaign'}
          </button>
        )}
      </div>

      {showCreate && !activeId && (
        <form onSubmit={submitCreate} className="p-5 rounded-2xl bg-[#10192C] border border-[#283650] space-y-3">
          <h2 className="text-sm font-semibold text-[#EEF3FF]">New campaign</h2>
          {formError && (
            <p className="text-[11px] text-[#FB7185] bg-[#FB7185]/10 border border-[#FB7185]/30 rounded-lg px-3 py-2">
              {formError}
            </p>
          )}
          <div className="grid md:grid-cols-2 gap-3">
            {(
              [
                ['name', 'Campaign name *', 'Autumn Product Launch'],
                ['ownerName', 'Campaign owner *', 'Priya Raman'],
                ['targetAudience', 'Target audience *', 'Mid-market marketing leaders'],
              ] as [keyof typeof form, string, string][]
            ).map(([key, label, placeholder]) => (
              <label key={key} className="text-xs text-[#9AABC5] block">
                {label}
                <input
                  value={form[key] as string}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  placeholder={placeholder}
                  className="w-full mt-1 px-3 py-2 rounded-lg bg-[#151F35] border border-[#283650] text-[#EEF3FF] text-xs outline-hidden focus:border-[#46E3C1]"
                />
              </label>
            ))}
            <label className="text-xs text-[#9AABC5] block">
              Campaign status
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="w-full mt-1 px-3 py-2 rounded-lg bg-[#151F35] border border-[#283650] text-[#EEF3FF] text-xs outline-hidden focus:border-[#46E3C1]"
              >
                {['draft', 'in_review', 'approved', 'released', 'archived'].map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-[#9AABC5] block">
              Start date *
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                className="w-full mt-1 px-3 py-2 rounded-lg bg-[#151F35] border border-[#283650] text-[#EEF3FF] text-xs outline-hidden focus:border-[#46E3C1]"
              />
            </label>
            <label className="text-xs text-[#9AABC5] block">
              End date *
              <input
                type="date"
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                className="w-full mt-1 px-3 py-2 rounded-lg bg-[#151F35] border border-[#283650] text-[#EEF3FF] text-xs outline-hidden focus:border-[#46E3C1]"
              />
            </label>
          </div>
          <label className="text-xs text-[#9AABC5] block">
            Description *
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
              className="w-full mt-1 px-3 py-2 rounded-lg bg-[#151F35] border border-[#283650] text-[#EEF3FF] text-xs outline-hidden focus:border-[#46E3C1]"
            />
          </label>
          <label className="text-xs text-[#9AABC5] block">
            Objective *
            <textarea
              value={form.objective}
              onChange={(e) => setForm({ ...form, objective: e.target.value })}
              rows={2}
              className="w-full mt-1 px-3 py-2 rounded-lg bg-[#151F35] border border-[#283650] text-[#EEF3FF] text-xs outline-hidden focus:border-[#46E3C1]"
            />
          </label>
          <div>
            <p className="text-xs text-[#9AABC5] mb-1.5">Publishing channels *</p>
            <div className="flex flex-wrap gap-1.5">
              {CAMPAIGN_CHANNELS.map((channel) => {
                const selected = form.channels.includes(channel);
                return (
                  <button
                    key={channel}
                    type="button"
                    onClick={() => toggleChannel(channel)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] border cursor-pointer ${
                      selected
                        ? 'bg-[#46E3C1]/15 text-[#46E3C1] border-[#46E3C1]/40'
                        : 'bg-[#151F35] text-[#9AABC5] border-[#283650]'
                    }`}
                  >
                    {CAMPAIGN_CHANNEL_LABELS[channel]}
                  </button>
                );
              })}
            </div>
          </div>
          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-[#46E3C1] text-[#0B1020] disabled:opacity-50 cursor-pointer"
          >
            {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Create campaign
          </button>
        </form>
      )}

      {activeId ? (
        detailLoading && !detail ? (
          <div className="p-10 text-center text-xs text-[#9AABC5]">
            <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Loading campaign…
          </div>
        ) : detailError ? (
          <div className="p-4 rounded-xl bg-[#FB7185]/10 border border-[#FB7185]/30 text-xs text-[#FB7185]">
            {detailError}
          </div>
        ) : (
          renderDetail()
        )
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search campaigns…"
              className="flex-1 min-w-[180px] px-3 py-2 rounded-lg bg-[#10192C] border border-[#283650] text-[#EEF3FF] text-xs outline-hidden focus:border-[#46E3C1]"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 rounded-lg bg-[#10192C] border border-[#283650] text-[#EEF3FF] text-xs"
            >
              <option value="all">All statuses</option>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <select
              value={channelFilter}
              onChange={(e) => setChannelFilter(e.target.value)}
              className="px-3 py-2 rounded-lg bg-[#10192C] border border-[#283650] text-[#EEF3FF] text-xs"
            >
              <option value="all">All channels</option>
              {CAMPAIGN_CHANNELS.map((channel) => (
                <option key={channel} value={channel}>
                  {CAMPAIGN_CHANNEL_LABELS[channel]}
                </option>
              ))}
            </select>
            <button
              onClick={() => void loadCampaigns()}
              className="px-3 py-2 rounded-lg bg-[#10192C] border border-[#283650] text-[#9AABC5] hover:text-[#EEF3FF] cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          {isLoadingList && (
            <div className="p-10 text-center text-xs text-[#9AABC5]">
              <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Loading campaigns…
            </div>
          )}

          {!isLoadingList && listError && (
            <div className="p-4 rounded-xl bg-[#FB7185]/10 border border-[#FB7185]/30 text-xs text-[#FB7185] space-y-2">
              <p>{listError}</p>
              <button onClick={() => void loadCampaigns()} className="underline cursor-pointer">
                Retry
              </button>
            </div>
          )}

          {!isLoadingList && !listError && campaigns.length === 0 && (
            <div className="p-10 text-center rounded-xl border border-dashed border-[#283650] text-xs text-[#9AABC5]">
              No campaigns match your filters. Create the first campaign to govern multi-channel content.
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            {campaigns.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setActiveId(item.id);
                  setTab('assets');
                }}
                className="text-left p-4 rounded-xl bg-[#10192C] border border-[#283650] hover:border-[#46E3C1]/50 transition-colors cursor-pointer space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-[#EEF3FF]">{item.name}</p>
                  <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-[#75D9F5]/15 text-[#75D9F5]">
                    {STATUS_LABELS[item.status] || item.status}
                  </span>
                </div>
                <p className="text-[11px] text-[#9AABC5] line-clamp-2">{item.description}</p>
                <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono text-[#9AABC5]">
                  {item.channels.map((channel) => (
                    <span key={channel} className="px-1.5 py-0.5 rounded bg-[#151F35] border border-[#283650]">
                      {CAMPAIGN_CHANNEL_LABELS[channel]}
                    </span>
                  ))}
                  <span>· {item.assetCount} asset(s)</span>
                  {item.manifest && <span>· manifest ✓</span>}
                </div>
                <p className="flex items-center gap-1 text-[11px] text-[#46E3C1]">
                  Open workshop <ChevronRight className="w-3 h-3" />
                </p>
              </button>
            ))}
          </div>

          {!isLoadingList && !listError && campaigns.length > 0 && (
            <p className="text-[10px] font-mono text-[#9AABC5]/70 flex items-center gap-1">
              <ClipboardList className="w-3 h-3" /> {campaigns.length} campaign(s) ·{' '}
              <History className="w-3 h-3" /> append-only audit retained per campaign
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default CampaignStudioView;
