import React, { useMemo } from 'react';
import { Activity } from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { BandwidthUnit, NetworkHistoryResponse, NetworkTimePeriod } from '../../types/system';
import { formatBandwidthRate } from '../../utils/formatters';

interface NetworkTrafficChartProps {
  history: NetworkHistoryResponse | null;
  selectedPeriod: NetworkTimePeriod;
  unit: BandwidthUnit;
  selectedInterface: string;
  onPeriodChange: (period: NetworkTimePeriod) => void;
  onUnitChange: (unit: BandwidthUnit) => void;
}

const PERIOD_OPTIONS: { value: NetworkTimePeriod; label: string }[] = [
  { value: '1m', label: '1m' },
  { value: '5m', label: '5m' },
  { value: '15m', label: '15m' },
  { value: '30m', label: '30m' },
  { value: '1h', label: '1h' },
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
];

export const NetworkTrafficChart: React.FC<NetworkTrafficChartProps> = ({
  history,
  selectedPeriod,
  unit,
  selectedInterface,
  onPeriodChange,
  onUnitChange,
}) => {
  const chartData = useMemo(() => {
    const pts = history?.points ?? [];
    return pts.map((p) => ({
      ...p,
      dlValue: unit === 'bits' ? p.downloadBytesSec * 8 : p.downloadBytesSec,
      ulValue: unit === 'bits' ? p.uploadBytesSec * 8 : p.uploadBytesSec,
    }));
  }, [history?.points, unit]);

  const formatAxisValue = (val: number) => {
    if (!Number.isFinite(val) || val <= 0) return unit === 'bits' ? '0 bps' : '0 B/s';
    const rawBytesPerSec = unit === 'bits' ? val / 8 : val;
    return formatBandwidthRate(rawBytesPerSec, unit, 1);
  };

  return (
    <div className="bg-[#0B1118] border border-[#1A2633] rounded-lg p-4">
      {/* Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex flex-wrap items-center gap-3 min-w-0">
          <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider font-mono-num flex items-center gap-2 whitespace-nowrap">
            <Activity className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            Real-Time Network Traffic
          </h3>
          <div className="flex items-center gap-3 text-[11px] font-mono-num">
            <span className="flex items-center gap-1.5 text-emerald-400 whitespace-nowrap">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
              Download
            </span>
            <span className="flex items-center gap-1.5 text-sky-400 whitespace-nowrap">
              <span className="w-2 h-2 rounded-full bg-sky-400 shrink-0" />
              Upload
            </span>
          </div>
        </div>

        {/* Controls: Time Range & Unit Switcher */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center bg-[#080B10] border border-[#1A2633] rounded p-0.5">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => onPeriodChange(opt.value)}
                className={`px-2 py-1 text-[11px] font-mono-num rounded transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  selectedPeriod === opt.value
                    ? 'bg-[#162230] text-cyan-300 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="inline-flex items-center bg-[#080B10] border border-[#1A2633] rounded p-0.5">
            <button
              type="button"
              onClick={() => onUnitChange('bytes')}
              className={`px-2 py-1 text-[11px] font-mono-num rounded transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                unit === 'bytes'
                  ? 'bg-[#162230] text-emerald-300 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Bytes/s
            </button>
            <button
              type="button"
              onClick={() => onUnitChange('bits')}
              className={`px-2 py-1 text-[11px] font-mono-num rounded transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                unit === 'bits'
                  ? 'bg-[#162230] text-sky-300 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Bits/s
            </button>
          </div>
        </div>
      </div>

      {/* Chart Area */}
      <div className="h-64 w-full">
        {chartData.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs text-slate-500 font-mono-num border border-dashed border-[#1A2633] rounded">
            Collecting initial network samples for {selectedInterface === 'all' ? 'All Interfaces' : selectedInterface}...
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
              <defs>
                <linearGradient id="netOverviewDlGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10B981" stopOpacity={0.32} />
                  <stop offset="95%" stopColor="#10B981" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="netOverviewUlGrad" x1="0" y1="0" x2="0" y2="1">
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
                  const point = payload[0]?.payload;
                  if (!point) return null;
                  return (
                    <div className="bg-[#080B10] border border-[#1A2633] rounded px-3 py-2 text-[11px] font-mono-num space-y-1 shadow-lg">
                      <div className="text-slate-300 font-semibold border-b border-[#1A2633] pb-1">
                        {point.timeLabel}
                      </div>
                      <div className="flex items-center justify-between gap-4 text-emerald-400">
                        <span>Download:</span>
                        <span className="font-semibold">
                          {formatBandwidthRate(point.downloadBytesSec, unit)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-4 text-sky-400">
                        <span>Upload:</span>
                        <span className="font-semibold">
                          {formatBandwidthRate(point.uploadBytesSec, unit)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-4 text-slate-400 pt-0.5 border-t border-[#141E28]">
                        <span>Active Sockets:</span>
                        <span className="text-slate-200">{point.activeConnections}</span>
                      </div>
                    </div>
                  );
                }}
              />
              <Area
                type="monotone"
                dataKey="dlValue"
                name="Download"
                stroke="#10B981"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#netOverviewDlGrad)"
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="ulValue"
                name="Upload"
                stroke="#38BDF8"
                strokeWidth={1.75}
                fillOpacity={1}
                fill="url(#netOverviewUlGrad)"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Footer Metadata Strip */}
      <div className="mt-3 pt-2.5 border-t border-[#141E28] flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400 font-mono-num">
        <span>
          Scope: <span className="text-slate-200">{selectedInterface === 'all' ? 'All Interfaces' : selectedInterface}</span>
          {' · '}Window: <span className="text-slate-200">{selectedPeriod}</span>
          {' · '}Samples: <span className="text-slate-200">{chartData.length}</span>
        </span>
        <span>
          Window Peak DL: <span className="text-emerald-400">{formatBandwidthRate(history?.peakDownloadBytesSec ?? 0, unit)}</span>
          {' · '}Window Peak UL: <span className="text-sky-400">{formatBandwidthRate(history?.peakUploadBytesSec ?? 0, unit)}</span>
        </span>
      </div>
    </div>
  );
};
