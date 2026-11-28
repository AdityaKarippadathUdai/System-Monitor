import { create } from 'zustand';
import {
  AppearanceConfig,
  BatteryStats,
  DesktopConfig,
  DesktopPlatformCapabilities,
  DesktopTelemetryPayload,
  FpsTelemetry,
  PinnedMetricConfig,
  ShortcutConfig,
  ShortcutStatus,
  StartupConfig,
  StartupStatus,
} from '../types/desktop';
import { invokeTauriCommand, isTauriEnvironment } from '../services/tauriBridge';
import { applyThemeAndAppearance } from '../utils/theme';

const STORAGE_KEY = 'sysmon_desktop_config_v1';

export const DEFAULT_DESKTOP_CONFIG: DesktopConfig = {
  widget: {
    enabled: false,
    visible: false,
    x: 36,
    y: 48,
    width: 310,
    height: 360,
    opacity: 0.86,
    alwaysOnTop: true,
    clickThrough: false,
    showBorder: true,
    backgroundBlur: true,
    layoutMode: 'detailed',
    sizePreset: 'medium',
    showPinnedSection: true,
    metrics: [
      'cpu_usage',
      'cpu_temp',
      'gpu_usage',
      'gpu_temp',
      'ram_usage',
      'vram_usage',
      'net_down',
      'net_up',
      'battery',
      'fps',
    ],
  },
  overlay: {
    enabled: false,
    visible: false,
    x: 24,
    y: 24,
    width: 420,
    height: 76,
    opacity: 0.8,
    alwaysOnTop: true,
    clickThrough: true,
    showBorder: true,
    backgroundBlur: true,
    positionPreset: 'top-right',
    metrics: ['cpu_usage', 'cpu_temp', 'gpu_usage', 'gpu_temp', 'ram_usage', 'net_down', 'net_up'],
  },
  tray: {
    enabled: true,
    minimizeToTrayOnClose: true,
    showTooltipMetrics: true,
    startMinimized: false,
  },
  background: {
    enabled: true,
    intervalMs: 1000,
    pauseWhenAllHidden: false,
  },
  startup: {
    launchAtLogin: false,
    startMinimized: false,
    startFloatingWidget: false,
    startBackgroundMonitoring: true,
    restoreWidgetPosition: true,
    manualGamingModeOnly: false,
  },
  appearance: {
    theme: 'dark',
    accentColor: '#3B82F6',
    widgetOpacity: 0.86,
    widgetBorder: true,
    cornerRadius: 10,
    fontSize: 'md',
    density: 'comfortable',
    backgroundBlur: true,
    metricColors: {
      cpu: '#3B82F6',
      gpu: '#06B6D4',
      memory: '#10B981',
      network: '#EC4899',
      battery: '#F59E0B',
      fps: '#22C55E',
    },
  },
  shortcuts: {
    toggleDashboard: 'Ctrl+Shift+M',
    toggleWidget: 'Ctrl+Shift+W',
    toggleGamingMode: 'Ctrl+Shift+G',
    toggleOverlay: 'Ctrl+Shift+O',
    toggleClickThrough: 'Ctrl+Shift+L',
  },
  gaming: {
    enabled: false,
    autoDetect: true,
    positionPreset: 'top-left',
    x: 20,
    y: 20,
    width: 280,
    height: 220,
    opacity: 0.78,
    compactMode: false,
    textSize: 'md',
    refreshIntervalMs: 1000,
    alwaysOnTop: true,
    clickThrough: true,
    metrics: [
      'fps',
      'cpu_usage',
      'cpu_temp',
      'gpu_usage',
      'gpu_temp',
      'ram_usage',
      'vram_usage',
      'gpu_power',
      'net_latency',
    ],
    latencyTarget: '1.1.1.1',
    exclusions: [],
    customGames: [],
    perGameOverrides: {},
  },
  pinnedMetrics: [
    {
      id: 'pin-cpu-temp',
      metric: 'cpu_temp',
      label: 'CPU Temp',
      displayFormat: 'absolute',
      warningThreshold: 75,
      criticalThreshold: 90,
      compact: true,
    },
    {
      id: 'pin-gpu-temp',
      metric: 'gpu_temp',
      label: 'GPU Temp',
      displayFormat: 'absolute',
      warningThreshold: 78,
      criticalThreshold: 88,
      compact: true,
    },
    {
      id: 'pin-ram',
      metric: 'ram_usage',
      label: 'RAM',
      displayFormat: 'combined',
      warningThreshold: 80,
      criticalThreshold: 92,
      compact: true,
    },
    {
      id: 'pin-net-dl',
      metric: 'net_down',
      label: 'Net Down',
      displayFormat: 'absolute',
      warningThreshold: null,
      criticalThreshold: null,
      compact: true,
    },
  ],
};

