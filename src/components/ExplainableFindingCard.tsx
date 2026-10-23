import React, { useState } from 'react';
import { Finding, WorkspaceRole } from '../types/brandlens';
import {
  Check,
  Edit3,
  XCircle,
  AlertTriangle,
  Info,
  ExternalLink,
  MessageSquare,
  ShieldCheck,
  ShieldAlert,
  Clock,
  UserCheck,
} from 'lucide-react';

interface FindingCardProps {
  finding: Finding;
  userRole: WorkspaceRole;
  onAccept: (finding: Finding) => void;
  onEditManually: (finding: Finding, customText: string) => void;
  onDismiss: (finding: Finding, reason: string) => void;
  onOpenComments?: (finding: Finding) => void;
}

export const ExplainableFindingCard: React.FC<FindingCardProps> = ({
  finding,
  userRole,
  onAccept,
  onEditManually,
  onDismiss,
  onOpenComments,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [customText, setCustomText] = useState(finding.suggestedRevision);
  const [isDismissing, setIsDismissing] = useState(false);
  const [dismissReason, setDismissReason] = useState('');
  const [dismissError, setDismissError] = useState('');

  const isHighSeverity = finding.severity === 'high';
  const isMediumSeverity = finding.severity === 'medium';
  const isResolved = finding.status !== 'open';

  const handleDismissSubmit = () => {
    if (!dismissReason.trim()) {
      setDismissError('A mandatory reason is required to dismiss a brand governance finding.');
      return;
    }
    setDismissError('');
    onDismiss(finding, dismissReason.trim());
    setIsDismissing(false);
  };

  const handleEditSubmit = () => {
    if (!customText.trim()) return;
    onEditManually(finding, customText.trim());
    setIsEditing(false);
  };

  return (
    <div
      className={`relative rounded-xl border transition-all duration-200 overflow-hidden ${
        isResolved
          ? 'bg-[#151F35]/50 border-[#283650]/60 opacity-80'
          : isHighSeverity
          ? 'bg-[#151F35] border-[#FB7185]/40 shadow-lg shadow-[#FB7185]/5'
          : 'bg-[#151F35] border-[#283650] hover:border-[#46E3C1]/50'
      }`}
    >
      {/* Top Coloured Accent Rule */}
      <div
        className={`h-1 w-full ${
          isHighSeverity
            ? 'bg-gradient-to-r from-[#FB7185] to-[#FFD166]'
            : isMediumSeverity
            ? 'bg-gradient-to-r from-[#FFD166] to-[#75D9F5]'
            : 'bg-gradient-to-r from-[#46E3C1] to-[#75D9F5]'
        }`}
      />

      <div className="p-5 md:p-6 space-y-5">
        {/* Card Header: Category & Severity */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#283650]/60 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono tracking-wider uppercase px-2.5 py-0.5 rounded bg-[#10192C] text-[#75D9F5] border border-[#283650]">
              {finding.category}
            </span>
            {finding.ruleId && (
              <span className="text-xs text-[#9AABC5] font-mono">
                {finding.ruleId}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {finding.status === 'open' ? (
              <span
                className={`text-xs font-semibold px-3 py-1 rounded-full uppercase tracking-wider flex items-center gap-1.5 ${
                  isHighSeverity
                    ? 'bg-[#FB7185]/15 text-[#FB7185] border border-[#FB7185]/40'
                    : isMediumSeverity
                    ? 'bg-[#FFD166]/15 text-[#FFD166] border border-[#FFD166]/40'
                    : 'bg-[#46E3C1]/15 text-[#46E3C1] border border-[#46E3C1]/40'
                }`}
              >
                {isHighSeverity ? (
                  <>
                    <ShieldAlert className="w-3.5 h-3.5" />
                    HIGH — HUMAN REVIEW
                  </>
                ) : isMediumSeverity ? (
                  <>
                    <AlertTriangle className="w-3.5 h-3.5" />
                    MEDIUM — REVIEW RECOMMENDED
                  </>
                ) : (
                  <>
                    <Info className="w-3.5 h-3.5" />
                    LOW — SUGGESTION
                  </>
                )}
              </span>
            ) : (
              <span className="text-xs font-semibold px-3 py-1 rounded-full uppercase tracking-wider bg-[#46E3C1]/15 text-[#46E3C1] border border-[#46E3C1]/40 flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5" />
                {finding.status.toUpperCase()}
              </span>
            )}
          </div>
        </div>

        {/* 2-Column Core Layout (Exact Concept Plan PDF Slide 08 Style) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Left Panel: Submitted Copy & Why Flagged */}
          <div className="rounded-lg bg-[#10192C] border border-[#283650] p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-mono tracking-widest uppercase px-2 py-0.5 rounded bg-[#151F35] text-[#75D9F5]">
                  SUBMITTED COPY
                </span>
                {finding.startOffset !== undefined && (
                  <span className="text-[11px] text-[#9AABC5] font-mono">
                    pos: {finding.startOffset}–{finding.endOffset}
                  </span>
                )}
              </div>
              <p className="text-base font-semibold text-[#EEF3FF] leading-relaxed my-2 italic">
                “{finding.excerpt}”
              </p>
            </div>

            <div className="pt-4 mt-4 border-t border-[#283650]/60">
              <span className="text-[10px] font-mono tracking-widest uppercase text-[#FB7185] block mb-1">
                WHY FLAGGED
              </span>
              <p className="text-xs text-[#9AABC5] leading-relaxed">
                {finding.rationale}
              </p>
            </div>
          </div>

          {/* Right Panel: Approved Source & Suggested Revision */}
          <div className="rounded-lg bg-[#10192C] border border-[#283650] p-4 flex flex-col justify-between">
            {/* Approved Source Evidence Banner */}
            <div className="pb-3 border-b border-[#283650]/60">
              <div className="flex items-center justify-between mb-1.5">
                <span
                  className={`text-[10px] font-mono tracking-widest uppercase px-2 py-0.5 rounded ${
                    finding.evidenceStatus === 'unsupported'
                      ? 'bg-[#FB7185]/20 text-[#FB7185]'
                      : finding.evidenceStatus === 'expired_source'
                      ? 'bg-[#FFD166]/20 text-[#FFD166]'
                      : 'bg-[#46E3C1]/20 text-[#46E3C1]'
                  }`}
                >
                  APPROVED SOURCE
                </span>
                {finding.confidence && (
                  <span className="text-[11px] text-[#9AABC5] font-mono">
                    confidence: {Math.round(finding.confidence * 100)}%
                  </span>
                )}
              </div>

              {finding.evidenceStatus === 'unsupported' ? (
                <div className="flex items-start gap-2 mt-2 p-2.5 rounded bg-[#FB7185]/10 border border-[#FB7185]/20">
                  <ShieldAlert className="w-4 h-4 text-[#FB7185] shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-[#FB7185]">
                      No approved evidence found.
                    </p>
                    <p className="text-[11px] text-[#9AABC5] mt-0.5">
                      No policy, fact, or audited documentation supports this assertion. Fabricating citations is prohibited.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="text-xs mt-1 space-y-1">
                  <div className="text-[#46E3C1] font-medium flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-[#46E3C1]" />
                    <span>{finding.evidenceSourceName || 'Sample Service Policy'}</span>
                    {finding.evidenceStatus === 'expired_source' && (
                      <span className="text-[10px] bg-[#FFD166]/20 text-[#FFD166] px-1.5 py-0.2 rounded font-mono">
                        EXPIRED
                      </span>
                    )}
                  </div>
                  {finding.evidenceSourceText && (
                    <p className="text-[#9AABC5] italic text-[11px] pl-5 border-l border-[#46E3C1]/30">
                      “{finding.evidenceSourceText}”
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Suggested Revision */}
            <div className="pt-3">
              <span className="text-[10px] font-mono tracking-widest uppercase text-[#46E3C1] block mb-1">
                SUGGESTED REVISION
              </span>

              {isEditing ? (
                <div className="space-y-2">
                  <textarea
                    value={customText}
                    onChange={(e) => setCustomText(e.target.value)}
                    className="w-full text-xs font-medium text-[#EEF3FF] bg-[#151F35] border border-[#46E3C1] rounded p-2.5 focus:outline-none focus:ring-1 focus:ring-[#46E3C1]"
                    rows={3}
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setIsEditing(false)}
                      className="px-2.5 py-1 text-xs text-[#9AABC5] hover:text-[#EEF3FF]"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleEditSubmit}
                      className="px-3 py-1 bg-[#46E3C1] text-[#0B1020] text-xs font-semibold rounded hover:bg-[#46E3C1]/90"
                    >
                      Apply Custom Text
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-sm font-semibold text-[#EEF3FF] leading-snug my-1">
                  “{finding.suggestedRevision || 'Consider rephrasing with verified specifications.'}”
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Dismissal Reason Form */}
        {isDismissing && (
          <div className="p-4 rounded-lg bg-[#10192C] border border-[#FB7185]/40 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#FB7185]">
              <AlertTriangle className="w-4 h-4" />
              <span>Mandatory Justification for Finding Dismissal</span>
            </div>
            <p className="text-xs text-[#9AABC5]">
              BrandLens maintains an immutable audit trail. Every override requires an explicit reason recorded with your identity ({userRole}).
            </p>
            <textarea
              value={dismissReason}
              onChange={(e) => setDismissReason(e.target.value)}
              placeholder="e.g., Executive legal signoff granted for specialized seasonal partner campaign..."
              className="w-full text-xs text-[#EEF3FF] bg-[#151F35] border border-[#283650] rounded p-2.5 focus:outline-none focus:border-[#FB7185]"
              rows={2}
            />
            {dismissError && (
              <p className="text-[11px] text-[#FB7185]">{dismissError}</p>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setIsDismissing(false)}
                className="px-3 py-1 text-xs text-[#9AABC5] hover:text-[#EEF3FF]"
              >
                Cancel
              </button>
              <button
                onClick={handleDismissSubmit}
                className="px-3 py-1 bg-[#FB7185] text-[#0B1020] text-xs font-semibold rounded hover:bg-[#FB7185]/90"
              >
                Confirm Dismissal & Log
              </button>
            </div>
          </div>
        )}

        {/* Resolved Note if Dismissed / Accepted */}
        {finding.status === 'dismissed' && finding.dismissReason && (
          <div className="p-3 rounded bg-[#10192C] border border-[#283650] text-xs text-[#9AABC5] flex items-center justify-between">
            <div>
              <span className="font-semibold text-[#FB7185]">Dismissed Reason: </span>
              <span>{finding.dismissReason}</span>
            </div>
            {finding.updatedBy && (
              <span className="text-[11px] font-mono text-[#9AABC5]">
                actor: {finding.updatedBy.slice(0, 10)}
              </span>
            )}
          </div>
        )}

        {/* Action Buttons Toolbar */}
        {!isResolved && !isDismissing && (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => onAccept(finding)}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#46E3C1] text-[#0B1020] text-xs font-semibold hover:bg-[#46E3C1]/90 shadow-sm transition-colors cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                Accept edit
              </button>

              <button
                onClick={() => setIsEditing(!isEditing)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#151F35] text-[#EEF3FF] border border-[#283650] text-xs font-medium hover:border-[#75D9F5] transition-colors cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5 text-[#75D9F5]" />
                Edit manually
              </button>

              <button
                onClick={() => setIsDismissing(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#151F35] text-[#FB7185] border border-[#283650] text-xs font-medium hover:border-[#FB7185] transition-colors cursor-pointer"
              >
                <XCircle className="w-3.5 h-3.5" />
                Dismiss with reason
              </button>
            </div>

            {onOpenComments && (
              <button
                onClick={() => onOpenComments(finding)}
                className="inline-flex items-center gap-1.5 text-xs text-[#9AABC5] hover:text-[#75D9F5] transition-colors cursor-pointer"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Discuss / Annotate</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Slide 08 Strict Explainability Footer Rule Note */}
      <div className="bg-[#10192C]/80 px-5 py-2 border-t border-[#283650]/60 text-[11px] text-[#9AABC5] flex items-center justify-between">
        <span className="text-[#FFD166]">
          Explainability rule: If no approved evidence is found, BrandLens displays “no approved evidence found” — it never invents a source.
        </span>
      </div>
    </div>
  );
};
