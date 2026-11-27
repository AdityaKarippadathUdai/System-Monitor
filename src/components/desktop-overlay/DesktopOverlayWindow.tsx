import React from 'react';
import { GripVertical, Lock, Unlock, X } from 'lucide-react';
import { useSystemStore } from '../../store/systemStore';
import { useDesktopStore } from '../../stores/desktop-store';
import { useDesktopExperienceSync } from '../../hooks/use-desktop-widget';
import { useGlobalShortcuts } from '../../hooks/use-global-shortcuts';
import { resolveTelemetryMetric } from '../../utils/desktopMetrics';
import { OverlayConfig } from '../../types/desktop';

interface DesktopOverlayWindowProps {
  previewConfig?: OverlayConfig;
  isPreview?: boolean;
}

export const DesktopOverlayWindow: React.FC<DesktopOverlayWindowProps> = ({
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
  const toggleDesktopOverlay = useDesktopStore((s) => s.toggleDesktopOverlay);
  const setClickThrough = useDesktopStore((s) => s.setClickThrough);
  const startWindowDrag = useDesktopStore((s) => s.startWindowDrag);

  const overlayCfg = previewConfig || storeConfig.overlay;
  const appearance = storeConfig.appearance;
  const isDark =
    appearance.theme === 'dark' ||
    (appearance.theme === 'system' &&
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-color-scheme: dark)').matches);

  const cells = overlayCfg.metrics
    .map((key) => resolveTelemetryMetric(key, overview, battery, fps, latencyMs, tempUnit, 'percent'))
    .filter((c) => c.supported || c.key !== 'battery');

  const opacity = Math.min(1, Math.max(0.2, overlayCfg.opacity));

  return (
    <div
      style={{
        backgroundColor: isDark
          ? `rgba(8, 12, 18, ${opacity})`
          : `rgba(255, 255, 255, ${opacity})`,
        borderRadius: `${appearance.cornerRadius}px`,
        backdropFilter:
          overlayCfg.backgroundBlur && appearance.backgroundBlur ? 'blur(12px)' : undefined,
        WebkitBackdropFilter:
          overlayCfg.backgroundBlur && appearance.backgroundBlur ? 'blur(12px)' : undefined,
        borderColor: overlayCfg.showBorder
          ? isDark
            ? 'rgba(56, 82, 110, 0.45)'
            : 'rgba(148, 163, 184, 0.5)'
          : 'transparent',
      }}
      className={`h-full w-full border px-2.5 py-1.5 flex items-center justify-between gap-3 select-none font-mono-num shadow-lg ${
        isDark ? 'text-slate-100' : 'text-slate-900'
      }`}
    >
      <div
        data-tauri-drag-region={!isPreview ? '' : undefined}
        onMouseDown={() => {
          if (!isPreview) void startWindowDrag();
        }}
        className="flex items-center gap-2.5 flex-wrap cursor-move flex-1 min-w-0"
      >
        <GripVertical className="w-3.5 h-3.5 opacity-50 shrink-0" />
        {cells.map((cell) => (
          <div key={cell.key} className="flex items-baseline gap-1 text-[11px] whitespace-nowrap">
            <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>
              {cell.shortLabel}
            </span>
            <span
              className={`font-bold ${
                cell.severity === 'critical'
                  ? 'text-red-400'
                  : cell.severity === 'warning'
                  ? 'text-amber-400'
                  : ''
              }`}
            >
              {cell.valueText}
            </span>
          </div>
        ))}
      </div>

      {!isPreview && (
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => void setClickThrough('overlay')}
            title="Toggle Overlay Click-Through"
            className={`p-1 rounded hover:bg-slate-500/20 cursor-pointer ${
              overlayCfg.clickThrough ? 'text-amber-400' : 'opacity-70'
            }`}
          >
            {overlayCfg.clickThrough ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
          </button>
          <button
            onClick={() => void toggleDesktopOverlay(false)}
            title="Hide Desktop Overlay"
            className="p-1 rounded hover:bg-red-500/20 hover:text-red-400 opacity-70 cursor-pointer"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
};
