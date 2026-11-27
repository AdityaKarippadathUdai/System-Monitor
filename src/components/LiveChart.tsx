import React, { useState } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { MetricHistoryPoint } from '../types/system';
import { Cpu, MemoryStick, MonitorCog, HardDrive, Network } from 'lucide-react';

interface LiveChartProps {
  data: MetricHistoryPoint[];
  className?: string;
  chartHeightClass?: string;
}

export const LiveChart: React.FC<LiveChartProps> = ({
  data,
  className = '',
  chartHeightClass = 'h-64',
}) => {
  const [showCpu, setShowCpu] = useState(true);
  const [showMemory, setShowMemory] = useState(true);
  const [showGpu, setShowGpu] = useState(true);
  const [showDisk, setShowDisk] = useState(false);
  const [showNetwork, setShowNetwork] = useState(false);

  const series = [
    {
      id: 'cpu',
      name: 'CPU Usage',
      color: '#3B82F6',
      active: showCpu,
      toggle: () => setShowCpu(!showCpu),
      icon: Cpu,
      unit: '%',
    },
    {
      id: 'memory',
      name: 'RAM Usage',
      color: '#10B981',
      active: showMemory,
      toggle: () => setShowMemory(!showMemory),
      icon: MemoryStick,
      unit: '%',
    },
    {
      id: 'gpu',
      name: 'GPU Usage',
      color: '#06B6D4',
      active: showGpu,
      toggle: () => setShowGpu(!showGpu),
      icon: MonitorCog,
      unit: '%',
    },
    {
      id: 'diskReadMB',
      name: 'Disk Read',
      color: '#F59E0B',
      active: showDisk,
      toggle: () => setShowDisk(!showDisk),
      icon: HardDrive,
      unit: 'MB/s',
    },
    {
      id: 'netRxMB',
      name: 'Network In',
      color: '#EC4899',
      active: showNetwork,
      toggle: () => setShowNetwork(!showNetwork),
      icon: Network,
      unit: 'MB/s',
    },
  ];

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-[#0B1118]/95 border border-[#1A2633] rounded-md p-2.5 shadow-xl font-mono-num text-xs backdrop-blur-sm z-50">
          <div className="text-slate-400 text-[11px] mb-1.5 pb-1 border-b border-[#1A2633] flex justify-between gap-4">
            <span>Time</span>
            <span className="text-slate-200">{label}</span>
          </div>
          <div className="space-y-1">
            {payload.map((item: any, idx: number) => (
              <div key={idx} className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-1.5">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-slate-300">{item.name}:</span>
                </div>
                <span className="text-slate-100 font-semibold">
                  {typeof item.value === 'number' ? item.value.toFixed(1) : item.value}{' '}
                  {item.unit || '%'}
                </span>
              </div>
            ))}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div
      id="system-activity-chart"
      className={`bg-[#0B1118] border border-[#1A2633] rounded-lg p-4 flex flex-col ${className}`}
    >
      {/* Header with Title and Toggle Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-100 tracking-tight flex items-center gap-2">
            System Activity
            <span className="text-[11px] font-normal text-slate-400 font-mono-num">
              (60s rolling telemetry)
            </span>
          </h3>
        </div>

        {/* Series Toggles */}
        <div className="flex flex-wrap items-center gap-1.5">
          {series.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                id={`toggle-${item.id}`}
                onClick={item.toggle}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono-num transition-colors border ${
                  item.active
                    ? 'bg-[#101720] border-[#1A2633] text-slate-100 shadow-sm'
                    : 'bg-transparent border-transparent text-slate-400 hover:text-slate-300'
                }`}
              >
                <span
                  className="w-2 h-2 rounded-full transition-opacity"
                  style={{
                    backgroundColor: item.color,
                    opacity: item.active ? 1 : 0.3,
                  }}
                />
                <Icon className="w-3.5 h-3.5 opacity-80" />
                <span className="hidden sm:inline">{item.name.replace(' Usage', '')}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Chart Area */}
      <div className={`${chartHeightClass} w-full`}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.0} />
              </linearGradient>
              <linearGradient id="memGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10B981" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#10B981" stopOpacity={0.0} />
              </linearGradient>
              <linearGradient id="gpuGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#06B6D4" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#06B6D4" stopOpacity={0.0} />
              </linearGradient>
              <linearGradient id="diskGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#F59E0B" stopOpacity={0.0} />
              </linearGradient>
              <linearGradient id="netGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#EC4899" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#EC4899" stopOpacity={0.0} />
              </linearGradient>
            </defs>

            <CartesianGrid stroke="#141E28" strokeDasharray="3 3" vertical={false} />

            <XAxis
              dataKey="timeLabel"
              stroke="#475569"
              tick={{ fill: '#64748B', fontSize: 10, fontFamily: 'monospace' }}
              tickLine={false}
              axisLine={{ stroke: '#1A2633' }}
              interval="preserveStartEnd"
              minTickGap={40}
            />

            <YAxis
              stroke="#475569"
              domain={[0, 100]}
              tick={{ fill: '#64748B', fontSize: 10, fontFamily: 'monospace' }}
              tickLine={false}
              axisLine={{ stroke: '#1A2633' }}
              tickFormatter={(v) => `${v}%`}
            />

            <Tooltip content={<CustomTooltip />} />

            {showCpu && (
              <Area
                type="monotone"
                name="CPU"
                dataKey="cpu"
                stroke="#3B82F6"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#cpuGrad)"
                isAnimationActive={false}
              />
            )}

            {showMemory && (
              <Area
                type="monotone"
                name="RAM"
                dataKey="memory"
                stroke="#10B981"
                strokeWidth={1.75}
                fillOpacity={1}
                fill="url(#memGrad)"
                isAnimationActive={false}
              />
            )}

            {showGpu && (
              <Area
                type="monotone"
                name="GPU"
                dataKey="gpu"
                stroke="#06B6D4"
                strokeWidth={1.75}
                fillOpacity={1}
                fill="url(#gpuGrad)"
                isAnimationActive={false}
              />
            )}

            {showDisk && (
              <Area
                type="monotone"
                name="Disk Read"
                dataKey="diskReadMB"
                stroke="#F59E0B"
                strokeWidth={1.5}
                fillOpacity={1}
                fill="url(#diskGrad)"
                isAnimationActive={false}
              />
            )}

            {showNetwork && (
              <Area
                type="monotone"
                name="Network In"
                dataKey="netRxMB"
                stroke="#EC4899"
                strokeWidth={1.5}
                fillOpacity={1}
                fill="url(#netGrad)"
                isAnimationActive={false}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
