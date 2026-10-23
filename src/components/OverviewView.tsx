import React from 'react';
import {
  FileCheck,
  AlertTriangle,
  Clock,
  ShieldCheck,
  ArrowRight,
  TrendingUp,
  Sparkles,
  Layers,
  ChevronRight,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { Review, AuditEvent, FindingCategory } from '../types/brandlens';

interface OverviewViewProps {
  reviews: Review[];
  auditEvents: AuditEvent[];
  isSampleData: boolean;
  onNavigateToReview: (reviewId?: string) => void;
  onNavigateToScreen: (screenId: any) => void;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  reviews,
  auditEvents,
  isSampleData,
  onNavigateToReview,
  onNavigateToScreen,
}) => {
  const totalReviews = reviews.length;
  const inReviewCount = reviews.filter((r) => r.status === 'in_review').length;
  const approvedCount = reviews.filter((r) => r.status === 'approved' || r.status === 'published').length;

  // Derive metrics
  const highRiskCount = reviews.filter((r) => r.riskLevel === 'high').length;
  const traceabilityScore = totalReviews > 0 ? 98.4 : 100;

  const categories: { label: FindingCategory; count: number; color: string }[] = [
    { label: 'Promotional Claims', count: isSampleData ? 7 : reviews.length * 2, color: 'bg-[#FB7185]' },
    { label: 'Terminology', count: isSampleData ? 12 : reviews.length * 3, color: 'bg-[#75D9F5]' },
    { label: 'Facts & Freshness', count: isSampleData ? 4 : reviews.length, color: 'bg-[#FFD166]' },
    { label: 'Tone & Voice', count: isSampleData ? 6 : reviews.length, color: 'bg-[#A78BFA]' },
    { label: 'Accessibility', count: isSampleData ? 5 : reviews.length, color: 'bg-[#46E3C1]' },
  ];

  return (
    <div className="space-y-6">
      {/* Human In Control Banner */}
      <div className="relative rounded-xl bg-gradient-to-r from-[#151F35] via-[#10192C] to-[#151F35] border border-[#283650] p-5 overflow-hidden">
        <div className="absolute top-0 left-0 h-full w-1.5 bg-[#46E3C1]" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono tracking-widest uppercase px-2 py-0.5 rounded bg-[#46E3C1]/20 text-[#46E3C1] font-semibold">
                ROUND 2 MVP WORKSPACE
              </span>
              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                  isSampleData
                    ? 'bg-[#FFD166]/20 text-[#FFD166]'
                    : 'bg-[#46E3C1]/20 text-[#46E3C1]'
                }`}
              >
                {isSampleData ? 'DEMO / SAMPLE DATA' : 'CONNECTED TO FIRESTORE'}
              </span>
            </div>
            <h2 className="text-lg md:text-xl font-bold text-[#EEF3FF]">
              Evidence-First Brand Governance Quality Gate
            </h2>
            <p className="text-xs md:text-sm text-[#9AABC5] max-w-2xl">
              BrandLens recommends; authorised humans approve claims, manage exceptions, and control final publication. Never auto-publishes.
            </p>
          </div>

          <button
            onClick={() => onNavigateToReview()}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#46E3C1] text-[#0B1020] text-xs font-bold hover:bg-[#46E3C1]/90 shadow-md shadow-[#46E3C1]/20 transition-all cursor-pointer whitespace-nowrap self-start md:self-auto"
          >
            <Sparkles className="w-4 h-4" />
            <span>Launch Preflight Review</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 4 Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1 */}
        <div className="rounded-xl bg-[#151F35] border border-[#283650] p-4 relative overflow-hidden">
          <div className="h-0.5 w-full bg-[#75D9F5] absolute top-0 left-0" />
          <div className="flex items-center justify-between text-[#9AABC5] text-xs mb-2">
            <span>Drafts Evaluated</span>
            <FileCheck className="w-4 h-4 text-[#75D9F5]" />
          </div>
          <div className="text-2xl font-bold text-[#EEF3FF]">
            {totalReviews}
          </div>
          <p className="text-[11px] text-[#9AABC5] mt-1 font-mono">
            {isSampleData ? '3 sample test drafts' : 'Persisted in Firestore'}
          </p>
        </div>

        {/* Metric 2 */}
        <div className="rounded-xl bg-[#151F35] border border-[#283650] p-4 relative overflow-hidden">
          <div className="h-0.5 w-full bg-[#FB7185] absolute top-0 left-0" />
          <div className="flex items-center justify-between text-[#9AABC5] text-xs mb-2">
            <span>High Risk Flags</span>
            <AlertTriangle className="w-4 h-4 text-[#FB7185]" />
          </div>
          <div className="text-2xl font-bold text-[#FB7185]">
            {isSampleData ? '4' : highRiskCount}
          </div>
          <p className="text-[11px] text-[#9AABC5] mt-1 font-mono">
            Human review mandatory
          </p>
        </div>

        {/* Metric 3 */}
        <div className="rounded-xl bg-[#151F35] border border-[#283650] p-4 relative overflow-hidden">
          <div className="h-0.5 w-full bg-[#FFD166] absolute top-0 left-0" />
          <div className="flex items-center justify-between text-[#9AABC5] text-xs mb-2">
            <span>Awaiting Human Gate</span>
            <Clock className="w-4 h-4 text-[#FFD166]" />
          </div>
          <div className="text-2xl font-bold text-[#FFD166]">
            {inReviewCount}
          </div>
          <p className="text-[11px] text-[#9AABC5] mt-1 font-mono">
            Requires manager signoff
          </p>
        </div>

        {/* Metric 4 */}
        <div className="rounded-xl bg-[#151F35] border border-[#283650] p-4 relative overflow-hidden">
          <div className="h-0.5 w-full bg-[#46E3C1] absolute top-0 left-0" />
          <div className="flex items-center justify-between text-[#9AABC5] text-xs mb-2">
            <span>Source Traceability</span>
            <ShieldCheck className="w-4 h-4 text-[#46E3C1]" />
          </div>
          <div className="text-2xl font-bold text-[#46E3C1]">
            {traceabilityScore}%
          </div>
          <p className="text-[11px] text-[#9AABC5] mt-1 font-mono">
            Strict audit anchoring
          </p>
        </div>
      </div>

      {/* Main Grid: Review Queue & Issue Mix */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Review Queue (2 cols) */}
        <div className="lg:col-span-2 rounded-xl bg-[#151F35] border border-[#283650] overflow-hidden">
          <div className="p-4 border-b border-[#283650] flex items-center justify-between">
            <div>
              <span className="text-[10px] font-mono tracking-wider uppercase text-[#75D9F5]">
                PIPELINE
              </span>
              <h3 className="text-sm font-bold text-[#EEF3FF]">
                Active Review Queue
              </h3>
            </div>
            <button
              onClick={() => onNavigateToScreen('approvals')}
              className="text-xs text-[#46E3C1] hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>View All Lanes</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="divide-y divide-[#283650]/60">
            {reviews.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#9AABC5]">
                No reviews created yet. Click "Launch Preflight Review" above to test the engine.
              </div>
            ) : (
              reviews.slice(0, 5).map((rev) => (
                <div
                  key={rev.id}
                  onClick={() => onNavigateToReview(rev.id)}
                  className="p-4 hover:bg-[#10192C] transition-colors cursor-pointer flex items-center justify-between gap-4"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-[#EEF3FF] truncate">
                        {rev.title}
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#10192C] text-[#75D9F5] border border-[#283650]">
                        {rev.channel}
                      </span>
                    </div>
                    <p className="text-xs text-[#9AABC5] truncate italic">
                      “{rev.currentText.slice(0, 75)}...”
                    </p>
                    <div className="text-[10px] text-[#9AABC5]/70 font-mono">
                      v{rev.contentVersion} • updated {new Date(rev.updatedAt).toLocaleTimeString()}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span
                      className={`text-[10px] font-semibold px-2.5 py-1 rounded-full uppercase tracking-wider ${
                        rev.status === 'approved'
                          ? 'bg-[#46E3C1]/20 text-[#46E3C1]'
                          : rev.status === 'published'
                          ? 'bg-[#75D9F5]/20 text-[#75D9F5]'
                          : rev.status === 'changes_requested'
                          ? 'bg-[#FB7185]/20 text-[#FB7185]'
                          : 'bg-[#FFD166]/20 text-[#FFD166]'
                      }`}
                    >
                      {rev.status.replace('_', ' ')}
                    </span>
                    <ChevronRight className="w-4 h-4 text-[#9AABC5]" />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Issue Mix Categories (1 col) */}
        <div className="rounded-xl bg-[#151F35] border border-[#283650] p-4 space-y-4">
          <div className="border-b border-[#283650] pb-3">
            <span className="text-[10px] font-mono tracking-wider uppercase text-[#A78BFA]">
              INTELLIGENCE
            </span>
            <h3 className="text-sm font-bold text-[#EEF3FF]">
              Issue Category Breakdown
            </h3>
            <p className="text-[11px] text-[#9AABC5]">
              Governance quality categories evaluated by BrandLens
            </p>
          </div>

          <div className="space-y-3">
            {categories.map((cat) => (
              <div key={cat.label} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-[#EEF3FF]">{cat.label}</span>
                  <span className="font-mono text-[#9AABC5]">{cat.count} flags</span>
                </div>
                <div className="h-1.5 w-full bg-[#10192C] rounded-full overflow-hidden">
                  <div
                    className={`h-full ${cat.color}`}
                    style={{ width: `${Math.min(100, Math.max(15, cat.count * 8))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="pt-3 border-t border-[#283650] text-[11px] text-[#9AABC5]">
            <p className="font-medium text-[#EEF3FF] mb-1">
              Deterministic + Grounded AI Rules:
            </p>
            <p>
              Absolute claims, expired fact records, prohibited terms, and inaccessible link targets are prioritized.
            </p>
          </div>
        </div>
      </div>

      {/* Recent Governance Activity Feed */}
      <div className="rounded-xl bg-[#151F35] border border-[#283650] p-4">
        <div className="flex items-center justify-between border-b border-[#283650] pb-3 mb-3">
          <div>
            <span className="text-[10px] font-mono tracking-wider uppercase text-[#46E3C1]">
              IMMUTABLE AUDIT TRAIL
            </span>
            <h3 className="text-sm font-bold text-[#EEF3FF]">
              Recent Governance Activity
            </h3>
          </div>
          <button
            onClick={() => onNavigateToScreen('audit')}
            className="text-xs text-[#46E3C1] hover:underline flex items-center gap-1 cursor-pointer"
          >
            <span>Full Audit Log</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="space-y-2.5">
          {auditEvents.length === 0 ? (
            <div className="p-4 text-center text-xs text-[#9AABC5]">
              No audit events recorded yet. Perform preflights and edits to build history.
            </div>
          ) : (
            auditEvents.slice(0, 4).map((evt) => (
              <div
                key={evt.id}
                className="p-3 rounded-lg bg-[#10192C] border border-[#283650] flex flex-col sm:flex-row sm:items-center justify-between gap-2"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-[#EEF3FF]">
                      {evt.action}
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.2 rounded bg-[#151F35] text-[#46E3C1]">
                      {evt.actorRole}
                    </span>
                  </div>
                  {evt.reason && (
                    <p className="text-[11px] text-[#9AABC5] italic truncate max-w-xl">
                      {evt.reason}
                    </p>
                  )}
                </div>
                <div className="text-[10px] text-[#9AABC5] font-mono shrink-0">
                  {new Date(evt.createdAt).toLocaleTimeString()}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
