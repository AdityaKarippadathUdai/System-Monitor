import React from 'react';
import {
  MonitorCog,
  Thermometer,
  Zap,
  Gauge,
  Fan,
} from 'lucide-react';
import { GpuStats } from '../types/system';
import {
  formatBytes,
  formatMhz,
  formatPercent,
  formatTemperature,
  formatWatts,
  getResourceStatus,
} from '../utils/formatters';
import { StatusIndicator } from './StatusIndicator';
import { CircularProgress } from './CircularProgress';
import { useSystemStore } from '../store/systemStore';

interface GpuCardProps {
  gpus: GpuStats[];
  activeGpuId: string;
  onSelectGpu: (id: string) => void;
  className?: string;
}

export const GpuCard: React.FC<GpuCardProps> = ({
  gpus,
  activeGpuId,
  onSelectGpu,
  className = '',
}) => {
  const tempUnit = useSystemStore((state) => state.settings.tempUnit);

  if (!gpus || gpus.length === 0) {
    return (
      <div className="bg-[#0B1118] border border-[#1A2633] rounded-lg p-8 text-center text-slate-500 font-mono-num">
        No compatible GPU hardware telemetry detected on this system.
      </div>
    );
  }

  const activeGpu = gpus.find((g) => g.id === activeGpuId) || gpus[0];
  const utilVal = activeGpu.utilizationPercent;
  const vramVal = activeGpu.vramUsagePercent;
  const gpuStatus = getResourceStatus(utilVal ?? 0);
  const vramStatus = getResourceStatus(vramVal ?? 0);

  const freeVram =
    activeGpu.vramTotalBytes != null && activeGpu.vramUsedBytes != null
      ? Math.max(0, activeGpu.vramTotalBytes - activeGpu.vramUsedBytes)
      : null;

  const gpuTypeLabel =
    activeGpu.gpuType === 'discrete'
      ? 'Discrete GPU'
      : activeGpu.gpuType === 'integrated'
      ? 'Integrated GPU'
      : 'Graphics Adapter';

  return (
    <div
      id="gpu-card-container"
      className={`bg-[#0B1118] border border-[#1A2633] rounded-lg p-4 flex flex-col space-y-4 ${className}`}
    >
      {/* GPU Selector if multiple (e.g. hybrid iGPU + dGPU) */}
      {gpus.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-[#1A2633] pb-3">
          <span className="text-xs text-slate-400 font-mono-num mr-1">Detected GPUs ({gpus.length}):</span>
          {gpus.map((gpu, index) => (
            <button
              key={gpu.id}
              onClick={() => onSelectGpu(gpu.id)}
              className={`px-2.5 py-1 rounded text-xs font-mono-num transition-colors border cursor-pointer flex items-center gap-1.5 ${
                activeGpu.id === gpu.id
                  ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40 shadow-sm'
                  : 'bg-[#101720] text-slate-400 border-[#1A2633] hover:text-slate-200'
              }`}
            >
              <span>GPU {index}: {gpu.name}</span>
              <span className="text-[10px] px-1 rounded bg-[#080B10] border border-[#1A2633] uppercase">
                {gpu.gpuType === 'discrete' ? 'dGPU' : gpu.gpuType === 'integrated' ? 'iGPU' : gpu.vendor}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* GPU Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="p-2.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            <MonitorCog className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-100">{activeGpu.name}</h3>
              <span className="text-[10px] font-mono-num px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                {gpuTypeLabel}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 font-mono-num mt-0.5">
              <span>Vendor: {activeGpu.vendor}</span>
              <span>•</span>
              <span>Driver: {activeGpu.driverVersion || 'N/A'}</span>
              {activeGpu.pciBusId && (
                <>
                  <span>•</span>
                  <span>Bus: {activeGpu.pciBusId}</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <StatusIndicator status={gpuStatus} label={`GPU: ${formatPercent(utilVal)}`} size="sm" />
          <StatusIndicator status={vramStatus} label={`VRAM: ${formatPercent(vramVal)}`} size="sm" />
        </div>
      </div>

      {/* Main Gauges Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-[#101720] border border-[#14202c] rounded-lg p-4">
        {/* GPU Core Utilization */}
        <div className="flex items-center gap-4">
          <CircularProgress
            value={utilVal ?? 0}
            size={110}
            strokeWidth={8}
            label={utilVal != null ? 'GPU CORE' : 'N/A'}
            colorScheme="cyan"
          />
          <div className="space-y-1.5 font-mono-num text-xs flex-1">
            <div className="text-slate-300 font-semibold">Core Activity</div>
            <div className="flex justify-between text-slate-400 text-[11px]">
              <span>Utilization:</span>
              <span className="text-slate-200">{formatPercent(utilVal)}</span>
            </div>
            <div className="flex justify-between text-slate-400 text-[11px]">
              <span>Core Clock:</span>
              <span className="text-slate-200">{formatMhz(activeGpu.coreClockMhz)}</span>
            </div>
            <div className="flex justify-between text-slate-400 text-[11px]">
              <span>Memory Clock:</span>
              <span className="text-slate-200">{formatMhz(activeGpu.memoryClockMhz)}</span>
            </div>
            <div className="flex justify-between text-slate-400 text-[11px]">
              <span>Compute:</span>
              <span className="text-slate-200">{activeGpu.computeCapability || 'N/A'}</span>
            </div>
          </div>
        </div>

        {/* VRAM Memory Allocation */}
        <div className="flex items-center gap-4 md:border-l md:border-[#1A2633] md:pl-4">
          <CircularProgress
            value={vramVal ?? 0}
            size={110}
            strokeWidth={8}
            label={vramVal != null ? 'VRAM' : 'N/A'}
            colorScheme="blue"
          />
          <div className="space-y-1.5 font-mono-num text-xs flex-1">
            <div className="text-slate-300 font-semibold">Dedicated Video Memory</div>
            <div className="flex justify-between text-slate-400 text-[11px]">
              <span>Allocated:</span>
              <span className="text-slate-200 font-medium">{formatBytes(activeGpu.vramUsedBytes)}</span>
            </div>
            <div className="flex justify-between text-slate-400 text-[11px]">
              <span>Total VRAM:</span>
              <span className="text-slate-200">{formatBytes(activeGpu.vramTotalBytes)}</span>
            </div>
            <div className="flex justify-between text-slate-400 text-[11px]">
              <span>Free VRAM:</span>
              <span className="text-slate-200">{formatBytes(freeVram)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Thermals, Power, Clocks Telemetry */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono-num text-xs">
        <div className="bg-[#080B10] border border-[#14202c] p-2.5 rounded">
          <div className="flex items-center gap-1.5 text-slate-400 text-[11px] mb-1">
            <Thermometer className="w-3.5 h-3.5 text-red-400" />
            <span>Temperature</span>
          </div>
          <div className="text-base font-bold text-slate-100">
            {formatTemperature(activeGpu.temperatureC, tempUnit)}
          </div>
          <div className="text-[10px] text-slate-500">
            {activeGpu.temperatureC != null ? 'Core Thermal Sensor' : 'Sensor Unavailable'}
          </div>
        </div>

        <div className="bg-[#080B10] border border-[#14202c] p-2.5 rounded">
          <div className="flex items-center gap-1.5 text-slate-400 text-[11px] mb-1">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>Power Draw</span>
          </div>
          <div className="text-base font-bold text-slate-100">
            {formatWatts(activeGpu.powerWatts)}
          </div>
          <div className="text-[10px] text-slate-500">
            Limit: {formatWatts(activeGpu.powerLimitWatts)}
          </div>
        </div>

        <div className="bg-[#080B10] border border-[#14202c] p-2.5 rounded">
          <div className="flex items-center gap-1.5 text-slate-400 text-[11px] mb-1">
            <Fan className="w-3.5 h-3.5 text-cyan-400" />
            <span>Cooling Fan</span>
          </div>
          <div className="text-base font-bold text-slate-100">
            {activeGpu.fanSpeedPercent == null
              ? 'N/A'
              : activeGpu.fanSpeedPercent > 0
              ? `${activeGpu.fanSpeedPercent}%`
              : '0% (Idle)'}
          </div>
          <div className="text-[10px] text-slate-500">
            {activeGpu.fanSpeedPercent == null
              ? 'No Fan Tachometer'
              : activeGpu.fanSpeedPercent > 0
              ? 'Active Cooling'
              : 'Zero RPM / Passive'}
          </div>
        </div>

        <div className="bg-[#080B10] border border-[#14202c] p-2.5 rounded">
          <div className="flex items-center gap-1.5 text-slate-400 text-[11px] mb-1">
            <Gauge className="w-3.5 h-3.5 text-blue-400" />
            <span>Adapter Bus</span>
          </div>
          <div className="text-sm font-bold text-slate-100 truncate" title={activeGpu.pciBusId || 'N/A'}>
            {activeGpu.pciBusId || 'N/A'}
          </div>
          <div className="text-[10px] text-slate-500">{gpuTypeLabel}</div>
        </div>
      </div>
    </div>
  );
};
