import React, { useState } from 'react';
import {
  Activity,
  AppWindow,
  CheckCircle2,
  Cpu,
  Gamepad2,
  Info,
  Keyboard,
  Layers,
  LayoutGrid,
  Monitor,
  Palette,
  Pin,
  Plus,
  Power,
  RotateCcw,
  ShieldAlert,
  Sliders,
  Trash2,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { useSystemStore } from '../../store/systemStore';
import { useDesktopStore } from '../../stores/desktop-store';
import { useGamingStore } from '../../stores/gaming-store';
import { useLayoutStore } from '../../stores/layout-store';
import {
  FontSizeScale,
  PinnedDisplayFormat,
  PositionPreset,
  TelemetryMetricKey,
  ThemeMode,
  UiDensity,
  WidgetLayoutMode,
  WidgetSizePreset,
} from '../../types/desktop';
import { FloatingWidgetWindow } from '../desktop-widget/FloatingWidgetWindow';
import { DesktopOverlayWindow } from '../desktop-overlay/DesktopOverlayWindow';
import { GamingOverlayWindow } from '../gaming-mode/GamingOverlayWindow';

type DesktopSectionId =
  | 'widget'
  | 'overlay'
  | 'tray'
  | 'background'
  | 'dashboard'
  | 'appearance'
  | 'shortcuts'
  | 'startup'
  | 'gaming';

const ALL_METRIC_OPTIONS: { key: TelemetryMetricKey; label: string }[] = [
  { key: 'cpu_usage', label: 'CPU Usage' },
  { key: 'cpu_temp', label: 'CPU Temp' },
  { key: 'gpu_usage', label: 'GPU Usage' },
  { key: 'gpu_temp', label: 'GPU Temp' },
  { key: 'ram_usage', label: 'RAM Usage' },
  { key: 'vram_usage', label: 'GPU VRAM' },
  { key: 'gpu_power', label: 'GPU Power' },
  { key: 'net_down', label: 'Network Download' },
  { key: 'net_up', label: 'Network Upload' },
  { key: 'net_latency', label: 'Ping Latency' },
  { key: 'battery', label: 'Battery (if supported)' },
  { key: 'fps', label: 'FPS (MangoHud / RTSS)' },
];

const SECTIONS: { id: DesktopSectionId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'widget', label: 'Floating Widget', icon: AppWindow },
  { id: 'overlay', label: 'Desktop Overlay', icon: Layers },
  { id: 'tray', label: 'System Tray', icon: Monitor },
  { id: 'background', label: 'Background Monitoring', icon: Activity },
  { id: 'dashboard', label: 'Dashboard Customisation', icon: LayoutGrid },
  { id: 'appearance', label: 'Themes & Appearance', icon: Palette },
  { id: 'shortcuts', label: 'Keyboard Shortcuts', icon: Keyboard },
  { id: 'startup', label: 'Startup Behaviour', icon: Power },
  { id: 'gaming', label: 'Gaming Mode', icon: Gamepad2 },
];

