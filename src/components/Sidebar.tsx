import React from 'react';
import {
  LayoutDashboard,
  BookOpen,
  FileCheck2,
  CheckCircle2,
  TrendingUp,
  History,
  Settings,
  Shield,
  Layers,
  Megaphone,
  Sparkles,
  Database,
} from 'lucide-react';
import { WorkspaceRole } from '../types/brandlens';

export type ScreenId =
  | 'overview'
  | 'library'
  | 'review'
  | 'campaigns'
  | 'approvals'
  | 'trends'
  | 'audit'
  | 'settings';

interface SidebarProps {
  currentScreen: ScreenId;
  onNavigate: (screen: ScreenId) => void;
  workspaceName: string;
  isSampleData: boolean;
  onToggleSampleData: () => void;
  userRole: WorkspaceRole;
  userEmail?: string;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentScreen,
  onNavigate,
  workspaceName,
  isSampleData,
  onToggleSampleData,
  userRole,
  userEmail,
  isOpenMobile,
  onCloseMobile,
}) => {
  const navItems = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard, kicker: '01' },
    { id: 'library', label: 'Governance Library', icon: BookOpen, kicker: '02' },
    { id: 'review', label: 'Content Review', icon: FileCheck2, kicker: '03', isCore: true },
    { id: 'approvals', label: 'Approvals Lane', icon: CheckCircle2, kicker: '04' },
    { id: 'trends', label: 'Trends & Memory', icon: TrendingUp, kicker: '05' },
    { id: 'audit', label: 'Audit History', icon: History, kicker: '06' },
    { id: 'settings', label: 'Workspace Settings', icon: Settings, kicker: '07' },
  ] as const;

  const roleColors: Record<WorkspaceRole, { bg: string; text: string; label: string }> = {
    creator: { bg: 'bg-[#75D9F5]/15', text: 'text-[#75D9F5]', label: 'Creator' },
    brand_manager: { bg: 'bg-[#46E3C1]/15', text: 'text-[#46E3C1]', label: 'Brand Manager' },
    specialist_reviewer: { bg: 'bg-[#A78BFA]/15', text: 'text-[#A78BFA]', label: 'Specialist' },
    publish_owner: { bg: 'bg-[#FFD166]/15', text: 'text-[#FFD166]', label: 'Publish Owner' },
    admin: { bg: 'bg-[#FB7185]/15', text: 'text-[#FB7185]', label: 'Admin' },
  };

  return (
    <>
      {/* Mobile backdrop */}
      {isOpenMobile && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs lg:hidden"
          onClick={onCloseMobile}
        />
      )}

      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-72 bg-[#0B1020] border-r border-[#283650] flex flex-col justify-between transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          isOpenMobile ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="p-5 border-b border-[#283650]/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#46E3C1] to-[#75D9F5] flex items-center justify-center shadow-lg shadow-[#46E3C1]/20">
              <Shield className="w-5 h-5 text-[#0B1020]" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold tracking-tight text-lg text-[#EEF3FF]">
                  BrandLens
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#46E3C1]/20 text-[#46E3C1] font-semibold">
                  MVP v2
                </span>
              </div>
              <p className="text-[11px] text-[#9AABC5]">
                Governance Copilot
              </p>
            </div>
          </div>

          {/* Current Workspace Selector & Badge */}
          <div className="mt-4 p-2.5 rounded-lg bg-[#151F35] border border-[#283650] flex items-center justify-between">
            <div className="flex items-center gap-2 overflow-hidden">
              <Layers className="w-4 h-4 text-[#75D9F5] shrink-0" />
              <div className="truncate">
                <p className="text-xs font-semibold text-[#EEF3FF] truncate">
                  {workspaceName}
                </p>
                <p className="text-[10px] text-[#9AABC5] font-mono">
                  Phoenix Coders Studio
                </p>
              </div>
            </div>
          </div>

          {/* Persistent Real Records vs Demo Mode Switcher */}
          <div className="mt-3">
            <button
              onClick={onToggleSampleData}
              className={`w-full py-1.5 px-2.5 rounded-lg text-[11px] font-medium flex items-center justify-between transition-colors border ${
                isSampleData
                  ? 'bg-[#FFD166]/10 text-[#FFD166] border-[#FFD166]/40 hover:bg-[#FFD166]/15'
                  : 'bg-[#46E3C1]/10 text-[#46E3C1] border-[#46E3C1]/40 hover:bg-[#46E3C1]/15'
              }`}
            >
              <span className="flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5" />
                {isSampleData ? 'DEMO / SAMPLE DATA' : 'FIRESTORE PERSISTENT'}
              </span>
              <span className="text-[10px] font-mono uppercase underline">
                toggle
              </span>
            </button>
          </div>
        </div>

        {/* Navigation Menu */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          <div className="px-3 pt-2 pb-1 text-[10px] font-mono tracking-wider uppercase text-[#9AABC5]/70">
            Navigation
          </div>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentScreen === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  onNavigate(item.id);
                  onCloseMobile();
                }}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all group cursor-pointer ${
                  isActive
                    ? 'bg-[#151F35] text-[#EEF3FF] border border-[#46E3C1]/40 shadow-xs'
                    : 'text-[#9AABC5] hover:bg-[#151F35]/60 hover:text-[#EEF3FF]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                      isActive
                        ? 'bg-[#46E3C1]/20 text-[#46E3C1]'
                        : 'bg-[#10192C] text-[#9AABC5] group-hover:text-[#EEF3FF]'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <span>{item.label}</span>
                </div>

                <div className="flex items-center gap-1.5">
                  {'isCore' in item && item.isCore && (
                    <span className="w-1.5 h-1.5 rounded-full bg-[#46E3C1] animate-pulse" />
                  )}
                  <span className="text-[10px] font-mono text-[#9AABC5]/50 group-hover:text-[#9AABC5]">
                    {item.kicker}
                  </span>
                </div>
              </button>
            );
          })}
        </nav>

        {/* Human in Control Anchor Footer */}
        <div className="p-4 border-t border-[#283650]/70 bg-[#10192C]/50 space-y-3">
          <div className="p-2.5 rounded-lg bg-[#151F35]/70 border border-[#283650] text-[11px] text-[#9AABC5]">
            <p className="text-[#EEF3FF] font-semibold flex items-center gap-1 mb-0.5">
              <Sparkles className="w-3.5 h-3.5 text-[#46E3C1]" />
              Human Governance
            </p>
            <p className="leading-snug">
              BrandLens recommends; authorised humans approve. Never auto-publishes.
            </p>
          </div>

          {/* Current User & Role Tag */}
          <div className="flex items-center justify-between pt-1">
            <div className="truncate">
              <p className="text-xs font-medium text-[#EEF3FF] truncate">
                {userEmail || 'reviewer@phoenix.studio'}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                    roleColors[userRole].bg
                  } ${roleColors[userRole].text}`}
                >
                  {roleColors[userRole].label}
                </span>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};
