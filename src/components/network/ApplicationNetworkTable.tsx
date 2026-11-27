import React, { useMemo, useState } from 'react';
import {
  Search,
  RefreshCw,
  ArrowUpDown,
  ChevronUp,
  ChevronDown,
  AlertTriangle,
  ChevronRight,
  Layers,
} from 'lucide-react';
import {
  BandwidthUnit,
  NetworkAttributionCapabilities,
  ProcessNetworkUsage,
} from '../../types/system';
import { formatBandwidthRate, formatBytes } from '../../utils/formatters';
import { AppIconBadge } from './AppIconBadge';

interface ApplicationNetworkTableProps {
  processes: ProcessNetworkUsage[];
  capabilities?: NetworkAttributionCapabilities;
  unit: BandwidthUnit;
  isRefreshing: boolean;
  onRefresh: () => void;
  onSelectApp: (pid: number) => void;
}

type AppFilter = 'all' | 'active' | 'connected' | 'inactive';
type AppSortField =
  | 'downloadSpeed'
  | 'uploadSpeed'
  | 'totalDownloaded'
  | 'totalUploaded'
  | 'combined'
  | 'share'
  | 'connections'
  | 'name'
  | 'pid';

export const ApplicationNetworkTable: React.FC<ApplicationNetworkTableProps> = ({
  processes,
  capabilities,
  unit,
  isRefreshing,
  onRefresh,
  onSelectApp,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<AppFilter>('all');
  const [sortField, setSortField] = useState<AppSortField>('downloadSpeed');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const handleSort = (field: AppSortField) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortField(field);
      setSortOrder(field === 'name' ? 'asc' : 'desc');
    }
  };

  const filteredAndSorted = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    const filtered = processes.filter((p) => {
      if (filter === 'active') {
        const hasTraffic =
          (p.downloadSpeedBytesSec ?? 0) > 0 || (p.uploadSpeedBytesSec ?? 0) > 0;
        if (!hasTraffic && p.activeConnections === 0) return false;
      } else if (filter === 'connected') {
        if (p.activeConnections === 0) return false;
      } else if (filter === 'inactive') {
        const hasTraffic =
          (p.downloadSpeedBytesSec ?? 0) > 0 || (p.uploadSpeedBytesSec ?? 0) > 0;
        if (hasTraffic || p.activeConnections > 0) return false;
      }

      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        String(p.pid).includes(q) ||
        (p.executablePath && p.executablePath.toLowerCase().includes(q)) ||
        p.protocols.some((proto) => proto.toLowerCase().includes(q))
      );
    });

    const mult = sortOrder === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const val = (item: ProcessNetworkUsage): number | string => {
        switch (sortField) {
          case 'downloadSpeed':
            return item.downloadSpeedBytesSec ?? -1;
          case 'uploadSpeed':
            return item.uploadSpeedBytesSec ?? -1;
          case 'totalDownloaded':
            return item.totalDownloadedBytes ?? -1;
          case 'totalUploaded':
            return item.totalUploadedBytes ?? -1;
          case 'combined':
            return item.combinedTotalBytes ?? item.combinedSpeedBytesSec ?? -1;
          case 'share':
            return item.trafficSharePercent ?? -1;
          case 'connections':
            return item.activeConnections * 1000 + item.totalSockets;
          case 'pid':
            return item.pid;
          case 'name':
            return item.name.toLowerCase();
        }
      };

      const av = val(a);
      const bv = val(b);
      if (typeof av === 'string' && typeof bv === 'string') {
        return av.localeCompare(bv) * mult;
      }
      if (av === bv) {
        if (b.activeConnections !== a.activeConnections) {
          return b.activeConnections - a.activeConnections;
        }
        return a.pid - b.pid;
      }
      return ((av as number) - (bv as number)) * mult;
    });
  }, [processes, searchQuery, filter, sortField, sortOrder]);

  const showCapabilityNotice =
    capabilities &&
    (capabilities.level !== 'full' || capabilities.unreadableProcessCount > 0);

  const renderSortIcon = (field: AppSortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3 h-3 text-slate-600 inline ml-1" />;
    }
    return sortOrder === 'asc' ? (
      <ChevronUp className="w-3 h-3 text-cyan-400 inline ml-1" />
    ) : (
      <ChevronDown className="w-3 h-3 text-cyan-400 inline ml-1" />
    );
  };

  return (
    <div className="bg-[#0B1118] border border-[#1A2633] rounded-lg overflow-hidden">
      {/* Section Header & Controls */}
      <div className="p-4 border-b border-[#1A2633] space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-xs font-semibold text-slate-100 uppercase tracking-wider font-mono-num flex items-center gap-2">
              <Layers className="w-3.5 h-3.5 text-emerald-400" />
              Application Network Usage
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5 font-mono-num">
              Showing {filteredAndSorted.length} of {processes.length} processes with network sockets · Click any row for socket details
            </p>
          </div>

          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="px-2.5 py-1.5 rounded bg-[#101720] hover:bg-[#16202C] border border-[#1A2633] text-xs font-mono-num text-slate-300 flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        {/* Capability / Privilege Transparency Notice */}
        {showCapabilityNotice && capabilities && (
          <div className="bg-[#101720] border border-amber-500/30 rounded-md px-3 py-2 text-[11px] text-amber-200/90 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <div className="font-semibold text-amber-300 font-mono-num">
                Attribution Mode: {capabilities.level.toUpperCase()} ({capabilities.platformMethod})
              </div>
              <div className="text-slate-300 leading-relaxed">
                {capabilities.limitationReason ||
                  'Some per-process socket byte counters are restricted by OS permissions.'}
                {capabilities.unreadableProcessCount > 0 && (
                  <span className="text-amber-300 font-mono-num">
                    {' '}
                    ({capabilities.unreadableProcessCount} processes unreadable without elevated privileges)
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Filter & Search Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search application, PID, path, protocol..."
              className="w-full bg-[#080B10] border border-[#1A2633] focus:border-cyan-500 focus:outline-none rounded pl-8 pr-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 font-mono-num"
            />
          </div>

          <div className="inline-flex items-center bg-[#080B10] border border-[#1A2633] rounded p-0.5">
            {(
              [
                { key: 'all', label: 'All' },
                { key: 'active', label: 'Active' },
                { key: 'connected', label: 'Connected' },
                { key: 'inactive', label: 'Idle / Listening' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setFilter(tab.key)}
                className={`px-2.5 py-1 text-[11px] font-mono-num rounded transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  filter === tab.key
                    ? 'bg-[#162230] text-cyan-300 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs font-mono-num">
          <thead>
            <tr className="bg-[#080B10] border-b border-[#1A2633] text-[10px] uppercase tracking-wider text-slate-400">
              <th className="py-2.5 px-3.5">
                <button
                  type="button"
                  onClick={() => handleSort('name')}
                  className="hover:text-slate-200 cursor-pointer flex items-center whitespace-nowrap"
                >
                  Application {renderSortIcon('name')}
                </button>
              </th>
              <th className="py-2.5 px-2.5 text-right">
                <button
                  type="button"
                  onClick={() => handleSort('pid')}
                  className="hover:text-slate-200 cursor-pointer inline-flex items-center whitespace-nowrap"
                >
                  PID {renderSortIcon('pid')}
                </button>
              </th>
              <th className="py-2.5 px-2.5 text-right">
                <button
                  type="button"
                  onClick={() => handleSort('downloadSpeed')}
                  className="hover:text-slate-200 cursor-pointer inline-flex items-center whitespace-nowrap"
                >
                  Download {renderSortIcon('downloadSpeed')}
                </button>
              </th>
              <th className="py-2.5 px-2.5 text-right">
                <button
                  type="button"
                  onClick={() => handleSort('uploadSpeed')}
                  className="hover:text-slate-200 cursor-pointer inline-flex items-center whitespace-nowrap"
                >
                  Upload {renderSortIcon('uploadSpeed')}
                </button>
              </th>
              <th className="py-2.5 px-2.5 text-right">
                <button
                  type="button"
                  onClick={() => handleSort('totalDownloaded')}
                  className="hover:text-slate-200 cursor-pointer inline-flex items-center whitespace-nowrap"
                >
                  Total DL {renderSortIcon('totalDownloaded')}
                </button>
              </th>
              <th className="py-2.5 px-2.5 text-right">
                <button
                  type="button"
                  onClick={() => handleSort('totalUploaded')}
                  className="hover:text-slate-200 cursor-pointer inline-flex items-center whitespace-nowrap"
                >
                  Total UL {renderSortIcon('totalUploaded')}
                </button>
              </th>
              <th className="py-2.5 px-2.5 text-right">
                <button
                  type="button"
                  onClick={() => handleSort('combined')}
                  className="hover:text-slate-200 cursor-pointer inline-flex items-center whitespace-nowrap"
                >
                  Combined {renderSortIcon('combined')}
                </button>
              </th>
              <th className="py-2.5 px-2.5 text-right">
                <button
                  type="button"
                  onClick={() => handleSort('share')}
                  className="hover:text-slate-200 cursor-pointer inline-flex items-center whitespace-nowrap"
                >
                  Share {renderSortIcon('share')}
                </button>
              </th>
              <th className="py-2.5 px-3.5 text-right">
                <button
                  type="button"
                  onClick={() => handleSort('connections')}
                  className="hover:text-slate-200 cursor-pointer inline-flex items-center whitespace-nowrap"
                >
                  Sockets {renderSortIcon('connections')}
                </button>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#141E28]">
            {filteredAndSorted.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-8 text-center text-slate-500">
                  No matching applications with active network sockets found.
                </td>
              </tr>
            ) : (
              filteredAndSorted.map((proc) => {
                const isActive =
                  (proc.downloadSpeedBytesSec ?? 0) > 0 ||
                  (proc.uploadSpeedBytesSec ?? 0) > 0 ||
                  proc.activeConnections > 0;

                return (
                  <tr
                    key={proc.pid}
                    onClick={() => onSelectApp(proc.pid)}
                    className="hover:bg-[#101720] transition-colors cursor-pointer group"
                  >
                    <td className="py-2.5 px-3.5 max-w-[260px]">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <AppIconBadge
                          name={proc.name}
                          executablePath={proc.executablePath}
                          category={proc.category}
                          size="sm"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-slate-200 group-hover:text-cyan-300 transition-colors truncate">
                              {proc.name}
                            </span>
                            <ChevronRight className="w-3 h-3 text-slate-600 group-hover:text-cyan-400 shrink-0" />
                          </div>
                          <div
                            className="text-[10px] text-slate-500 truncate"
                            title={proc.executablePath || proc.measurementSource}
                          >
                            {proc.category.toUpperCase()}
                            {proc.protocols.length > 0 ? ` · ${proc.protocols.join('/')}` : ''}
                            {!proc.isMeasured ? ' · Sockets only' : ''}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="py-2.5 px-2.5 text-right text-slate-400 whitespace-nowrap">
                      {proc.pid}
                    </td>

                    <td className="py-2.5 px-2.5 text-right whitespace-nowrap">
                      {proc.isMeasured ? (
                        <span
                          className={
                            (proc.downloadSpeedBytesSec ?? 0) > 0
                              ? 'text-emerald-400 font-semibold'
                              : 'text-slate-400'
                          }
                        >
                          {formatBandwidthRate(proc.downloadSpeedBytesSec, unit)}
                        </span>
                      ) : (
                        <span className="text-slate-600" title="Per-process byte counter unavailable">
                          —
                        </span>
                      )}
                    </td>

                    <td className="py-2.5 px-2.5 text-right whitespace-nowrap">
                      {proc.isMeasured ? (
                        <span
                          className={
                            (proc.uploadSpeedBytesSec ?? 0) > 0
                              ? 'text-sky-400 font-semibold'
                              : 'text-slate-400'
                          }
                        >
                          {formatBandwidthRate(proc.uploadSpeedBytesSec, unit)}
                        </span>
                      ) : (
                        <span className="text-slate-600" title="Per-process byte counter unavailable">
                          —
                        </span>
                      )}
                    </td>

                    <td className="py-2.5 px-2.5 text-right text-slate-300 whitespace-nowrap">
                      {proc.isMeasured ? formatBytes(proc.totalDownloadedBytes) : <span className="text-slate-600">—</span>}
                    </td>

                    <td className="py-2.5 px-2.5 text-right text-slate-300 whitespace-nowrap">
                      {proc.isMeasured ? formatBytes(proc.totalUploadedBytes) : <span className="text-slate-600">—</span>}
                    </td>

                    <td className="py-2.5 px-2.5 text-right font-semibold text-slate-200 whitespace-nowrap">
                      {proc.isMeasured ? formatBytes(proc.combinedTotalBytes) : <span className="text-slate-600">—</span>}
                    </td>

                    <td className="py-2.5 px-2.5 text-right whitespace-nowrap">
                      {proc.trafficSharePercent !== null ? (
                        <div className="inline-flex flex-col items-end gap-1 min-w-[54px]">
                          <span className="text-slate-200">
                            {proc.trafficSharePercent.toFixed(1)}%
                          </span>
                          <div className="w-12 h-1 bg-[#141E28] rounded-full overflow-hidden">
                            <div
                              className="h-full bg-emerald-400"
                              style={{ width: `${Math.min(100, Math.max(2, proc.trafficSharePercent))}%` }}
                            />
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>

                    <td className="py-2.5 px-3.5 text-right whitespace-nowrap">
                      <span className={isActive ? 'text-cyan-300 font-semibold' : 'text-slate-400'}>
                        {proc.activeConnections}
                      </span>
                      <span className="text-slate-500"> / {proc.totalSockets}</span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
