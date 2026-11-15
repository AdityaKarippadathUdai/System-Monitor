import React from 'react';
import {
  Network,
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
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
import { NetworkCard } from '../components/NetworkCard';
import { useProcesses } from '../hooks/useProcesses';
import { ProcessTable } from '../components/ProcessTable';
import { ProcessDetails } from '../components/ProcessDetails';

export const NetworkPage: React.FC = () => {
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

  const { network } = overview;

  // Top Network consumers
  const topNetProcesses = [...processes]
    .sort((a, b) => (b.netRxBytesSec + b.netTxBytesSec) - (a.netRxBytesSec + a.netTxBytesSec))
    .slice(0, 6);

  return (
    <div className="space-y-4 p-4 max-w-[1600px] mx-auto select-none">
      {/* Network Overview & Interfaces */}
      <NetworkCard network={network} />

      {/* Real-time Bandwidth Activity Chart */}
      <div className="bg-[#0B1118] border border-[#1A2633] rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider font-mono-num flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-emerald-400" />
            Network Traffic Rate (Inbound / Outbound MB/s)
          </h3>
          <div className="flex items-center gap-4 text-xs font-mono-num">
            <span className="flex items-center gap-1.5 text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-500" /> Inbound (RX MB/s)
            </span>
            <span className="flex items-center gap-1.5 text-pink-400">
              <span className="w-2 h-2 rounded-full bg-pink-500" /> Outbound (TX MB/s)
            </span>
          </div>
        </div>

        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={metricHistory} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="netRxGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10B981" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="netTxGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#EC4899" stopOpacity={0.3} />
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
                minTickGap={40}
              />
              <YAxis
                stroke="#475569"
                tick={{ fill: '#64748B', fontSize: 10, fontFamily: 'monospace' }}
                tickLine={false}
                axisLine={{ stroke: '#1A2633' }}
                tickFormatter={(v) => `${v} MB/s`}
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
                dataKey="netRxMB"
                name="Download (RX MB/s)"
                stroke="#10B981"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#netRxGrad)"
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="netTxMB"
                name="Upload (TX MB/s)"
                stroke="#EC4899"
                strokeWidth={1.5}
                fillOpacity={1}
                fill="url(#netTxGrad)"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top Network Consuming Processes */}
      <div>
        <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider font-mono-num mb-2">
          Processes With Active Network Traffic
        </h3>
        <ProcessTable
          processes={topNetProcesses}
          totalCount={totalCount}
          filteredCount={topNetProcesses.length}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          activeCategory={activeCategory}
          onCategoryChange={setActiveCategory}
          sortField="disk"
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
