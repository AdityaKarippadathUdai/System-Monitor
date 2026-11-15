import React from 'react';
import {
  LayoutDashboard,
  ListOrdered,
  Cpu,
  MemoryStick,
  MonitorCog,
  HardDrive,
  Network,
  Settings,
  Activity,
  Zap,
} from 'lucide-react';
import { AppPage, useSystemStore } from '../store/systemStore';
import { StatusIndicator } from './StatusIndicator';

interface SidebarProps {
  className?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({ className = '' }) => {
  const currentPage = useSystemStore((state) => state.currentPage);
  const setPage = useSystemStore((state) => state.setPage);
  const overview = useSystemStore((state) => state.overview);
  const tauriStats = useSystemStore((state) => state.tauriStats);

  const navItems: { id: AppPage; label: string; icon: any }[] = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'processes', label: 'Processes', icon: ListOrdered },
    { id: 'cpu', label: 'CPU', icon: Cpu },
    { id: 'memory', label: 'Memory', icon: MemoryStick },
    { id: 'gpu', label: 'GPU', icon: MonitorCog },
    { id: 'disk', label: 'Disk', icon: HardDrive },
    { id: 'network', label: 'Network', icon: Network },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const overallStatus = overview?.overallStatus || 'healthy';

  return (
    <aside
      id="app-sidebar"
      className={`w-56 bg-[#080B10] border-r border-[#1A2633] flex flex-col justify-between select-none shrink-0 ${className}`}
    >
      {/* Top Section: App Logo & Branding */}
      <div>
        <div className="p-4 border-b border-[#1A2633] flex items-center gap-3">
          <div className="w-8 h-8 rounded-md bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400 shadow-sm">
            <Activity className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-sm text-slate-100 tracking-wider font-mono-num">
                SysMon
              </span>
              <span className="text-[9px] px-1 py-0.2 rounded bg-blue-500/20 text-blue-400 font-mono-num border border-blue-500/30">
                PRO
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-mono-num">Desktop Monitor</p>
          </div>
        </div>

        {/* Navigation items */}
        <nav className="p-2 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isSelected = currentPage === item.id;

            return (
              <button
                key={item.id}
                id={`nav-${item.id}`}
                onClick={() => setPage(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-xs font-medium transition-all duration-150 relative cursor-pointer ${
                  isSelected
                    ? 'bg-blue-600/15 text-blue-400 font-semibold border-l-2 border-l-blue-500 shadow-inner'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-[#101720] border-l-2 border-l-transparent'
                }`}
              >
                <Icon
                  className={`w-4 h-4 transition-colors ${
                    isSelected ? 'text-blue-400' : 'text-slate-400 group-hover:text-slate-200'
                  }`}
                />
                <span className="tracking-tight">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Section: System Status & Version */}
      <div className="p-3 border-t border-[#1A2633] bg-[#05070A] space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-slate-400 font-mono-num">System Status</span>
          <StatusIndicator status={overallStatus} size="sm" />
        </div>

        {/* Host Platform & Engine Status */}
        <div className="flex items-center justify-between text-[10px] font-mono-num text-slate-400 pt-1 border-t border-[#131c26]">
          <div className="flex items-center gap-1.5 text-emerald-400 truncate">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping shrink-0" />
            <span className="truncate">
              {tauriStats.isTauri ? 'Tauri' : 'Web'} •{' '}
              {overview?.systemInfo?.platform
                ? overview.systemInfo.platform === 'windows'
                  ? 'Windows'
                  : overview.systemInfo.platform.charAt(0).toUpperCase() +
                    overview.systemInfo.platform.slice(1)
                : 'Host'}
            </span>
          </div>
          <span className="text-slate-300 font-semibold shrink-0">{tauriStats.latencyMs}ms</span>
        </div>
      </div>
    </aside>
  );
};
