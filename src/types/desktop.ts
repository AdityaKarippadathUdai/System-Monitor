import { SystemOverview } from './system';

export type WidgetLayoutMode = 'compact' | 'detailed' | 'minimal';
export type WidgetSizePreset = 'small' | 'medium' | 'large' | 'custom';
export type PositionPreset = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'custom';
export type ThemeMode = 'dark' | 'light' | 'system';
export type FontSizeScale = 'sm' | 'md' | 'lg';
export type UiDensity = 'compact' | 'comfortable';
export type PinnedDisplayFormat = 'percent' | 'absolute' | 'combined';

export type TelemetryMetricKey =
  | 'cpu_usage'
  | 'cpu_temp'
  | 'gpu_usage'
  | 'gpu_temp'
  | 'ram_usage'
  | 'vram_usage'
  | 'gpu_power'
  | 'net_down'
  | 'net_up'
  | 'net_latency'
  | 'battery'
  | 'fps';

export interface WidgetConfig {
  enabled: boolean;
  visible: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  alwaysOnTop: boolean;
  clickThrough: boolean;
  showBorder: boolean;
  backgroundBlur: boolean;
  layoutMode: WidgetLayoutMode;
  sizePreset: WidgetSizePreset;
  showPinnedSection: boolean;
  metrics: TelemetryMetricKey[];
}

export interface OverlayConfig {
  enabled: boolean;
  visible: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  alwaysOnTop: boolean;
  clickThrough: boolean;
  showBorder: boolean;
  backgroundBlur: boolean;
  positionPreset: PositionPreset;
  metrics: TelemetryMetricKey[];
}

export interface TrayConfig {
  enabled: boolean;
  minimizeToTrayOnClose: boolean;
  showTooltipMetrics: boolean;
  startMinimized: boolean;
}

export interface BackgroundMonitoringConfig {
  enabled: boolean;
  intervalMs: number;
  pauseWhenAllHidden: boolean;
}

export interface StartupConfig {
  launchAtLogin: boolean;
  startMinimized: boolean;
  startFloatingWidget: boolean;
  startBackgroundMonitoring: boolean;
  restoreWidgetPosition: boolean;
  manualGamingModeOnly: boolean;
}

export interface MetricColorsConfig {
  cpu: string;
  gpu: string;
  memory: string;
  network: string;
  battery: string;
  fps: string;
}

export interface AppearanceConfig {
  theme: ThemeMode;
  accentColor: string;
  widgetOpacity: number;
  widgetBorder: boolean;
  cornerRadius: number;
  fontSize: FontSizeScale;
  density: UiDensity;
  backgroundBlur: boolean;
  metricColors: MetricColorsConfig;
}

export interface ShortcutConfig {
  toggleDashboard: string;
  toggleWidget: string;
  toggleGamingMode: string;
  toggleOverlay: string;
  toggleClickThrough: string;
}

export interface GameOverlayPreference {
  enabled: boolean;
  compactMode?: boolean | null;
  positionPreset?: PositionPreset | null;
  metrics?: TelemetryMetricKey[] | null;
}

export interface GamingConfig {
  enabled: boolean;
  autoDetect: boolean;
  positionPreset: PositionPreset;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  compactMode: boolean;
  textSize: FontSizeScale;
  refreshIntervalMs: number;
  alwaysOnTop: boolean;
  clickThrough: boolean;
  metrics: TelemetryMetricKey[];
  latencyTarget: string;
  exclusions: string[];
  customGames: string[];
  perGameOverrides: Record<string, GameOverlayPreference>;
}

export interface PinnedMetricConfig {
  id: string;
  metric: TelemetryMetricKey;
  label: string;
  displayFormat: PinnedDisplayFormat;
  warningThreshold: number | null;
  criticalThreshold: number | null;
  compact: boolean;
}

export interface DesktopConfig {
  widget: WidgetConfig;
  overlay: OverlayConfig;
  tray: TrayConfig;
  background: BackgroundMonitoringConfig;
  startup: StartupConfig;
  appearance: AppearanceConfig;
  shortcuts: ShortcutConfig;
  gaming: GamingConfig;
  pinnedMetrics: PinnedMetricConfig[];
}

export interface BatteryStats {
  percent: number;
  isCharging: boolean;
  acOnline: boolean;
  state: string;
  timeRemainingSecs: number | null;
  powerWatts: number | null;
}

export interface FpsTelemetry {
  fps: number | null;
  frameTimeMs: number | null;
  source: string;
  activeGamePid: number | null;
  activeGameName: string | null;
  available: boolean;
  requiredIntegration: string;
}

export interface DetectedGame {
  pid: number;
  name: string;
  executablePath: string;
  detectionSource: string;
  isExcluded: boolean;
  mangohudActive: boolean;
}

export interface GamingStatus {
  active: boolean;
  autoActivated: boolean;
  detectedGames: DetectedGame[];
  activeGame: DetectedGame | null;
}

export interface DesktopPlatformCapabilities {
  platform: string;
  displayServer: string;
  desktopEnvironment: string;
  transparencySupported: boolean;
  blurSupported: boolean;
  clickThroughSupported: boolean;
  alwaysOnTopSupported: boolean;
  positioningSupported: boolean;
  globalShortcutsSupported: boolean;
  traySupported: boolean;
  limitations: string[];
}

export interface DesktopTelemetryPayload {
  overview: SystemOverview;
  battery: BatteryStats | null;
  fps: FpsTelemetry;
  gaming: GamingStatus;
  latencyMs: number | null;
  config: DesktopConfig;
  capabilities: DesktopPlatformCapabilities;
}

export interface ShortcutStatus {
  registered: string[];
  failed: string[];
  globalSupported: boolean;
  note: string;
}

export interface StartupStatus {
  enabled: boolean;
  mechanism: string;
  entryPath: string;
  note: string;
}

export type DashboardCardKind =
  | 'cpu'
  | 'memory'
  | 'gpu'
  | 'vram'
  | 'disk'
  | 'network'
  | 'temperature'
  | 'battery'
  | 'processes'
  | 'activity_chart'
  | 'cpu_cores'
  | 'system_details';

export interface DashboardCardLayoutItem {
  id: string;
  kind: DashboardCardKind;
  title: string;
  colSpan: 1 | 2 | 3 | 4;
  heightPreset: 'compact' | 'standard' | 'tall';
  visible: boolean;
}

export interface DashboardLayoutPreset {
  id: string;
  name: string;
  cards: DashboardCardLayoutItem[];
  updatedAt: number;
}
