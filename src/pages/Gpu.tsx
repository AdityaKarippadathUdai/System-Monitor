import React from 'react';
import {
  MonitorCog,
  Activity,
  Thermometer,
  Zap,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { useSystemStore } from '../store/systemStore';
import { GpuCard } from '../components/GpuCard';
import { useProcesses } from '../hooks/useProcesses';
import { ProcessTable } from '../components/ProcessTable';
import { ProcessDetails } from '../components/ProcessDetails';

import { formatPercent, formatTemperature } from '../utils/formatters';

export const GpuPage: React.FC = () => {
  const overview = useSystemStore((state) => state.overview);
  const metricHistory = useSystemStore((state) => state.metricHistory);
  const activeGpuId = useSystemStore((state) => state.activeGpuId);
  const setActiveGpuId = useSystemStore((state) => state.setActiveGpuId);
  const settings = useSystemStore((state) => state.settings);

  const {
    processes,
    totalCount,
    searchQuery,
    setSearchQuery,
    activeCategory,
    setActiveCategory,
    sortField,
    sortOrder,
    handleSort,
    selectedProcess,
    setSelectedProcess,
    killProcess,
  } = useProcesses();

  if (!overview) return null;

  const { gpus } = overview;
  const activeGpu = gpus.find((g) => g.id === activeGpuId) || gpus[0] || null;

  // Top GPU consumers
  const topGpuProcesses = [...processes]
    .filter((p) => (p.gpuPercent ?? 0) > 0 || (p.vramBytes ?? 0) > 0)
    .sort((a, b) => (b.gpuPercent ?? 0) - (a.gpuPercent ?? 0))
    .slice(0, 6);

  return (
    <div className="space-y-4 p-4 max-w-[1600px] mx-auto select-none">
      {/* GPU Detail Card Component */}
      <GpuCard
        gpus={gpus}
        activeGpuId={activeGpuId}
        onSelectGpu={setActiveGpuId}
      />

      {/* GPU & VRAM Historical Trend Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* GPU Core Utilization History */}
        <div className="bg-[#0B1118] border border-[#1A2633] rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider font-mono-num flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-cyan-400" />
              GPU Core Activity & Thermals
            </h3>
            <div className="flex items-center gap-3 text-xs font-mono-num">
              <span className="text-cyan-400">
                Core: {activeGpu ? formatPercent(activeGpu.utilizationPercent) : 'N/A'}
              </span>
              <span className="text-red-400">
                Temp: {activeGpu ? formatTemperature(activeGpu.temperatureC, settings.tempUnit) : 'N/A'}
              </span>
            </div>
          </div>

          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={metricHistory} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="gpuUtilGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06B6D4" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#06B6D4" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#141E28" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="timeLabel"
                  stroke="#475569"
                  tick={{ fill: '#64748B', fontSize: 10, fontFamily: 'monospace' }}
                  tickLine={false}
                  axisLine={{ stroke: '#1A2633' }}
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
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0B1118',
                    borderColor: '#1A2633',
                    fontFamily: 'monospace',
                    fontSize: '11px',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="gpu"
                  name="GPU Load"
                  stroke="#06B6D4"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#gpuUtilGrad)"
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="gpuTemp"
                  name="Temp (°C)"
                  stroke="#EF4444"
                  strokeWidth={1.5}
                  dot={false}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Dedicated VRAM History */}
        <div className="bg-[#0B1118] border border-[#1A2633] rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider font-mono-num flex items-center gap-2">
              <MonitorCog className="w-3.5 h-3.5 text-blue-400" />
              VRAM Allocation Breakdown
            </h3>
            <span className="text-xs font-mono-num text-blue-400">
              Allocated: {activeGpu ? formatPercent(activeGpu.vramUsagePercent) : 'N/A'}
            </span>
          </div>

          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={metricHistory} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="vramGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#141E28" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="timeLabel"
                  stroke="#475569"
                  tick={{ fill: '#64748B', fontSize: 10, fontFamily: 'monospace' }}
                  tickLine={false}
                  axisLine={{ stroke: '#1A2633' }}
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
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0B1118',
                    borderColor: '#1A2633',
                    fontFamily: 'monospace',
                    fontSize: '11px',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="vram"
                  name="VRAM Usage (%)"
                  stroke="#3B82F6"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#vramGrad)"
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* GPU Accelerating Applications */}
      <div>
        <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider font-mono-num mb-2">
          GPU & VRAM Consumer Processes
        </h3>
        <ProcessTable
          processes={topGpuProcesses}
          totalCount={totalCount}
          filteredCount={topGpuProcesses.length}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          activeCategory={activeCategory}
          onCategoryChange={setActiveCategory}
          sortField="gpuPercent"
          sortOrder="desc"
          onSort={handleSort}
          selectedProcess={selectedProcess}
          onSelectProcess={setSelectedProcess}
          isCompact={true}
        />
      </div>

      {selectedProcess && (
        <ProcessDetails
          process={selectedProcess}
          onClose={() => setSelectedProcess(null)}
          onKillProcess={killProcess}
        />
      )}
    </div>
  );
};
