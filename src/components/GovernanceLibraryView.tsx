import React, { useState } from 'react';
import {
  BookOpen,
  Plus,
  ShieldCheck,
  AlertTriangle,
  Clock,
  ExternalLink,
  Edit,
  Trash2,
  FileText,
  Volume2,
  List,
  Search,
  Filter,
  CheckCircle,
} from 'lucide-react';
import { KnowledgeItem, WorkspaceRole } from '../types/brandlens';

interface GovernanceLibraryViewProps {
  knowledgeItems: KnowledgeItem[];
  userRole: WorkspaceRole;
  onCreateItem: (item: Omit<KnowledgeItem, 'id' | 'createdAt'>) => Promise<void>;
  onUpdateItem: (id: string, updates: Partial<KnowledgeItem>) => Promise<void>;
  isSampleData: boolean;
}

export const GovernanceLibraryView: React.FC<GovernanceLibraryViewProps> = ({
  knowledgeItems,
  userRole,
  onCreateItem,
  onUpdateItem,
  isSampleData,
}) => {
  const [activeTab, setActiveTab] = useState<'all' | 'fact' | 'glossary' | 'tone' | 'guideline'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [formType, setFormType] = useState<KnowledgeItem['type']>('fact');
  const [formTitle, setFormTitle] = useState('');
  const [formBody, setFormBody] = useState('');
  const [formPreferredTerm, setFormPreferredTerm] = useState('');
  const [formProhibitedTerms, setFormProhibitedTerms] = useState('');
  const [formSourceName, setFormSourceName] = useState('');
  const [formSourceUrl, setFormSourceUrl] = useState('');
  const [formSourceText, setFormSourceText] = useState('');
  const [formExpiresAt, setFormExpiresAt] = useState('');

  const filteredItems = knowledgeItems.filter((item) => {
    const matchesTab = activeTab === 'all' || item.type === activeTab;
    const matchesSearch =
      searchQuery === '' ||
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.body && item.body.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (item.preferredTerm && item.preferredTerm.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (item.sourceName && item.sourceName.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesTab && matchesSearch;
  });

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) return;

    setIsSubmitting(true);
    try {
      const prohibitedArray = formProhibitedTerms
        ? formProhibitedTerms.split(',').map((s) => s.trim()).filter(Boolean)
        : [];

      await onCreateItem({
        workspaceId: 'phoenix-studio-primary',
        type: formType,
        title: formTitle.trim(),
        body: formBody.trim(),
        preferredTerm: formPreferredTerm.trim() || undefined,
        prohibitedTerms: prohibitedArray.length > 0 ? prohibitedArray : undefined,
        sourceName: formSourceName.trim() || undefined,
        sourceUrl: formSourceUrl.trim() || undefined,
        sourceText: formSourceText.trim() || undefined,
        expiresAt: formExpiresAt || undefined,
        status: 'active',
        version: '1.0.0',
      });

      // Reset form
      setFormTitle('');
      setFormBody('');
      setFormPreferredTerm('');
      setFormProhibitedTerms('');
      setFormSourceName('');
      setFormSourceUrl('');
      setFormSourceText('');
      setFormExpiresAt('');
      setIsModalOpen(false);
    } catch (err) {
      console.error('Failed to create knowledge item:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isStale = (item: KnowledgeItem) => {
    if (item.status === 'expired') return true;
    if (item.expiresAt) {
      return new Date(item.expiresAt) < new Date();
    }
    return false;
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-[10px] font-mono tracking-widest uppercase text-[#46E3C1]">
            SOURCE OF TRUTH
          </span>
          <h2 className="text-xl font-bold text-[#EEF3FF]">
            Governance Knowledge Base
          </h2>
          <p className="text-xs text-[#9AABC5]">
            Approved brand facts, terminology dictionaries, voice principles, and source citations.
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#46E3C1] text-[#0B1020] text-xs font-bold hover:bg-[#46E3C1]/90 shadow-md shadow-[#46E3C1]/10 transition-colors cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Add Knowledge Record</span>
        </button>
      </div>

      {/* Tabs & Search Filter */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#283650] pb-4">
        {/* Category Tabs */}
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: 'all', label: 'All Knowledge', count: knowledgeItems.length },
            { id: 'fact', label: 'Approved Facts', count: knowledgeItems.filter((k) => k.type === 'fact').length },
            { id: 'glossary', label: 'Terminology Rules', count: knowledgeItems.filter((k) => k.type === 'glossary').length },
            { id: 'tone', label: 'Voice & Tone', count: knowledgeItems.filter((k) => k.type === 'tone').length },
            { id: 'guideline', label: 'Guidelines', count: knowledgeItems.filter((k) => k.type === 'guideline').length },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-[#151F35] text-[#46E3C1] border border-[#46E3C1]/40'
                  : 'text-[#9AABC5] hover:text-[#EEF3FF] hover:bg-[#151F35]/50'
              }`}
            >
              <span>{tab.label}</span>
              <span className="ml-1.5 text-[10px] font-mono opacity-70">
                ({tab.count})
              </span>
            </button>
          ))}
        </div>

        {/* Search input */}
        <div className="relative w-full md:w-64">
          <Search className="w-4 h-4 text-[#9AABC5] absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search rules & sources..."
            className="w-full bg-[#151F35] border border-[#283650] rounded-lg pl-9 pr-3 py-1.5 text-xs text-[#EEF3FF] focus:outline-none focus:border-[#46E3C1]"
          />
        </div>
      </div>

      {/* Cards List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredItems.length === 0 ? (
          <div className="col-span-2 p-12 text-center rounded-xl bg-[#151F35] border border-[#283650] text-[#9AABC5] text-xs">
            No knowledge items found matching the selected filter.
          </div>
        ) : (
          filteredItems.map((item) => {
            const stale = isStale(item);
            return (
              <div
                key={item.id}
                className={`rounded-xl bg-[#151F35] border p-5 flex flex-col justify-between transition-colors relative overflow-hidden ${
                  stale
                    ? 'border-[#FFD166]/40 hover:border-[#FFD166]'
                    : 'border-[#283650] hover:border-[#46E3C1]/50'
                }`}
              >
                {/* Top Accent Line */}
                <div
                  className={`h-1 w-full absolute top-0 left-0 ${
                    stale
                      ? 'bg-[#FFD166]'
                      : item.type === 'fact'
                      ? 'bg-[#46E3C1]'
                      : item.type === 'glossary'
                      ? 'bg-[#75D9F5]'
                      : 'bg-[#A78BFA]'
                  }`}
                />

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-mono tracking-wider uppercase px-2 py-0.5 rounded bg-[#10192C] text-[#75D9F5] border border-[#283650]">
                      {item.type.toUpperCase()} • v{item.version || '1.0'}
                    </span>

                    {stale ? (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#FFD166]/15 text-[#FFD166] border border-[#FFD166]/30 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        STALE / EXPIRED
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#46E3C1]/15 text-[#46E3C1] border border-[#46E3C1]/30 flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" />
                        ACTIVE
                      </span>
                    )}
                  </div>

                  <div>
                    <h3 className="text-sm font-bold text-[#EEF3FF]">
                      {item.title}
                    </h3>
                    {item.body && (
                      <p className="text-xs text-[#9AABC5] mt-1 leading-relaxed">
                        {item.body}
                      </p>
                    )}
                  </div>

                  {/* Terminology Specific Pills */}
                  {item.type === 'glossary' && (
                    <div className="p-3 rounded-lg bg-[#10192C] border border-[#283650] space-y-1.5 text-xs">
                      {item.preferredTerm && (
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono text-[#46E3C1] uppercase tracking-wider">
                            Preferred:
                          </span>
                          <span className="text-[#EEF3FF] font-semibold">
                            {item.preferredTerm}
                          </span>
                        </div>
                      )}
                      {item.prohibitedTerms && item.prohibitedTerms.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[10px] font-mono text-[#FB7185] uppercase tracking-wider">
                            Prohibited:
                          </span>
                          {item.prohibitedTerms.map((t) => (
                            <span
                              key={t}
                              className="text-[11px] font-mono px-1.5 py-0.2 rounded bg-[#FB7185]/15 text-[#FB7185] border border-[#FB7185]/30 line-through"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Canonical Source Citation */}
                  {item.sourceName && (
                    <div className="p-2.5 rounded-lg bg-[#10192C] border border-[#283650] text-[11px] space-y-1">
                      <div className="flex items-center justify-between text-[#46E3C1]">
                        <span className="font-semibold flex items-center gap-1">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          {item.sourceName}
                        </span>
                        {item.sourceUrl && (
                          <a
                            href={item.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[#9AABC5] hover:text-[#EEF3FF]"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                      {item.sourceText && (
                        <p className="text-[#9AABC5] italic border-l border-[#46E3C1]/30 pl-2">
                          “{item.sourceText}”
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Footer metadata */}
                <div className="pt-3 mt-3 border-t border-[#283650]/60 flex items-center justify-between text-[10px] text-[#9AABC5] font-mono">
                  <span>ID: {item.id}</span>
                  {item.expiresAt && (
                    <span className={stale ? 'text-[#FFD166] font-semibold' : ''}>
                      Expires: {new Date(item.expiresAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Add Record Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#151F35] border border-[#283650] rounded-xl max-w-xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#283650] pb-3">
              <div>
                <span className="text-[10px] font-mono tracking-wider uppercase text-[#46E3C1]">
                  CREATE GOVERNANCE RECORD
                </span>
                <h3 className="text-base font-bold text-[#EEF3FF]">
                  Add Approved Brand Knowledge
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-[#9AABC5] hover:text-[#EEF3FF] text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#9AABC5] mb-1 font-mono uppercase text-[10px]">
                    Record Type
                  </label>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value as any)}
                    className="w-full bg-[#10192C] border border-[#283650] rounded-lg p-2 text-[#EEF3FF]"
                  >
                    <option value="fact">Approved Fact</option>
                    <option value="glossary">Terminology Rule</option>
                    <option value="tone">Tone & Voice Principle</option>
                    <option value="guideline">Guideline Spec</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[#9AABC5] mb-1 font-mono uppercase text-[10px]">
                    Expiry Date (Optional)
                  </label>
                  <input
                    type="date"
                    value={formExpiresAt}
                    onChange={(e) => setFormExpiresAt(e.target.value)}
                    className="w-full bg-[#10192C] border border-[#283650] rounded-lg p-2 text-[#EEF3FF]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[#9AABC5] mb-1 font-mono uppercase text-[10px]">
                  Rule Title / Statement *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Enterprise SLA Guarantee or Pricing Tier Spec"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full bg-[#10192C] border border-[#283650] rounded-lg p-2 text-[#EEF3FF]"
                />
              </div>

              {formType === 'glossary' && (
                <div className="grid grid-cols-2 gap-3 p-3 bg-[#10192C] rounded-lg border border-[#283650]">
                  <div>
                    <label className="block text-[#46E3C1] mb-1 font-mono uppercase text-[10px]">
                      Preferred Replacement
                    </label>
                    <input
                      type="text"
                      placeholder="e.g., cost-effective"
                      value={formPreferredTerm}
                      onChange={(e) => setFormPreferredTerm(e.target.value)}
                      className="w-full bg-[#151F35] border border-[#283650] rounded p-2 text-[#EEF3FF]"
                    />
                  </div>
                  <div>
                    <label className="block text-[#FB7185] mb-1 font-mono uppercase text-[10px]">
                      Prohibited Terms (comma-sep)
                    </label>
                    <input
                      type="text"
                      placeholder="cheap, budget-grade"
                      value={formProhibitedTerms}
                      onChange={(e) => setFormProhibitedTerms(e.target.value)}
                      className="w-full bg-[#151F35] border border-[#283650] rounded p-2 text-[#EEF3FF]"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-[#9AABC5] mb-1 font-mono uppercase text-[10px]">
                  Detailed Description / Policy Guidance
                </label>
                <textarea
                  rows={2}
                  placeholder="Provide context on where and how this rule applies..."
                  value={formBody}
                  onChange={(e) => setFormBody(e.target.value)}
                  className="w-full bg-[#10192C] border border-[#283650] rounded-lg p-2 text-[#EEF3FF]"
                />
              </div>

              <div className="p-3 bg-[#10192C] rounded-lg border border-[#283650] space-y-2">
                <span className="text-[10px] font-mono uppercase text-[#75D9F5] block">
                  Canonical Evidence & Source
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="Source Document Name"
                    value={formSourceName}
                    onChange={(e) => setFormSourceName(e.target.value)}
                    className="w-full bg-[#151F35] border border-[#283650] rounded p-2 text-[#EEF3FF]"
                  />
                  <input
                    type="url"
                    placeholder="Source URL (Optional)"
                    value={formSourceUrl}
                    onChange={(e) => setFormSourceUrl(e.target.value)}
                    className="w-full bg-[#151F35] border border-[#283650] rounded p-2 text-[#EEF3FF]"
                  />
                </div>
                <textarea
                  rows={2}
                  placeholder="Exact supporting passage / text excerpt from the approved source document..."
                  value={formSourceText}
                  onChange={(e) => setFormSourceText(e.target.value)}
                  className="w-full bg-[#151F35] border border-[#283650] rounded p-2 text-[#EEF3FF]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3 py-1.5 text-[#9AABC5] hover:text-[#EEF3FF]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 rounded-lg bg-[#46E3C1] text-[#0B1020] font-bold hover:bg-[#46E3C1]/90"
                >
                  {isSubmitting ? 'Saving to Firestore...' : 'Save Knowledge Record'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
