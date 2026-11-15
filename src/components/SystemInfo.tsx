import React from 'react';
import {
  Terminal,
  Cpu,
  MonitorCog,
  MemoryStick,
  HardDrive,
  Clock,
  Laptop,
  Server,
  Layers,
} from 'lucide-react';
import { SystemInfo as ISystemInfo, HealthStatus } from '../types/system';
import { formatUptime, formatBytes } from '../utils/formatters';

interface SystemInfoProps {
  info: ISystemInfo;
  className?: string;
}

export const SystemInfo: React.FC<SystemInfoProps> = ({ info, className = '' }) => {
  const windowing = [info.displayServer, info.desktopEnvironment].filter(Boolean).join(' • ');
  const specs = [
    {
      label: 'Operating System',
      value: `${info.osName} ${info.osVersion}`.trim(),
      icon: Laptop,
      color: 'text-blue-400',
    },
    {
      label: 'Kernel Version',
      value: info.kernelVersion,
      icon: Terminal,
      color: 'text-emerald-400',
    },
    {
      label: 'Hostname & System',
      value: info.model
        ? `${info.hostname} (${[info.manufacturer, info.model].filter(Boolean).join(' ')})`
        : info.hostname,
      icon: Server,
      color: 'text-purple-400',
    },
    {
      label: 'Architecture',
      value: `${info.architecture} (${info.platform})`,
      icon: Layers,
      color: 'text-cyan-400',
    },
    {
      label: 'Processor (CPU)',
      value: info.cpuModel,
      icon: Cpu,
      color: 'text-blue-400',
    },
    {
      label: 'Total RAM',
      value: `${info.totalMemoryGB} GB System Memory`,
      icon: MemoryStick,
      color: 'text-emerald-400',
    },
    {
      label: 'Tasks / Windowing',
      value:
        windowing ||
        `${info.processCount} Processes${info.threadCount ? ` • ${info.threadCount} Threads` : ''}`,
      icon: MonitorCog,
      color: 'text-amber-400',
    },
    {
      label: 'System Uptime',
      value: formatUptime(info.uptimeSeconds),
      icon: Clock,
      color: 'text-cyan-400',
    },
  ];

  return (
    <div
      id="system-info-panel"
      className={`bg-[#0B1118] border border-[#1A2633] rounded-lg p-4 font-mono-num ${className}`}
    >
      <div className="flex items-center justify-between mb-3 border-b border-[#1A2633] pb-2.5">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <Laptop className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-semibold text-slate-100 uppercase tracking-wider">
              Host System Specifications
            </h3>
          </div>
        </div>
        <span className="text-[11px] text-slate-400">
          Boot: <strong className="text-slate-300">{info.bootTime}</strong>
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2.5">
        {specs.map((item, idx) => {
          const Icon = item.icon;
          return (
            <div
              key={idx}
              className="bg-[#101720] border border-[#14202c] rounded p-2.5 flex flex-col justify-between space-y-1"
            >
              <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
                <Icon className={`w-3.5 h-3.5 ${item.color}`} />
                <span>{item.label}</span>
              </div>
              <div className="text-xs font-semibold text-slate-200 truncate" title={item.value}>
                {item.value}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
