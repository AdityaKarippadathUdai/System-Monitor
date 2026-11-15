import React from 'react';
import {
  Cpu,
  Thermometer,
  Zap,
  Gauge,
  Layers,
  Activity,
  Server,
  Clock,
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
import { CpuCoreGrid } from '../components/CpuCoreGrid';
import { StatusIndicator } from '../components/StatusIndicator';
import { formatFrequency, formatTemperature, getResourceStatus } from '../utils/formatters';
import { CircularProgress } from '../components/CircularProgress';
import { useProcesses } from '../hooks/useProcesses';
import { ProcessTable } from '../components/ProcessTable';
import { ProcessDetails } from '../components/ProcessDetails';

export const CpuPage: React.FC = () => {
  const overview = useSystemStore((state) => state.overview);
  const metricHistory = useSystemStore((state) => state.metricHistory);
  const settings = useSystemStore((state) => state.settings);

  const {
    processes,
    totalCount,
    filteredCount,
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

  const { cpu } = overview;
  const status = getResourceStatus(cpu.usagePercent);

  // Top CPU consumers
  const topCpuProcesses = [...processes]
    .sort((a, b) => b.cpuPercent - a.cpuPercent)
    .slice(0, 6);

  return (
    <div className="space-y-4 p-4 max-w-[1600px] mx-auto select-none">
      {/* CPU Top Header Banner */}
      <div className="bg-[#0B1118] border border-[#1A2633] rounded-lg p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <Cpu className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100">{cpu.modelName}</h2>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 font-mono-num mt-0.5">
                {cpu.manufacturer && (
                  <>
                    <span className="text-slate-300 font-semibold">{cpu.manufacturer}</span>
                    <span>•</span>
                  </>
                )}
                <span>{cpu.coresCount} Physical Cores</span>
                <span>•</span>
                <span>{cpu.threadsCount} Logical Threads</span>
                {cpu.governor && (
                  <>
                    <span>•</span>
                    <span>
                      Policy: <strong className="text-slate-300">{cpu.governor}</strong>
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <StatusIndicator status={status} label={`CPU Load: ${cpu.usagePercent.toFixed(1)}%`} size="md" />
          </div>
        </div>

        {/* Top Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono-num">
          <div className="bg-[#101720] border border-[#14202c] rounded p-3 flex items-center gap-3">
            <CircularProgress
              value={cpu.usagePercent}
              size={76}
              strokeWidth={6}
              colorScheme="blue"
            />
            <div>
              <div className="text-[11px] text-slate-400">Total Usage</div>
              <div className="text-lg font-bold text-slate-100">{cpu.usagePercent.toFixed(1)}%</div>
            </div>
          </div>

          <div className="bg-[#101720] border border-[#14202c] rounded p-3 flex flex-col justify-between">
            <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
              <Gauge className="w-3.5 h-3.5 text-blue-400" />
              <span>Current Frequency</span>
            </div>
            <div className="text-xl font-bold text-slate-100 font-mono-num">
              {formatFrequency(cpu.frequencyGhz)}
            </div>
            <div className="text-[10px] text-slate-500">
              {cpu.maxFrequencyGhz !== null
                ? `Max Clock: ${formatFrequency(cpu.maxFrequencyGhz)}`
                : 'Live clock telemetry'}
            </div>
          </div>

          <div className="bg-[#101720] border border-[#14202c] rounded p-3 flex flex-col justify-between">
            <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
              <Thermometer className="w-3.5 h-3.5 text-red-400" />
              <span>Package Thermals</span>
            </div>
            <div className="text-xl font-bold text-slate-100 font-mono-num">
              {formatTemperature(cpu.temperatureC, settings.tempUnit)}
            </div>
            <div className="text-[10px] text-slate-500">
              {cpu.temperatureC !== null ? 'Hardware thermal sensor' : 'Sensor unsupported on host'}
            </div>
          </div>

          <div className="bg-[#101720] border border-[#14202c] rounded p-3 flex flex-col justify-between">
            <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
              <Server className="w-3.5 h-3.5 text-emerald-400" />
              <span>Load Average (1m, 5m, 15m)</span>
            </div>
            <div className="text-base font-bold text-slate-100 font-mono-num">
              {cpu.loadAverage ? cpu.loadAverage.map((v) => v.toFixed(2)).join('  ') : 'N/A'}
            </div>
            <div className="text-[10px] text-slate-500">
              L1: {cpu.cache.l1 || 'N/A'} | L2: {cpu.cache.l2 || 'N/A'} | L3: {cpu.cache.l3 || 'N/A'}
            </div>
          </div>
        </div>
      </div>

      {/* Real-time CPU Usage & Thermal Chart */}
      <div className="bg-[#0B1118] border border-[#1A2633] rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider font-mono-num flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-blue-400" />
            CPU Utilization & Temperature History
          </h3>
          <div className="flex items-center gap-4 text-xs font-mono-num">
            <span className="flex items-center gap-1.5 text-blue-400">
              <span className="w-2 h-2 rounded-full bg-blue-500" /> CPU Usage (%)
            </span>
            <span className="flex items-center gap-1.5 text-red-400">
              <span className="w-2 h-2 rounded-full bg-red-500" /> Temperature (°C)
            </span>
          </div>
        </div>

        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={metricHistory} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="cpuArea" x1="0" y1="0" x2="0" y2="1">
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
                dataKey="cpu"
                name="CPU Usage"
                stroke="#3B82F6"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#cpuArea)"
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="cpuTemp"
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

      {/* Per Core Usage Grid */}
      <CpuCoreGrid cores={cpu.perCoreUsage} frequencyGhz={cpu.frequencyGhz} />

      {/* Top CPU Consuming Processes */}
      <div>
        <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider font-mono-num mb-2">
          Top CPU Consumers
        </h3>
        <ProcessTable
          processes={topCpuProcesses}
          totalCount={totalCount}
          filteredCount={topCpuProcesses.length}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          activeCategory={activeCategory}
          onCategoryChange={setActiveCategory}
          sortField={sortField}
          sortOrder={sortOrder}
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
