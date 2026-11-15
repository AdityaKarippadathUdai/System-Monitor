import React, { useState } from 'react';
import {
  Cpu,
  HardDrive,
  Laptop,
  Server,
  Layers,
  MemoryStick,
  MonitorCog,
  Terminal,
  Copy,
  Check,
  Info,
  ShieldCheck,
  Disc,
} from 'lucide-react';
import { useSystemStore } from '../store/systemStore';
import { SystemOverview } from '../types/system';
import { formatBytes } from '../utils/formatters';

interface SystemDetailsProps {
  overview?: SystemOverview | null;
  className?: string;
  id?: string;
}

export const SystemDetails: React.FC<SystemDetailsProps> = ({
  overview: propOverview,
  className = '',
  id = 'system-details-widget',
}) => {
  const storeOverview = useSystemStore((state) => state.overview);
  const overview = propOverview || storeOverview;
  const [copied, setCopied] = useState(false);

  if (!overview) {
    return (
      <div
        id={id}
        className={`bg-[#0B1118] border border-[#1A2633] rounded-lg p-4 text-slate-500 font-mono-num text-xs ${className}`}
      >
        Waiting for system telemetry to initialize...
      </div>
    );
  }

  const { cpu, memory, gpus, disks, systemInfo } = overview;
  const isWindows = systemInfo.platform.toLowerCase() === 'windows';
  const swapLabel = isWindows ? 'Page File' : 'Swap';

  // Calculate aggregated static storage capacity across all mounted storage devices
  const totalDiskBytes = disks.reduce((acc, d) => acc + (d.totalBytes || 0), 0);
  const primaryDisk = disks.find((d) => d.isSystem) || disks[0];
  const primaryGpu = gpus && gpus.length > 0 ? gpus[0] : null;

  const memTypeDisplay = memory.type || 'System RAM';
  const memSpeedDisplay = memory.speedMhz ? ` @ ${memory.speedMhz} MHz` : '';
  const windowingText = [systemInfo.displayServer, systemInfo.desktopEnvironment]
    .filter(Boolean)
    .join(' • ');

  const handleCopySpecs = () => {
    const specsText = [
      `=== System Details ===`,
      `Operating System: ${systemInfo.osName} ${systemInfo.osVersion} (${systemInfo.architecture})`,
      `Kernel: ${systemInfo.kernelVersion}`,
      `Hostname: ${systemInfo.hostname}`,
      systemInfo.manufacturer || systemInfo.model
        ? `Host System: ${[systemInfo.manufacturer, systemInfo.model].filter(Boolean).join(' ')}`
        : '',
      `CPU: ${cpu.manufacturer ? `${cpu.manufacturer} ` : ''}${cpu.modelName}`,
      `CPU Cores/Threads: ${cpu.coresCount} Physical Cores / ${cpu.threadsCount} Logical Threads`,
      `Physical RAM: ${formatBytes(memory.totalBytes, 0)} (${memTypeDisplay}${memSpeedDisplay})`,
      `Total Disk Capacity: ${formatBytes(totalDiskBytes, 1)} across ${disks.length} volume(s)`,
      primaryDisk ? `Primary Disk: ${primaryDisk.name} (${primaryDisk.diskType}, ${primaryDisk.filesystem})` : '',
      primaryGpu
        ? `GPU: ${primaryGpu.name} (${primaryGpu.vramTotalBytes ? `${formatBytes(primaryGpu.vramTotalBytes, 0)} VRAM` : 'VRAM N/A'})`
        : '',
      windowingText ? `Display / Desktop: ${windowingText}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    navigator.clipboard.writeText(specsText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const hardwareItems = [
    {
      id: 'spec-cpu-model',
      label: 'CPU Model',
      value: cpu.modelName || systemInfo.cpuModel || 'Unknown Processor',
      subtext: `${cpu.manufacturer ? `${cpu.manufacturer} • ` : ''}${cpu.coresCount} Cores / ${cpu.threadsCount} Threads • ${systemInfo.architecture}`,
      icon: Cpu,
      color: 'text-blue-400',
      badge: `${cpu.coresCount}C/${cpu.threadsCount}T`,
    },
    {
      id: 'spec-os-version',
      label: 'OS Version',
      value: `${systemInfo.osName} ${systemInfo.osVersion}`.trim(),
      subtext: `Kernel ${systemInfo.kernelVersion} • ${systemInfo.platform.toUpperCase()}`,
      icon: Laptop,
      color: 'text-indigo-400',
      badge: systemInfo.architecture,
    },
    {
      id: 'spec-total-disk',
      label: 'Total Disk Capacity',
      value: formatBytes(totalDiskBytes, 1),
      subtext: `${disks.length} Volume${disks.length === 1 ? '' : 's'} Mounted${primaryDisk ? ` • Primary ${primaryDisk.diskType} (${primaryDisk.filesystem})` : ''}`,
      icon: HardDrive,
      color: 'text-emerald-400',
      badge: `${disks.length} Drive${disks.length === 1 ? '' : 's'}`,
    },
    {
      id: 'spec-total-memory',
      label: 'Total Physical Memory',
      value: formatBytes(memory.totalBytes, 0),
      subtext: `${memTypeDisplay}${memSpeedDisplay} • ${swapLabel}: ${formatBytes(memory.swapTotalBytes, 0)}`,
      icon: MemoryStick,
      color: 'text-cyan-400',
      badge: `${systemInfo.totalMemoryGB || Math.round(memory.totalBytes / (1024 * 1024 * 1024))} GB`,
    },
    {
      id: 'spec-graphics-gpu',
      label: 'Graphics Adapter (GPU)',
      value: primaryGpu ? primaryGpu.name : 'No GPU Detected',
      subtext: primaryGpu
        ? `${primaryGpu.vramTotalBytes ? `${formatBytes(primaryGpu.vramTotalBytes, 0)} VRAM` : 'Shared Memory'}${primaryGpu.driverVersion ? ` • Driver ${primaryGpu.driverVersion}` : ''}`
        : 'Display telemetry unavailable',
      icon: MonitorCog,
      color: 'text-purple-400',
      badge: primaryGpu
        ? primaryGpu.vramTotalBytes
          ? `${formatBytes(primaryGpu.vramTotalBytes, 0)} VRAM`
          : primaryGpu.gpuType.toUpperCase()
        : 'N/A',
    },
    {
      id: 'spec-hostname-system',
      label: 'Host & Identity',
      value: systemInfo.model
        ? `${systemInfo.hostname} (${[systemInfo.manufacturer, systemInfo.model].filter(Boolean).join(' ')})`
        : systemInfo.hostname || 'localhost',
      subtext: `${systemInfo.processCount} Processes${systemInfo.threadCount ? ` • ${systemInfo.threadCount} Threads` : ''}${windowingText ? ` • ${windowingText}` : ''}`,
      icon: Server,
      color: 'text-amber-400',
      badge: systemInfo.platform,
    },
  ];

  return (
    <div
      id={id}
      className={`bg-[#0B1118] border border-[#1A2633] rounded-lg p-4 space-y-3.5 font-mono-num ${className}`}
    >
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#14202c] pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <Info className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider flex items-center gap-2">
              System Details
              <span className="text-[10px] font-normal px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 lowercase tracking-normal">
                static hardware specs
              </span>
            </h3>
            <p className="text-[11px] text-slate-400">
              Static hardware specifications, processor architecture, and storage capacity
            </p>
          </div>
        </div>

        <button
          id="copy-system-specs-btn"
          onClick={handleCopySpecs}
          className="px-2.5 py-1 rounded bg-[#101720] hover:bg-[#15202d] text-slate-300 border border-[#1A2633] flex items-center gap-1.5 text-xs transition-colors cursor-pointer"
          title="Copy hardware specs to clipboard"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400 font-medium">Specs Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5 text-slate-400" />
              <span>Copy Specs</span>
            </>
          )}
        </button>
      </div>

      {/* Hardware Specifications Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {hardwareItems.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.id}
              id={item.id}
              className="bg-[#05070A] border border-[#14202c] rounded-lg p-3 flex flex-col justify-between space-y-2 hover:border-[#1E2E40] transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-slate-400 text-[11px]">
                  <Icon className={`w-3.5 h-3.5 ${item.color}`} />
                  <span>{item.label}</span>
                </div>
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[#101720] text-slate-300 border border-[#14202c]">
                  {item.badge}
                </span>
              </div>

              <div>
                <div
                  className="text-xs font-semibold text-slate-100 truncate"
                  title={item.value}
                >
                  {item.value}
                </div>
                <div
                  className="text-[10px] text-slate-400 truncate mt-0.5"
                  title={item.subtext}
                >
                  {item.subtext}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Storage Volumes Breakdown Strip */}
      {disks.length > 0 && (
        <div className="bg-[#05070A] border border-[#14202c] rounded-lg p-2.5">
          <div className="flex items-center justify-between text-[11px] mb-2 text-slate-400">
            <span className="flex items-center gap-1.5 font-medium text-slate-300">
              <Disc className="w-3.5 h-3.5 text-emerald-400" />
              Mounted Storage Volumes ({disks.length})
            </span>
            <span className="text-slate-400 text-[10px]">
              Total Capacity: <strong className="text-emerald-400">{formatBytes(totalDiskBytes, 1)}</strong>
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
            {disks.map((disk, idx) => (
              <div
                key={disk.id || idx}
                className="bg-[#0B1118] border border-[#14202c] rounded p-2 flex items-center justify-between text-[11px]"
              >
                <div className="truncate pr-2">
                  <div className="font-semibold text-slate-200 truncate flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                    <span>{disk.mountPoint}</span>
                    {disk.isSystem && (
                      <span className="text-[9px] px-1 py-0.2 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">
                        {isWindows ? 'system' : 'root'}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-400">
                    {disk.filesystem} • {disk.diskType}
                  </span>
                </div>
                <div className="text-right shrink-0">
                  <span className="font-semibold text-slate-200 block">
                    {formatBytes(disk.totalBytes, 0)}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {disk.usagePercent.toFixed(0)}% used
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
