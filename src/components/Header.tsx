import React, { useState, useEffect } from 'react';
import {
  Play,
  Pause,
  Clock,
  Settings as SettingsIcon,
  Zap,
  AppWindow,
  Gamepad2,
} from 'lucide-react';
import { useSystemStore } from '../store/systemStore';
import { useDesktopStore } from '../stores/desktop-store';
import { useGamingStore } from '../stores/gaming-store';
import { StatusIndicator } from './StatusIndicator';

export const Header: React.FC = () => {
  const currentPage = useSystemStore((state) => state.currentPage);
  const setPage = useSystemStore((state) => state.setPage);
  const overview = useSystemStore((state) => state.overview);
  const isPaused = useSystemStore((state) => state.isPaused);
  const togglePause = useSystemStore((state) => state.togglePause);
  const lastUpdated = useSystemStore((state) => state.lastUpdated);
  const settings = useSystemStore((state) => state.settings);
  const setRefreshInterval = useSystemStore((state) => state.setRefreshInterval);
  const setTurboMode = useSystemStore((state) => state.setTurboMode);
  const tauriStats = useSystemStore((state) => state.tauriStats);
  const widgetConfig = useDesktopStore((state) => state.config.widget);
  const toggleFloatingWidget = useDesktopStore((state) => state.toggleFloatingWidget);
  const gamingStatus = useGamingStore((state) => state.status);
  const gamingEnabled = useDesktopStore((state) => state.config.gaming.enabled);
  const toggleGamingMode = useGamingStore((state) => state.toggleGamingMode);

  const [secondsAgo, setSecondsAgo] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      const diff = Math.max(0, Math.floor((Date.now() - lastUpdated) / 1000));
      setSecondsAgo(diff);
    }, 1000);

    return () => clearInterval(timer);
  }, [lastUpdated]);

  const isWindows = overview?.systemInfo?.platform === 'windows';

  const pageTitles: Record<string, { title: string; subtitle: string }> = {
    overview: { title: 'System Overview', subtitle: 'Real-time resource performance metrics' },
    processes: { title: 'Process Manager', subtitle: 'Running applications and system tasks' },
    cpu: { title: 'CPU Performance', subtitle: 'Per-core execution and clock frequencies' },
    memory: {
      title: isWindows ? 'Memory & Page File' : 'Memory & Swap',
      subtitle: 'Physical RAM distribution and virtual memory allocations',
    },
    gpu: { title: 'GPU & VRAM', subtitle: 'Graphics compute pipeline and thermal limits' },
    disk: { title: 'Disk Monitoring', subtitle: 'Storage throughput, partitions, and I/O rates' },
    network: { title: 'Network Activity', subtitle: 'Bandwidth traffic and interface statistics' },
    desktop: {
      title: 'Desktop Experience',
      subtitle: 'Floating widgets, overlays, tray, layouts, themes, shortcuts & gaming HUD',
    },
    settings: { title: 'Monitor Settings', subtitle: 'Application telemetry and polling preferences' },
  };

  const currentMeta = pageTitles[currentPage] || pageTitles.overview;
  const overallStatus = overview?.overallStatus || 'healthy';

  return (
    <header
      id="app-header"
      className="h-14 bg-[#080B10] border-b border-[#1A2633] px-5 flex items-center justify-between select-none shrink-0"
    >
      {/* Left: Title & Subtitle */}
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-sm font-bold text-slate-100 tracking-tight flex items-center gap-2">
            {currentMeta.title}
          </h1>
          <p className="text-[11px] text-slate-400 font-mono-num hidden sm:block">
            {currentMeta.subtitle}
          </p>
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-3 font-mono-num text-xs">
        {/* Tauri IPC Speed / Turbo Badge */}
        <div
          onClick={() => setTurboMode(!settings.turboMode)}
          id="tauri-turbo-mode-btn"
          title={`Tauri IPC Latency: ${tauriStats.latencyMs}ms. Click to toggle Turbo Mode.`}
          className={`cursor-pointer px-2.5 py-1 rounded border flex items-center gap-1.5 transition-colors ${
            settings.turboMode
              ? 'bg-amber-500/15 border-amber-500/40 text-amber-400 font-bold'
              : 'bg-[#05070A] border-[#14202c] text-emerald-400 hover:border-emerald-500/30'
          }`}
        >
          <Zap className={`w-3.5 h-3.5 ${settings.turboMode ? 'animate-bounce text-amber-400' : 'text-emerald-400'}`} />
          <span>{settings.turboMode ? 'Turbo 4Hz' : tauriStats.isTauri ? 'Tauri IPC' : 'Host API'}</span>
          <span className="text-[10px] opacity-75 font-normal text-slate-300">
            {tauriStats.latencyMs}ms
          </span>
        </div>

        {/* Status Indicator */}
        <div className="hidden md:flex items-center gap-2">
          <StatusIndicator
            status={overallStatus}
            label={
              overallStatus === 'healthy'
                ? 'System Healthy'
                : overallStatus === 'moderate'
                ? 'Moderate Load'
                : overallStatus === 'warning'
                ? 'High Resource Usage'
                : 'Critical Threshold'
            }
            size="sm"
          />
        </div>

        {/* Live status timer */}
        <div className="hidden lg:flex items-center gap-1.5 text-slate-400 text-[11px] bg-[#05070A] px-2.5 py-1 rounded border border-[#14202c]">
          <Clock className="w-3.5 h-3.5 text-slate-400" />
          <span>
            {isPaused ? (
              <span className="text-amber-400 font-semibold">Paused</span>
            ) : (
              <>
                Updated <span className="text-slate-200">{secondsAgo}s</span> ago
              </>
            )}
          </span>
        </div>

        {/* Refresh Interval Selector */}
        <div className="flex items-center gap-1.5 bg-[#0B1118] border border-[#1A2633] rounded px-2 py-1">
          <span className="text-[11px] text-slate-400 hidden sm:inline">Interval:</span>
          <select
            id="refresh-interval-select"
            value={settings.refreshInterval}
            onChange={(e) => {
              const val = Number(e.target.value);
              setRefreshInterval(val);
              if (val <= 250) setTurboMode(true);
              else if (settings.turboMode && val > 500) setTurboMode(false);
            }}
            className="bg-transparent text-slate-200 text-xs focus:outline-none cursor-pointer"
          >
            <option value={250} className="bg-[#0B1118] text-amber-400 font-bold">
              250ms (Turbo)
            </option>
            <option value={500} className="bg-[#0B1118] text-amber-300">
              500ms (Fast)
            </option>
            <option value={1000} className="bg-[#0B1118] text-slate-200">
              1.0s (Normal)
            </option>
            <option value={1500} className="bg-[#0B1118] text-slate-200">
              1.5s
            </option>
            <option value={2000} className="bg-[#0B1118] text-slate-200">
              2.0s
            </option>
            <option value={5000} className="bg-[#0B1118] text-slate-200">
              5.0s
            </option>
          </select>
        </div>

        {/* Pause / Play Toggle */}
        <button
          onClick={togglePause}
          id="pause-play-toggle-btn"
          title={isPaused ? 'Resume monitoring' : 'Pause monitoring'}
          className={`p-1.5 rounded border transition-colors cursor-pointer ${
            isPaused
              ? 'bg-amber-500/20 text-amber-400 border-amber-500/40 hover:bg-amber-500/30'
              : 'bg-[#0B1118] text-slate-400 border-[#1A2633] hover:text-slate-200 hover:bg-[#101720]'
          }`}
        >
          {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
        </button>

        {/* Quick Floating Widget Toggle */}
        <button
          onClick={() => void toggleFloatingWidget()}
          id="header-widget-toggle-btn"
          title="Show/Hide Floating Hardware Widget"
          className={`px-2 py-1 rounded border flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
            widgetConfig.enabled && widgetConfig.visible
              ? 'bg-blue-600/20 text-blue-400 border-blue-500/40 font-semibold'
              : 'bg-[#0B1118] text-slate-400 border-[#1A2633] hover:text-slate-200 hover:bg-[#101720]'
          }`}
        >
          <AppWindow className="w-3.5 h-3.5" />
          <span className="hidden xl:inline">Widget</span>
        </button>

        {/* Quick Gaming Mode Toggle */}
        <button
          onClick={() => void toggleGamingMode()}
          id="header-gaming-toggle-btn"
          title="Enable/Disable Gaming Mode HUD"
          className={`px-2 py-1 rounded border flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
            gamingStatus.active || gamingEnabled
              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 font-semibold'
              : 'bg-[#0B1118] text-slate-400 border-[#1A2633] hover:text-slate-200 hover:bg-[#101720]'
          }`}
        >
          <Gamepad2 className="w-3.5 h-3.5" />
          <span className="hidden xl:inline">Gaming</span>
        </button>

        {/* Settings Button */}
        <button
          onClick={() => setPage('settings')}
          id="header-settings-btn"
          title="Open Settings"
          className={`p-1.5 rounded border transition-colors cursor-pointer ${
            currentPage === 'settings'
              ? 'bg-blue-600/20 text-blue-400 border-blue-500/40'
              : 'bg-[#0B1118] text-slate-400 border-[#1A2633] hover:text-slate-200 hover:bg-[#101720]'
          }`}
        >
          <SettingsIcon className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