const ToggleSwitch: React.FC<{
  checked: boolean;
  onChange: (val: boolean) => void;
  label: string;
  description?: string;
}> = ({ checked, onChange, label, description }) => (
  <div className="flex items-center justify-between gap-4 py-2 border-b border-[#14202c] last:border-b-0">
    <div className="min-w-0">
      <div className="text-xs font-medium text-slate-200">{label}</div>
      {description && <div className="text-[11px] text-slate-400 mt-0.5">{description}</div>}
    </div>
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`w-9 h-5 rounded-full transition-colors relative p-0.5 cursor-pointer shrink-0 ${
        checked ? 'bg-blue-600' : 'bg-slate-700'
      }`}
    >
      <div
        className={`w-4 h-4 rounded-full bg-white transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  </div>
);

export const DesktopExperiencePage: React.FC = () => {
  const [activeSection, setActiveSection] = useState<DesktopSectionId>('widget');
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  const setPage = useSystemStore((s) => s.setPage);
  const config = useDesktopStore((s) => s.config);
  const capabilities = useDesktopStore((s) => s.capabilities);
  const fps = useDesktopStore((s) => s.fps);
  const shortcutStatus = useDesktopStore((s) => s.shortcutStatus);
  const shortcutError = useDesktopStore((s) => s.shortcutError);
  const startupStatus = useDesktopStore((s) => s.startupStatus);
  const startupError = useDesktopStore((s) => s.startupError);
  const monitoringActive = useDesktopStore((s) => s.monitoringActive);

  const patchConfig = useDesktopStore((s) => s.patchConfig);
  const updateAppearance = useDesktopStore((s) => s.updateAppearance);
  const toggleFloatingWidget = useDesktopStore((s) => s.toggleFloatingWidget);
  const toggleDesktopOverlay = useDesktopStore((s) => s.toggleDesktopOverlay);
  const setClickThrough = useDesktopStore((s) => s.setClickThrough);
  const updateShortcuts = useDesktopStore((s) => s.updateShortcuts);
  const resetShortcuts = useDesktopStore((s) => s.resetShortcuts);
  const applyStartupSettings = useDesktopStore((s) => s.applyStartupSettings);
  const setBackgroundMonitoring = useDesktopStore((s) => s.setBackgroundMonitoring);
  const setMonitoringActive = useDesktopStore((s) => s.setMonitoringActive);
  const addPinnedMetric = useDesktopStore((s) => s.addPinnedMetric);
  const removePinnedMetric = useDesktopStore((s) => s.removePinnedMetric);
  const updatePinnedMetric = useDesktopStore((s) => s.updatePinnedMetric);
  const reorderPinnedMetrics = useDesktopStore((s) => s.reorderPinnedMetrics);

  const gamingStatus = useGamingStore((s) => s.status);
  const toggleGamingMode = useGamingStore((s) => s.toggleGamingMode);
  const enableAutoDetectMode = useGamingStore((s) => s.enableAutoDetectMode);
  const addExclusion = useGamingStore((s) => s.addExclusion);
  const removeExclusion = useGamingStore((s) => s.removeExclusion);
  const addCustomGame = useGamingStore((s) => s.addCustomGame);
  const removeCustomGame = useGamingStore((s) => s.removeCustomGame);

  const presets = useLayoutStore((s) => s.presets);
  const activeLayoutId = useLayoutStore((s) => s.activeLayoutId);
  const switchLayout = useLayoutStore((s) => s.switchLayout);
  const setEditMode = useLayoutStore((s) => s.setEditMode);
  const restoreDefaultLayout = useLayoutStore((s) => s.restoreDefaultLayout);

  const [shortcutDraft, setShortcutDraft] = useState(config.shortcuts);
  const [newPinMetric, setNewPinMetric] = useState<TelemetryMetricKey>('cpu_usage');
  const [newPinLabel, setNewPinLabel] = useState('CPU Load');
  const [newPinFormat, setNewPinFormat] = useState<PinnedDisplayFormat>('percent');
  const [newPinWarn, setNewPinWarn] = useState('80');
  const [newPinCrit, setNewPinCrit] = useState('92');
  const [newExclusionInput, setNewExclusionInput] = useState('');
  const [newCustomGameInput, setNewCustomGameInput] = useState('');

  const notify = (msg: string) => {
    setStatusNotice(msg);
    window.setTimeout(() => setStatusNotice(null), 3200);
  };

  const toggleMetricInList = (list: TelemetryMetricKey[], key: TelemetryMetricKey): TelemetryMetricKey[] =>
    list.includes(key) ? list.filter((k) => k !== key) : [...list, key];

  const renderSection = () => {
    switch (activeSection) {
      case 'widget':
        return (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
            <div className="xl:col-span-7 space-y-4">
              <div className="bg-[#0B1118] border border-[#1A2633] rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-[#14202c] pb-2.5">
                  <div>
                    <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider">
                      Floating Hardware Monitor Widget
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Separate transparent always-on-top window synced with live telemetry
                    </p>
                  </div>
                  <button
                    onClick={() => void toggleFloatingWidget()}
                    className={`px-3 py-1.5 rounded text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer border ${
                      config.widget.enabled && config.widget.visible
                        ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                        : 'bg-blue-600 border-blue-500 text-white hover:bg-blue-500'
                    }`}
                  >
                    {config.widget.enabled && config.widget.visible
                      ? 'Hide Floating Widget'
                      : 'Launch Floating Widget'}
                  </button>
                </div>

                <ToggleSwitch
                  checked={config.widget.alwaysOnTop}
                  onChange={(val) =>
                    void patchConfig((p) => ({ ...p, widget: { ...p.widget, alwaysOnTop: val } }))
                  }
                  label="Always on Top"
                  description="Keep floating widget above standard desktop windows"
                />
                <ToggleSwitch
                  checked={config.widget.clickThrough}
                  onChange={(val) => void setClickThrough('widget', val)}
                  label="Click-Through Lock Mode"
                  description={`Pass mouse clicks through the widget (unlock via ${config.shortcuts.toggleClickThrough} or tray)`}
                />
                <ToggleSwitch
                  checked={config.widget.showBorder}
                  onChange={(val) =>
                    void patchConfig((p) => ({ ...p, widget: { ...p.widget, showBorder: val } }))
                  }
                  label="Widget Border"
                  description="Render subtle hairline outline around the transparent surface"
                />
                <ToggleSwitch
                  checked={config.widget.backgroundBlur}
                  onChange={(val) =>
                    void patchConfig((p) => ({ ...p, widget: { ...p.widget, backgroundBlur: val } }))
                  }
                  label="Background Blur (Where Supported)"
                  description="DWM blur on Windows / compositor glass blur fallback on Linux"
                />
                <ToggleSwitch
                  checked={config.widget.showPinnedSection}
                  onChange={(val) =>
                    void patchConfig((p) => ({
                      ...p,
                      widget: { ...p.widget, showPinnedSection: val },
                    }))
                  }
                  label="Show Pinned Important Metrics"
                  description="Display user-pinned metrics and threshold alerts inside the widget"
                />

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Layout Mode</label>
                    <select
                      value={config.widget.layoutMode}
                      onChange={(e) =>
                        void patchConfig((p) => ({
                          ...p,
                          widget: { ...p.widget, layoutMode: e.target.value as WidgetLayoutMode },
                        }))
                      }
                      className="w-full bg-[#101720] border border-[#1A2633] rounded px-2 py-1.5 text-xs text-slate-200"
                    >
                      <option value="compact">Compact</option>
                      <option value="detailed">Detailed</option>
                      <option value="minimal">Minimal Strip</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Size Preset</label>
                    <select
                      value={config.widget.sizePreset}
                      onChange={(e) =>
                        void patchConfig((p) => ({
                          ...p,
                          widget: { ...p.widget, sizePreset: e.target.value as WidgetSizePreset },
                        }))
                      }
                      className="w-full bg-[#101720] border border-[#1A2633] rounded px-2 py-1.5 text-xs text-slate-200"
                    >
                      <option value="small">Small</option>
                      <option value="medium">Medium</option>
                      <option value="large">Large</option>
                      <option value="custom">Custom Drag Size</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">
                      Opacity ({Math.round(config.widget.opacity * 100)}%)
                    </label>
                    <input
                      type="range"
                      min={0.3}
                      max={1}
                      step={0.02}
                      value={config.widget.opacity}
                      onChange={(e) =>
                        void patchConfig((p) => ({
                          ...p,
                          widget: { ...p.widget, opacity: Number(e.target.value) },
                        }))
                      }
                      className="w-full accent-blue-500 cursor-pointer mt-1.5"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-[#0B1118] border border-[#1A2633] rounded-lg p-4 space-y-2.5">
                <h4 className="text-xs font-bold text-slate-100 uppercase tracking-wider">
                  Widget Metrics (Unsupported Hardware Auto-Hidden)
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {ALL_METRIC_OPTIONS.map((opt) => {
                    const selected = config.widget.metrics.includes(opt.key);
                    return (
                      <button
                        key={opt.key}
                        onClick={() =>
                          void patchConfig((p) => ({
                            ...p,
                            widget: {
                              ...p.widget,
                              metrics: toggleMetricInList(p.widget.metrics, opt.key),
                            },
                          }))
                        }
                        className={`px-2 py-1.5 rounded border text-left text-[11px] transition-colors cursor-pointer ${
                          selected
                            ? 'bg-blue-600/20 border-blue-500/40 text-blue-300 font-semibold'
                            : 'bg-[#101720] border-[#14202c] text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="xl:col-span-5 space-y-3">
              <div className="bg-[#0B1118] border border-[#1A2633] rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-100 uppercase tracking-wider">
                    Live Floating Widget Preview
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono-num">
                    {config.widget.width}×{config.widget.height}px
                  </span>
                </div>
                <div className="p-4 rounded-lg bg-[#05070A] border border-[#14202c] min-h-[300px] flex items-center justify-center">
                  <div className="w-full max-w-[330px]">
                    <FloatingWidgetWindow isPreview previewConfig={config.widget} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      case 'overlay':
        return (
          <div className="space-y-4">
            <div className="bg-[#0B1118] border border-[#1A2633] rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-[#14202c] pb-2.5">
                <div>
                  <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider">
                    Desktop Telemetry Overlay Window
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Lightweight frameless HUD bar independent from the floating widget
                  </p>
                </div>
                <button
                  onClick={() => void toggleDesktopOverlay()}
                  className={`px-3 py-1.5 rounded text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer border ${
                    config.overlay.enabled && config.overlay.visible
                      ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                      : 'bg-blue-600 border-blue-500 text-white hover:bg-blue-500'
                  }`}
                >
                  {config.overlay.enabled && config.overlay.visible
                    ? 'Hide Desktop Overlay'
                    : 'Show Desktop Overlay'}
                </button>
              </div>

              <ToggleSwitch
                checked={config.overlay.alwaysOnTop}
                onChange={(val) =>
                  void patchConfig((p) => ({ ...p, overlay: { ...p.overlay, alwaysOnTop: val } }))
                }
                label="Always on Top"
              />
              <ToggleSwitch
                checked={config.overlay.clickThrough}
                onChange={(val) => void setClickThrough('overlay', val)}
                label="Click-Through Interaction Pass-Through"
              />
              <ToggleSwitch
                checked={config.overlay.showBorder}
                onChange={(val) =>
                  void patchConfig((p) => ({ ...p, overlay: { ...p.overlay, showBorder: val } }))
                }
                label="Overlay Border"
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Position Preset</label>
                  <select
                    value={config.overlay.positionPreset}
                    onChange={(e) =>
                      void patchConfig((p) => ({
                        ...p,
                        overlay: {
                          ...p.overlay,
                          positionPreset: e.target.value as PositionPreset,
                        },
                      }))
                    }
                    className="w-full bg-[#101720] border border-[#1A2633] rounded px-2 py-1.5 text-xs text-slate-200"
                  >
                    <option value="top-left">Top Left</option>
                    <option value="top-right">Top Right</option>
                    <option value="bottom-left">Bottom Left</option>
                    <option value="bottom-right">Bottom Right</option>
                    <option value="custom">Custom Position</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">
                    Opacity ({Math.round(config.overlay.opacity * 100)}%)
                  </label>
                  <input
                    type="range"
                    min={0.25}
                    max={1}
                    step={0.02}
                    value={config.overlay.opacity}
                    onChange={(e) =>
                      void patchConfig((p) => ({
                        ...p,
                        overlay: { ...p.overlay, opacity: Number(e.target.value) },
                      }))
                    }
                    className="w-full accent-blue-500 cursor-pointer mt-1.5"
                  />
                </div>
              </div>

              <div className="pt-2">
                <label className="text-[11px] text-slate-400 block mb-1.5">Overlay Metrics</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  {ALL_METRIC_OPTIONS.map((opt) => {
                    const selected = config.overlay.metrics.includes(opt.key);
                    return (
                      <button
                        key={opt.key}
                        onClick={() =>
                          void patchConfig((p) => ({
                            ...p,
                            overlay: {
                              ...p.overlay,
                              metrics: toggleMetricInList(p.overlay.metrics, opt.key),
                            },
                          }))
                        }
                        className={`px-2 py-1.5 rounded border text-left text-[11px] cursor-pointer ${
                          selected
                            ? 'bg-blue-600/20 border-blue-500/40 text-blue-300 font-semibold'
                            : 'bg-[#101720] border-[#14202c] text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="bg-[#0B1118] border border-[#1A2633] rounded-lg p-4 space-y-2">
              <div className="text-xs font-bold text-slate-100 uppercase tracking-wider">
                Live Overlay Strip Preview
              </div>
              <div className="p-4 rounded bg-[#05070A] border border-[#14202c]">
                <DesktopOverlayWindow isPreview previewConfig={config.overlay} />
              </div>
            </div>
          </div>
        );

      case 'tray':
        return (
          <div className="bg-[#0B1118] border border-[#1A2633] rounded-lg p-4 space-y-3">
            <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider border-b border-[#14202c] pb-2">
              System Tray Integration
            </h3>
            <ToggleSwitch
              checked={config.tray.enabled}
              onChange={(val) =>
                void patchConfig((p) => ({ ...p, tray: { ...p.tray, enabled: val } }))
              }
              label="Enable Persistent System Tray Icon"
              description="Provides quick actions for Dashboard, Floating Widget, Desktop Overlay, Gaming Mode, and Monitoring"
            />
            <ToggleSwitch
              checked={config.tray.minimizeToTrayOnClose}
              onChange={(val) =>
                void patchConfig((p) => ({
                  ...p,
                  tray: { ...p.tray, minimizeToTrayOnClose: val },
                }))
              }
              label="Close Window Minimizes to Tray"
              description="Closing the main window hides it to the tray while background monitoring and overlays continue"
            />
            <ToggleSwitch
              checked={config.tray.showTooltipMetrics}
              onChange={(val) =>
                void patchConfig((p) => ({
                  ...p,
                  tray: { ...p.tray, showTooltipMetrics: val },
                }))
              }
              label="Live Tray Tooltip Metrics"
              description="Updates the tray hover tooltip with live CPU, RAM, and GPU usage percentages"
            />
            <ToggleSwitch
              checked={config.tray.startMinimized}
              onChange={(val) =>
                void patchConfig((p) => ({ ...p, tray: { ...p.tray, startMinimized: val } }))
              }
              label="Start Minimized to Tray"
              description="Hide the main dashboard window on application launch"
            />
            <div className="p-3 rounded bg-[#05070A] border border-[#14202c] text-[11px] text-slate-400">
              Tray Menu Actions: <span className="text-slate-200">SysMon Pro • Open Dashboard • Show/Hide Floating Widget • Show/Hide Desktop Overlay • Enable/Disable Gaming Mode • Start/Stop Monitoring • Settings • Exit</span>
            </div>
          </div>
        );

      case 'background':
        return (
          <div className="bg-[#0B1118] border border-[#1A2633] rounded-lg p-4 space-y-4">
            <div className="flex items-center justify-between border-b border-[#14202c] pb-2.5">
              <div>
                <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider">
                  Background Monitoring Service
                </h3>
                <p className="text-[11px] text-slate-400">
                  Single shared Rust telemetry engine serving dashboard, tray tooltip, widgets, and game detection
                </p>
              </div>
              <button
                onClick={() => void setMonitoringActive(!monitoringActive)}
                className={`px-3 py-1.5 rounded text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer border ${
                  monitoringActive
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                    : 'bg-amber-500/15 border-amber-500/40 text-amber-400'
                }`}
              >
                {monitoringActive ? 'Monitoring Running' : 'Monitoring Paused'}
              </button>
            </div>

            <ToggleSwitch
              checked={config.background.enabled}
              onChange={(val) => void setBackgroundMonitoring(val)}
              label="Continue Monitoring When Main Window Is Closed"
              description="Keeps tray metrics, floating widgets, overlays, and game auto-detection active in the background"
            />
            <ToggleSwitch
              checked={config.background.pauseWhenAllHidden}
              onChange={(val) =>
                void patchConfig((p) => ({
                  ...p,
                  background: { ...p.background, pauseWhenAllHidden: val },
                }))
              }
              label="Pause Telemetry When All Windows Are Hidden"
              description="Suspends background sampling when dashboard, widget, overlay, and gaming HUD are all hidden"
            />

            <div>
              <label className="text-[11px] text-slate-400 block mb-1.5">
                Background Polling Interval
              </label>
              <div className="grid grid-cols-5 gap-2">
                {[
                  { label: '500 ms', ms: 500 },
                  { label: '1s', ms: 1000 },
                  { label: '2s', ms: 2000 },
                  { label: '5s', ms: 5000 },
                  { label: '10s', ms: 10000 },
                ].map((opt) => (
                  <button
                    key={opt.ms}
                    onClick={() => void setBackgroundMonitoring(config.background.enabled, opt.ms)}
                    className={`py-2 px-2 rounded border text-xs cursor-pointer ${
                      config.background.intervalMs === opt.ms
                        ? 'bg-blue-600/20 border-blue-500/50 text-blue-300 font-semibold'
                        : 'bg-[#101720] border-[#14202c] text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        );

      case 'dashboard':
        return (
          <div className="space-y-4">
            <div className="bg-[#0B1118] border border-[#1A2633] rounded-lg p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#14202c] pb-2.5">
                <div>
                  <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider">
                    Dashboard Layouts & Resizable Cards
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Reorder, resize, add/remove cards, and switch named Overview presets
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setEditMode(true);
                      setPage('overview');
                    }}
                    className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                  >
                    Open Overview Editor
                  </button>
                  <button
                    onClick={() => {
                      restoreDefaultLayout();
                      notify('Default Overview layout restored.');
                    }}
                    className="px-3 py-1.5 rounded bg-[#101720] hover:bg-[#15202d] border border-[#1A2633] text-slate-200 text-xs cursor-pointer whitespace-nowrap"
                  >
                    Restore Default
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {presets.map((preset) => (
                  <div
                    key={preset.id}
                    onClick={() => switchLayout(preset.id)}
                    className={`p-3 rounded border cursor-pointer flex items-center justify-between ${
                      preset.id === activeLayoutId
                        ? 'bg-blue-600/15 border-blue-500/40 text-blue-300'
                        : 'bg-[#101720] border-[#14202c] text-slate-300 hover:border-slate-600'
                    }`}
                  >
                    <div>
                      <div className="text-xs font-semibold">{preset.name}</div>
                      <div className="text-[10px] text-slate-400">
                        {preset.cards.filter((c) => c.visible).length} active cards
                      </div>
                    </div>
                    {preset.id === activeLayoutId && (
                      <span className="text-[10px] font-bold text-blue-400">ACTIVE</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Pin Important Metrics Manager */}
            <div className="bg-[#0B1118] border border-[#1A2633] rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2 border-b border-[#14202c] pb-2">
                <Pin className="w-4 h-4 text-blue-400" />
                <div>
                  <h4 className="text-xs font-bold text-slate-100 uppercase tracking-wider">
                    Pinned Important Metrics
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    Configure display format, warning/critical thresholds, and order for floating views
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                {config.pinnedMetrics.map((pin, idx) => (
                  <div
                    key={pin.id}
                    className="p-2.5 rounded bg-[#05070A] border border-[#14202c] flex flex-wrap items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-semibold text-slate-200">{pin.label}</span>
                      <span className="text-[10px] text-slate-400">({pin.metric})</span>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <select
                        value={pin.displayFormat}
                        onChange={(e) =>
                          void updatePinnedMetric(pin.id, {
                            displayFormat: e.target.value as PinnedDisplayFormat,
                          })
                        }
                        className="bg-[#101720] border border-[#1A2633] rounded px-1.5 py-0.5 text-[11px] text-slate-200"
                      >
                        <option value="percent">Percentage</option>
                        <option value="absolute">Absolute</option>
                        <option value="combined">Combined</option>
                      </select>

                      <span className="text-[10px] text-amber-400">
                        Warn: {pin.warningThreshold ?? 'Off'}
                      </span>
                      <span className="text-[10px] text-red-400">
                        Crit: {pin.criticalThreshold ?? 'Off'}
                      </span>

                      <button
                        onClick={() => void reorderPinnedMetrics(idx, idx - 1)}
                        disabled={idx === 0}
                        className="p-1 text-slate-400 hover:text-slate-200 disabled:opacity-30 cursor-pointer"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => void reorderPinnedMetrics(idx, idx + 1)}
                        disabled={idx === config.pinnedMetrics.length - 1}
                        className="p-1 text-slate-400 hover:text-slate-200 disabled:opacity-30 cursor-pointer"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => void removePinnedMetric(pin.id)}
                        className="p-1 text-slate-400 hover:text-red-400 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 pt-2 border-t border-[#14202c]">
                <select
                  value={newPinMetric}
                  onChange={(e) => setNewPinMetric(e.target.value as TelemetryMetricKey)}
                  className="bg-[#101720] border border-[#1A2633] rounded px-2 py-1.5 text-xs text-slate-200"
                >
                  {ALL_METRIC_OPTIONS.map((m) => (
                    <option key={m.key} value={m.key}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={newPinLabel}
                  onChange={(e) => setNewPinLabel(e.target.value)}
                  placeholder="Label"
                  className="bg-[#101720] border border-[#1A2633] rounded px-2 py-1.5 text-xs text-slate-200"
                />
                <select
                  value={newPinFormat}
                  onChange={(e) => setNewPinFormat(e.target.value as PinnedDisplayFormat)}
                  className="bg-[#101720] border border-[#1A2633] rounded px-2 py-1.5 text-xs text-slate-200"
                >
                  <option value="percent">Percent</option>
                  <option value="absolute">Absolute</option>
                  <option value="combined">Combined</option>
                </select>
                <input
                  type="number"
                  value={newPinWarn}
                  onChange={(e) => setNewPinWarn(e.target.value)}
                  placeholder="Warn"
                  className="bg-[#101720] border border-[#1A2633] rounded px-2 py-1.5 text-xs text-slate-200"
                />
                <input
                  type="number"
                  value={newPinCrit}
                  onChange={(e) => setNewPinCrit(e.target.value)}
                  placeholder="Crit"
                  className="bg-[#101720] border border-[#1A2633] rounded px-2 py-1.5 text-xs text-slate-200"
                />
                <button
                  onClick={() => {
                    void addPinnedMetric({
                      id: `pin-${Date.now()}`,
                      metric: newPinMetric,
                      label: newPinLabel.trim() || newPinMetric,
                      displayFormat: newPinFormat,
                      warningThreshold: newPinWarn ? Number(newPinWarn) : null,
                      criticalThreshold: newPinCrit ? Number(newPinCrit) : null,
                      compact: true,
                    });
                    notify('Pinned metric added.');
                  }}
                  className="px-2.5 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Pin</span>
                </button>
              </div>
            </div>
          </div>
        );

      case 'appearance':
        return (
          <div className="bg-[#0B1118] border border-[#1A2633] rounded-lg p-4 space-y-4">
            <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider border-b border-[#14202c] pb-2">
              Themes & Appearance (Synced Across Main & Floating Windows)
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Theme Mode</label>
                <div className="grid grid-cols-3 gap-1">
                  {(['dark', 'light', 'system'] as ThemeMode[]).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => void updateAppearance({ theme: mode })}
                      className={`py-1.5 rounded border text-xs capitalize cursor-pointer ${
                        config.appearance.theme === mode
                          ? 'bg-blue-600/20 border-blue-500/50 text-blue-300 font-semibold'
                          : 'bg-[#101720] border-[#14202c] text-slate-400'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Font Size</label>
                <div className="grid grid-cols-3 gap-1">
                  {(['sm', 'md', 'lg'] as FontSizeScale[]).map((fs) => (
                    <button
                      key={fs}
                      onClick={() => void updateAppearance({ fontSize: fs })}
                      className={`py-1.5 rounded border text-xs uppercase cursor-pointer ${
                        config.appearance.fontSize === fs
                          ? 'bg-blue-600/20 border-blue-500/50 text-blue-300 font-semibold'
                          : 'bg-[#101720] border-[#14202c] text-slate-400'
                      }`}
                    >
                      {fs}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Density</label>
                <div className="grid grid-cols-2 gap-1">
                  {(['compact', 'comfortable'] as UiDensity[]).map((d) => (
                    <button
                      key={d}
                      onClick={() => void updateAppearance({ density: d })}
                      className={`py-1.5 rounded border text-xs capitalize cursor-pointer ${
                        config.appearance.density === d
                          ? 'bg-blue-600/20 border-blue-500/50 text-blue-300 font-semibold'
                          : 'bg-[#101720] border-[#14202c] text-slate-400'
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Accent Color</label>
                <div className="flex items-center gap-2">
                  {['#3B82F6', '#06B6D4', '#10B981', '#F59E0B', '#EC4899'].map((hex) => (
                    <button
                      key={hex}
                      onClick={() => void updateAppearance({ accentColor: hex })}
                      style={{ backgroundColor: hex }}
                      className={`w-6 h-6 rounded-full border-2 cursor-pointer ${
                        config.appearance.accentColor === hex
                          ? 'border-white scale-110'
                          : 'border-transparent opacity-75'
                      }`}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">
                  Corner Radius ({config.appearance.cornerRadius}px)
                </label>
                <input
                  type="range"
                  min={2}
                  max={18}
                  value={config.appearance.cornerRadius}
                  onChange={(e) => void updateAppearance({ cornerRadius: Number(e.target.value) })}
                  className="w-full accent-blue-500 cursor-pointer"
                />
              </div>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">
                  Global Widget Opacity ({Math.round(config.appearance.widgetOpacity * 100)}%)
                </label>
                <input
                  type="range"
                  min={0.3}
                  max={1}
                  step={0.02}
                  value={config.appearance.widgetOpacity}
                  onChange={(e) =>
                    void updateAppearance({ widgetOpacity: Number(e.target.value) })
                  }
                  className="w-full accent-blue-500 cursor-pointer"
                />
              </div>
            </div>

            <ToggleSwitch
              checked={config.appearance.widgetBorder}
              onChange={(val) => void updateAppearance({ widgetBorder: val })}
              label="Widget Borders"
            />
            <ToggleSwitch
              checked={config.appearance.backgroundBlur}
              onChange={(val) => void updateAppearance({ backgroundBlur: val })}
              label="Glass Background Blur (Where Supported)"
            />
          </div>
        );

      case 'shortcuts':
        return (
          <div className="bg-[#0B1118] border border-[#1A2633] rounded-lg p-4 space-y-4">
            <div className="flex items-center justify-between border-b border-[#14202c] pb-2.5">
              <div>
                <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider">
                  Global Keyboard Shortcuts
                </h3>
                <p className="text-[11px] text-slate-400">
                  Duplicate and conflict validation enforced automatically
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    void resetShortcuts().then(() => {
                      setShortcutDraft(useDesktopStore.getState().config.shortcuts);
                      notify('Shortcuts reset to defaults.');
                    });
                  }}
                  className="px-2.5 py-1.5 rounded bg-[#101720] border border-[#1A2633] text-slate-300 text-xs flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset Defaults</span>
                </button>
                <button
                  onClick={() => {
                    void updateShortcuts(shortcutDraft).then((ok) => {
                      if (ok) notify('Keyboard shortcuts updated.');
                    });
                  }}
                  className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold cursor-pointer"
                >
                  Apply Shortcuts
                </button>
              </div>
            </div>

            {shortcutError && (
              <div className="p-2.5 rounded bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
                {shortcutError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { key: 'toggleDashboard' as const, label: 'Toggle Main Dashboard' },
                { key: 'toggleWidget' as const, label: 'Show / Hide Floating Widget' },
                { key: 'toggleOverlay' as const, label: 'Show / Hide Desktop Overlay' },
                { key: 'toggleGamingMode' as const, label: 'Toggle Gaming Mode' },
                { key: 'toggleClickThrough' as const, label: 'Toggle Click-Through Lock' },
              ].map((row) => (
                <div key={row.key} className="bg-[#05070A] border border-[#14202c] rounded p-3">
                  <label className="text-[11px] text-slate-400 block mb-1">{row.label}</label>
                  <input
                    type="text"
                    value={shortcutDraft[row.key]}
                    onChange={(e) =>
                      setShortcutDraft((prev) => ({ ...prev, [row.key]: e.target.value }))
                    }
                    placeholder="e.g. Ctrl+Shift+M"
                    className="w-full bg-[#101720] border border-[#1A2633] rounded px-2.5 py-1.5 text-xs text-slate-100 font-mono-num"
                  />
                </div>
              ))}
            </div>

            <div className="p-3 rounded bg-[#05070A] border border-[#14202c] text-[11px] text-slate-400 flex items-start gap-2">
              <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
              <div>
                <div className="text-slate-200 font-semibold">
                  Display Server: {capabilities.displayServer} ({capabilities.desktopEnvironment})
                </div>
                <div className="mt-0.5">
                  {shortcutStatus?.note ||
                    (capabilities.globalShortcutsSupported
                      ? 'System-wide global hotkeys are supported on this desktop session.'
                      : 'Global shortcuts outside focused SysMon windows are restricted on Wayland / Web Preview; bind compositor shortcuts in your desktop environment for Wayland global triggers.')}
                </div>
              </div>
            </div>
          </div>
        );

      case 'startup':
        return (
          <div className="bg-[#0B1118] border border-[#1A2633] rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-[#14202c] pb-2.5">
              <div>
                <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider">
                  Startup Behaviour (No Administrator Privileges Required)
                </h3>
                <p className="text-[11px] text-slate-400">
                  Linux: XDG Autostart (~/.config/autostart) • Windows: HKCU CurrentUser Run Registry
                </p>
              </div>
              <button
                onClick={() => {
                  void applyStartupSettings(config.startup).then((ok) => {
                    if (ok) notify('Startup configuration applied.');
                  });
                }}
                className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
              >
                Apply Startup Entry
              </button>
            </div>

            {startupError && (
              <div className="p-2.5 rounded bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
                {startupError}
              </div>
            )}

            <ToggleSwitch
              checked={config.startup.launchAtLogin}
              onChange={(val) =>
                void applyStartupSettings({ ...config.startup, launchAtLogin: val })
              }
              label="Launch SysMon Pro on System Login"
            />
            <ToggleSwitch
              checked={config.startup.startMinimized}
              onChange={(val) =>
                void patchConfig((p) => ({
                  ...p,
                  startup: { ...p.startup, startMinimized: val },
                }))
              }
              label="Start Minimized to System Tray (--minimized)"
            />
            <ToggleSwitch
              checked={config.startup.startFloatingWidget}
              onChange={(val) =>
                void patchConfig((p) => ({
                  ...p,
                  startup: { ...p.startup, startFloatingWidget: val },
                }))
              }
              label="Launch Floating Hardware Widget at Startup (--widget)"
            />
            <ToggleSwitch
              checked={config.startup.startBackgroundMonitoring}
              onChange={(val) =>
                void patchConfig((p) => ({
                  ...p,
                  startup: { ...p.startup, startBackgroundMonitoring: val },
                }))
              }
              label="Enable Background Monitoring on Startup"
            />
            <ToggleSwitch
              checked={config.startup.manualGamingModeOnly}
              onChange={(val) =>
                void patchConfig((p) => ({
                  ...p,
                  startup: { ...p.startup, manualGamingModeOnly: val },
                }))
              }
              label="Keep Gaming Mode Manual-Only on Startup"
              description="Prevents auto-activating Gaming HUD right after login until manually toggled"
            />

            {startupStatus && (
              <div className="p-3 rounded bg-[#05070A] border border-[#14202c] text-[11px] text-slate-400 space-y-1">
                <div>
                  Status:{' '}
                  <span className={startupStatus.enabled ? 'text-emerald-400' : 'text-slate-300'}>
                    {startupStatus.enabled ? 'Installed' : 'Not Installed'}
                  </span>{' '}
                  • {startupStatus.mechanism}
                </div>
                {startupStatus.entryPath && (
                  <div className="text-slate-500 break-all">{startupStatus.entryPath}</div>
                )}
                <div>{startupStatus.note}</div>
              </div>
            )}
          </div>
        );

      case 'gaming':
        return (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
            <div className="xl:col-span-7 space-y-4">
              <div className="bg-[#0B1118] border border-[#1A2633] rounded-lg p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#14202c] pb-2.5">
                  <div>
                    <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider">
                      Gaming Mode & Performance HUD
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Genuine FPS only (Linux MangoHud / Windows RTSS) — never fabricated
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => void enableAutoDetectMode()}
                      className="px-2.5 py-1.5 rounded bg-[#101720] border border-[#1A2633] text-slate-300 text-xs cursor-pointer"
                    >
                      Auto Mode
                    </button>
                    <button
                      onClick={() => void toggleGamingMode()}
                      className={`px-3 py-1.5 rounded text-xs font-semibold cursor-pointer border ${
                        gamingStatus.active || config.gaming.enabled
                          ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                          : 'bg-blue-600 border-blue-500 text-white hover:bg-blue-500'
                      }`}
                    >
                      {gamingStatus.active || config.gaming.enabled
                        ? 'Disable Gaming Mode'
                        : 'Enable Gaming Mode'}
                    </button>
                  </div>
                </div>

                <ToggleSwitch
                  checked={config.gaming.autoDetect}
                  onChange={(val) =>
                    void patchConfig((p) => ({ ...p, gaming: { ...p.gaming, autoDetect: val } }))
                  }
                  label="Auto-Detect Running Games"
                  description="Detects Steam, Proton/Wine, Epic, GOG, Riot, MangoHud, and custom game processes"
                />
                <ToggleSwitch
                  checked={config.gaming.compactMode}
                  onChange={(val) =>
                    void patchConfig((p) => ({ ...p, gaming: { ...p.gaming, compactMode: val } }))
                  }
                  label="Compact Inline HUD Layout"
                />
                <ToggleSwitch
                  checked={config.gaming.clickThrough}
                  onChange={(val) => void setClickThrough('gaming', val)}
                  label="Click-Through Non-Focus-Stealing Overlay"
                />

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">HUD Position</label>
                    <select
                      value={config.gaming.positionPreset}
                      onChange={(e) =>
                        void patchConfig((p) => ({
                          ...p,
                          gaming: {
                            ...p.gaming,
                            positionPreset: e.target.value as PositionPreset,
                          },
                        }))
                      }
                      className="w-full bg-[#101720] border border-[#1A2633] rounded px-2 py-1.5 text-xs text-slate-200"
                    >
                      <option value="top-left">Top Left</option>
                      <option value="top-right">Top Right</option>
                      <option value="bottom-left">Bottom Left</option>
                      <option value="bottom-right">Bottom Right</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Ping Target (Optional)</label>
                    <input
                      type="text"
                      value={config.gaming.latencyTarget}
                      onChange={(e) =>
                        void patchConfig((p) => ({
                          ...p,
                          gaming: { ...p.gaming, latencyTarget: e.target.value },
                        }))
                      }
                      className="w-full bg-[#101720] border border-[#1A2633] rounded px-2 py-1.5 text-xs text-slate-200"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">
                      Opacity ({Math.round(config.gaming.opacity * 100)}%)
                    </label>
                    <input
                      type="range"
                      min={0.25}
                      max={1}
                      step={0.02}
                      value={config.gaming.opacity}
                      onChange={(e) =>
                        void patchConfig((p) => ({
                          ...p,
                          gaming: { ...p.gaming, opacity: Number(e.target.value) },
                        }))
                      }
                      className="w-full accent-emerald-500 cursor-pointer mt-1.5"
                    />
                  </div>
                </div>
              </div>

              {/* Detected Games, Custom Games & Exclusions */}
              <div className="bg-[#0B1118] border border-[#1A2633] rounded-lg p-4 space-y-3">
                <h4 className="text-xs font-bold text-slate-100 uppercase tracking-wider">
                  Detected Games, Custom List & Exclusions
                </h4>
                <div className="text-[11px] text-slate-400">
                  {gamingStatus.detectedGames.length === 0 ? (
                    <span>No active game processes detected right now.</span>
                  ) : (
                    <div className="space-y-1">
                      {gamingStatus.detectedGames.map((g) => (
                        <div
                          key={g.pid}
                          className="flex items-center justify-between px-2.5 py-1.5 rounded bg-[#05070A] border border-[#14202c]"
                        >
                          <div>
                            <span className="text-slate-200 font-semibold">{g.name}</span>{' '}
                            <span className="text-slate-500">PID {g.pid} • {g.detectionSource}</span>
                          </div>
                          <button
                            onClick={() =>
                              void (g.isExcluded
                                ? removeExclusion(g.name)
                                : addExclusion(g.name))
                            }
                            className="text-[10px] text-amber-400 hover:underline cursor-pointer"
                          >
                            {g.isExcluded ? 'Remove Exclusion' : 'Exclude'}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-[#14202c]">
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Custom Game Executables</label>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={newCustomGameInput}
                        onChange={(e) => setNewCustomGameInput(e.target.value)}
                        placeholder="e.g. minecraft"
                        className="flex-1 bg-[#101720] border border-[#1A2633] rounded px-2 py-1 text-xs text-slate-200"
                      />
                      <button
                        onClick={() => {
                          void addCustomGame(newCustomGameInput);
                          setNewCustomGameInput('');
                        }}
                        className="px-2.5 py-1 rounded bg-blue-600 text-white text-xs cursor-pointer"
                      >
                        Add
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {config.gaming.customGames.map((g) => (
                        <button
                          key={g}
                          onClick={() => void removeCustomGame(g)}
                          className="px-2 py-0.5 rounded bg-[#101720] border border-[#1A2633] text-[10px] text-slate-300 hover:text-red-400 cursor-pointer"
                        >
                          {g} ×
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Excluded Processes</label>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={newExclusionInput}
                        onChange={(e) => setNewExclusionInput(e.target.value)}
                        placeholder="e.g. launcher.exe"
                        className="flex-1 bg-[#101720] border border-[#1A2633] rounded px-2 py-1 text-xs text-slate-200"
                      />
                      <button
                        onClick={() => {
                          void addExclusion(newExclusionInput);
                          setNewExclusionInput('');
                        }}
                        className="px-2.5 py-1 rounded bg-amber-600 text-white text-xs cursor-pointer"
                      >
                        Exclude
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {config.gaming.exclusions.map((ex) => (
                        <button
                          key={ex}
                          onClick={() => void removeExclusion(ex)}
                          className="px-2 py-0.5 rounded bg-[#101720] border border-[#1A2633] text-[10px] text-slate-300 hover:text-red-400 cursor-pointer"
                        >
                          {ex} ×
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="xl:col-span-5 space-y-3">
              <div className="bg-[#0B1118] border border-[#1A2633] rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-100 uppercase tracking-wider">
                    Live Gaming HUD Preview
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono-num">
                    FPS Source: {fps.source}
                  </span>
                </div>
                <div className="p-4 rounded bg-[#05070A] border border-[#14202c]">
                  <GamingOverlayWindow isPreview previewConfig={config.gaming} />
                </div>
                <div className="p-2.5 rounded bg-[#05070A] border border-[#14202c] text-[11px] text-slate-400">
                  {fps.requiredIntegration}
                </div>
              </div>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="space-y-4 p-4 max-w-[1600px] mx-auto select-none font-mono-num text-xs">
      {/* Header Banner */}
      <div className="bg-[#0B1118] border border-[#1A2633] rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <Sliders className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-100">Desktop Experience & Overlays</h2>
            <p className="text-[11px] text-slate-400">
              Floating widgets, desktop overlays, system tray, background monitoring, layouts, themes, hotkeys, startup & gaming HUD
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {statusNotice && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{statusNotice}</span>
            </div>
          )}
          <span className="px-2.5 py-1 rounded bg-[#05070A] border border-[#14202c] text-[11px] text-slate-300">
            {capabilities.displayServer} • {capabilities.platform.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Platform Limitation Notice (Explicit & Honest) */}
      {capabilities.limitations.length > 0 && (
        <div className="bg-[#0B1118] border border-amber-500/30 rounded-lg p-3 flex items-start gap-2.5 text-[11px] text-amber-200/90">
          <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            {capabilities.limitations.map((lim, i) => (
              <div key={i}>{lim}</div>
            ))}
          </div>
        </div>
      )}

      {/* 9-Category Navigation + Active Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        <div className="lg:col-span-3 bg-[#0B1118] border border-[#1A2633] rounded-lg p-2 space-y-1">
          {SECTIONS.map((sec) => {
            const Icon = sec.icon;
            const active = activeSection === sec.id;
            return (
              <button
                key={sec.id}
                onClick={() => setActiveSection(sec.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-xs transition-colors cursor-pointer ${
                  active
                    ? 'bg-blue-600/15 text-blue-400 font-semibold border-l-2 border-l-blue-500'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-[#101720] border-l-2 border-l-transparent'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{sec.label}</span>
              </button>
            );
          })}
        </div>

        <div className="lg:col-span-9">{renderSection()}</div>
      </div>
    </div>
  );
};
