import React, { useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  ShieldCheck,
  AlertTriangle,
  UserCheck,
  Download,
  Share2,
  Lock,
  MessageSquare,
  FileCheck,
} from 'lucide-react';
import { Review, WorkspaceRole } from '../types/brandlens';

interface ApprovalsViewProps {
  reviews: Review[];
  userRole: WorkspaceRole;
  onUpdateStatus: (review: Review, newStatus: Review['status'], reason?: string) => Promise<void>;
  onSelectReview: (reviewId: string) => void;
}

export const ApprovalsView: React.FC<ApprovalsViewProps> = ({
  reviews,
  userRole,
  onUpdateStatus,
  onSelectReview,
}) => {
  const [selectedReview, setSelectedReview] = useState<Review | null>(reviews[0] || null);
  const [requestReason, setRequestReason] = useState('');
  const [isRequestingChanges, setIsRequestingChanges] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  React.useEffect(() => {
    if (!selectedReview && reviews.length > 0) {
      setSelectedReview(reviews[0]);
    } else if (selectedReview) {
      const refreshed = reviews.find((r) => r.id === selectedReview.id);
      if (refreshed) setSelectedReview(refreshed);
    }
  }, [reviews]);

  const canApprove =
    userRole === 'admin' ||
    userRole === 'brand_manager' ||
    userRole === 'specialist_reviewer';

  const canPublish =
    userRole === 'admin' ||
    userRole === 'publish_owner';

  const handleApprove = async () => {
    if (!selectedReview) return;
    await onUpdateStatus(
      selectedReview,
      'approved',
      `Approved by ${userRole} after preflight compliance confirmation.`
    );
  };

  const handleRequestChanges = async () => {
    if (!selectedReview || !requestReason.trim()) return;
    await onUpdateStatus(
      selectedReview,
      'changes_requested',
      `Changes requested: ${requestReason.trim()}`
    );
    setRequestReason('');
    setIsRequestingChanges(false);
  };

  const handlePublish = async () => {
    if (!selectedReview) return;
    setIsExporting(true);
    await onUpdateStatus(
      selectedReview,
      'published',
      `Final release published and certified by ${userRole}. Brand compliance manifest generated.`
    );
    setIsExporting(false);
  };

  const columns: { id: Review['status']; label: string; count: number; color: string }[] = [
    { id: 'draft', label: 'Drafts in Prep', count: reviews.filter((r) => r.status === 'draft').length, color: 'text-[#9AABC5]' },
    { id: 'in_review', label: 'In Review Lane', count: reviews.filter((r) => r.status === 'in_review').length, color: 'text-[#FFD166]' },
    { id: 'changes_requested', label: 'Changes Requested', count: reviews.filter((r) => r.status === 'changes_requested').length, color: 'text-[#FB7185]' },
    { id: 'approved', label: 'Approved by Human', count: reviews.filter((r) => r.status === 'approved').length, color: 'text-[#46E3C1]' },
    { id: 'published', label: 'Published / Exported', count: reviews.filter((r) => r.status === 'published').length, color: 'text-[#75D9F5]' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-[10px] font-mono tracking-widest uppercase text-[#46E3C1]">
            SCREEN 04
          </span>
          <span className="text-xs text-[#283650]"> / </span>
          <span className="text-xs text-[#75D9F5] font-mono">
            HUMAN-IN-THE-LOOP QUALITY GATE
          </span>
          <h2 className="text-xl font-bold text-[#EEF3FF]">
            Guided Approvals Lane
          </h2>
          <p className="text-xs text-[#9AABC5]">
            Role-gated transition pipeline. BrandLens never auto-publishes; authorized humans approve and export.
          </p>
        </div>

        {/* Current Role badge */}
        <div className="flex items-center gap-2 p-2 rounded-xl bg-[#151F35] border border-[#283650] text-xs">
          <span className="text-[#9AABC5] font-mono">Active Actor:</span>
          <span className="font-semibold text-[#46E3C1] uppercase tracking-wider">
            {userRole.replace('_', ' ')}
          </span>
        </div>
      </div>

      {/* Kanban / Pipeline Columns Preview */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {columns.map((col) => (
          <div key={col.id} className="p-3 rounded-xl bg-[#151F35] border border-[#283650] space-y-1">
            <span className="text-[10px] font-mono uppercase text-[#9AABC5]">
              {col.label}
            </span>
            <div className={`text-xl font-bold ${col.color}`}>
              {col.count}
            </div>
          </div>
        ))}
      </div>

      {/* Main Review Decision Workspace */}
      {selectedReview ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Review Selector (4 cols) */}
          <div className="lg:col-span-4 rounded-xl bg-[#151F35] border border-[#283650] p-4 space-y-3">
            <span className="text-[10px] font-mono tracking-wider uppercase text-[#75D9F5]">
              SELECT DRAFT IN WORKSPACE
            </span>
            <div className="space-y-2">
              {reviews.map((r) => (
                <div
                  key={r.id}
                  onClick={() => setSelectedReview(r)}
                  className={`p-3 rounded-lg border transition-all cursor-pointer ${
                    selectedReview.id === r.id
                      ? 'bg-[#10192C] border-[#46E3C1]'
                      : 'bg-[#151F35] border-[#283650] hover:border-[#75D9F5]'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-semibold text-[#EEF3FF] truncate">
                      {r.title}
                    </span>
                    <span
                      className={`text-[9px] font-mono px-2 py-0.2 rounded uppercase ${
                        r.status === 'approved'
                          ? 'bg-[#46E3C1]/20 text-[#46E3C1]'
                          : r.status === 'published'
                          ? 'bg-[#75D9F5]/20 text-[#75D9F5]'
                          : r.status === 'changes_requested'
                          ? 'bg-[#FB7185]/20 text-[#FB7185]'
                          : 'bg-[#FFD166]/20 text-[#FFD166]'
                      }`}
                    >
                      {r.status.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#9AABC5] line-clamp-1 italic">
                    “{r.currentText}”
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Right Decision Card (8 cols) */}
          <div className="lg:col-span-8 rounded-xl bg-[#151F35] border border-[#283650] p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-[#283650] pb-4">
              <div>
                <span className="text-[10px] font-mono uppercase text-[#46E3C1]">
                  VERSION v{selectedReview.contentVersion} • {selectedReview.channel.toUpperCase()}
                </span>
                <h3 className="text-lg font-bold text-[#EEF3FF]">
                  {selectedReview.title}
                </h3>
              </div>

              <div className="text-right">
                <span className="text-[10px] font-mono text-[#9AABC5] block">
                  Current Status
                </span>
                <span
                  className={`text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full ${
                    selectedReview.status === 'approved'
                      ? 'bg-[#46E3C1]/20 text-[#46E3C1] border border-[#46E3C1]/30'
                      : selectedReview.status === 'published'
                      ? 'bg-[#75D9F5]/20 text-[#75D9F5] border border-[#75D9F5]/30'
                      : selectedReview.status === 'changes_requested'
                      ? 'bg-[#FB7185]/20 text-[#FB7185] border border-[#FB7185]/30'
                      : 'bg-[#FFD166]/20 text-[#FFD166] border border-[#FFD166]/30'
                  }`}
                >
                  {selectedReview.status.replace('_', ' ')}
                </span>
              </div>
            </div>

            {/* Governed Text View */}
            <div className="rounded-lg bg-[#10192C] border border-[#283650] p-4 space-y-2">
              <span className="text-[10px] font-mono uppercase text-[#75D9F5]">
                Governed Content Payload for Signoff:
              </span>
              <p className="text-sm text-[#EEF3FF] leading-relaxed font-sans">
                {selectedReview.currentText}
              </p>
            </div>

            {/* Request Changes Drawer */}
            {isRequestingChanges && (
              <div className="p-4 rounded-lg bg-[#10192C] border border-[#FB7185]/40 space-y-2 text-xs">
                <span className="font-semibold text-[#FB7185] block">
                  Specify Required Revisions or Policy Conflict:
                </span>
                <textarea
                  rows={2}
                  value={requestReason}
                  onChange={(e) => setRequestReason(e.target.value)}
                  placeholder="e.g. Legal requires softer SLA wording before releasing to paid channels..."
                  className="w-full bg-[#151F35] border border-[#283650] rounded p-2 text-[#EEF3FF] focus:outline-none focus:border-[#FB7185]"
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setIsRequestingChanges(false)}
                    className="px-3 py-1 text-[#9AABC5] hover:text-[#EEF3FF]"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleRequestChanges}
                    className="px-3 py-1 bg-[#FB7185] text-[#0B1020] font-bold rounded"
                  >
                    Submit Request
                  </button>
                </div>
              </div>
            )}

            {/* Human Gatekeeper Controls */}
            <div className="pt-2 border-t border-[#283650] flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onSelectReview(selectedReview.id)}
                  className="px-3 py-1.5 rounded-lg bg-[#10192C] border border-[#283650] text-xs text-[#9AABC5] hover:text-[#EEF3FF] flex items-center gap-1.5"
                >
                  <FileCheck className="w-3.5 h-3.5" />
                  <span>Inspect Preflight Findings</span>
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Request Changes Button */}
                <button
                  onClick={() => setIsRequestingChanges(!isRequestingChanges)}
                  className="px-3.5 py-2 rounded-lg bg-[#151F35] border border-[#FB7185]/40 text-[#FB7185] text-xs font-semibold hover:bg-[#FB7185]/10 flex items-center gap-1.5 cursor-pointer"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  <span>Request Changes</span>
                </button>

                {/* Approve Button */}
                <button
                  onClick={handleApprove}
                  disabled={!canApprove || selectedReview.status === 'approved' || selectedReview.status === 'published'}
                  className="px-4 py-2 rounded-lg bg-[#46E3C1] text-[#0B1020] text-xs font-bold hover:bg-[#46E3C1]/90 shadow-md shadow-[#46E3C1]/20 flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
                  title={
                    canApprove
                      ? 'Approve draft as Brand Manager / Specialist'
                      : 'Creators cannot self-approve. Switch to Brand Manager or Specialist.'
                  }
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Approve Content (Human Signoff)</span>
                </button>

                {/* Publish / Export Gate Button */}
                <button
                  onClick={handlePublish}
                  disabled={!canPublish || selectedReview.status !== 'approved'}
                  className="px-4 py-2 rounded-lg bg-[#75D9F5] text-[#0B1020] text-xs font-bold hover:bg-[#75D9F5]/90 shadow-md shadow-[#75D9F5]/20 flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
                  title={
                    canPublish
                      ? selectedReview.status === 'approved'
                        ? 'Publish Owner export & release'
                        : 'Must be in Approved state before publication'
                      : 'Only Publish Owner or Admin can execute final release'
                  }
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export & Release</span>
                </button>
              </div>
            </div>

            {/* Human Gate Audit Explanation */}
            <div className="p-3 rounded-lg bg-[#10192C] border border-[#283650] text-[11px] text-[#9AABC5] flex items-center justify-between">
              <span>
                <strong className="text-[#EEF3FF]">Governance Policy:</strong> Creator cannot self-approve high-risk claims. Publish Owners own release manifests.
              </span>
              <span className="font-mono text-[#46E3C1]">
                Zero Auto-Publish Enforced
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-12 text-center rounded-xl bg-[#151F35] border border-[#283650] text-xs text-[#9AABC5]">
          No draft reviews currently in workspace.
        </div>
      )}
    </div>
  );
};
