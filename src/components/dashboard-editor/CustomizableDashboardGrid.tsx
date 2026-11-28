import React, { useRef, useState } from 'react';
import {
  ArrowRight,
  BatteryCharging,
  Check,
  Cpu,
  GripVertical,
  HardDrive,
  LayoutGrid,
  MemoryStick,
  MonitorCog,
  Network,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Thermometer,
  Trash2,
  X,
} from 'lucide-react';
import { useSystemStore } from '../../store/systemStore';
import { useDesktopStore } from '../../stores/desktop-store';
import { OPTIONAL_CARD_CATALOG, useLayoutStore } from '../../stores/layout-store';
import { DashboardCardKind, DashboardCardLayoutItem } from '../../types/desktop';
import { ResourceCard } from '../ResourceCard';
import { LiveChart } from '../LiveChart';
import { CpuCoreGrid } from '../CpuCoreGrid';
import { SystemDetails } from '../SystemDetails';
import { ProcessTable } from '../ProcessTable';
import { ProcessDetails } from '../ProcessDetails';
import { useProcesses } from '../../hooks/useProcesses';
import {
  formatBytes,
  formatFrequency,
  formatMhz,
  formatSpeed,
  formatTemperature,
  formatWatts,
} from '../../utils/formatters';

export const CustomizableDashboardGrid: React.FC = () => {
  const overview = useSystemStore((s) => s.overview);
  const metricHistory = useSystemStore((s) => s.metricHistory);
  const setPage = useSystemStore((s) => s.setPage);
  const settings = useSystemStore((s) => s.settings);
  const battery = useDesktopStore((s) => s.battery);

  const presets = useLayoutStore((s) => s.presets);
  const activeLayoutId = useLayoutStore((s) => s.activeLayoutId);
  const editMode = useLayoutStore((s) => s.editMode);
  const isCustomized = useLayoutStore((s) => s.isCustomized);
  const setEditMode = useLayoutStore((s) => s.setEditMode);
  const reorderCard = useLayoutStore((s) => s.reorderCard);
  const resizeCard = useLayoutStore((s) => s.resizeCard);
  const addCard = useLayoutStore((s) => s.addCard);
  const removeCard = useLayoutStore((s) => s.removeCard);
  const saveLayoutAs = useLayoutStore((s) => s.saveLayoutAs);
  const switchLayout = useLayoutStore((s) => s.switchLayout);
  const deleteLayout = useLayoutStore((s) => s.deleteLayout);
  const restoreDefaultLayout = useLayoutStore((s) => s.restoreDefaultLayout);

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

  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [newPresetName, setNewPresetName] = useState('');
  const [showAddMenu, setShowAddMenu] = useState(false);
  const gridRef = useRef<HTMLDivElement | null>(null);

  if (!overview) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500 font-mono-num">
        Initializing system monitor service...
      </div>
    );
  }

  const activePreset = presets.find((p) => p.id === activeLayoutId) || presets[0];
  const cards = (activePreset?.cards || []).filter((c) => c.visible);

  const { cpu, memory, gpus, disks, network, systemInfo } = overview;
  const isWindows = systemInfo.platform.toLowerCase() === 'windows';
  const primaryGpu = gpus[0];
  const primaryDisk = disks.find((d) => d.isSystem) || disks[0];

  const cpuSparkline = metricHistory.map((m) => m.cpu);
  const memSparkline = metricHistory.map((m) => m.memory);
  const gpuSparkline = metricHistory.map((m) => m.gpu);
  const vramSparkline = metricHistory.map((m) => m.vram);
  const diskSparkline = metricHistory.map((m) => m.diskReadMB);
  const netSparkline = metricHistory.map((m) => m.netRxMB);
  const tempSparkline = metricHistory.map((m) => m.cpuTemp ?? 0);

  const vramDisplay = primaryGpu
    ? primaryGpu.vramUsedBytes !== null && primaryGpu.vramTotalBytes !== null
      ? `${formatBytes(primaryGpu.vramUsedBytes)} / ${formatBytes(primaryGpu.vramTotalBytes, 0)}`
      : primaryGpu.vramTotalBytes !== null
      ? `Total: ${formatBytes(primaryGpu.vramTotalBytes, 0)}`
      : 'N/A'
    : 'N/A';

  const colSpanClass = (span: 1 | 2 | 3 | 4) => {
    switch (span) {
      case 1:
        return 'col-span-1 sm:col-span-1 lg:col-span-1';
      case 2:
        return 'col-span-1 sm:col-span-2 lg:col-span-2';
      case 3:
        return 'col-span-1 sm:col-span-2 lg:col-span-3';
      case 4:
        return 'col-span-1 sm:col-span-2 lg:col-span-4';
    }
  };

  const handleResizeDragStart = (
    e: React.MouseEvent,
    card: DashboardCardLayoutItem
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const startSpan = card.colSpan;
    const colWidth = Math.max(220, (gridRef.current?.clientWidth || 1200) / 4);

    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      const spanDelta = Math.round(dx / (colWidth * 0.65));
      const nextSpan = Math.min(4, Math.max(1, startSpan + spanDelta)) as 1 | 2 | 3 | 4;
      const nextHeight: 'compact' | 'standard' | 'tall' =
        dy > 60 ? 'tall' : dy < -45 ? 'compact' : card.heightPreset;
      resizeCard(card.id, nextSpan, nextHeight);
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const renderCardBody = (card: DashboardCardLayoutItem) => {
    const chartHeightClass =
      card.heightPreset === 'compact'
        ? 'h-44'
        : card.heightPreset === 'tall'
        ? 'h-80'
        : 'h-64';

    switch (card.kind) {
      case 'cpu':
        return (
          <ResourceCard
            id="overview-cpu-card"
            title="CPU"
            subTitle={cpu.manufacturer || cpu.modelName.split(' ').slice(0, 2).join(' ')}
            value={cpu.usagePercent}
            valueDisplay={`${cpu.usagePercent.toFixed(1)}%`}
            icon={Cpu}
            colorScheme="blue"
            historyData={cpuSparkline}
            onClick={editMode ? undefined : () => setPage('cpu')}
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
        );
      case 'memory':
        return (
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
            onClick={editMode ? undefined : () => setPage('memory')}
            details={[
              { label: 'Available', value: formatBytes(memory.availableBytes) },
              { label: 'Cached', value: formatBytes(memory.cachedBytes) },
              {
                label: isWindows ? 'Page File' : 'Swap Used',
                value: formatBytes(memory.swapUsedBytes),
              },
              {
                label: isWindows ? 'Page Total' : 'Swap Total',
                value: formatBytes(memory.swapTotalBytes, 0),
              },
            ]}
          />
        );
      case 'gpu':
        return (
          <ResourceCard
            id="overview-gpu-card"
            title="GPU"
            subTitle={
              primaryGpu
                ? `${primaryGpu.vendor} • ${
                    primaryGpu.gpuType === 'discrete' ? 'Discrete' : 'Integrated'
                  }`
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
            onClick={editMode ? undefined : () => setPage('gpu')}
            details={[
              { label: 'VRAM Usage', value: vramDisplay },
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
        );
      case 'vram':
        return (
          <ResourceCard
            id="overview-vram-card"
            title="VRAM"
            subTitle={primaryGpu ? primaryGpu.name : 'Dedicated Video Memory'}
            value={primaryGpu?.vramUsagePercent ?? 0}
            valueDisplay={vramDisplay}
            icon={MonitorCog}
            colorScheme="cyan"
            historyData={vramSparkline}
            onClick={editMode ? undefined : () => setPage('gpu')}
            details={[
              {
                label: 'VRAM Used',
                value:
                  primaryGpu?.vramUsedBytes != null
                    ? formatBytes(primaryGpu.vramUsedBytes)
                    : 'N/A',
              },
              {
                label: 'VRAM Total',
                value:
                  primaryGpu?.vramTotalBytes != null
                    ? formatBytes(primaryGpu.vramTotalBytes, 0)
                    : 'N/A',
              },
              {
                label: 'Memory Clock',
                value: primaryGpu ? formatMhz(primaryGpu.memoryClockMhz) : 'N/A',
              },
              {
                label: 'GPU Load',
                value:
                  primaryGpu?.utilizationPercent != null
                    ? `${primaryGpu.utilizationPercent.toFixed(1)}%`
                    : 'N/A',
              },
            ]}
          />
        );
      case 'disk':
        return (
          <ResourceCard
            id="overview-disk-card"
            title="Disk Storage"
            subTitle={
              primaryDisk ? `${primaryDisk.mountPoint} (${primaryDisk.diskType})` : 'Primary Drive'
            }
            value={primaryDisk ? primaryDisk.usagePercent : 0}
            valueDisplay={
              primaryDisk
                ? `${formatBytes(primaryDisk.usedBytes)} / ${formatBytes(primaryDisk.totalBytes, 0)}`
                : 'N/A'
            }
            icon={HardDrive}
            colorScheme="green"
            historyData={diskSparkline}
            onClick={editMode ? undefined : () => setPage('disk')}
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
        );
      case 'network':
        return (
          <ResourceCard
            id="overview-network-card"
            title="Network"
            subTitle={network.activeInterface || 'Active Adapter'}
            value={Math.min(100, (network.downloadSpeedBytesSec / (10 * 1024 * 1024)) * 100)}
            valueDisplay={formatSpeed(network.downloadSpeedBytesSec)}
            icon={Network}
            colorScheme="blue"
            historyData={netSparkline}
            onClick={editMode ? undefined : () => setPage('network')}
            details={[
              { label: 'Upload Rate', value: formatSpeed(network.uploadSpeedBytesSec) },
              { label: 'Download Rate', value: formatSpeed(network.downloadSpeedBytesSec) },
              { label: 'Total RX', value: formatBytes(network.totalDownloadedBytes) },
              { label: 'Total TX', value: formatBytes(network.totalUploadedBytes) },
            ]}
          />
        );
      case 'temperature':
        return (
          <ResourceCard
            id="overview-temp-card"
            title="Thermals"
            subTitle="CPU & GPU Sensor Package"
            value={cpu.temperatureC ?? primaryGpu?.temperatureC ?? 0}
            valueDisplay={formatTemperature(cpu.temperatureC, settings.tempUnit)}
            icon={Thermometer}
            colorScheme="amber"
            historyData={tempSparkline}
            details={[
              {
                label: 'CPU Package',
                value: formatTemperature(cpu.temperatureC, settings.tempUnit),
              },
              {
                label: 'GPU Core',
                value: formatTemperature(primaryGpu?.temperatureC ?? null, settings.tempUnit),
              },
              {
                label: 'GPU Fan',
                value:
                  primaryGpu?.fanSpeedPercent != null ? `${primaryGpu.fanSpeedPercent}%` : 'N/A',
              },
              {
                label: 'Governor',
                value: cpu.governor || 'Default',
              },
            ]}
          />
        );
      case 'battery':
        return (
          <ResourceCard
            id="overview-battery-card"
            title="Battery"
            subTitle={battery ? battery.state : 'AC / No Battery Detected'}
            value={battery?.percent ?? 0}
            valueDisplay={battery ? `${battery.percent.toFixed(0)}%` : 'N/A'}
            icon={BatteryCharging}
            colorScheme="amber"
            historyData={battery ? [battery.percent, battery.percent] : [0]}
            details={[
              { label: 'Power Source', value: battery?.acOnline ? 'AC Adapter' : battery ? 'Battery' : 'Desktop AC' },
              { label: 'Charging', value: battery ? (battery.isCharging ? 'Yes' : 'No') : 'N/A' },
              {
                label: 'Power Draw',
                value: battery?.powerWatts != null ? `${battery.powerWatts} W` : 'N/A',
              },
              {
                label: 'Remaining',
                value:
                  battery?.timeRemainingSecs != null
                    ? `${Math.floor(battery.timeRemainingSecs / 60)}m`
                    : 'N/A',
              },
            ]}
          />
        );
      case 'activity_chart':
        return <LiveChart data={metricHistory} chartHeightClass={chartHeightClass} />;
      case 'cpu_cores':
        return <CpuCoreGrid cores={cpu.perCoreUsage} frequencyGhz={cpu.frequencyGhz} />;
      case 'processes': {
        const rowLimit =
          card.heightPreset === 'compact' ? 5 : card.heightPreset === 'tall' ? 14 : 8;
        return (
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
              processes={processes.slice(0, rowLimit)}
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
        );
      }
      case 'system_details':
        return <SystemDetails overview={overview} id="overview-system-details-widget" />;
    }
  };

  const addableKinds = OPTIONAL_CARD_CATALOG.filter(
    (item) => !cards.some((c) => c.kind === item.kind)
  );

  return (
    <div className="space-y-4 p-4 max-w-[1600px] mx-auto select-none">
      {/* Compact Layout Toolbar (non-intrusive when Edit Mode is off) */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-mono-num text-xs">
          {(isCustomized || presets.length > 1 || editMode) && (
            <div className="flex items-center gap-1.5 bg-[#0B1118] border border-[#1A2633] rounded px-2 py-1">
              <LayoutGrid className="w-3.5 h-3.5 text-blue-400" />
              <select
                value={activeLayoutId}
                onChange={(e) => switchLayout(e.target.value)}
                className="bg-transparent text-slate-200 text-xs focus:outline-none cursor-pointer"
              >
                {presets.map((p) => (
                  <option key={p.id} value={p.id} className="bg-[#0B1118]">
                    {p.name}
                  </option>
                ))}
              </select>
              {activeLayoutId !== 'default' && editMode && (
                <button
                  onClick={() => deleteLayout(activeLayoutId)}
                  title="Delete selected custom layout"
                  className="text-red-400 hover:text-red-300 cursor-pointer ml-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 font-mono-num text-xs">
          {editMode && (
            <>
              {/* Add Card Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setShowAddMenu((v) => !v)}
                  className="px-2.5 py-1 rounded bg-[#0B1118] hover:bg-[#101720] border border-[#1A2633] text-slate-200 flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Add Card</span>
                </button>
                {showAddMenu && (
                  <div className="absolute right-0 mt-1 w-52 bg-[#0B1118] border border-[#1A2633] rounded-md shadow-xl p-1.5 z-40 space-y-0.5">
                    {addableKinds.length === 0 ? (
                      <div className="px-2 py-1.5 text-[11px] text-slate-400">
                        All catalog cards are already active.
                      </div>
                    ) : (
                      addableKinds.map((item) => (
                        <button
                          key={item.kind}
                          onClick={() => {
                            addCard(item.kind as DashboardCardKind);
                            setShowAddMenu(false);
                          }}
                          className="w-full text-left px-2 py-1.5 rounded text-xs text-slate-200 hover:bg-[#101720] flex items-center justify-between cursor-pointer"
                        >
                          <span>{item.title}</span>
                          <Plus className="w-3 h-3 text-blue-400" />
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Save Named Layout */}
              <div className="flex items-center gap-1 bg-[#0B1118] border border-[#1A2633] rounded px-2 py-0.5">
                <input
                  type="text"
                  value={newPresetName}
                  onChange={(e) => setNewPresetName(e.target.value)}
                  placeholder="Save layout as..."
                  className="bg-transparent text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none w-28"
                />
                <button
                  onClick={() => {
                    if (newPresetName.trim()) {
                      saveLayoutAs(newPresetName);
                      setNewPresetName('');
                    }
                  }}
                  title="Save current layout"
                  className="p-1 text-emerald-400 hover:text-emerald-300 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                </button>
              </div>

              <button
                onClick={() => restoreDefaultLayout()}
                className="px-2.5 py-1 rounded bg-[#0B1118] hover:bg-[#101720] border border-[#1A2633] text-slate-300 flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                <span>Restore Default</span>
              </button>
            </>
          )}

          <button
            onClick={() => {
              setEditMode(!editMode);
              setShowAddMenu(false);
            }}
            id="toggle-dashboard-edit-mode"
            className={`px-2.5 py-1 rounded border flex items-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer ${
              editMode
                ? 'bg-blue-600/20 border-blue-500/50 text-blue-400 font-semibold'
                : 'bg-[#0B1118] border-[#1A2633] text-slate-400 hover:text-slate-200'
            }`}
          >
            {editMode ? <Check className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
            <span>{editMode ? 'Done Editing' : 'Edit Layout'}</span>
          </button>
        </div>
      </div>

      {/* Responsive 4-Column Customizable Grid */}
      <div
        ref={gridRef}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-stretch"
      >
        {cards.map((card) => (
          <div
            key={card.id}
            draggable={editMode}
            onDragStart={() => {
              if (editMode) setDraggedId(card.id);
            }}
            onDragOver={(e) => {
              if (editMode) {
                e.preventDefault();
                setDragOverId(card.id);
              }
            }}
            onDragLeave={() => {
              if (dragOverId === card.id) setDragOverId(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (editMode && draggedId && draggedId !== card.id) {
                reorderCard(draggedId, card.id);
              }
              setDraggedId(null);
              setDragOverId(null);
            }}
            onDragEnd={() => {
              setDraggedId(null);
              setDragOverId(null);
            }}
            className={`${colSpanClass(card.colSpan)} relative min-w-0 transition-all ${
              editMode
                ? `rounded-lg ring-1 ${
                    dragOverId === card.id
                      ? 'ring-blue-400 bg-blue-500/5'
                      : 'ring-blue-500/30'
                  }`
                : ''
            }`}
          >
            {/* Edit Mode Overlay Controls */}
            {editMode && (
              <div className="mb-1.5 px-2.5 py-1 rounded bg-[#080B10] border border-[#1A2633] flex items-center justify-between gap-2 font-mono-num text-[11px]">
                <div className="flex items-center gap-1.5 cursor-grab text-slate-300">
                  <GripVertical className="w-3.5 h-3.5 text-blue-400" />
                  <span className="font-semibold truncate">{card.title}</span>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <select
                    value={card.colSpan}
                    onChange={(e) =>
                      resizeCard(card.id, Number(e.target.value) as 1 | 2 | 3 | 4)
                    }
                    title="Card column width"
                    className="bg-[#101720] border border-[#1A2633] rounded px-1.5 py-0.5 text-[10px] text-slate-200 cursor-pointer"
                  >
                    <option value={1}>1 Col</option>
                    <option value={2}>2 Col</option>
                    <option value={3}>3 Col</option>
                    <option value={4}>Full</option>
                  </select>

                  <select
                    value={card.heightPreset}
                    onChange={(e) =>
                      resizeCard(
                        card.id,
                        card.colSpan,
                        e.target.value as 'compact' | 'standard' | 'tall'
                      )
                    }
                    title="Card height"
                    className="bg-[#101720] border border-[#1A2633] rounded px-1.5 py-0.5 text-[10px] text-slate-200 cursor-pointer"
                  >
                    <option value="compact">Compact</option>
                    <option value="standard">Standard</option>
                    <option value="tall">Tall</option>
                  </select>

                  <button
                    onClick={() => removeCard(card.id)}
                    title="Remove card from layout"
                    className="p-0.5 rounded hover:bg-red-500/20 text-slate-400 hover:text-red-400 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {renderCardBody(card)}

            {/* Drag-to-resize corner handle (shown only in Edit Mode) */}
            {editMode && (
              <div
                onMouseDown={(e) => handleResizeDragStart(e, card)}
                title="Drag to resize card width & height"
                className="absolute bottom-1 right-1 w-3.5 h-3.5 cursor-nwse-resize flex items-end justify-end p-0.5 opacity-80 hover:opacity-100"
              >
                <span className="block w-2 h-2 border-r-2 border-b-2 border-blue-400" />
              </div>
            )}
          </div>
        ))}
      </div>

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
