import React, { useState, useRef } from 'react';
import {
  FileText,
  Upload,
  Play,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Send,
  Eye,
  FileCode,
  ArrowRight,
  ShieldCheck,
  ShieldAlert,
  Layers,
  History,
  Info,
} from 'lucide-react';
import {
  Review,
  Finding,
  KnowledgeItem,
  WorkspaceRole,
  TestCase,
} from '../types/brandlens';
import { ExplainableFindingCard } from './ExplainableFindingCard';
import { DEMO_TEST_CASES } from '../data/sampleKnowledge';

interface ContentReviewViewProps {
  currentReview: Review | null;
  findings: Finding[];
  knowledgeItems: KnowledgeItem[];
  userRole: WorkspaceRole;
  engineMode: 'Rules-only mode' | 'Source-grounded AI + Rules enabled';
  onRunPreflight: (
    text: string,
    channel: Review['channel'],
    title: string,
    fileMetadata?: Review['fileMetadata']
  ) => Promise<void>;
  onAcceptFinding: (finding: Finding) => Promise<void>;
  onEditFindingManually: (finding: Finding, customText: string) => Promise<void>;
  onDismissFinding: (finding: Finding, reason: string) => Promise<void>;
  onSubmitForApproval: (review: Review) => Promise<void>;
  onOpenComments?: (finding: Finding) => void;
}

