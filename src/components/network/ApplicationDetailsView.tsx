import React, { useMemo } from 'react';
import {
  ArrowLeft,
  RefreshCw,
  ArrowDownLeft,
  ArrowUpRight,
  Download,
  Upload,
  AlertTriangle,
  Cable,
  Activity,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { BandwidthUnit, ProcessNetworkDetails } from '../../types/system';
import { formatBandwidthRate, formatBytes } from '../../utils/formatters';
import { AppIconBadge } from './AppIconBadge';

interface ApplicationDetailsViewProps {
  details: ProcessNetworkDetails | null;
  isLoading: boolean;
  unit: BandwidthUnit;
  onBack: () => void;
  onRefresh: () => void;
}

export const ApplicationDetailsView: React.FC<ApplicationDetailsViewProps> = ({
  details,
  isLoading,
  unit,
  onBack,
  onRefresh,
}) => {
  const chartData = useMemo(() => {
    if (!details) return [];
    return details.history.map((p) => ({
      ...p,
      dlValue: unit === 'bits' ? p.downloadBytesSec * 8 : p.downloadBytesSec,
      ulValue: unit === 'bits' ? p.uploadBytesSec * 8 : p.uploadBytesSec,
    }));
  }, [details, unit]);

  const formatAxisValue = (val: number) => {
    if (!Number.isFinite(val) || val <= 0) return unit === 'bits' ? '0 bps' : '0 B/s';
    const rawBytesPerSec = unit === 'bits' ? val / 8 : val;
    return formatBandwidthRate(rawBytesPerSec, unit, 1);
  };

  if (isLoading && !details) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={onBack}
          className="px-3 py-1.5 rounded bg-[#0B1118] hover:bg-[#101720] border border-[#1A2633] text-xs font-mono-num text-slate-200 inline-flex items-center gap-2 cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5 text-cyan-400" />
          Back to Network Monitor
        </button>
        <div className="bg-[#0B1118] border border-[#1A2633] rounded-lg p-8 text-center text-xs font-mono-num text-slate-400">
          Loading application network telemetry...
        </div>
      </div>
    );
  }

  if (!details) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={onBack}
          className="px-3 py-1.5 rounded bg-[#0B1118] hover:bg-[#101720] border border-[#1A2633] text-xs font-mono-num text-slate-200 inline-flex items-center gap-2 cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5 text-cyan-400" />
          Back to Network Monitor
        </button>
        <div className="bg-[#0B1118] border border-[#1A2633] rounded-lg p-8 text-center text-xs font-mono-num text-slate-400">
          This process is no longer active or has closed its network sockets.
        </div>
      </div>
    );
  }

  const { usage, connections, capabilities } = details;

  return (
    <div className="space-y-4">
      {/* Top Navigation & Process Header */}
      <div className="bg-[#0B1118] border border-[#1A2633] rounded-lg p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="px-3 py-1.5 rounded bg-[#101720] hover:bg-[#16202C] border border-[#1A2633] text-xs font-mono-num text-slate-200 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-cyan-400" />
            <span>Back to Network Monitor</span>
          </button>

          <AppIconBadge
            name={usage.name}
            executablePath={usage.executablePath}
            category={usage.category}
            size="lg"
          />

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-bold text-slate-100 truncate">{usage.name}</h2>
              <span className="text-xs font-mono-num text-slate-400">
                PID {usage.pid} · {usage.status}
                {usage.user ? ` · ${usage.user}` : ''}
              </span>
            </div>
            <div
              className="text-[11px] font-mono-num text-slate-500 truncate mt-0.5"
              title={usage.executablePath || 'Executable path unavailable'}
            >
              {usage.executablePath || 'Executable path unavailable'}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onRefresh}
          disabled={isLoading}
          className="px-3 py-1.5 rounded bg-[#101720] hover:bg-[#16202C] border border-[#1A2633] text-xs font-mono-num text-slate-200 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Unmeasured Telemetry Warning if Applicable */}
      {!usage.isMeasured && (
        <div className="bg-[#0B1118] border border-amber-500/30 rounded-lg px-4 py-3 text-xs text-amber-200/90 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold text-amber-300 font-mono-num">
              Per-Socket Byte Counters Unmeasured ({capabilities.platformMethod})
            </div>
            <p className="text-slate-300 mt-0.5">
              {capabilities.limitationReason ||
                'Active sockets are monitored directly, while per-process transfer bytes require elevated/native socket accounting.'}
            </p>
          </div>
        </div>
      )}

      {/* 4 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 font-mono-num">
        <div className="bg-[#0B1118] border border-[#1A2633] rounded-lg p-3.5">
          <div className="flex items-center justify-between text-[11px] text-slate-400 uppercase tracking-wider mb-1.5">
            <span>Download Speed</span>
            <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-xl font-bold text-emerald-400">
            {usage.isMeasured ? formatBandwidthRate(usage.downloadSpeedBytesSec, unit) : 'N/A'}
          </div>
        </div>

        <div className="bg-[#0B1118] border border-[#1A2633] rounded-lg p-3.5">
          <div className="flex items-center justify-between text-[11px] text-slate-400 uppercase tracking-wider mb-1.5">
            <span>Upload Speed</span>
            <ArrowUpRight className="w-3.5 h-3.5 text-sky-400" />
          </div>
          <div className="text-xl font-bold text-sky-400">
            {usage.isMeasured ? formatBandwidthRate(usage.uploadSpeedBytesSec, unit) : 'N/A'}
          </div>
        </div>

        <div className="bg-[#0B1118] border border-[#1A2633] rounded-lg p-3.5">
          <div className="flex items-center justify-between text-[11px] text-slate-400 uppercase tracking-wider mb-1.5">
            <span>Total Received</span>
            <Download className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-xl font-bold text-slate-100">
            {usage.isMeasured ? formatBytes(usage.totalDownloadedBytes) : 'N/A'}
          </div>
        </div>

        <div className="bg-[#0B1118] border border-[#1A2633] rounded-lg p-3.5">
          <div className="flex items-center justify-between text-[11px] text-slate-400 uppercase tracking-wider mb-1.5">
            <span>Total Transmitted</span>
            <Upload className="w-3.5 h-3.5 text-sky-400" />
          </div>
          <div className="text-xl font-bold text-slate-100">
            {usage.isMeasured ? formatBytes(usage.totalUploadedBytes) : 'N/A'}
          </div>
        </div>
      </div>

      {/* Historical App Traffic Graph */}
      <div className="bg-[#0B1118] border border-[#1A2633] rounded-lg p-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider font-mono-num flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-emerald-400" />
            Application Traffic History ({usage.name})
          </h3>
          <div className="flex items-center gap-3 text-[11px] font-mono-num">
            <span className="flex items-center gap-1.5 text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400" /> Download
            </span>
            <span className="flex items-center gap-1.5 text-sky-400">
              <span className="w-2 h-2 rounded-full bg-sky-400" /> Upload
            </span>
          </div>
        </div>

        <div className="h-52 w-full">
          {!usage.isMeasured || chartData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-slate-500 font-mono-num border border-dashed border-[#1A2633] rounded px-4 text-center">
              {!usage.isMeasured
                ? 'Per-application traffic history requires native kernel socket byte counters.'
                : 'Collecting per-application bandwidth samples...'}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="appDlGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="appUlGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#38BDF8" stopOpacity={0.28} />
                    <stop offset="95%" stopColor="#38BDF8" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#141E28" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="timeLabel"
                  stroke="#475569"
                  tick={{ fill: '#64748B', fontSize: 10, fontFamily: 'monospace' }}
                  tickLine={false}
                  axisLine={{ stroke: '#1A2633' }}
                  minTickGap={36}
                />
                <YAxis
                  stroke="#475569"
                  width={68}
                  tick={{ fill: '#64748B', fontSize: 10, fontFamily: 'monospace' }}
                  tickLine={false}
                  axisLine={{ stroke: '#1A2633' }}
                  tickFormatter={formatAxisValue}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload || payload.length === 0) return null;
                    const p = payload[0]?.payload;
                    if (!p) return null;
                    return (
                      <div className="bg-[#080B10] border border-[#1A2633] rounded px-3 py-2 text-[11px] font-mono-num space-y-1">
                        <div className="text-slate-300 font-semibold">{p.timeLabel}</div>
                        <div className="text-emerald-400">
                          DL: {formatBandwidthRate(p.downloadBytesSec, unit)}
                        </div>
                        <div className="text-sky-400">
                          UL: {formatBandwidthRate(p.uploadBytesSec, unit)}
                        </div>
                      </div>
                    );
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="dlValue"
                  stroke="#10B981"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#appDlGrad)"
                  isAnimationActive={false}
                />
                <Area
                  type="monotone"
                  dataKey="ulValue"
                  stroke="#38BDF8"
                  strokeWidth={1.75}
                  fillOpacity={1}
                  fill="url(#appUlGrad)"
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Active Remote Connections for this Process */}
      <div className="bg-[#0B1118] border border-[#1A2633] rounded-lg overflow-hidden">
        <div className="p-4 border-b border-[#1A2633] flex items-center justify-between">
          <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider font-mono-num flex items-center gap-2">
            <Cable className="w-3.5 h-3.5 text-cyan-400" />
            Active Remote Connections ({connections.length})
          </h3>
          <span className="text-[11px] font-mono-num text-slate-400">
            {usage.activeConnections} active · {usage.totalSockets} total sockets
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs font-mono-num">
            <thead>
              <tr className="bg-[#080B10] border-b border-[#1A2633] text-[10px] uppercase tracking-wider text-slate-400">
                <th className="py-2.5 px-3.5">Protocol</th>
                <th className="py-2.5 px-3">Local Address</th>
                <th className="py-2.5 px-3">Remote Endpoint</th>
                <th className="py-2.5 px-3">State</th>
                <th className="py-2.5 px-3 text-right">RX Traffic</th>
                <th className="py-2.5 px-3.5 text-right">TX Traffic</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#141E28]">
              {connections.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-500">
                    No open sockets currently attached to PID {usage.pid}.
                  </td>
                </tr>
              ) : (
                connections.map((conn) => (
                  <tr key={conn.id} className="hover:bg-[#101720]">
                    <td className="py-2 px-3.5 text-cyan-300 font-semibold whitespace-nowrap">
                      {conn.protocol}
                    </td>
                    <td className="py-2 px-3 text-slate-300 whitespace-nowrap">
                      {conn.localAddress}:{conn.localPort}
                    </td>
                    <td className="py-2 px-3 text-slate-200 whitespace-nowrap">
                      {conn.remoteAddress}
                      {conn.remotePort !== null ? `:${conn.remotePort}` : ''}
                    </td>
                    <td className="py-2 px-3 whitespace-nowrap">
                      <span
                        className={
                          conn.state === 'ESTABLISHED'
                            ? 'text-emerald-400'
                            : conn.state === 'LISTEN'
                            ? 'text-sky-400'
                            : 'text-slate-400'
                        }
                      >
                        {conn.state}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right whitespace-nowrap">
                      {conn.rxSpeedBytesSec !== null ? (
                        <div>
                          <div className="text-emerald-400">
                            {formatBandwidthRate(conn.rxSpeedBytesSec, unit)}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {formatBytes(conn.rxBytesTotal)}
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    <td className="py-2 px-3.5 text-right whitespace-nowrap">
                      {conn.txSpeedBytesSec !== null ? (
                        <div>
                          <div className="text-sky-400">
                            {formatBandwidthRate(conn.txSpeedBytesSec, unit)}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {formatBytes(conn.txBytesTotal)}
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
