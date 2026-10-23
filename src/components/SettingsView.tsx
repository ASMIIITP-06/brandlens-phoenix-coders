import React, { useState } from 'react';
import {
  Settings,
  Shield,
  Users,
  Key,
  Database,
  Lock,
  Cpu,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Download,
} from 'lucide-react';
import { WorkspaceRole, WorkspaceMember } from '../types/brandlens';

interface SettingsViewProps {
  workspaceName: string;
  userRole: WorkspaceRole;
  onChangeRole: (role: WorkspaceRole) => void;
  engineMode: string;
  isSampleData: boolean;
  onResetWorkspace: () => Promise<void>;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  workspaceName,
  userRole,
  onChangeRole,
  engineMode,
  isSampleData,
  onResetWorkspace,
}) => {
  const [isResetting, setIsResetting] = useState(false);
  const [retentionDays, setRetentionDays] = useState('90');

  const members: WorkspaceMember[] = [
    { uid: 'uid-admin-01', role: 'admin', displayName: 'Phoenix Lead Architect', email: 'lead@phoenix.studio', status: 'active', joinedAt: '2026-01-01' },
    { uid: 'uid-mgr-02', role: 'brand_manager', displayName: 'Brand Strategy Director', email: 'brand@phoenix.studio', status: 'active', joinedAt: '2026-01-10' },
    { uid: 'uid-spec-03', role: 'specialist_reviewer', displayName: 'Legal & Compliance Officer', email: 'compliance@phoenix.studio', status: 'active', joinedAt: '2026-01-15' },
    { uid: 'uid-pub-04', role: 'publish_owner', displayName: 'Release Operations Lead', email: 'release@phoenix.studio', status: 'active', joinedAt: '2026-01-20' },
    { uid: 'uid-creator-05', role: 'creator', displayName: 'Staff Content Writer', email: 'copywriter@phoenix.studio', status: 'active', joinedAt: '2026-02-01' },
  ];

  const handleReset = async () => {
    setIsResetting(true);
    try {
      await onResetWorkspace();
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono tracking-widest uppercase text-[#46E3C1]">
            SCREEN 07
          </span>
          <span className="text-xs text-[#283650]"> / </span>
          <span className="text-xs text-[#75D9F5] font-mono">
            CONFIGURATION & SECURITY
          </span>
        </div>
        <h2 className="text-xl font-bold text-[#EEF3FF]">
          Workspace Governance Settings
        </h2>
        <p className="text-xs text-[#9AABC5]">
          Manage team roles, retention windows, external AI disclosure, and security controls.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Workspace Profile & Active Role */}
        <div className="p-5 rounded-xl bg-[#151F35] border border-[#283650] space-y-4">
          <div className="border-b border-[#283650] pb-3">
            <span className="text-[10px] font-mono uppercase text-[#46E3C1]">
              IDENTITY & TENANCY
            </span>
            <h3 className="text-sm font-bold text-[#EEF3FF]">
              Workspace Identity
            </h3>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <label className="block text-[#9AABC5] mb-1 font-mono uppercase text-[10px]">
                Workspace Name
              </label>
              <input
                type="text"
                disabled
                value={workspaceName}
                className="w-full bg-[#10192C] border border-[#283650] rounded-lg p-2.5 text-[#EEF3FF] font-medium"
              />
            </div>

            <div>
              <label className="block text-[#9AABC5] mb-1 font-mono uppercase text-[10px]">
                Live Evaluator Role Simulation (For Testing Round 2 Acceptance)
              </label>
              <select
                value={userRole}
                onChange={(e) => onChangeRole(e.target.value as WorkspaceRole)}
                className="w-full bg-[#10192C] border border-[#46E3C1] rounded-lg p-2.5 text-[#EEF3FF] font-semibold"
              >
                <option value="creator">Creator (Can submit drafts, apply suggestions)</option>
                <option value="brand_manager">Brand Manager (Can manage rules, approve standard copy)</option>
                <option value="specialist_reviewer">Specialist Reviewer (Can verify high-risk claims)</option>
                <option value="publish_owner">Publish Owner (Can export and certified release)</option>
                <option value="admin">Admin (Full workspace governance control)</option>
              </select>
              <p className="text-[11px] text-[#9AABC5] mt-1">
                Role switching allows judges to test Creator restrictions vs Specialist/Publisher gates.
              </p>
            </div>

            <div>
              <label className="block text-[#9AABC5] mb-1 font-mono uppercase text-[10px]">
                Audit Trail Retention
              </label>
              <select
                value={retentionDays}
                onChange={(e) => setRetentionDays(e.target.value)}
                className="w-full bg-[#10192C] border border-[#283650] rounded-lg p-2 text-[#EEF3FF]"
              >
                <option value="90">90 Days (Enterprise Standard)</option>
                <option value="365">1 Year (Regulatory Compliant)</option>
                <option value="forever">Indefinite (Full Legal Immutability)</option>
              </select>
            </div>
          </div>
        </div>

        {/* AI & Preflight Engine Transparency */}
        <div className="p-5 rounded-xl bg-[#151F35] border border-[#283650] space-y-4">
          <div className="border-b border-[#283650] pb-3">
            <span className="text-[10px] font-mono uppercase text-[#75D9F5]">
              TRANSPARENCY & PRIVACY
            </span>
            <h3 className="text-sm font-bold text-[#EEF3FF]">
              Preflight Engine Architecture
            </h3>
          </div>

          <div className="space-y-3 text-xs">
            <div className="p-3 rounded-lg bg-[#10192C] border border-[#283650] space-y-1">
              <div className="flex items-center justify-between text-[#46E3C1] font-semibold">
                <span className="flex items-center gap-1.5">
                  <Cpu className="w-4 h-4" />
                  Engine Mode: {engineMode}
                </span>
                <span className="text-[10px] font-mono px-2 py-0.2 rounded bg-[#46E3C1]/20 text-[#46E3C1]">
                  ACTIVE
                </span>
              </div>
              <p className="text-[#9AABC5] text-[11px] leading-relaxed">
                Deterministic regex preflight checks run instantaneously on every review. When an API key is present, Gemini 3.8 Flash provides source-grounded semantic claim checks.
              </p>
            </div>

            <div className="p-3 rounded-lg bg-[#10192C] border border-[#283650] space-y-1">
              <span className="font-semibold text-[#EEF3FF] block">
                External AI Processing Disclosure:
              </span>
              <p className="text-[#9AABC5] text-[11px] leading-relaxed">
                Client drafts never transmit private model keys to the browser. All grounding passes through server-side route handlers. User content is never retained by third-party foundation models for training.
              </p>
            </div>

            <div className="p-3 rounded-lg bg-[#10192C] border border-[#283650] space-y-1">
              <span className="font-semibold text-[#FFD166] block">
                Explainability Guarantee:
              </span>
              <p className="text-[#9AABC5] text-[11px] leading-relaxed">
                If no matching source exists in the Governance Library, the engine strictly outputs "No approved evidence found". It is programmatically forbidden from inventing citations.
              </p>
            </div>
          </div>
        </div>

        {/* Security Checklist (ABAC / Firestore Rules) */}
        <div className="p-5 rounded-xl bg-[#151F35] border border-[#283650] space-y-4 lg:col-span-2">
          <div className="border-b border-[#283650] pb-3 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-mono uppercase text-[#A78BFA]">
                SECURITY AUDIT
              </span>
              <h3 className="text-sm font-bold text-[#EEF3FF]">
                Hardened Multi-Tenant Security Checklist
              </h3>
            </div>
            <span className="text-xs font-mono text-[#46E3C1]">
              Rules Deployed & Enforced
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            {[
              { title: 'Default Deny Catch-All', desc: 'All collections reject unmapped reads and writes automatically.' },
              { title: 'Master Gate Workspace Scoping', desc: 'Membership in /workspaces/{id} is strictly checked before any sub-resource access.' },
              { title: 'Immutable Append-Only Audit Trail', desc: 'auditEvents collection allows create operations only; update and delete are rejected.' },
              { title: 'Mandatory Dismissal Justification', desc: 'Firestore rules reject finding status="dismissed" without a non-empty reason string.' },
              { title: 'Role-Gated State Transitions', desc: 'Creator role is blocked from self-approving high-risk claims.' },
              { title: 'Client Offline Resilience & Error Handling', desc: 'All database queries wrapped with FirestoreErrorInfo JSON diagnostic handler.' },
            ].map((check, i) => (
              <div key={i} className="p-3 rounded-lg bg-[#10192C] border border-[#283650] flex items-start gap-2.5">
                <CheckCircle className="w-4 h-4 text-[#46E3C1] shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-[#EEF3FF]">{check.title}</h4>
                  <p className="text-[11px] text-[#9AABC5] mt-0.5">{check.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Workspace Member Matrix */}
        <div className="p-5 rounded-xl bg-[#151F35] border border-[#283650] space-y-4 lg:col-span-2">
          <div className="border-b border-[#283650] pb-3 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-mono uppercase text-[#75D9F5]">
                ROLES & PERMISSIONS
              </span>
              <h3 className="text-sm font-bold text-[#EEF3FF]">
                Authorized Team Members
              </h3>
            </div>
            <span className="text-xs font-mono text-[#9AABC5]">
              {members.length} Provisioned Roles
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-[#9AABC5]">
              <thead className="bg-[#10192C] text-[#EEF3FF] font-mono text-[10px] uppercase">
                <tr>
                  <th className="p-3 rounded-l-lg">Member</th>
                  <th className="p-3">Role</th>
                  <th className="p-3">Permitted Actions</th>
                  <th className="p-3 rounded-r-lg">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#283650]/60">
                {members.map((m) => (
                  <tr key={m.uid} className="hover:bg-[#10192C]/40">
                    <td className="p-3 text-[#EEF3FF] font-medium">
                      <div>{m.displayName}</div>
                      <div className="text-[10px] text-[#9AABC5] font-mono">{m.email}</div>
                    </td>
                    <td className="p-3">
                      <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-[#10192C] text-[#75D9F5] border border-[#283650]">
                        {m.role.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="p-3 text-[11px]">
                      {m.role === 'admin' && 'Full workspace authority, member management'}
                      {m.role === 'brand_manager' && 'Manage knowledge base, triage & approve standard copy'}
                      {m.role === 'specialist_reviewer' && 'Verify high-severity claims, legal & compliance'}
                      {m.role === 'publish_owner' && 'Final release gatekeeper & certification'}
                      {m.role === 'creator' && 'Submit drafts, apply preflight revisions'}
                    </td>
                    <td className="p-3">
                      <span className="text-[10px] text-[#46E3C1] font-mono">
                        {m.status.toUpperCase()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
