import React from 'react';
import { History, TrendingUp } from 'lucide-react';
import {
  BandwidthUnit,
  NetworkAttributionCapabilities,
  NetworkHistoryResponse,
  NetworkTimePeriod,
} from '../../types/system';
import { formatBandwidthRate, formatBytes } from '../../utils/formatters';
import { AppIconBadge } from './AppIconBadge';

interface NetworkHistoryAnalyticsProps {
  history: NetworkHistoryResponse | null;
  analyticsPeriod: NetworkTimePeriod;
  unit: BandwidthUnit;
  capabilities?: NetworkAttributionCapabilities;
  onPeriodChange: (period: NetworkTimePeriod) => void;
  onSelectApp: (pid: number) => void;
}

const ANALYTICS_PERIODS: { value: NetworkTimePeriod; label: string }[] = [
  { value: '5m', label: '5m' },
  { value: '30m', label: '30m' },
  { value: '1h', label: '1h' },
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
];

export const NetworkHistoryAnalytics: React.FC<NetworkHistoryAnalyticsProps> = ({
  history,
  analyticsPeriod,
  unit,
  capabilities,
  onPeriodChange,
  onSelectApp,
}) => {
  const topApps = history?.topApplications ?? [];

  return (
    <div className="bg-[#0B1118] border border-[#1A2633] rounded-lg p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider font-mono-num flex items-center gap-2">
            <History className="w-3.5 h-3.5 text-cyan-400" />
            Historical Bandwidth Analytics
          </h3>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Local persisted network volume, peak speeds, and top recorded applications
          </p>
        </div>

        <div className="inline-flex items-center bg-[#080B10] border border-[#1A2633] rounded p-0.5">
          {ANALYTICS_PERIODS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onPeriodChange(opt.value)}
              className={`px-2.5 py-1 text-[11px] font-mono-num rounded transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                analyticsPeriod === opt.value
                  ? 'bg-[#162230] text-cyan-300 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 font-mono-num">
        <div className="bg-[#101720] border border-[#14202c] rounded-lg p-3">
          <div className="text-[11px] text-slate-400">Window Downloaded</div>
          <div className="text-base font-bold text-emerald-400 mt-1">
            {formatBytes(history?.totalDownloadedBytes ?? 0)}
          </div>
        </div>
        <div className="bg-[#101720] border border-[#14202c] rounded-lg p-3">
          <div className="text-[11px] text-slate-400">Window Uploaded</div>
          <div className="text-base font-bold text-sky-400 mt-1">
            {formatBytes(history?.totalUploadedBytes ?? 0)}
          </div>
        </div>
        <div className="bg-[#101720] border border-[#14202c] rounded-lg p-3">
          <div className="text-[11px] text-slate-400">Peak Download Rate</div>
          <div className="text-base font-bold text-slate-100 mt-1">
            {formatBandwidthRate(history?.peakDownloadBytesSec ?? 0, unit)}
          </div>
        </div>
        <div className="bg-[#101720] border border-[#14202c] rounded-lg p-3">
          <div className="text-[11px] text-slate-400">Peak Upload Rate</div>
          <div className="text-base font-bold text-slate-100 mt-1">
            {formatBandwidthRate(history?.peakUploadBytesSec ?? 0, unit)}
          </div>
        </div>
      </div>

      {/* Top Historical Applications */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-[11px] font-mono-num text-slate-400">
          <span className="flex items-center gap-1.5 text-slate-300 font-semibold uppercase tracking-wider">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
            Top Recorded Consumers ({topApps.length})
          </span>
          {capabilities && !capabilities.perProcessBytesSupported && (
            <span className="text-amber-400/90">Per-process historical bytes unavailable in current mode</span>
          )}
        </div>

        {topApps.length === 0 ? (
          <div className="bg-[#080B10] border border-[#14202c] rounded p-3 text-xs text-slate-500 font-mono-num">
            {capabilities && !capabilities.perProcessBytesSupported
              ? 'Per-application historical byte totals require native per-socket kernel byte counters (Tauri desktop app on Linux Netlink sock_diag or Windows Administrator EStats).'
              : 'No measured per-application bandwidth totals recorded yet in local history.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {topApps.slice(0, 6).map((app, index) => {
              const combined = app.totalDownloadedBytes + app.totalUploadedBytes;
              return (
                <button
                  key={`${app.pid}-${app.name}`}
                  type="button"
                  onClick={() => onSelectApp(app.pid)}
                  className="bg-[#101720] hover:bg-[#141E2A] border border-[#1A2633] rounded-lg p-3 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-[11px] text-slate-500 font-mono-num w-4 shrink-0">
                      #{index + 1}
                    </span>
                    <AppIconBadge name={app.name} size="sm" />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-200 truncate">
                        {app.name}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono-num">
                        PID {app.pid} · Peak DL {formatBandwidthRate(app.peakDownloadBytesSec, unit)}
                      </div>
                    </div>
                  </div>
                  <div className="text-right font-mono-num shrink-0">
                    <div className="text-xs font-bold text-slate-100">{formatBytes(combined)}</div>
                    <div className="text-[10px] text-slate-400">
                      <span className="text-emerald-400">{formatBytes(app.totalDownloadedBytes)}</span>
                      {' / '}
                      <span className="text-sky-400">{formatBytes(app.totalUploadedBytes)}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