export const ContentReviewView: React.FC<ContentReviewViewProps> = ({
  currentReview,
  findings,
  knowledgeItems,
  userRole,
  engineMode,
  onRunPreflight,
  onAcceptFinding,
  onEditFindingManually,
  onDismissFinding,
  onSubmitForApproval,
  onOpenComments,
}) => {
  const [draftTitle, setDraftTitle] = useState(currentReview?.title || 'Q4 Product Launch Announcement');
  const [channel, setChannel] = useState<Review['channel']>(currentReview?.channel || 'website');
  const [draftText, setDraftText] = useState(
    currentReview?.currentText ||
      'Our platform guarantees delivery in 24 hours for every customer. We offer a cheap solution with 99.9% uptime SLA. To read the report, click here.'
  );
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [viewDiff, setViewDiff] = useState(false);
  const [filterSeverity, setFilterSeverity] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync state if currentReview changes
  React.useEffect(() => {
    if (currentReview) {
      setDraftTitle(currentReview.title);
      setChannel(currentReview.channel);
      setDraftText(currentReview.currentText);
    }
  }, [currentReview?.id, currentReview?.currentText, currentReview?.contentVersion]);

  // Handle fast test case injection
  const handleLoadTestCase = (tc: TestCase) => {
    setDraftTitle(`Test: ${tc.label}`);
    setDraftText(tc.inputText);
    setUploadError(null);
  };

  // Handle Document Upload (.txt, .docx)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError(null);

    // Validate size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setUploadError('File exceeds 10MB limit. Please upload a smaller document.');
      return;
    }

    const lowerName = file.name.toLowerCase();
    const isTxt = lowerName.endsWith('.txt');
    const isDocx = lowerName.endsWith('.docx');

    if (!isTxt && !isDocx) {
      setUploadError(`Unsupported file format "${file.name}". BrandLens accepts .txt and .docx documents.`);
      return;
    }

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64Content = (reader.result as string).split(',')[1];
        try {
          const response = await fetch('/api/parse-doc', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fileName: file.name,
              mimeType: file.type,
              base64Content,
            }),
          });

          const data = await response.json();
          if (!response.ok) {
            setUploadError(data.error || 'Failed to extract text from document.');
            return;
          }

          setDraftTitle(file.name.replace(/\.[^/.]+$/, ''));
          setDraftText(data.text);
          setUploadError(null);
        } catch (apiErr) {
          setUploadError('Server parsing endpoint failed. You can paste text directly.');
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setUploadError('Failed to read local file.');
    }
  };

  const handlePreflightClick = async () => {
    if (!draftText.trim()) return;
    setIsEvaluating(true);
    setUploadError(null);
    try {
      await onRunPreflight(draftText.trim(), channel, draftTitle.trim());
    } finally {
      setIsEvaluating(false);
    }
  };

  const filteredFindings = findings.filter((f) => {
    if (filterSeverity === 'all') return true;
    return f.severity === filterSeverity;
  });

  const openFindingsCount = findings.filter((f) => f.status === 'open').length;
  const highRiskCount = findings.filter((f) => f.severity === 'high' && f.status === 'open').length;

  return (
    <div className="space-y-6">
      {/* Top Header & Fast Test Case Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono tracking-widest uppercase text-[#46E3C1]">
              SCREEN 03
            </span>
            <span className="text-xs text-[#283650]">/</span>
            <span className="text-xs text-[#75D9F5] font-mono">
              PREFLIGHT QUALITY GATE
            </span>
          </div>
          <h2 className="text-xl font-bold text-[#EEF3FF]">
            Content Preflight & Review
          </h2>
          <p className="text-xs text-[#9AABC5]">
            Submit copy or documents, inspect evidence-grounded flags, and resolve before human approval.
          </p>
        </div>

        {/* Engine mode pill */}
        <div className="flex items-center gap-2 self-start md:self-auto">
          <span className="text-xs px-3 py-1.5 rounded-lg bg-[#151F35] border border-[#283650] text-[#EEF3FF] flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#46E3C1] animate-pulse" />
            <span className="font-mono text-xs">{engineMode}</span>
          </span>
        </div>
      </div>

      {/* Labelled Test Set Fast Injector (Required by Round 2 Acceptance Test 11) */}
      <div className="p-4 rounded-xl bg-[#151F35] border border-[#283650] space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono tracking-wider uppercase text-[#FFD166] flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-[#FFD166]" />
            Labelled Round 2 Test Scenarios (1-Click Run)
          </span>
          <span className="text-[10px] text-[#9AABC5] font-mono">
            6 validated test cases
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {DEMO_TEST_CASES.map((tc, idx) => (
            <button
              key={tc.id}
              onClick={() => handleLoadTestCase(tc)}
              className="p-2 text-left rounded-lg bg-[#10192C] hover:bg-[#151F35] border border-[#283650] hover:border-[#46E3C1] transition-all cursor-pointer group"
            >
              <div className="text-[10px] font-mono text-[#75D9F5] mb-0.5 truncate">
                0{idx + 1} • {tc.category}
              </div>
              <p className="text-[11px] font-medium text-[#EEF3FF] line-clamp-2 leading-tight">
                {tc.label}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Main 2-Panel Area: Draft Editor (Left) & Findings Stream (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Draft Input & Settings (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="rounded-xl bg-[#151F35] border border-[#283650] p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[#283650] pb-3">
              <span className="text-[10px] font-mono tracking-wider uppercase text-[#75D9F5]">
                DRAFT PARAMETERS
              </span>
              {currentReview && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#10192C] text-[#46E3C1] border border-[#283650]">
                  v{currentReview.contentVersion} ({currentReview.status})
                </span>
              )}
            </div>

            {/* Title & Channel */}
            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-mono uppercase text-[#9AABC5] mb-1">
                  Draft Title
                </label>
                <input
                  type="text"
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  className="w-full bg-[#10192C] border border-[#283650] rounded-lg p-2.5 text-xs text-[#EEF3FF] focus:outline-none focus:border-[#46E3C1]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-mono uppercase text-[#9AABC5] mb-1">
                    Channel Target
                  </label>
                  <select
                    value={channel}
                    onChange={(e) => setChannel(e.target.value as any)}
                    className="w-full bg-[#10192C] border border-[#283650] rounded-lg p-2 text-xs text-[#EEF3FF] focus:outline-none focus:border-[#46E3C1]"
                  >
                    <option value="website">Website / Landing</option>
                    <option value="paid_campaign">Paid Campaign</option>
                    <option value="social">Social Media</option>
                    <option value="email">Email Newsletter</option>
                    <option value="product_page">Product Page</option>
                    <option value="other">Other Collateral</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-mono uppercase text-[#9AABC5] mb-1">
                    Upload File (.txt, .docx)
                  </label>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    accept=".txt,.docx"
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full bg-[#10192C] border border-[#283650] hover:border-[#75D9F5] rounded-lg p-2 text-xs text-[#9AABC5] hover:text-[#EEF3FF] flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5 text-[#75D9F5]" />
                    <span>Upload Document</span>
                  </button>
                </div>
              </div>

              {uploadError && (
                <div className="p-2.5 rounded-lg bg-[#FB7185]/15 border border-[#FB7185]/30 text-xs text-[#FB7185] flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{uploadError}</span>
                </div>
              )}
            </div>

            {/* Text Editor Area */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[10px] font-mono">
                <span className="text-[#9AABC5] uppercase">
                  Content Draft ({draftText.length} characters)
                </span>
                {currentReview && currentReview.contentVersion > 1 && (
                  <button
                    type="button"
                    onClick={() => setViewDiff(!viewDiff)}
                    className="text-[#75D9F5] hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <History className="w-3 h-3" />
                    <span>{viewDiff ? 'Hide Diff' : 'Compare Original vs Current'}</span>
                  </button>
                )}
              </div>

              {viewDiff && currentReview ? (
                <div className="space-y-2 p-3 rounded-lg bg-[#10192C] border border-[#283650] text-xs">
                  <div>
                    <span className="text-[10px] font-mono text-[#FB7185] uppercase">
                      Original Submitted Copy (v1):
                    </span>
                    <p className="text-[#9AABC5] mt-1 line-through">
                      {currentReview.originalText}
                    </p>
                  </div>
                  <div className="pt-2 border-t border-[#283650]">
                    <span className="text-[10px] font-mono text-[#46E3C1] uppercase">
                      Current Governed Copy (v{currentReview.contentVersion}):
                    </span>
                    <p className="text-[#EEF3FF] font-medium mt-1">
                      {currentReview.currentText}
                    </p>
                  </div>
                </div>
              ) : (
                <textarea
                  rows={9}
                  value={draftText}
                  onChange={(e) => setDraftText(e.target.value)}
                  placeholder="Paste or type copy to run preflight check..."
                  className="w-full bg-[#10192C] border border-[#283650] rounded-lg p-3 text-xs md:text-sm text-[#EEF3FF] leading-relaxed focus:outline-none focus:border-[#46E3C1] font-sans"
                />
              )}
            </div>

            {/* Run Preflight Action */}
            <div className="pt-2 space-y-3">
              <button
                type="button"
                onClick={handlePreflightClick}
                disabled={isEvaluating || !draftText.trim()}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-[#46E3C1] to-[#75D9F5] text-[#0B1020] text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 hover:opacity-95 shadow-md shadow-[#46E3C1]/20 transition-all cursor-pointer disabled:opacity-50"
              >
                {isEvaluating ? (
                  <>
                    <span className="w-4 h-4 border-2 border-[#0B1020] border-t-transparent rounded-full animate-spin" />
                    <span>Analyzing Draft & Matching Approved Sources...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-current" />
                    <span>Run Preflight Quality Gate</span>
                  </>
                )}
              </button>

              {/* Submit for Approval Button */}
              {currentReview && (
                <button
                  type="button"
                  onClick={() => onSubmitForApproval(currentReview)}
                  disabled={currentReview.status === 'in_review' || currentReview.status === 'approved'}
                  className={`w-full py-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-colors ${
                    currentReview.status === 'in_review'
                      ? 'bg-[#FFD166]/10 text-[#FFD166] border-[#FFD166]/40 cursor-default'
                      : currentReview.status === 'approved'
                      ? 'bg-[#46E3C1]/10 text-[#46E3C1] border-[#46E3C1]/40 cursor-default'
                      : 'bg-[#151F35] text-[#EEF3FF] border-[#283650] hover:border-[#46E3C1] cursor-pointer'
                  }`}
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>
                    {currentReview.status === 'in_review'
                      ? 'In Review Lane (Awaiting Approval)'
                      : currentReview.status === 'approved'
                      ? 'Approved by Human Reviewer'
                      : 'Submit Draft to Approvals Lane'}
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Preflight Findings Cards (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-[#151F35] border border-[#283650] rounded-xl p-4">
            <div>
              <span className="text-[10px] font-mono tracking-wider uppercase text-[#46E3C1]">
                FINDINGS STREAM
              </span>
              <h3 className="text-sm font-bold text-[#EEF3FF]">
                Preflight Evidence Findings ({findings.length})
              </h3>
            </div>

            {/* Severity Filter Pills */}
            <div className="flex items-center gap-1.5">
              {[
                { id: 'all', label: 'All', count: findings.length },
                { id: 'high', label: 'High', count: findings.filter((f) => f.severity === 'high').length },
                { id: 'medium', label: 'Medium', count: findings.filter((f) => f.severity === 'medium').length },
                { id: 'low', label: 'Low', count: findings.filter((f) => f.severity === 'low').length },
              ].map((pill) => (
                <button
                  key={pill.id}
                  onClick={() => setFilterSeverity(pill.id as any)}
                  className={`px-2.5 py-1 rounded text-[11px] font-mono transition-colors cursor-pointer ${
                    filterSeverity === pill.id
                      ? 'bg-[#10192C] text-[#46E3C1] border border-[#46E3C1]/50'
                      : 'text-[#9AABC5] hover:text-[#EEF3FF]'
                  }`}
                >
                  {pill.label} ({pill.count})
                </button>
              ))}
            </div>
          </div>

          {/* Finding Cards List */}
          <div className="space-y-4">
            {filteredFindings.length === 0 ? (
              <div className="p-12 text-center rounded-xl bg-[#151F35] border border-[#283650] space-y-2">
                <CheckCircle2 className="w-8 h-8 text-[#46E3C1] mx-auto" />
                <h4 className="text-sm font-bold text-[#EEF3FF]">
                  {findings.length === 0 ? 'No Findings Detected Yet' : 'No Findings Match This Filter'}
                </h4>
                <p className="text-xs text-[#9AABC5] max-w-sm mx-auto">
                  {findings.length === 0
                    ? 'Click "Run Preflight Quality Gate" or pick one of the 6 test scenarios above to evaluate the copy against brand rules.'
                    : 'Switch filter to "All" to inspect other findings.'}
                </p>
              </div>
            ) : (
              filteredFindings.map((finding) => (
                <ExplainableFindingCard
                  key={finding.id}
                  finding={finding}
                  userRole={userRole}
                  onAccept={onAcceptFinding}
                  onEditManually={onEditFindingManually}
                  onDismiss={onDismissFinding}
                  onOpenComments={onOpenComments}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
