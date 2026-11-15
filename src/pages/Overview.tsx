import React from 'react';
import {
  Cpu,
  MemoryStick,
  MonitorCog,
  HardDrive,
  Activity,
  ArrowRight,
  Sparkles,
  Zap,
  Radio,
} from 'lucide-react';
import { useSystemStore } from '../store/systemStore';
import { ResourceCard } from '../components/ResourceCard';
import { LiveChart } from '../components/LiveChart';
import { CpuCoreGrid } from '../components/CpuCoreGrid';
import { SystemDetails } from '../components/SystemDetails';
import {
  formatBytes,
  formatFrequency,
  formatMhz,
  formatSpeed,
  formatTemperature,
  formatWatts,
} from '../utils/formatters';
import { ProcessTable } from '../components/ProcessTable';
import { useProcesses } from '../hooks/useProcesses';
import { ProcessDetails } from '../components/ProcessDetails';

export const Overview: React.FC = () => {
  const overview = useSystemStore((state) => state.overview);
  const metricHistory = useSystemStore((state) => state.metricHistory);
  const setPage = useSystemStore((state) => state.setPage);
  const settings = useSystemStore((state) => state.settings);
  const tauriStats = useSystemStore((state) => state.tauriStats);

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

  if (!overview) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500 font-mono-num">
        Initializing system monitor service...
      </div>
    );
  }

  const { cpu, memory, gpus, disks, systemInfo } = overview;
  const isWindows = systemInfo.platform.toLowerCase() === 'windows';
  const primaryGpu = gpus[0];
  const primaryDisk = disks.find((d) => d.isSystem) || disks[0];

  // Extract sparkline arrays from metricHistory
  const cpuSparkline = metricHistory.map((m) => m.cpu);
  const memSparkline = metricHistory.map((m) => m.memory);
  const gpuSparkline = metricHistory.map((m) => m.gpu);
  const diskSparkline = metricHistory.map((m) => m.diskReadMB);

  const vramDisplay = primaryGpu
    ? primaryGpu.vramUsedBytes !== null && primaryGpu.vramTotalBytes !== null
      ? `${formatBytes(primaryGpu.vramUsedBytes)} / ${formatBytes(primaryGpu.vramTotalBytes, 0)}`
      : primaryGpu.vramTotalBytes !== null
      ? `Total: ${formatBytes(primaryGpu.vramTotalBytes, 0)}`
      : 'N/A'
    : 'N/A';

  return (
    <div className="space-y-4 p-4 max-w-[1600px] mx-auto select-none">
      {/* 4 Primary Top Resource Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* CPU Card */}
        <ResourceCard
          id="overview-cpu-card"
          title="CPU"
          subTitle={cpu.manufacturer || cpu.modelName.split(' ').slice(0, 2).join(' ')}
          value={cpu.usagePercent}
          valueDisplay={`${cpu.usagePercent.toFixed(1)}%`}
          icon={Cpu}
          colorScheme="blue"
          historyData={cpuSparkline}
          onClick={() => setPage('cpu')}
          details={[
            { label: 'Cores / Threads', value: `${cpu.coresCount}C / ${cpu.threadsCount}T` },
            { label: 'Clock Speed', value: formatFrequency(cpu.frequencyGhz) },
            {
              label: 'Temperature',
              value: settings.showCpuTemp
                ? formatTemperature(cpu.temperatureC, settings.tempUnit)
                : '—',
            },
            {
              label: 'Load Average',
              value: cpu.loadAverage
                ? `${cpu.loadAverage[0].toFixed(2)}, ${cpu.loadAverage[1].toFixed(2)}`
                : 'N/A',
            },
          ]}
        />

        {/* Memory Card */}
        <ResourceCard
          id="overview-mem-card"
          title="Memory"
          subTitle={
            memory.type
              ? `${memory.type}${memory.speedMhz ? ` @ ${memory.speedMhz} MHz` : ''}`
              : 'System Physical RAM'
          }
          value={memory.usagePercent}
          valueDisplay={`${formatBytes(memory.usedBytes)} / ${formatBytes(memory.totalBytes, 0)}`}
          icon={MemoryStick}
          colorScheme="green"
          historyData={memSparkline}
          onClick={() => setPage('memory')}
          details={[
            { label: 'Available', value: formatBytes(memory.availableBytes) },
            { label: 'Cached', value: formatBytes(memory.cachedBytes) },
            { label: isWindows ? 'Page File' : 'Swap Used', value: formatBytes(memory.swapUsedBytes) },
            { label: isWindows ? 'Page Total' : 'Swap Total', value: formatBytes(memory.swapTotalBytes, 0) },
          ]}
        />

        {/* GPU Card */}
        <ResourceCard
          id="overview-gpu-card"
          title="GPU"
          subTitle={
            primaryGpu
              ? `${primaryGpu.vendor} • ${primaryGpu.gpuType === 'discrete' ? 'Discrete' : 'Integrated'}`
              : 'No GPU Detected'
          }
          value={primaryGpu?.utilizationPercent ?? 0}
          valueDisplay={
            primaryGpu
              ? primaryGpu.utilizationPercent !== null
                ? `${primaryGpu.utilizationPercent.toFixed(1)}%`
                : 'N/A'
              : 'N/A'
          }
          icon={MonitorCog}
          colorScheme="cyan"
          historyData={gpuSparkline}
          onClick={() => setPage('gpu')}
          details={[
            {
              label: 'VRAM Usage',
              value: vramDisplay,
            },
            {
              label: 'Temperature',
              value:
                primaryGpu && settings.showGpuTemp
                  ? formatTemperature(primaryGpu.temperatureC, settings.tempUnit)
                  : '—',
            },
            {
              label: 'Power Draw',
              value: primaryGpu ? formatWatts(primaryGpu.powerWatts) : 'N/A',
            },
            {
              label: 'Core Clock',
              value: primaryGpu ? formatMhz(primaryGpu.coreClockMhz) : 'N/A',
            },
          ]}
        />

        {/* Disk Card */}
        <ResourceCard
          id="overview-disk-card"
          title="Disk Storage"
          subTitle={primaryDisk ? `${primaryDisk.mountPoint} (${primaryDisk.diskType})` : 'Primary Drive'}
          value={primaryDisk ? primaryDisk.usagePercent : 0}
          valueDisplay={
            primaryDisk
              ? `${formatBytes(primaryDisk.usedBytes)} / ${formatBytes(primaryDisk.totalBytes, 0)}`
              : 'N/A'
          }
          icon={HardDrive}
          colorScheme="green"
          historyData={diskSparkline}
          onClick={() => setPage('disk')}
          details={[
            {
              label: 'Read Rate',
              value: primaryDisk ? formatSpeed(primaryDisk.readSpeedBytesSec) : 'N/A',
            },
            {
              label: 'Write Rate',
              value: primaryDisk ? formatSpeed(primaryDisk.writeSpeedBytesSec) : 'N/A',
            },
            {
              label: 'Available',
              value: primaryDisk ? formatBytes(primaryDisk.availableBytes) : '—',
            },
            {
              label: 'Filesystem',
              value: primaryDisk ? primaryDisk.filesystem : '—',
            },
          ]}
        />
      </div>

      {/* Large System Activity Multi-Line Real-Time Graph */}
      <LiveChart data={metricHistory} />

      {/* CPU Cores Grid preview */}
      <CpuCoreGrid cores={cpu.perCoreUsage} frequencyGhz={cpu.frequencyGhz} />

      {/* Process Table Preview Section */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 font-mono-num">
            <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
              Active Processes ({totalCount})
            </h3>
          </div>
          <button
            onClick={() => setPage('processes')}
            className="text-xs font-mono-num text-blue-400 hover:text-blue-300 flex items-center gap-1 hover:underline cursor-pointer"
          >
            <span>View Full Process Manager</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>

        <ProcessTable
          processes={processes.slice(0, 8)}
          totalCount={totalCount}
          filteredCount={filteredCount}
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

      {/* Host System Details Widget */}
      <SystemDetails overview={overview} id="overview-system-details-widget" />

      {/* Process details drawer / modal */}
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
