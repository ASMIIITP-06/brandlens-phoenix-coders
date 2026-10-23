import React from 'react';
import {
  Menu,
  Cpu,
  ShieldCheck,
  LogIn,
  LogOut,
  ChevronDown,
  User,
  Zap,
} from 'lucide-react';
import { WorkspaceRole } from '../types/brandlens';

interface HeaderProps {
  screenTitle: string;
  screenKicker: string;
  engineMode: 'Rules-only mode' | 'Source-grounded AI + Rules enabled';
  userRole: WorkspaceRole;
  onChangeRole: (role: WorkspaceRole) => void;
  user: { email: string | null; displayName: string | null } | null;
  onSignIn: () => void;
  onSignOut: () => void;
  onOpenMobileMenu: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  screenTitle,
  screenKicker,
  engineMode,
  userRole,
  onChangeRole,
  user,
  onSignIn,
  onSignOut,
  onOpenMobileMenu,
}) => {
  const roles: { id: WorkspaceRole; label: string; desc: string }[] = [
    { id: 'creator', label: 'Creator', desc: 'Submit drafts, apply edits' },
    { id: 'brand_manager', label: 'Brand Manager', desc: 'Triage rules, approve standard copy' },
    { id: 'specialist_reviewer', label: 'Specialist', desc: 'Verify high-risk claims & legal' },
    { id: 'publish_owner', label: 'Publish Owner', desc: 'Final release & compliance export' },
    { id: 'admin', label: 'Admin', desc: 'Full workspace governance control' },
  ];

  const isAIMode = engineMode.includes('AI');

  return (
    <header className="sticky top-0 z-30 h-16 bg-[#0B1020]/90 backdrop-blur-md border-b border-[#283650] px-4 md:px-8 flex items-center justify-between">
      {/* Left: Mobile trigger & breadcrumb */}
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenMobileMenu}
          className="p-2 rounded-lg text-[#9AABC5] hover:text-[#EEF3FF] hover:bg-[#151F35] lg:hidden"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono tracking-widest uppercase text-[#46E3C1]">
              {screenKicker}
            </span>
            <span className="text-xs text-[#283650]">/</span>
            <h1 className="text-sm md:text-base font-bold text-[#EEF3FF]">
              {screenTitle}
            </h1>
          </div>
        </div>
      </div>

      {/* Right: Engine Status, Role Switcher, Auth */}
      <div className="flex items-center gap-2 md:gap-4">
        {/* Engine status indicator badge */}
        <div
          className={`hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${
            isAIMode
              ? 'bg-[#46E3C1]/10 text-[#46E3C1] border-[#46E3C1]/30'
              : 'bg-[#FFD166]/10 text-[#FFD166] border-[#FFD166]/30'
          }`}
          title={
            isAIMode
              ? 'Grounded Gemini AI analysis + deterministic preflight checks'
              : 'Transparent deterministic rules engine active'
          }
        >
          {isAIMode ? (
            <Zap className="w-3.5 h-3.5 text-[#46E3C1]" />
          ) : (
            <Cpu className="w-3.5 h-3.5 text-[#FFD166]" />
          )}
          <span className="text-[11px] font-mono">{engineMode}</span>
        </div>

        {/* Role Switcher (Crucial for testing RBAC in Round 2 Acceptance Tests) */}
        <div className="flex items-center gap-1 bg-[#151F35] border border-[#283650] rounded-lg p-1">
          <span className="text-[10px] font-mono uppercase text-[#9AABC5] px-2 hidden md:inline">
            Role:
          </span>
          <select
            value={userRole}
            onChange={(e) => onChangeRole(e.target.value as WorkspaceRole)}
            className="bg-[#10192C] text-[#EEF3FF] text-xs rounded border border-[#283650] py-1 px-2 focus:outline-none focus:border-[#46E3C1] cursor-pointer"
          >
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        {/* Firebase Authentication Sign-In / User Profile */}
        {user ? (
          <div className="flex items-center gap-2">
            <div className="hidden md:flex flex-col text-right">
              <span className="text-xs font-semibold text-[#EEF3FF] leading-tight">
                {user.displayName || 'Authorized User'}
              </span>
              <span className="text-[10px] text-[#9AABC5] font-mono leading-tight truncate max-w-[140px]">
                {user.email}
              </span>
            </div>
            <button
              onClick={onSignOut}
              className="p-2 rounded-lg bg-[#151F35] text-[#9AABC5] hover:text-[#FB7185] border border-[#283650] transition-colors cursor-pointer"
              title="Sign out of Firebase"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={onSignIn}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#46E3C1] text-[#0B1020] text-xs font-semibold hover:bg-[#46E3C1]/90 transition-colors shadow-xs cursor-pointer"
          >
            <LogIn className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Google Sign In</span>
            <span className="sm:hidden">Sign In</span>
          </button>
        )}
      </div>
    </header>
  );
};