function mergeConfig(partial?: Partial<DesktopConfig>): DesktopConfig {
  if (!partial) return structuredClone(DEFAULT_DESKTOP_CONFIG);
  return {
    widget: { ...DEFAULT_DESKTOP_CONFIG.widget, ...(partial.widget || {}) },
    overlay: { ...DEFAULT_DESKTOP_CONFIG.overlay, ...(partial.overlay || {}) },
    tray: { ...DEFAULT_DESKTOP_CONFIG.tray, ...(partial.tray || {}) },
    background: { ...DEFAULT_DESKTOP_CONFIG.background, ...(partial.background || {}) },
    startup: { ...DEFAULT_DESKTOP_CONFIG.startup, ...(partial.startup || {}) },
    appearance: {
      ...DEFAULT_DESKTOP_CONFIG.appearance,
      ...(partial.appearance || {}),
      metricColors: {
        ...DEFAULT_DESKTOP_CONFIG.appearance.metricColors,
        ...(partial.appearance?.metricColors || {}),
      },
    },
    shortcuts: { ...DEFAULT_DESKTOP_CONFIG.shortcuts, ...(partial.shortcuts || {}) },
    gaming: { ...DEFAULT_DESKTOP_CONFIG.gaming, ...(partial.gaming || {}) },
    pinnedMetrics: Array.isArray(partial.pinnedMetrics)
      ? partial.pinnedMetrics
      : DEFAULT_DESKTOP_CONFIG.pinnedMetrics,
  };
}

function loadCachedDesktopConfig(): DesktopConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return mergeConfig(JSON.parse(raw));
    }
  } catch {
    // ignore
  }
  return structuredClone(DEFAULT_DESKTOP_CONFIG);
}

function saveCachedDesktopConfig(cfg: DesktopConfig) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  } catch {
    // ignore
  }
}

export const DEFAULT_FPS_TELEMETRY: FpsTelemetry = {
  fps: null,
  frameTimeMs: null,
  source: 'Unavailable',
  activeGamePid: null,
  activeGameName: null,
  available: false,
  requiredIntegration:
    'Requires MangoHud (Linux) or RivaTuner Statistics Server (Windows) for genuine FPS telemetry.',
};

export const DEFAULT_CAPABILITIES: DesktopPlatformCapabilities = {
  platform: 'linux',
  displayServer: 'Host Session',
  desktopEnvironment: 'Desktop',
  transparencySupported: true,
  blurSupported: false,
  clickThroughSupported: false,
  alwaysOnTopSupported: false,
  positioningSupported: false,
  globalShortcutsSupported: false,
  traySupported: false,
  limitations: [],
};

interface DesktopState {
  config: DesktopConfig;
  battery: BatteryStats | null;
  fps: FpsTelemetry;
  latencyMs: number | null;
  capabilities: DesktopPlatformCapabilities;
  shortcutStatus: ShortcutStatus | null;
  startupStatus: StartupStatus | null;
  shortcutError: string | null;
  startupError: string | null;
  monitoringActive: boolean;
  isLoaded: boolean;

