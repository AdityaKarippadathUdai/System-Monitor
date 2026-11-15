import React from 'react';
import {
  MemoryStick,
  Layers,
  Activity,
  HardDrive,
  CheckCircle2,
  PieChart,
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
import { useSystemStore } from '../store/systemStore';
import { CircularProgress } from '../components/CircularProgress';
import { StatusIndicator } from '../components/StatusIndicator';
import { formatBytes, getResourceStatus } from '../utils/formatters';
import { UsageBar } from '../components/UsageBar';
import { useProcesses } from '../hooks/useProcesses';
import { ProcessTable } from '../components/ProcessTable';
import { ProcessDetails } from '../components/ProcessDetails';

export const MemoryPage: React.FC = () => {
  const overview = useSystemStore((state) => state.overview);
  const metricHistory = useSystemStore((state) => state.metricHistory);

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

  const { memory, systemInfo } = overview;
  const isWindows = systemInfo.platform.toLowerCase() === 'windows';
  const swapTitle = isWindows ? 'Page File (Virtual Memory)' : 'Swap Space (Virtual Memory)';
  const swapShort = isWindows ? 'Page File' : 'Swap';

  const ramStatus = getResourceStatus(memory.usagePercent);
  const swapStatus = getResourceStatus(memory.swapPercent);

  // Top RAM consumers
  const topRamProcesses = [...processes]
    .sort((a, b) => b.memoryBytes - a.memoryBytes)
    .slice(0, 6);

  const cachedPercent =
    memory.cachedBytes !== null && memory.totalBytes > 0
      ? (memory.cachedBytes / memory.totalBytes) * 100
      : 0;

  return (
    <div className="space-y-4 p-4 max-w-[1600px] mx-auto select-none">
      {/* Memory Top Gauges & Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Physical RAM Card */}
        <div className="bg-[#0B1118] border border-[#1A2633] rounded-lg p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <MemoryStick className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-100">Physical Memory (RAM)</h3>
                  <p className="text-xs text-slate-400 font-mono-num">
                    {memory.type
                      ? `${memory.type}${memory.speedMhz ? ` @ ${memory.speedMhz} MHz` : ''}`
                      : 'System Physical Memory'}
                  </p>
                </div>
              </div>
              <StatusIndicator status={ramStatus} label={`RAM: ${memory.usagePercent.toFixed(1)}%`} size="sm" />
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-6 my-4 bg-[#101720] border border-[#14202c] rounded-lg p-4">
              <CircularProgress
                value={memory.usagePercent}
                secondaryValue={cachedPercent}
                size={130}
                strokeWidth={10}
                label="RAM USED"
                subLabel={`${formatBytes(memory.usedBytes)}`}
                colorScheme="green"
              />

              <div className="space-y-2 font-mono-num text-xs flex-1 w-full">
                <div className="flex justify-between items-center py-1 border-b border-[#131c26]">
                  <span className="text-slate-400">Total Installed:</span>
                  <span className="text-slate-100 font-bold">{formatBytes(memory.totalBytes)}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-[#131c26]">
                  <span className="text-emerald-400">Used Memory:</span>
                  <span className="text-emerald-400 font-bold">
                    {formatBytes(memory.usedBytes)} ({memory.usagePercent.toFixed(1)}%)
                  </span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-[#131c26]">
                  <span className="text-slate-300">Cached / Buffers:</span>
                  <span className="text-slate-300 font-semibold">
                    {formatBytes(memory.cachedBytes)}
                    {memory.buffersBytes !== null ? ` / ${formatBytes(memory.buffersBytes)}` : ''}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-cyan-400">Available / Free:</span>
                  <span className="text-cyan-400 font-semibold">
                    {formatBytes(memory.availableBytes)} / {formatBytes(memory.freeBytes)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <UsageBar value={memory.usagePercent} secondaryValue={cachedPercent} height="sm" colorScheme="green" />
        </div>

        {/* Swap / Page File & Virtual Memory Card */}
        <div className="bg-[#0B1118] border border-[#1A2633] rounded-lg p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  <HardDrive className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-100">{swapTitle}</h3>
                  <p className="text-xs text-slate-400 font-mono-num">
                    {isWindows
                      ? 'Windows Page File & Commit Charge'
                      : 'Linux Kernel Swap / Backing Store'}
                  </p>
                </div>
              </div>
              <StatusIndicator status={swapStatus} label={`${swapShort}: ${memory.swapPercent.toFixed(1)}%`} size="sm" />
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-6 my-4 bg-[#101720] border border-[#14202c] rounded-lg p-4">
              <CircularProgress
                value={memory.swapPercent}
                size={130}
                strokeWidth={10}
                label={isWindows ? 'PAGE USED' : 'SWAP USED'}
                subLabel={`${formatBytes(memory.swapUsedBytes)}`}
                colorScheme="cyan"
              />

              <div className="space-y-2 font-mono-num text-xs flex-1 w-full">
                <div className="flex justify-between items-center py-1 border-b border-[#131c26]">
                  <span className="text-slate-400">Allocated {swapShort}:</span>
                  <span className="text-slate-100 font-bold">{formatBytes(memory.swapTotalBytes)}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-[#131c26]">
                  <span className="text-cyan-400">{swapShort} Used:</span>
                  <span className="text-cyan-400 font-bold">
                    {formatBytes(memory.swapUsedBytes)} ({memory.swapPercent.toFixed(1)}%)
                  </span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-[#131c26]">
                  <span className="text-slate-300">{swapShort} Free:</span>
                  <span className="text-slate-300 font-semibold">{formatBytes(memory.swapFreeBytes)}</span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-slate-400">Virtual Memory:</span>
                  <span className="text-slate-200">
                    {formatBytes(memory.virtualUsedBytes)} / {formatBytes(memory.virtualTotalBytes)} ({memory.virtualPercent.toFixed(1)}%)
                  </span>
                </div>
              </div>
            </div>
          </div>

          <UsageBar value={memory.swapPercent} height="sm" colorScheme="cyan" />
        </div>
      </div>

      {/* Memory Utilization Timeline Chart */}
      <div className="bg-[#0B1118] border border-[#1A2633] rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider font-mono-num flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-emerald-400" />
            RAM Allocation History
          </h3>
          <span className="text-xs font-mono-num text-emerald-400">
            Active: {formatBytes(memory.usedBytes)} ({memory.usagePercent}%)
          </span>
        </div>

        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={metricHistory} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="memAreaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10B981" stopOpacity={0.0} />
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
                dataKey="memory"
                name="RAM Used"
                stroke="#10B981"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#memAreaGrad)"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top Memory Consuming Processes */}
      <div>
        <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider font-mono-num mb-2">
          Top Memory (RAM) Consumers
        </h3>
        <ProcessTable
          processes={topRamProcesses}
          totalCount={totalCount}
          filteredCount={topRamProcesses.length}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          activeCategory={activeCategory}
          onCategoryChange={setActiveCategory}
          sortField="memoryBytes"
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
