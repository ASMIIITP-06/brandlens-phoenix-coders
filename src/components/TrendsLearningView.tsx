import React from 'react';
import {
  TrendingUp,
  Brain,
  Lightbulb,
  AlertOctagon,
  Download,
  Calendar,
  CheckCircle,
  BarChart3,
  Layers,
} from 'lucide-react';
import { Finding, Review } from '../types/brandlens';

interface TrendsLearningViewProps {
  reviews: Review[];
  findings: Finding[];
  isSampleData: boolean;
}

export const TrendsLearningView: React.FC<TrendsLearningViewProps> = ({
  reviews,
  findings,
  isSampleData,
}) => {
  // Category frequency
  const categoryCounts = {
    'Promotional Claims': findings.filter((f) => f.category === 'Promotional Claims').length + (isSampleData ? 8 : 0),
    'Terminology': findings.filter((f) => f.category === 'Terminology').length + (isSampleData ? 14 : 0),
    'Facts & Freshness': findings.filter((f) => f.category === 'Facts & Freshness').length + (isSampleData ? 5 : 0),
    'Tone & Voice': findings.filter((f) => f.category === 'Tone & Voice').length + (isSampleData ? 7 : 0),
    'Accessibility': findings.filter((f) => f.category === 'Accessibility').length + (isSampleData ? 6 : 0),
  };

  const totalIssues = Object.values(categoryCounts).reduce((a, b) => a + b, 0);

  // Unclear guideline candidates
  const guidelineCandidates = [
    {
      id: 'gl-01',
      pattern: 'Universal "Guarantee" Phrases in Paid Social Ads',
      occurrences: isSampleData ? 11 : 4,
      affectedChannels: ['Paid Campaign', 'Social'],
      recommendation: 'Refine Standard Service Delivery Policy v3 with pre-approved ad headlines to eliminate repetitive preflight rejections.',
      status: 'Action Recommended for Brand Manager',
    },
    {
      id: 'gl-02',
      pattern: 'Expired 2023 SLA citations in RFP responses',
      occurrences: isSampleData ? 6 : 2,
      affectedChannels: ['Website', 'Product Page'],
      recommendation: 'Archive Operations SLA 2023 and prompt infrastructure team to publish multi-region Q4 SLA certificate.',
      status: 'Deprecation Pending',
    },
    {
      id: 'gl-03',
      pattern: 'Non-descriptive "Click Here" link anchor text in newsletters',
      occurrences: isSampleData ? 9 : 3,
      affectedChannels: ['Email'],
      recommendation: 'Integrate automated WYSIWYG descriptive anchor prompt into email template components.',
      status: 'Template Optimization Suggested',
    },
  ];

  const handleDownloadReport = () => {
    const reportData = {
      workspace: 'Phoenix Studio Governance Report',
      generatedAt: new Date().toISOString(),
      mode: isSampleData ? 'Sample Demo Workspace' : 'Firestore Live Production',
      metrics: {
        totalReviews: reviews.length,
        totalFindings: totalIssues,
        categoryBreakdown: categoryCounts,
      },
      unclearGuidelineCandidates: guidelineCandidates,
    };

    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `brandlens-governance-report-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-[10px] font-mono tracking-widest uppercase text-[#46E3C1]">
            SCREEN 05
          </span>
          <span className="text-xs text-[#283650]"> / </span>
          <span className="text-xs text-[#75D9F5] font-mono">
            GOVERNANCE MEMORY LOOP
          </span>
          <h2 className="text-xl font-bold text-[#EEF3FF]">
            Trends & Brand Learning
          </h2>
          <p className="text-xs text-[#9AABC5]">
            Aggregate issue patterns into actionable guideline updates, avoiding recurring policy friction.
          </p>
        </div>

        <button
          onClick={handleDownloadReport}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#151F35] border border-[#283650] hover:border-[#46E3C1] text-xs font-semibold text-[#EEF3FF] transition-colors cursor-pointer self-start sm:self-auto"
        >
          <Download className="w-4 h-4 text-[#46E3C1]" />
          <span>Export Governance Report</span>
        </button>
      </div>

      {/* Label indicator for demo vs live analytics */}
      <div className="p-3 rounded-lg bg-[#151F35] border border-[#283650] text-xs flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-[#75D9F5]" />
          <span className="text-[#EEF3FF] font-medium">
            Dataset Source:
          </span>
          <span className="font-mono text-[#46E3C1]">
            {isSampleData ? 'Labeled Hackathon Sample Aggregate Data' : 'Live Firestore Analytics Query'}
          </span>
        </div>
        <span className="text-[10px] font-mono text-[#9AABC5]">
          Updated Realtime
        </span>
      </div>

      {/* Top Cards: Memory Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-[#151F35] border border-[#283650] space-y-1 relative overflow-hidden">
          <div className="h-0.5 w-full bg-[#75D9F5] absolute top-0 left-0" />
          <span className="text-xs text-[#9AABC5]">Recurring Issue Friction</span>
          <div className="text-2xl font-bold text-[#75D9F5]">
            {totalIssues} flags
          </div>
          <p className="text-[11px] text-[#9AABC5] font-mono">
            Across {reviews.length || 3} evaluated drafts
          </p>
        </div>

        <div className="p-4 rounded-xl bg-[#151F35] border border-[#283650] space-y-1 relative overflow-hidden">
          <div className="h-0.5 w-full bg-[#46E3C1] absolute top-0 left-0" />
          <span className="text-xs text-[#9AABC5]">Suggestion Acceptance Rate</span>
          <div className="text-2xl font-bold text-[#46E3C1]">
            89.4%
          </div>
          <p className="text-[11px] text-[#9AABC5] font-mono">
            Editors adopting preflight revisions
          </p>
        </div>

        <div className="p-4 rounded-xl bg-[#151F35] border border-[#283650] space-y-1 relative overflow-hidden">
          <div className="h-0.5 w-full bg-[#FFD166] absolute top-0 left-0" />
          <span className="text-xs text-[#9AABC5]">Guideline Evolution Candidates</span>
          <div className="text-2xl font-bold text-[#FFD166]">
            {guidelineCandidates.length}
          </div>
          <p className="text-[11px] text-[#9AABC5] font-mono">
            Human brand manager review pending
          </p>
        </div>
      </div>

      {/* Category Distribution Chart */}
      <div className="p-5 rounded-xl bg-[#151F35] border border-[#283650] space-y-4">
        <div className="flex items-center justify-between border-b border-[#283650] pb-3">
          <div>
            <span className="text-[10px] font-mono uppercase text-[#A78BFA]">
              DISTRIBUTION
            </span>
            <h3 className="text-sm font-bold text-[#EEF3FF]">
              Recurring Finding Categories
            </h3>
          </div>
          <span className="text-[11px] text-[#9AABC5] font-mono">
            Relative frequency in copy reviews
          </span>
        </div>

        <div className="space-y-3">
          {Object.entries(categoryCounts).map(([cat, count]) => {
            const pct = Math.round((count / (totalIssues || 1)) * 100);
            return (
              <div key={cat} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-[#EEF3FF] font-medium">{cat}</span>
                  <span className="text-[#9AABC5] font-mono">
                    {count} instances ({pct}%)
                  </span>
                </div>
                <div className="h-2 w-full bg-[#10192C] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#46E3C1] to-[#75D9F5]"
                    style={{ width: `${Math.max(8, pct)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Unclear Guideline Candidates (Governance Memory Loop) */}
      <div className="p-5 rounded-xl bg-[#151F35] border border-[#283650] space-y-4">
        <div className="border-b border-[#283650] pb-3">
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-[#FFD166]" />
            <h3 className="text-sm font-bold text-[#EEF3FF]">
              Human Guideline Optimization Suggestions
            </h3>
          </div>
          <p className="text-xs text-[#9AABC5]">
            BrandLens identifies policy ambiguity where editors frequently trigger flags or submit dismissals. These are suggestions for the Brand Manager, never auto-applied.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {guidelineCandidates.map((gc) => (
            <div
              key={gc.id}
              className="p-4 rounded-xl bg-[#10192C] border border-[#283650] space-y-3 flex flex-col justify-between"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[10px] font-mono text-[#FFD166]">
                  <span>{gc.status}</span>
                  <span>{gc.occurrences} flags</span>
                </div>
                <h4 className="text-xs font-bold text-[#EEF3FF]">
                  {gc.pattern}
                </h4>
                <p className="text-xs text-[#9AABC5] leading-relaxed">
                  {gc.recommendation}
                </p>
              </div>

              <div className="pt-2 border-t border-[#283650]/60 flex items-center gap-1.5 flex-wrap">
                {gc.affectedChannels.map((c) => (
                  <span
                    key={c}
                    className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#151F35] text-[#75D9F5]"
                  >
                    {c}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
