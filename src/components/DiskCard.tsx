import React from 'react';
import { HardDrive, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { DiskStats } from '../types/system';
import { formatBytes, formatSpeed, formatTemperature, getResourceStatus } from '../utils/formatters';
import { UsageBar } from './UsageBar';
import { StatusIndicator } from './StatusIndicator';
import { useSystemStore } from '../store/systemStore';

interface DiskCardProps {
  disk: DiskStats;
  className?: string;
}

export const DiskCard: React.FC<DiskCardProps> = ({ disk, className = '' }) => {
  const status = getResourceStatus(disk.usagePercent);
  const tempUnit = useSystemStore((state) => state.settings.tempUnit);

  return (
    <div
      id={`disk-card-${disk.id}`}
      className={`bg-[#0B1118] border border-[#1A2633] rounded-lg p-4 flex flex-col justify-between ${className}`}
    >
      {/* Top Meta */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
              <HardDrive className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-semibold text-slate-200 truncate">{disk.name}</h4>
                {disk.isSystem && (
                  <span className="px-1.5 py-0.2 rounded text-[10px] font-mono-num bg-blue-500/10 text-blue-400 border border-blue-500/20 shrink-0">
                    System Boot
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 font-mono-num">
                <span>Mount: <strong className="text-slate-300">{disk.mountPoint}</strong></span>
                <span>•</span>
                <span>FS: <strong className="text-slate-300">{disk.filesystem}</strong></span>
                <span>•</span>
                <span className="text-emerald-400/80">{disk.diskType}</span>
              </div>
            </div>
          </div>
          <StatusIndicator status={status} size="sm" />
        </div>

        {/* Capacity Bar */}
        <div className="bg-[#101720] border border-[#14202c] rounded p-3 my-3">
          <div className="flex justify-between items-center text-xs font-mono-num mb-1.5">
            <span className="text-slate-400">
              Capacity: <span className="text-slate-200">{formatBytes(disk.usedBytes)}</span> / {formatBytes(disk.totalBytes)}
            </span>
            <span className="font-semibold text-slate-100">{disk.usagePercent.toFixed(1)}%</span>
          </div>
          <UsageBar value={disk.usagePercent} height="sm" colorScheme="green" />
          <div className="flex justify-between items-center text-[10px] font-mono-num text-slate-500 mt-1">
            <span>Available: {formatBytes(disk.availableBytes)}</span>
            <span>Temp: {formatTemperature(disk.temperatureC, tempUnit)}</span>
          </div>
        </div>
      </div>

      {/* Read & Write Speeds */}
      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#131c26] font-mono-num text-xs">
        <div className="bg-[#080B10] border border-[#14202c] rounded p-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-slate-400 text-[11px]">Read Speed</span>
          </div>
          <div className="text-right">
            <span className="font-bold text-slate-200">{formatSpeed(disk.readSpeedBytesSec)}</span>
            <span className="block text-[10px] text-slate-500">
              {disk.readOpsSec != null ? `${disk.readOpsSec} IOPS` : 'N/A'}
            </span>
          </div>
        </div>

        <div className="bg-[#080B10] border border-[#14202c] rounded p-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <ArrowUpRight className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-slate-400 text-[11px]">Write Speed</span>
          </div>
          <div className="text-right">
            <span className="font-bold text-slate-200">{formatSpeed(disk.writeSpeedBytesSec)}</span>
            <span className="block text-[10px] text-slate-500">
              {disk.writeOpsSec != null ? `${disk.writeOpsSec} IOPS` : 'N/A'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
