import React, { useMemo, useState } from 'react';
import {
  Search,
  RefreshCw,
  ArrowUpDown,
  ChevronUp,
  ChevronDown,
  Globe2,
} from 'lucide-react';
import { BandwidthUnit, NetworkConnection } from '../../types/system';
import { formatBandwidthRate, formatBytes } from '../../utils/formatters';

interface NetworkConnectionsTableProps {
  connections: NetworkConnection[];
  unit: BandwidthUnit;
  isRefreshing: boolean;
  onRefresh: () => void;
  onSelectApp: (pid: number) => void;
}

type ConnSortField = 'process' | 'protocol' | 'local' | 'remote' | 'state' | 'rx' | 'tx';

export const NetworkConnectionsTable: React.FC<NetworkConnectionsTableProps> = ({
  connections,
  unit,
  isRefreshing,
  onRefresh,
  onSelectApp,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [protocolFilter, setProtocolFilter] = useState<string>('ALL');
  const [stateFilter, setStateFilter] = useState<string>('ALL');
  const [hideLoopback, setHideLoopback] = useState(false);
  const [sortField, setSortField] = useState<ConnSortField>('state');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [showAllRows, setShowAllRows] = useState(false);

  const availableStates = useMemo(() => {
    const set = new Set<string>();
    for (const c of connections) {
      if (c.state) set.add(c.state);
    }
    return ['ALL', ...Array.from(set).sort()];
  }, [connections]);

  const handleSort = (field: ConnSortField) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder(field === 'rx' || field === 'tx' ? 'desc' : 'asc');
    }
  };

  const filteredAndSorted = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    const filtered = connections.filter((c) => {
      if (hideLoopback && c.isLoopback) return false;
      if (protocolFilter !== 'ALL' && c.protocol !== protocolFilter) return false;
      if (stateFilter !== 'ALL' && c.state !== stateFilter) return false;
      if (!q) return true;

      return (
        c.processName.toLowerCase().includes(q) ||
        (c.pid !== null && String(c.pid).includes(q)) ||
        c.localAddress.toLowerCase().includes(q) ||
        String(c.localPort).includes(q) ||
        c.remoteAddress.toLowerCase().includes(q) ||
        (c.remotePort !== null && String(c.remotePort).includes(q)) ||
        c.state.toLowerCase().includes(q)
      );
    });

    const mult = sortOrder === 'asc' ? 1 : -1;
    const statePriority = (s: string) => {
      if (s === 'ESTABLISHED') return 0;
      if (s === 'SYN_SENT' || s === 'SYN_RECV') return 1;
      if (s === 'LISTEN') return 2;
      return 3;
    };

    return [...filtered].sort((a, b) => {
      switch (sortField) {
        case 'process':
          return a.processName.localeCompare(b.processName) * mult;
        case 'protocol':
          return a.protocol.localeCompare(b.protocol) * mult;
        case 'local':
          return (
            `${a.localAddress}:${a.localPort}`.localeCompare(`${b.localAddress}:${b.localPort}`) *
            mult
          );
        case 'remote':
          return (
            `${a.remoteAddress}:${a.remotePort ?? ''}`.localeCompare(
              `${b.remoteAddress}:${b.remotePort ?? ''}`
            ) * mult
          );
        case 'rx':
          return ((a.rxSpeedBytesSec ?? -1) - (b.rxSpeedBytesSec ?? -1)) * mult;
        case 'tx':
          return ((a.txSpeedBytesSec ?? -1) - (b.txSpeedBytesSec ?? -1)) * mult;
        case 'state':
        default: {
          const pa = statePriority(a.state);
          const pb = statePriority(b.state);
          if (pa !== pb) return (pa - pb) * mult;
          return a.state.localeCompare(b.state) * mult;
        }
      }
    });
  }, [connections, searchQuery, protocolFilter, stateFilter, hideLoopback, sortField, sortOrder]);

  const visibleRows = showAllRows ? filteredAndSorted : filteredAndSorted.slice(0, 60);

  const renderSortIcon = (field: ConnSortField) => {
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
      <div className="p-4 border-b border-[#1A2633] space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-xs font-semibold text-slate-100 uppercase tracking-wider font-mono-num flex items-center gap-2">
              <Globe2 className="w-3.5 h-3.5 text-sky-400" />
              Network Hosts and Connections
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5 font-mono-num">
              {filteredAndSorted.length} matching connections ({connections.length} total sockets)
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setHideLoopback((prev) => !prev)}
              className={`px-2.5 py-1.5 rounded border text-[11px] font-mono-num cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
                hideLoopback
                  ? 'bg-[#162230] border-cyan-500/40 text-cyan-300'
                  : 'bg-[#101720] border-[#1A2633] text-slate-400 hover:text-slate-200'
              }`}
            >
              {hideLoopback ? 'Loopback Hidden' : 'Hide Loopback'}
            </button>

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
        </div>

        {/* Search + Protocol + State Filters */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter process, IP, port, state..."
              className="w-full bg-[#080B10] border border-[#1A2633] focus:border-cyan-500 focus:outline-none rounded pl-8 pr-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 font-mono-num"
            />
          </div>

          <div className="inline-flex items-center bg-[#080B10] border border-[#1A2633] rounded p-0.5">
            {['ALL', 'TCP', 'TCP6', 'UDP', 'UDP6'].map((proto) => (
              <button
                key={proto}
                type="button"
                onClick={() => setProtocolFilter(proto)}
                className={`px-2 py-1 text-[11px] font-mono-num rounded cursor-pointer whitespace-nowrap shrink-0 ${
                  protocolFilter === proto
                    ? 'bg-[#162230] text-cyan-300 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {proto}
              </button>
            ))}
          </div>

          <select
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value)}
            aria-label="Filter by socket state"
            className="bg-[#080B10] border border-[#1A2633] focus:border-cyan-500 focus:outline-none rounded px-2.5 py-1.5 text-[11px] text-slate-200 font-mono-num"
          >
            {availableStates.map((st) => (
              <option key={st} value={st}>
                State: {st}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Connections Table */}
      <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
        <table className="w-full text-left border-collapse text-xs font-mono-num">
          <thead className="sticky top-0 z-10 bg-[#080B10]">
            <tr className="border-b border-[#1A2633] text-[10px] uppercase tracking-wider text-slate-400">
              <th className="py-2.5 px-3.5">
                <button
                  type="button"
                  onClick={() => handleSort('process')}
                  className="hover:text-slate-200 cursor-pointer inline-flex items-center whitespace-nowrap"
                >
                  Process {renderSortIcon('process')}
                </button>
              </th>
              <th className="py-2.5 px-2.5">
                <button
                  type="button"
                  onClick={() => handleSort('protocol')}
                  className="hover:text-slate-200 cursor-pointer inline-flex items-center whitespace-nowrap"
                >
                  Proto {renderSortIcon('protocol')}
                </button>
              </th>
              <th className="py-2.5 px-2.5">
                <button
                  type="button"
                  onClick={() => handleSort('local')}
                  className="hover:text-slate-200 cursor-pointer inline-flex items-center whitespace-nowrap"
                >
                  Local Endpoint {renderSortIcon('local')}
                </button>
              </th>
              <th className="py-2.5 px-2.5">
                <button
                  type="button"
                  onClick={() => handleSort('remote')}
                  className="hover:text-slate-200 cursor-pointer inline-flex items-center whitespace-nowrap"
                >
                  Remote Host {renderSortIcon('remote')}
                </button>
              </th>
              <th className="py-2.5 px-2.5">
                <button
                  type="button"
                  onClick={() => handleSort('state')}
                  className="hover:text-slate-200 cursor-pointer inline-flex items-center whitespace-nowrap"
                >
                  State {renderSortIcon('state')}
                </button>
              </th>
              <th className="py-2.5 px-2.5 text-right">
                <button
                  type="button"
                  onClick={() => handleSort('rx')}
                  className="hover:text-slate-200 cursor-pointer inline-flex items-center whitespace-nowrap"
                >
                  RX {renderSortIcon('rx')}
                </button>
              </th>
              <th className="py-2.5 px-3.5 text-right">
                <button
                  type="button"
                  onClick={() => handleSort('tx')}
                  className="hover:text-slate-200 cursor-pointer inline-flex items-center whitespace-nowrap"
                >
                  TX {renderSortIcon('tx')}
                </button>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#141E28]">
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-500">
                  No connections match the active filters.
                </td>
              </tr>
            ) : (
              visibleRows.map((conn) => (
                <tr key={conn.id} className="hover:bg-[#101720] transition-colors">
                  <td className="py-2 px-3.5 whitespace-nowrap">
                    {conn.pid !== null ? (
                      <button
                        type="button"
                        onClick={() => onSelectApp(conn.pid!)}
                        className="text-left text-slate-200 hover:text-cyan-300 font-semibold cursor-pointer"
                      >
                        {conn.processName}
                        <span className="text-slate-500 font-normal ml-1.5">#{conn.pid}</span>
                      </button>
                    ) : (
                      <span className="text-slate-500">{conn.processName}</span>
                    )}
                  </td>
                  <td className="py-2 px-2.5 text-cyan-300 font-semibold whitespace-nowrap">
                    {conn.protocol}
                  </td>
                  <td className="py-2 px-2.5 text-slate-300 whitespace-nowrap">
                    {conn.localAddress}:{conn.localPort}
                  </td>
                  <td className="py-2 px-2.5 text-slate-200 whitespace-nowrap">
                    {conn.remoteAddress}
                    {conn.remotePort !== null ? `:${conn.remotePort}` : ''}
                  </td>
                  <td className="py-2 px-2.5 whitespace-nowrap">
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
                  <td className="py-2 px-2.5 text-right whitespace-nowrap">
                    {conn.rxSpeedBytesSec !== null ? (
                      <span className="text-emerald-400" title={`Total: ${formatBytes(conn.rxBytesTotal)}`}>
                        {formatBandwidthRate(conn.rxSpeedBytesSec, unit)}
                      </span>
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>
                  <td className="py-2 px-3.5 text-right whitespace-nowrap">
                    {conn.txSpeedBytesSec !== null ? (
                      <span className="text-sky-400" title={`Total: ${formatBytes(conn.txBytesTotal)}`}>
                        {formatBandwidthRate(conn.txSpeedBytesSec, unit)}
                      </span>
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

      {filteredAndSorted.length > 60 && (
        <div className="p-2.5 border-t border-[#1A2633] bg-[#080B10] flex items-center justify-between text-[11px] font-mono-num text-slate-400">
          <span>
            Showing {visibleRows.length} of {filteredAndSorted.length} connections
          </span>
          <button
            type="button"
            onClick={() => setShowAllRows((prev) => !prev)}
            className="text-cyan-400 hover:text-cyan-300 cursor-pointer"
          >
            {showAllRows ? 'Show Top 60' : `Show All (${filteredAndSorted.length})`}
          </button>
        </div>
      )}
    </div>
  );
};
