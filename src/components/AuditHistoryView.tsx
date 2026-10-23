import React, { useState } from 'react';
import {
  History,
  ShieldCheck,
  Search,
  Filter,
  User,
  Clock,
  FileCheck,
  CheckCircle,
  XCircle,
  Lock,
} from 'lucide-react';
import { AuditEvent } from '../types/brandlens';

interface AuditHistoryViewProps {
  auditEvents: AuditEvent[];
}

export const AuditHistoryView: React.FC<AuditHistoryViewProps> = ({ auditEvents }) => {
  const [filterAction, setFilterAction] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredEvents = auditEvents.filter((evt) => {
    const matchesAction = filterAction === 'all' || evt.action.toLowerCase().includes(filterAction.toLowerCase());
    const matchesSearch =
      searchQuery === '' ||
      evt.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
      evt.actorName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (evt.reason && evt.reason.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (evt.reviewId && evt.reviewId.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesAction && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono tracking-widest uppercase text-[#46E3C1]">
              SCREEN 06
            </span>
            <span className="text-xs text-[#283650]"> / </span>
            <span className="text-xs text-[#75D9F5] font-mono">
              IMMUTABLE RECORD
            </span>
          </div>
          <h2 className="text-xl font-bold text-[#EEF3FF]">
            Governance Audit Trail
          </h2>
          <p className="text-xs text-[#9AABC5]">
            Append-only governance ledger recording all preflights, finding overrides, version edits, and human signoffs.
          </p>
        </div>

        <div className="flex items-center gap-2 p-2 rounded-xl bg-[#151F35] border border-[#283650] text-xs">
          <Lock className="w-3.5 h-3.5 text-[#46E3C1]" />
          <span className="text-[#EEF3FF] font-mono">Append-Only Ledger Active</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#283650] pb-4">
        <div className="flex flex-wrap items-center gap-2">
          {['all', 'preflight', 'accepted', 'dismissed', 'status', 'approved'].map((f) => (
            <button
              key={f}
              onClick={() => setFilterAction(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono capitalize transition-colors cursor-pointer ${
                filterAction === f
                  ? 'bg-[#151F35] text-[#46E3C1] border border-[#46E3C1]/50'
                  : 'text-[#9AABC5] hover:text-[#EEF3FF] hover:bg-[#151F35]/40'
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-[#9AABC5] absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search audit trail by actor, reason, review..."
            className="w-full bg-[#151F35] border border-[#283650] rounded-lg pl-9 pr-3 py-1.5 text-xs text-[#EEF3FF] focus:outline-none focus:border-[#46E3C1]"
          />
        </div>
      </div>

      {/* Audit Events Timeline */}
      <div className="rounded-xl bg-[#151F35] border border-[#283650] overflow-hidden">
        <div className="p-4 border-b border-[#283650] flex items-center justify-between text-xs text-[#9AABC5]">
          <span>Event History ({filteredEvents.length} recorded entries)</span>
          <span className="font-mono text-[10px]">Security Rules: Write/Delete Blocked</span>
        </div>

        <div className="divide-y divide-[#283650]/60">
          {filteredEvents.length === 0 ? (
            <div className="p-12 text-center text-xs text-[#9AABC5]">
              No audit events found matching query.
            </div>
          ) : (
            filteredEvents.map((evt) => (
              <div key={evt.id} className="p-4 hover:bg-[#10192C]/50 transition-colors space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-2 h-2 rounded-full bg-[#46E3C1]" />
                    <span className="text-xs font-bold text-[#EEF3FF]">
                      {evt.action}
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#10192C] text-[#75D9F5] border border-[#283650]">
                      {evt.actorRole}
                    </span>
                    {evt.versionId && (
                      <span className="text-[10px] font-mono text-[#9AABC5]">
                        v{evt.versionId}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-[11px] font-mono text-[#9AABC5]">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{new Date(evt.createdAt).toLocaleString()}</span>
                  </div>
                </div>

                {evt.reason && (
                  <p className="text-xs text-[#9AABC5] pl-4 border-l-2 border-[#283650] italic leading-relaxed">
                    “{evt.reason}”
                  </p>
                )}

                <div className="flex items-center justify-between text-[10px] font-mono text-[#9AABC5]/70 pt-1">
                  <span>Actor: {evt.actorName} ({evt.actorUid ? evt.actorUid.slice(0, 14) : 'system'})</span>
                  {evt.reviewId && <span>Review ID: {evt.reviewId}</span>}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