  applyConfigLocally: (cfg: DesktopConfig) => void;
  applyTelemetryPayload: (payload: DesktopTelemetryPayload) => void;
  fetchDesktopState: () => Promise<void>;
  updateConfig: (next: DesktopConfig) => Promise<void>;
  patchConfig: (updater: (prev: DesktopConfig) => DesktopConfig) => Promise<void>;
  updateAppearance: (partial: Partial<AppearanceConfig>) => Promise<void>;
  toggleFloatingWidget: (visible?: boolean) => Promise<void>;
  toggleDesktopOverlay: (visible?: boolean) => Promise<void>;
  setClickThrough: (target: 'widget' | 'overlay' | 'gaming' | 'all', enabled?: boolean) => Promise<void>;
  updateShortcuts: (shortcuts: ShortcutConfig) => Promise<boolean>;
  resetShortcuts: () => Promise<void>;
  applyStartupSettings: (startup: StartupConfig) => Promise<boolean>;
  setBackgroundMonitoring: (enabled: boolean, intervalMs?: number) => Promise<void>;
  setMonitoringActive: (enabled: boolean) => Promise<void>;
  addPinnedMetric: (item: PinnedMetricConfig) => Promise<void>;
  removePinnedMetric: (id: string) => Promise<void>;
  updatePinnedMetric: (id: string, patch: Partial<PinnedMetricConfig>) => Promise<void>;
  reorderPinnedMetrics: (fromIndex: number, toIndex: number) => Promise<void>;
  startWindowDrag: () => Promise<void>;
  showMainWindow: () => Promise<void>;
}

const initialCfg = loadCachedDesktopConfig();
if (typeof document !== 'undefined') {
  applyThemeAndAppearance(initialCfg.appearance);
}

