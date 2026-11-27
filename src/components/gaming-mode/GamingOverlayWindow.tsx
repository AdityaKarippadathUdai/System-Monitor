import React from 'react';
import { Gamepad2, Info, X } from 'lucide-react';
import { useSystemStore } from '../../store/systemStore';
import { useDesktopStore } from '../../stores/desktop-store';
import { useGamingStore } from '../../stores/gaming-store';
import { useDesktopExperienceSync } from '../../hooks/use-desktop-widget';
import { useGlobalShortcuts } from '../../hooks/use-global-shortcuts';
import { resolveTelemetryMetric } from '../../utils/desktopMetrics';
import { GamingConfig } from '../../types/desktop';

interface GamingOverlayWindowProps {
  previewConfig?: GamingConfig;
  isPreview?: boolean;
}

export const GamingOverlayWindow: React.FC<GamingOverlayWindowProps> = ({
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
  const startWindowDrag = useDesktopStore((s) => s.startWindowDrag);
  const gamingStatus = useGamingStore((s) => s.status);
  const toggleGamingMode = useGamingStore((s) => s.toggleGamingMode);

  const gamingCfg = previewConfig || storeConfig.gaming;
  const activeGameName = gamingStatus.activeGame?.name;
  const gameOverride = activeGameName ? gamingCfg.perGameOverrides[activeGameName] : undefined;

  const isCompact = gameOverride?.compactMode ?? gamingCfg.compactMode;
  const metricKeys = gameOverride?.metrics ?? gamingCfg.metrics;

  const cells = metricKeys
    .map((key) =>
      resolveTelemetryMetric(key, overview, battery, fps, latencyMs, tempUnit, 'percent')
    )
    .filter((c) => c.supported || c.key === 'fps' || c.key === 'net_latency');

  const opacity = Math.min(1, Math.max(0.25, gamingCfg.opacity));

  return (
    <div
      style={{
        backgroundColor: `rgba(5, 8, 13, ${opacity})`,
        borderRadius: `${Math.max(6, storeConfig.appearance.cornerRadius - 2)}px`,
      }}
      className="h-full w-full border border-emerald-500/35 text-slate-100 font-mono-num select-none shadow-2xl flex flex-col overflow-hidden"
    >
      {/* Top HUD Header */}
      <div
        data-tauri-drag-region={!isPreview ? '' : undefined}
        onMouseDown={() => {
          if (!isPreview) void startWindowDrag();
        }}
        className="px-2.5 py-1 bg-black/50 border-b border-emerald-500/20 flex items-center justify-between gap-2 cursor-move shrink-0"
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <Gamepad2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span className="text-[10px] font-bold tracking-wider text-emerald-400 uppercase truncate">
            {activeGameName || 'GAMING HUD'}
          </span>
        </div>
        {!isPreview && (
          <button
            onClick={() => void toggleGamingMode(false)}
            title="Exit Gaming Mode"
            className="p-0.5 rounded hover:bg-red-500/20 text-slate-400 hover:text-red-400 cursor-pointer shrink-0"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Metrics HUD */}
      <div className={`flex-1 ${isCompact ? 'p-2 flex flex-wrap gap-x-3 gap-y-1 items-center' : 'p-2.5 space-y-1'}`}>
        {cells.map((cell) => {
          const isFps = cell.key === 'fps';
          const valueColor = isFps
            ? fps.available
              ? 'text-emerald-400'
              : 'text-amber-400'
            : cell.severity === 'critical'
            ? 'text-red-400'
            : cell.severity === 'warning'
            ? 'text-amber-400'
            : 'text-slate-100';

          return isCompact ? (
            <div key={cell.key} className="flex items-baseline gap-1 text-[11px] whitespace-nowrap">
              <span className="text-slate-400">{cell.shortLabel}</span>
              <span className={`font-bold ${valueColor}`}>{cell.valueText}</span>
            </div>
          ) : (
            <div key={cell.key} className="flex items-center justify-between text-[11px] gap-2">
              <span className="text-slate-400">{cell.label}</span>
              <span className={`font-bold ${valueColor}`}>
                {cell.valueText}
                {isFps && fps.available && fps.frameTimeMs !== null && (
                  <span className="text-[9px] text-slate-400 ml-1">({fps.frameTimeMs}ms)</span>
                )}
              </span>
            </div>
          );
        })}

        {!isCompact && metricKeys.includes('fps') && !fps.available && (
          <div className="mt-1.5 pt-1.5 border-t border-slate-800/80 flex items-start gap-1.5 text-[9px] text-amber-300/90 leading-tight">
            <Info className="w-3 h-3 shrink-0 mt-0.5" />
            <span>{fps.requiredIntegration}</span>
          </div>
        )}
      </div>
    </div>
  );
};
