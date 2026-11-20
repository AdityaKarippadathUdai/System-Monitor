import React from 'react';
import {
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Activity,
  Layers,
  Terminal,
  Server,
  X,
} from 'lucide-react';
import { ProcessInfo, ProcessCategory, ProcessSortField, ProcessSortOrder } from '../types/process';
import { formatBytes, formatSpeed } from '../utils/formatters';
import { UsageBar } from './UsageBar';

interface ProcessTableProps {
  processes: ProcessInfo[];
  totalCount: number;
  filteredCount: number;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  activeCategory: ProcessCategory;
  onCategoryChange: (cat: ProcessCategory) => void;
  sortField: ProcessSortField;
  sortOrder: ProcessSortOrder;
  onSort: (field: ProcessSortField) => void;
  selectedProcess: ProcessInfo | null;
  onSelectProcess: (proc: ProcessInfo) => void;
  isCompact?: boolean;
}

export const ProcessTable: React.FC<ProcessTableProps> = ({
  processes,
  totalCount,
  filteredCount,
  searchQuery,
  onSearchChange,
  activeCategory,
  onCategoryChange,
  sortField,
  sortOrder,
  onSort,
  selectedProcess,
  onSelectProcess,
  isCompact = false,
}) => {
  const categories: { id: ProcessCategory; label: string; icon: any }[] = [
    { id: 'all', label: 'All Processes', icon: Layers },
    { id: 'app', label: 'Applications', icon: Terminal },
    { id: 'background', label: 'Background', icon: Activity },
    { id: 'system', label: 'System', icon: Server },
  ];

  const getSortIcon = (field: ProcessSortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3 h-3 opacity-40 group-hover:opacity-100" />;
    }
    return sortOrder === 'asc' ? (
      <ArrowUp className="w-3 h-3 text-blue-400" />
    ) : (
      <ArrowDown className="w-3 h-3 text-blue-400" />
    );
  };

  const getStatusBadge = (status: ProcessInfo['status']) => {
    switch (status) {
      case 'running':
        return (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono-num font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            running
          </span>
        );
      case 'sleeping':
        return (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono-num font-medium bg-slate-800 text-slate-400 border border-slate-700/50">
            sleep
          </span>
        );
      case 'stopped':
        return (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono-num font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
            stopped
          </span>
        );
      case 'zombie':
        return (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono-num font-medium bg-red-500/10 text-red-400 border border-red-500/20">
            zombie
          </span>
        );
      case 'unknown':
      default:
        return (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono-num font-medium bg-slate-800/70 text-slate-500 border border-slate-700/50">
            unknown
          </span>
        );
    }
  };

  return (
    <div className="bg-[#0B1118] border border-[#1A2633] rounded-lg overflow-hidden flex flex-col h-full">
      {/* Control Bar: Search + Category Filters */}
      <div className="p-3 border-b border-[#1A2633] bg-[#0D1117] flex flex-wrap items-center justify-between gap-3">
        {/* Category tabs */}
        <div className="flex items-center gap-1 bg-[#080B10] p-1 rounded-md border border-[#1A2633]">
          {categories.map((cat) => {
            const Icon = cat.icon;
            const isActive = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                id={`cat-${cat.id}`}
                onClick={() => onCategoryChange(cat.id)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-600/20 text-blue-400 border border-blue-500/40 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 border border-transparent'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>

        {/* Search input */}
        <div className="relative min-w-[220px] max-w-sm flex-1 sm:flex-initial">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            id="process-search-input"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search processes, PID, user..."
            className="w-full bg-[#080B10] border border-[#1A2633] focus:border-blue-500 focus:outline-none rounded text-xs text-slate-100 pl-8 pr-7 py-1.5 font-mono-num placeholder:text-slate-500"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Table Header & Rows */}
      <div className="overflow-x-auto flex-1 select-none">
        <table className="w-full text-left border-collapse text-xs font-mono-num">
          <thead>
            <tr className="border-b border-[#1A2633] bg-[#080B10] text-slate-400 text-[11px] sticky top-0 z-10">
              <th
                onClick={() => onSort('name')}
                className="py-2.5 px-3 font-medium cursor-pointer hover:text-slate-200 group"
              >
                <div className="flex items-center gap-1.5">
                  <span>Application</span>
                  {getSortIcon('name')}
                </div>
              </th>

              <th
                onClick={() => onSort('pid')}
                className="py-2.5 px-3 font-medium cursor-pointer hover:text-slate-200 group w-20"
              >
                <div className="flex items-center gap-1.5">
                  <span>PID</span>
                  {getSortIcon('pid')}
                </div>
              </th>

              <th
                onClick={() => onSort('cpuPercent')}
                className="py-2.5 px-3 font-medium cursor-pointer hover:text-slate-200 group w-28"
              >
                <div className="flex items-center gap-1.5">
                  <span>CPU</span>
                  {getSortIcon('cpuPercent')}
                </div>
              </th>

              <th
                onClick={() => onSort('memoryBytes')}
                className="py-2.5 px-3 font-medium cursor-pointer hover:text-slate-200 group w-32"
              >
                <div className="flex items-center gap-1.5">
                  <span>Memory</span>
                  {getSortIcon('memoryBytes')}
                </div>
              </th>

              <th
                onClick={() => onSort('gpuPercent')}
                className="py-2.5 px-3 font-medium cursor-pointer hover:text-slate-200 group w-24 hidden md:table-cell"
              >
                <div className="flex items-center gap-1.5">
                  <span>GPU</span>
                  {getSortIcon('gpuPercent')}
                </div>
              </th>

              <th
                onClick={() => onSort('vramBytes')}
                className="py-2.5 px-3 font-medium cursor-pointer hover:text-slate-200 group w-28 hidden lg:table-cell"
              >
                <div className="flex items-center gap-1.5">
                  <span>VRAM</span>
                  {getSortIcon('vramBytes')}
                </div>
              </th>

              <th
                onClick={() => onSort('disk')}
                className="py-2.5 px-3 font-medium cursor-pointer hover:text-slate-200 group w-28 hidden sm:table-cell"
              >
                <div className="flex items-center gap-1.5">
                  <span>Disk I/O</span>
                  {getSortIcon('disk')}
                </div>
              </th>

              <th className="py-2.5 px-3 font-medium w-24 text-right">Status</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-[#131c26]">
            {processes.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-slate-500 font-sans">
                  No running processes found matching the criteria.
                </td>
              </tr>
            ) : (
              processes.map((proc) => {
                const isSelected = selectedProcess?.pid === proc.pid;
                const totalDisk = proc.diskReadBytesSec + proc.diskWriteBytesSec;

                return (
                  <tr
                    key={proc.pid}
                    id={`process-row-${proc.pid}`}
                    onClick={() => onSelectProcess(proc)}
                    className={`cursor-pointer transition-colors duration-150 ${
                      isSelected
                        ? 'bg-blue-950/40 border-l-2 border-l-blue-500'
                        : 'hover:bg-[#101720]'
                    } ${isCompact ? 'py-1' : ''}`}
                  >
                    {/* App / Name */}
                    <td className={`px-3 ${isCompact ? 'py-1.5' : 'py-2.5'}`}>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-200">{proc.name}</span>
                        {proc.user && (
                          <span className="text-[10px] text-slate-400 font-normal hidden xl:inline truncate max-w-[200px]">
                            {proc.user}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* PID */}
                    <td className={`px-3 text-slate-400 ${isCompact ? 'py-1.5' : 'py-2.5'}`}>
                      {proc.pid}
                    </td>

                    {/* CPU */}
                    <td className={`px-3 ${isCompact ? 'py-1.5' : 'py-2.5'}`}>
                      <div className="space-y-1">
                        <div className="flex justify-between items-center text-[11px]">
                          <span
                            className={
                              proc.cpuPercent > 10
                                ? 'text-amber-400 font-medium'
                                : 'text-slate-200'
                            }
                          >
                            {proc.cpuPercent.toFixed(1)}%
                          </span>
                        </div>
                        <UsageBar value={proc.cpuPercent} height="xs" colorScheme="blue" />
                      </div>
                    </td>

                    {/* RAM */}
                    <td className={`px-3 ${isCompact ? 'py-1.5' : 'py-2.5'}`}>
                      <div className="space-y-1">
                        <div className="flex justify-between items-center text-[11px]">
                          <span className="text-slate-200">{formatBytes(proc.memoryBytes)}</span>
                          <span className="text-slate-400 text-[10px]">
                            {proc.memoryPercent.toFixed(1)}%
                          </span>
                        </div>
                        <UsageBar value={proc.memoryPercent} height="xs" colorScheme="green" />
                      </div>
                    </td>

                    {/* GPU */}
                    <td
                      className={`px-3 hidden md:table-cell ${
                        isCompact ? 'py-1.5' : 'py-2.5'
                      }`}
                    >
                      <span
                        className={
                          (proc.gpuPercent ?? 0) > 5
                            ? 'text-cyan-400 font-medium'
                            : 'text-slate-400'
                        }
                      >
                        {proc.gpuPercent !== null && proc.gpuPercent > 0
                          ? `${proc.gpuPercent.toFixed(1)}%`
                          : '—'}
                      </span>
                    </td>

                    {/* VRAM */}
                    <td
                      className={`px-3 hidden lg:table-cell text-slate-300 ${
                        isCompact ? 'py-1.5' : 'py-2.5'
                      }`}
                    >
                      {proc.vramBytes !== null && proc.vramBytes > 0
                        ? formatBytes(proc.vramBytes)
                        : '—'}
                    </td>

                    {/* Disk I/O */}
                    <td
                      className={`px-3 hidden sm:table-cell text-slate-400 ${
                        isCompact ? 'py-1.5' : 'py-2.5'
                      }`}
                    >
                      {totalDisk > 0 ? formatSpeed(totalDisk) : '0 B/s'}
                    </td>

                    {/* Status */}
                    <td className={`px-3 text-right ${isCompact ? 'py-1.5' : 'py-2.5'}`}>
                      {getStatusBadge(proc.status)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Footer bar */}
      <div className="px-3 py-2 border-t border-[#1A2633] bg-[#080B10] text-[11px] font-mono-num text-slate-400 flex items-center justify-between">
        <span>
          Showing <strong className="text-slate-200">{filteredCount}</strong> of{' '}
          <strong className="text-slate-200">{totalCount}</strong> processes
        </span>
        <span className="text-slate-500">Click any process row for deep inspection</span>
      </div>
    </div>
  );
};