export const useDesktopStore = create<DesktopState>((set, get) => ({
  config: initialCfg,
  battery: null,
  fps: DEFAULT_FPS_TELEMETRY,
  latencyMs: null,
  capabilities: DEFAULT_CAPABILITIES,
  shortcutStatus: null,
  startupStatus: null,
  shortcutError: null,
  startupError: null,
  monitoringActive: true,
  isLoaded: false,

  applyConfigLocally: (cfg) => {
    const merged = mergeConfig(cfg);
    saveCachedDesktopConfig(merged);
    applyThemeAndAppearance(merged.appearance);
    set({ config: merged, isLoaded: true });
  },

  applyTelemetryPayload: (payload) => {
    const merged = mergeConfig(payload.config);
    saveCachedDesktopConfig(merged);
    applyThemeAndAppearance(merged.appearance);
    set({
      config: merged,
      battery: payload.battery,
      fps: payload.fps,
      latencyMs: payload.latencyMs,
      capabilities: payload.capabilities,
      isLoaded: true,
    });
  },

  fetchDesktopState: async () => {
    if (isTauriEnvironment()) {
      try {
        const [payload, shortcutStatus, startupStatus] = await Promise.all([
          invokeTauriCommand<DesktopTelemetryPayload>('get_desktop_state'),
          invokeTauriCommand<ShortcutStatus>('get_shortcut_status').catch(() => null),
          invokeTauriCommand<StartupStatus>('get_startup_status').catch(() => null),
        ]);
        const merged = mergeConfig(payload.config);
        saveCachedDesktopConfig(merged);
        applyThemeAndAppearance(merged.appearance);
        set({
          config: merged,
          battery: payload.battery,
          fps: payload.fps,
          latencyMs: payload.latencyMs,
          capabilities: payload.capabilities,
          shortcutStatus,
          startupStatus,
          isLoaded: true,
        });
        return;
      } catch (err) {
        console.warn('[DesktopStore] Tauri get_desktop_state error:', err);
      }
    }

    try {
      const [telemetryRes, startupRes] = await Promise.all([
        fetch('/api/desktop/telemetry'),
        fetch('/api/desktop/startup'),
      ]);
      if (telemetryRes.ok) {
        const data = await telemetryRes.json();
        const merged = mergeConfig(data.config);
        saveCachedDesktopConfig(merged);
        applyThemeAndAppearance(merged.appearance);
        set({
          config: merged,
          battery: data.battery ?? null,
          fps: data.fps ?? DEFAULT_FPS_TELEMETRY,
          capabilities: data.capabilities ?? DEFAULT_CAPABILITIES,
          isLoaded: true,
        });
      }
      if (startupRes.ok) {
        set({ startupStatus: await startupRes.json() });
      }
    } catch {
      set({ isLoaded: true });
    }
  },

  updateConfig: async (next) => {
    const merged = mergeConfig(next);
    saveCachedDesktopConfig(merged);
    applyThemeAndAppearance(merged.appearance);
    set({ config: merged });

    if (isTauriEnvironment()) {
      try {
        const saved = await invokeTauriCommand<DesktopConfig>('update_desktop_config', {
          config: merged,
        });
        const cleanSaved = mergeConfig(saved);
        saveCachedDesktopConfig(cleanSaved);
        set({ config: cleanSaved });
      } catch (err) {
        console.warn('[DesktopStore] update_desktop_config failed:', err);
      }
      return;
    }

    try {
      await fetch('/api/desktop/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(merged),
      });
    } catch {
      // ignore offline preview errors
    }
  },

  patchConfig: async (updater) => {
    const next = updater(get().config);
    await get().updateConfig(next);
  },

  updateAppearance: async (partial) => {
    const prev = get().config;
    const next: DesktopConfig = {
      ...prev,
      appearance: {
        ...prev.appearance,
        ...partial,
        metricColors: {
          ...prev.appearance.metricColors,
          ...(partial.metricColors || {}),
        },
      },
      // Synchronize shared widget/overlay visual appearance when updated from global Themes & Appearance
      widget: {
        ...prev.widget,
        opacity: partial.widgetOpacity ?? prev.widget.opacity,
        showBorder: partial.widgetBorder ?? prev.widget.showBorder,
        backgroundBlur: partial.backgroundBlur ?? prev.widget.backgroundBlur,
      },
    };
    await get().updateConfig(next);
  },

  toggleFloatingWidget: async (visible) => {
    const prev = get().config;
    const target = visible ?? !(prev.widget.enabled && prev.widget.visible);
    if (isTauriEnvironment()) {
      try {
        const updated = await invokeTauriCommand<DesktopConfig>('toggle_floating_widget', {
          visible: target,
        });
        get().applyConfigLocally(updated);
        return;
      } catch {
        // fallback below
      }
    }
    await get().updateConfig({
      ...prev,
      widget: { ...prev.widget, enabled: target, visible: target },
    });
  },

  toggleDesktopOverlay: async (visible) => {
    const prev = get().config;
    const target = visible ?? !(prev.overlay.enabled && prev.overlay.visible);
    if (isTauriEnvironment()) {
      try {
        const updated = await invokeTauriCommand<DesktopConfig>('toggle_desktop_overlay', {
          visible: target,
        });
        get().applyConfigLocally(updated);
        return;
      } catch {
        // fallback below
      }
    }
    await get().updateConfig({
      ...prev,
      overlay: { ...prev.overlay, enabled: target, visible: target },
    });
  },

  setClickThrough: async (target, enabled) => {
    if (isTauriEnvironment()) {
      try {
        const updated = await invokeTauriCommand<DesktopConfig>('set_window_click_through', {
          target,
          enabled: enabled ?? null,
        });
        get().applyConfigLocally(updated);
        return;
      } catch {
        // fallback below
      }
    }
    await get().patchConfig((prev) => {
      const next = structuredClone(prev);
      if (target === 'widget' || target === 'all') {
        next.widget.clickThrough = enabled ?? !prev.widget.clickThrough;
      }
      if (target === 'overlay' || target === 'all') {
        next.overlay.clickThrough = enabled ?? !prev.overlay.clickThrough;
      }
      if (target === 'gaming' || target === 'all') {
        next.gaming.clickThrough = enabled ?? !prev.gaming.clickThrough;
      }
      return next;
    });
  },

  updateShortcuts: async (shortcuts) => {
    set({ shortcutError: null });
    const combos = [
      shortcuts.toggleDashboard,
      shortcuts.toggleWidget,
      shortcuts.toggleGamingMode,
      shortcuts.toggleOverlay,
      shortcuts.toggleClickThrough,
    ].map((s) => s.trim().toLowerCase());

    if (combos.some((c) => !c)) {
      set({ shortcutError: 'All shortcut bindings must be non-empty.' });
      return false;
    }
    if (new Set(combos).size !== combos.length) {
      set({ shortcutError: 'Duplicate shortcut conflict detected. Each action must have a unique key binding.' });
      return false;
    }

    if (isTauriEnvironment()) {
      try {
        const status = await invokeTauriCommand<ShortcutStatus>('update_shortcuts', {
          shortcuts,
        });
        const nextCfg = { ...get().config, shortcuts };
        saveCachedDesktopConfig(nextCfg);
        set({ config: nextCfg, shortcutStatus: status, shortcutError: null });
        return true;
      } catch (err: any) {
        set({ shortcutError: err instanceof Error ? err.message : String(err) });
        return false;
      }
    }

    await get().patchConfig((prev) => ({ ...prev, shortcuts }));
    return true;
  },

  resetShortcuts: async () => {
    await get().updateShortcuts({ ...DEFAULT_DESKTOP_CONFIG.shortcuts });
  },

  applyStartupSettings: async (startup) => {
    set({ startupError: null });
    if (isTauriEnvironment()) {
      try {
        const status = await invokeTauriCommand<StartupStatus>('apply_startup_settings', {
          startupCfg: startup,
        });
        const nextCfg = { ...get().config, startup };
        saveCachedDesktopConfig(nextCfg);
        set({ config: nextCfg, startupStatus: status, startupError: null });
        return true;
      } catch (err: any) {
        set({ startupError: err instanceof Error ? err.message : String(err) });
        return false;
      }
    }

    await get().patchConfig((prev) => ({ ...prev, startup }));
    return true;
  },

  setBackgroundMonitoring: async (enabled, intervalMs) => {
    if (isTauriEnvironment()) {
      try {
        const updated = await invokeTauriCommand<DesktopConfig>('set_background_monitoring', {
          enabled,
          intervalMs: intervalMs ?? null,
        });
        get().applyConfigLocally(updated);
        return;
      } catch {
        // fallback below
      }
    }
    await get().patchConfig((prev) => ({
      ...prev,
      background: {
        ...prev.background,
        enabled,
        intervalMs: intervalMs ?? prev.background.intervalMs,
      },
    }));
  },

  setMonitoringActive: async (enabled) => {
    set({ monitoringActive: enabled });
    if (isTauriEnvironment()) {
      try {
        await invokeTauriCommand<boolean>('set_monitoring_enabled', { enabled });
      } catch {
        // ignore
      }
    }
  },

  addPinnedMetric: async (item) => {
    await get().patchConfig((prev) => ({
      ...prev,
      pinnedMetrics: [...prev.pinnedMetrics.filter((m) => m.id !== item.id), item],
    }));
  },

  removePinnedMetric: async (id) => {
    await get().patchConfig((prev) => ({
      ...prev,
      pinnedMetrics: prev.pinnedMetrics.filter((m) => m.id !== id),
    }));
  },

  updatePinnedMetric: async (id, patch) => {
    await get().patchConfig((prev) => ({
      ...prev,
      pinnedMetrics: prev.pinnedMetrics.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    }));
  },

  reorderPinnedMetrics: async (fromIndex, toIndex) => {
    await get().patchConfig((prev) => {
      const list = [...prev.pinnedMetrics];
      if (fromIndex < 0 || toIndex < 0 || fromIndex >= list.length || toIndex >= list.length) {
        return prev;
      }
      const [moved] = list.splice(fromIndex, 1);
      list.splice(toIndex, 0, moved);
      return { ...prev, pinnedMetrics: list };
    });
  },

  startWindowDrag: async () => {
    if (isTauriEnvironment()) {
      try {
        await invokeTauriCommand<void>('start_window_drag');
      } catch {
        // ignore
      }
    }
  },

  showMainWindow: async () => {
    if (isTauriEnvironment()) {
      try {
        await invokeTauriCommand<void>('show_main_window');
      } catch {
        // ignore
      }
    }
  },
}));
