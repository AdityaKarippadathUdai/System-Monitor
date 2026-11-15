import React, { useState } from 'react';
import {
  Settings as SettingsIcon,
  Clock,
  Layout,
  Download,
  RotateCcw,
  CheckCircle2,
  Zap,
  Play,
} from 'lucide-react';
import { useSystemStore } from '../store/systemStore';
import { SystemDetails } from '../components/SystemDetails';

export const SettingsPage: React.FC = () => {
  const settings = useSystemStore((state) => state.settings);
  const updateSettings = useSystemStore((state) => state.updateSettings);
  const setTurboMode = useSystemStore((state) => state.setTurboMode);
  const overview = useSystemStore((state) => state.overview);
  const processes = useSystemStore((state) => state.processes);
  const tauriStats = useSystemStore((state) => state.tauriStats);
  const benchmarkResult = useSystemStore((state) => state.benchmarkResult);
  const isBenchmarking = useSystemStore((state) => state.isBenchmarking);
  const runBenchmark = useSystemStore((state) => state.runBenchmark);

  const [notification, setNotification] = useState<string | null>(null);

  const showFeedback = (msg: string) => {
    setNotification(msg);
    setTimeout(() => {
      setNotification(null);
    }, 3500);
  };

  const handleExportSnapshot = () => {
    const snapshot = {
      exportedAt: new Date().toISOString(),
      tauriEngine: tauriStats,
      systemOverview: overview,
      processCount: processes.length,
      processes: processes,
      settings: settings,
    };

    const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sysmon-telemetry-snapshot-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showFeedback('System telemetry snapshot exported successfully as JSON.');
  };

  const handleResetDefaults = () => {
    updateSettings({
      refreshInterval: 1000,
      showCpuTemp: true,
      showGpuTemp: true,
      compactProcessList: false,
      startMinimized: false,
      startWithSystem: true,
      tempUnit: 'C',
      theme: 'dark',
      chartTimeframe: 60,
      turboMode: false,
    });
    showFeedback('Settings reset to default desktop configuration.');
  };

  return (
    <div className="space-y-4 p-4 max-w-5xl mx-auto select-none font-mono-num text-xs">
      {/* Page Header Banner */}
      <div className="bg-[#0B1118] border border-[#1A2633] rounded-lg p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <SettingsIcon className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-100">Application & Engine Preferences</h2>
            <p className="text-[11px] text-slate-400">
              High-speed IPC configuration, telemetry sampling rates, and performance preferences
            </p>
          </div>
        </div>

        {notification && (
          <div className="flex items-center gap-1.5 px-3 py-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-xs">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{notification}</span>
          </div>
        )}
      </div>

      {/* Tauri Native Speed & IPC Diagnostics Panel */}
      <div className="bg-[#0B1118] border border-[#1A2633] rounded-lg p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#14202c] pb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider">
                Telemetry IPC Acceleration & Benchmark
              </h3>
              <p className="text-[11px] text-slate-400">
                Low-latency host IPC bridge and real-time hardware sampling diagnostics
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={runBenchmark}
              disabled={isBenchmarking}
              className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            >
              <Play className={`w-3.5 h-3.5 ${isBenchmarking ? 'animate-spin' : ''}`} />
              <span>{isBenchmarking ? 'Benchmarking...' : 'Run IPC Speed Test'}</span>
            </button>
          </div>
        </div>

        {/* Live IPC Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-[#05070A] border border-[#14202c] rounded-lg p-3">
            <span className="text-[10px] text-slate-400 block mb-1">IPC Latency (RTT)</span>
            <span className="text-lg font-bold text-emerald-400 font-mono-num">
              {tauriStats.latencyMs} <span className="text-xs text-slate-400 font-normal">ms</span>
            </span>
            <span className="text-[10px] text-slate-500 block mt-0.5">Direct host telemetry</span>
          </div>

          <div className="bg-[#05070A] border border-[#14202c] rounded-lg p-3">
            <span className="text-[10px] text-slate-400 block mb-1">IPC Throughput</span>
            <span className="text-lg font-bold text-blue-400 font-mono-num">
              {benchmarkResult ? benchmarkResult.opsPerSec : tauriStats.throughputPerSec * 250}{' '}
              <span className="text-xs text-slate-400 font-normal">ops/s</span>
            </span>
            <span className="text-[10px] text-slate-500 block mt-0.5">Non-blocking async loop</span>
          </div>

          <div className="bg-[#05070A] border border-[#14202c] rounded-lg p-3">
            <span className="text-[10px] text-slate-400 block mb-1">Engine Backend</span>
            <span className="text-xs font-bold text-purple-300 block truncate">
              {tauriStats.isTauri ? 'Native Tauri v2 (Rust)' : 'Node.js / Express API'}
            </span>
            <span className="text-[10px] text-emerald-400/90 block mt-0.5 truncate">
              {overview?.systemInfo?.platform
                ? `${overview.systemInfo.platform.toUpperCase()} • ${tauriStats.isTauri ? 'Native OS APIs' : 'systeminformation'}`
                : 'Cross-Platform Monitor'}
            </span>
          </div>

          <div className="bg-[#05070A] border border-[#14202c] rounded-lg p-3">
            <span className="text-[10px] text-slate-400 block mb-1">Sampling Frequency</span>
            <span className="text-lg font-bold text-amber-400 font-mono-num">
              {settings.refreshInterval <= 250 ? '4.0 Hz' : settings.refreshInterval <= 500 ? '2.0 Hz' : `${(1000 / settings.refreshInterval).toFixed(1)} Hz`}
            </span>
            <span className="text-[10px] text-slate-500 block mt-0.5">{settings.refreshInterval}ms cycle</span>
          </div>
        </div>

        {/* Benchmark Results Display */}
        {benchmarkResult && (
          <div className="bg-[#080d14] border border-blue-500/30 rounded-lg p-3 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span className="text-slate-200">
                Benchmark Completed: Avg Latency <strong className="text-emerald-400">{benchmarkResult.avgLatencyMs}ms</strong> (Min: {benchmarkResult.minLatencyMs}ms, Max: {benchmarkResult.maxLatencyMs}ms)
              </span>
            </div>
            <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-bold">
              {benchmarkResult.opsPerSec} Operations / Sec
            </span>
          </div>
        )}
      </div>

      {/* Main Settings Sections */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Monitoring & Sampling */}
        <div className="bg-[#0B1118] border border-[#1A2633] rounded-lg p-4 space-y-3">
          <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider flex items-center gap-2 border-b border-[#14202c] pb-2">
            <Clock className="w-3.5 h-3.5 text-blue-400" />
            Monitoring & Telemetry Sampling
          </h3>

          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-slate-300">Telemetry Poll Interval</label>
                {settings.turboMode && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-bold border border-amber-500/30">
                    ⚡ Turbo 4Hz Active
                  </span>
                )}
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { label: '⚡ 250ms (Turbo)', val: 250 },
                  { label: '500ms (Fast)', val: 500 },
                  { label: '1.0s (Normal)', val: 1000 },
                  { label: '1.5s', val: 1500 },
                  { label: '2.0s', val: 2000 },
                  { label: '5.0s', val: 5000 },
                ].map((item) => (
                  <button
                    key={item.val}
                    onClick={() => {
                      updateSettings({ refreshInterval: item.val });
                      if (item.val <= 250) setTurboMode(true);
                      else if (settings.turboMode && item.val > 500) setTurboMode(false);
                    }}
                    className={`py-1.5 px-2 rounded text-center border transition-colors cursor-pointer ${
                      settings.refreshInterval === item.val
                        ? 'bg-blue-600/20 border-blue-500/50 text-blue-400 font-bold'
                        : 'bg-[#101720] border-[#14202c] text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-slate-300 block mb-1">Chart History Length</label>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { label: '30 Seconds', val: 30 },
                  { label: '60 Seconds', val: 60 },
                  { label: '120 Seconds', val: 120 },
                ].map((item) => (
                  <button
                    key={item.val}
                    onClick={() => updateSettings({ chartTimeframe: item.val as 30 | 60 | 120 })}
                    className={`py-1.5 px-2 rounded text-center border transition-colors cursor-pointer ${
                      settings.chartTimeframe === item.val
                        ? 'bg-blue-600/20 border-blue-500/50 text-blue-400 font-bold'
                        : 'bg-[#101720] border-[#14202c] text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-slate-300 block mb-1">Temperature Display Unit</label>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { label: 'Celsius (°C)', val: 'C' },
                  { label: 'Fahrenheit (°F)', val: 'F' },
                ].map((item) => (
                  <button
                    key={item.val}
                    onClick={() => updateSettings({ tempUnit: item.val as 'C' | 'F' })}
                    className={`py-1.5 px-2 rounded text-center border transition-colors cursor-pointer ${
                      settings.tempUnit === item.val
                        ? 'bg-blue-600/20 border-blue-500/50 text-blue-400 font-bold'
                        : 'bg-[#101720] border-[#14202c] text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Display & Behavior Toggles */}
        <div className="bg-[#0B1118] border border-[#1A2633] rounded-lg p-4 space-y-3">
          <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider flex items-center gap-2 border-b border-[#14202c] pb-2">
            <Layout className="w-3.5 h-3.5 text-emerald-400" />
            Display & UI Toggles
          </h3>

          <div className="space-y-3">
            <div className="flex items-center justify-between py-1">
              <div>
                <span className="text-slate-200 block font-medium">Turbo 4Hz Mode (250ms)</span>
                <span className="text-[10px] text-slate-500">Sub-millisecond fast polling loop</span>
              </div>
              <button
                onClick={() => setTurboMode(!settings.turboMode)}
                className={`w-9 h-5 rounded-full transition-colors relative p-0.5 cursor-pointer ${
                  settings.turboMode ? 'bg-amber-500' : 'bg-slate-700'
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full bg-white transition-transform ${
                    settings.turboMode ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between py-1 border-t border-[#14202c]">
              <div>
                <span className="text-slate-200 block font-medium">Show CPU Package Temperature</span>
                <span className="text-[10px] text-slate-500">Render live package thermal badge</span>
              </div>
              <button
                onClick={() => updateSettings({ showCpuTemp: !settings.showCpuTemp })}
                className={`w-9 h-5 rounded-full transition-colors relative p-0.5 cursor-pointer ${
                  settings.showCpuTemp ? 'bg-blue-600' : 'bg-slate-700'
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full bg-white transition-transform ${
                    settings.showCpuTemp ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between py-1 border-t border-[#14202c]">
              <div>
                <span className="text-slate-200 block font-medium">Show GPU Temperature</span>
                <span className="text-[10px] text-slate-500">Render discrete GPU hotspot metrics</span>
              </div>
              <button
                onClick={() => updateSettings({ showGpuTemp: !settings.showGpuTemp })}
                className={`w-9 h-5 rounded-full transition-colors relative p-0.5 cursor-pointer ${
                  settings.showGpuTemp ? 'bg-blue-600' : 'bg-slate-700'
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full bg-white transition-transform ${
                    settings.showGpuTemp ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between py-1 border-t border-[#14202c]">
              <div>
                <span className="text-slate-200 block font-medium">Compact Process List</span>
                <span className="text-[10px] text-slate-500">Reduce vertical row padding</span>
              </div>
              <button
                onClick={() =>
                  updateSettings({ compactProcessList: !settings.compactProcessList })
                }
                className={`w-9 h-5 rounded-full transition-colors relative p-0.5 cursor-pointer ${
                  settings.compactProcessList ? 'bg-blue-600' : 'bg-slate-700'
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full bg-white transition-transform ${
                    settings.compactProcessList ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* System Details: Static Hardware Information Widget */}
      <SystemDetails overview={overview} id="settings-system-details-widget" />

      {/* Actions: Export Snapshot & Reset */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <button
          onClick={handleExportSnapshot}
          id="export-snapshot-btn"
          className="px-3.5 py-2 rounded bg-[#101720] hover:bg-[#15202d] text-slate-200 border border-[#1A2633] flex items-center gap-2 transition-colors cursor-pointer"
        >
          <Download className="w-4 h-4 text-blue-400" />
          <span>Export Telemetry Snapshot (JSON)</span>
        </button>

        <button
          onClick={handleResetDefaults}
          id="reset-defaults-btn"
          className="px-3.5 py-2 rounded bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 flex items-center gap-2 transition-colors cursor-pointer"
        >
          <RotateCcw className="w-4 h-4" />
          <span>Reset Settings to Defaults</span>
        </button>
      </div>
    </div>
  );
};
