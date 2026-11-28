import React from 'react';
import {
  Activity,
  GripHorizontal,
  Lock,
  Unlock,
  Pin,
  Settings,
  X,
} from 'lucide-react';
import { useSystemStore } from '../../store/systemStore';
import { useDesktopStore } from '../../stores/desktop-store';
import { useDesktopExperienceSync } from '../../hooks/use-desktop-widget';
import { useGlobalShortcuts } from '../../hooks/use-global-shortcuts';
import { resolvePinnedMetric, resolveTelemetryMetric } from '../../utils/desktopMetrics';
import { WidgetConfig } from '../../types/desktop';

interface FloatingWidgetWindowProps {
  previewConfig?: WidgetConfig;
  isPreview?: boolean;
}

export const FloatingWidgetWindow: React.FC<FloatingWidgetWindowProps> = ({
  previewConfig,
  isPreview = false,
}) => {
  useDesktopExperienceSync(!isPreview);
  useGlobalShortcuts(!isPreview);

  const overview = useSystemStore((s) => s.overview);
  const tempUnit = useSystemStore((s) => s.settings.tempUnit);
  const storeConfig = useDesktopStore((s) => s.config);
  const battery = useDesktopStore((s) => s.battery);
  const fps = useDesktopStore((s) => s.fps);
  const latencyMs = useDesktopStore((s) => s.latencyMs);
  const toggleFloatingWidget = useDesktopStore((s) => s.toggleFloatingWidget);
  const setClickThrough = useDesktopStore((s) => s.setClickThrough);
  const startWindowDrag = useDesktopStore((s) => s.startWindowDrag);
  const showMainWindow = useDesktopStore((s) => s.showMainWindow);

  const widgetCfg = previewConfig || storeConfig.widget;
  const appearance = storeConfig.appearance;
  const isDark =
    appearance.theme === 'dark' ||
    (appearance.theme === 'system' &&
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-color-scheme: dark)').matches);

  const getMetricColor = (key: string): string => {
    if (key.startsWith('cpu')) return appearance.metricColors.cpu;
    if (key.startsWith('gpu') || key === 'vram_usage') return appearance.metricColors.gpu;
    if (key === 'ram_usage') return appearance.metricColors.memory;
    if (key.startsWith('net')) return appearance.metricColors.network;
    if (key === 'battery') return appearance.metricColors.battery;
    if (key === 'fps') return appearance.metricColors.fps;
    return appearance.accentColor;
  };

  const resolvedMetrics = widgetCfg.metrics
    .map((key) =>
      resolveTelemetryMetric(key, overview, battery, fps, latencyMs, tempUnit, 'combined')
    )
    .filter((cell) => cell.supported || cell.key === 'fps'); // auto-hide unsupported hardware metrics

  const pinnedCells = widgetCfg.showPinnedSection
    ? storeConfig.pinnedMetrics
        .map((pin) =>
          resolvePinnedMetric(pin, overview, battery, fps, latencyMs, tempUnit)
        )
        .filter((cell) => cell.supported || cell.key === 'fps')
    : [];

  const opacity = Math.min(1, Math.max(0.25, widgetCfg.opacity));
  const bgStyle: React.CSSProperties = {
    backgroundColor: isDark ? `rgba(11, 17, 24, ${opacity})` : `rgba(255, 255, 255, ${opacity})`,
    borderRadius: `${appearance.cornerRadius}px`,
    backdropFilter: widgetCfg.backgroundBlur && appearance.backgroundBlur ? 'blur(14px)' : undefined,
    WebkitBackdropFilter:
      widgetCfg.backgroundBlur && appearance.backgroundBlur ? 'blur(14px)' : undefined,
    borderColor: widgetCfg.showBorder
      ? isDark
        ? 'rgba(56, 82, 110, 0.5)'
        : 'rgba(148, 163, 184, 0.55)'
      : 'transparent',
  };

  const severityColor = (sev: 'normal' | 'warning' | 'critical') => {
    if (sev === 'critical') return 'text-red-400';
    if (sev === 'warning') return 'text-amber-400';
    return isDark ? 'text-slate-100' : 'text-slate-900';
  };

  const isMinimal = widgetCfg.layoutMode === 'minimal';
  const isCompact = widgetCfg.layoutMode === 'compact';

  return (
    <div
      style={bgStyle}
      className={`h-full w-full border shadow-xl flex flex-col overflow-hidden select-none font-mono-num transition-colors ${
        isDark ? 'text-slate-100' : 'text-slate-900'
      }`}
    >
      {/* Drag / Title Strip */}
      <div
        data-tauri-drag-region={!isPreview ? '' : undefined}
        onMouseDown={() => {
          if (!isPreview) void startWindowDrag();
        }}
        className={`flex items-center justify-between px-3 py-1.5 border-b cursor-move shrink-0 ${
          isDark ? 'border-slate-800/80 bg-slate-950/35' : 'border-slate-200/80 bg-slate-100/50'
        }`}
      >
        <div className="flex items-center gap-1.5 min-w-0 pointer-events-none">
          <Activity className="w-3.5 h-3.5 shrink-0" style={{ color: appearance.accentColor }} />
          <span className="text-[11px] font-bold tracking-wider truncate">SYSMON WIDGET</span>
          {widgetCfg.clickThrough && (
            <span className="text-[9px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
              LOCKED
            </span>
          )}
        </div>

        {!isPreview && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => void setClickThrough('widget')}
              title={
                widgetCfg.clickThrough
                  ? 'Unlock widget interactions (or press shortcut)'
                  : 'Enable click-through lock'
              }
              className={`p-1 rounded hover:bg-slate-500/20 cursor-pointer ${
                widgetCfg.clickThrough ? 'text-amber-400' : 'opacity-70 hover:opacity-100'
              }`}
            >
              {widgetCfg.clickThrough ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
            </button>
            <button
              onClick={() => void showMainWindow()}
              title="Open SysMon Pro Dashboard"
              className="p-1 rounded hover:bg-slate-500/20 opacity-70 hover:opacity-100 cursor-pointer"
            >
              <Settings className="w-3 h-3" />
            </button>
            <button
              onClick={() => void toggleFloatingWidget(false)}
              title="Hide Floating Widget"
              className="p-1 rounded hover:bg-red-500/20 hover:text-red-400 opacity-70 hover:opacity-100 cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {/* Main Telemetry Grid */}
      <div className={`flex-1 overflow-y-auto ${isMinimal ? 'p-2 space-y-1' : 'p-2.5 space-y-2.5'}`}>
        {isMinimal ? (
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
            {resolvedMetrics.map((m) => (
              <div key={m.key} className="flex items-center gap-1">
                <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>{m.shortLabel}</span>
                <span className={`font-bold ${severityColor(m.severity)}`}>{m.valueText}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className={`grid ${isCompact ? 'grid-cols-2 gap-1.5' : 'grid-cols-2 gap-2'}`}>
            {resolvedMetrics.map((m) => (
              <div
                key={m.key}
                className={`rounded-md border px-2 py-1.5 ${
                  isDark
                    ? 'bg-slate-950/45 border-slate-800/70'
                    : 'bg-slate-50/75 border-slate-200/80'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span
                    className={`text-[10px] truncate ${
                      isDark ? 'text-slate-400' : 'text-slate-500'
                    }`}
                  >
                    {m.label}
                  </span>
                  {m.key === 'fps' && !fps.available && (
                    <span
                      title={fps.requiredIntegration}
                      className="text-[9px] text-amber-400 shrink-0"
                    >
                      *
                    </span>
                  )}
                </div>
                <div className={`text-xs font-bold mt-0.5 truncate ${severityColor(m.severity)}`}>
                  {m.valueText}
                </div>
                {!isCompact && m.subText && (
                  <div
                    className={`text-[9px] truncate mt-0.5 ${
                      isDark ? 'text-slate-500' : 'text-slate-500'
                    }`}
                  >
                    {m.subText}
                  </div>
                )}
                {!isCompact && m.numericPercent !== null && (
                  <div
                    className={`mt-1 h-1 rounded-full overflow-hidden ${
                      isDark ? 'bg-slate-800' : 'bg-slate-200'
                    }`}
                  >
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${Math.min(100, Math.max(0, m.numericPercent))}%`,
                        backgroundColor:
                          m.severity === 'critical'
                            ? '#EF4444'
                            : m.severity === 'warning'
                            ? '#F59E0B'
                            : getMetricColor(m.key),
                      }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Pinned Important Metrics Section */}
        {!isMinimal && pinnedCells.length > 0 && (
          <div
            className={`pt-2 border-t ${
              isDark ? 'border-slate-800/80' : 'border-slate-200/80'
            }`}
          >
            <div className="flex items-center gap-1 mb-1.5 text-[10px] uppercase tracking-wider opacity-75">
              <Pin className="w-3 h-3" style={{ color: appearance.accentColor }} />
              <span>Pinned Metrics</span>
            </div>
            <div className="space-y-1">
              {pinnedCells.map((pin, idx) => (
                <div
                  key={`${pin.key}-${idx}`}
                  className={`flex items-center justify-between px-2 py-1 rounded text-[11px] ${
                    isDark ? 'bg-slate-950/35' : 'bg-slate-100/70'
                  }`}
                >
                  <span className={isDark ? 'text-slate-300' : 'text-slate-600'}>{pin.label}</span>
                  <span className={`font-semibold ${severityColor(pin.severity)}`}>
                    {pin.valueText}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Resize / Drag Hint */}
      {!isPreview && (
        <div
          className={`px-2.5 py-1 text-[9px] flex items-center justify-between border-t ${
            isDark ? 'border-slate-800/60 text-slate-500' : 'border-slate-200/60 text-slate-400'
          }`}
        >
          <span className="truncate">Drag bar to move • Edges to resize</span>
          <GripHorizontal className="w-3 h-3 shrink-0" />
        </div>
      )}
    </div>
  );
};
