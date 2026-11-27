import { create } from 'zustand';
import { SystemOverview, MetricHistoryPoint } from '../types/system';
import { ProcessInfo } from '../types/process';
import { systemMonitorService } from '../services/systemMonitor';
import { TauriIpcStats } from '../services/tauriBridge';

export type AppPage =
  | 'overview'
  | 'processes'
  | 'cpu'
  | 'memory'
  | 'gpu'
  | 'disk'
  | 'network'
  | 'desktop'
  | 'settings';

export interface UserSettings {
  refreshInterval: number; // in ms (250, 500, 1000, 1500, 2000, 5000)
  showCpuTemp: boolean;
  showGpuTemp: boolean;
  compactProcessList: boolean;
  startMinimized: boolean;
  startWithSystem: boolean;
  tempUnit: 'C' | 'F';
  theme: 'dark';
  chartTimeframe: 30 | 60 | 120;
  turboMode: boolean;
}

const DEFAULT_SETTINGS: UserSettings = {
  refreshInterval: 1000,
  showCpuTemp: true,
  showGpuTemp: true,
  compactProcessList: false,
  startMinimized: false,
  startWithSystem: true,
  tempUnit: 'C',
  theme: 'dark',
  chartTimeframe: 60,
  turboMode: false,
};

function loadStoredSettings(): UserSettings {
  try {
    const raw = localStorage.getItem('sysmon_settings');
    if (raw) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    }
  } catch {
    // ignore
  }
  return DEFAULT_SETTINGS;
}

function saveStoredSettings(settings: UserSettings) {
  try {
    localStorage.setItem('sysmon_settings', JSON.stringify(settings));
  } catch {
    // ignore
  }
}

export interface IpcBenchmarkData {
  avgLatencyMs: number;
  minLatencyMs: number;
  maxLatencyMs: number;
  opsPerSec: number;
}

interface SystemState {
  currentPage: AppPage;
  overview: SystemOverview | null;
  processes: ProcessInfo[];
  metricHistory: MetricHistoryPoint[];
  selectedProcess: ProcessInfo | null;
  isLoading: boolean;
  isPaused: boolean;
  lastUpdated: number;
  settings: UserSettings;
  activeGpuId: string;
  tauriStats: TauriIpcStats;
  benchmarkResult: IpcBenchmarkData | null;
  isBenchmarking: boolean;

  // Actions
  setPage: (page: AppPage) => void;
  setSelectedProcess: (proc: ProcessInfo | null) => void;
  setActiveGpuId: (id: string) => void;
  togglePause: () => void;
  setRefreshInterval: (ms: number) => void;
  setTurboMode: (enabled: boolean) => void;
  updateSettings: (partial: Partial<UserSettings>) => void;
  applyOverview: (overview: SystemOverview) => void;
  applyProcesses: (processes: ProcessInfo[]) => void;
  fetchTick: () => Promise<void>;
  fetchProcessesOnly: () => Promise<void>;
  killProcess: (pid: number) => Promise<{ success: boolean; message: string }>;
  runBenchmark: () => Promise<void>;
}

let inFlightTick = false;
let inFlightProcs = false;

export const useSystemStore = create<SystemState>((set, get) => ({
  currentPage: 'overview',
  overview: null,
  processes: [],
  metricHistory: [],
  selectedProcess: null,
  isLoading: true,
  isPaused: false,
  lastUpdated: Date.now(),
  settings: loadStoredSettings(),
  activeGpuId: '',
  tauriStats: systemMonitorService.getIpcStats(loadStoredSettings().turboMode),
  benchmarkResult: null,
  isBenchmarking: false,

  setPage: (page) => set({ currentPage: page }),

  setSelectedProcess: (proc) => set({ selectedProcess: proc }),

  setActiveGpuId: (id) => set({ activeGpuId: id }),

  togglePause: () => set((state) => ({ isPaused: !state.isPaused })),

  setRefreshInterval: (ms) => {
    const updated = { ...get().settings, refreshInterval: ms };
    saveStoredSettings(updated);
    set({ settings: updated });
    void systemMonitorService.setPollingInterval(ms);
  },

  setTurboMode: (enabled: boolean) => {
    const newInterval = enabled ? 250 : 1000;
    const updated = { ...get().settings, turboMode: enabled, refreshInterval: newInterval };
    saveStoredSettings(updated);
    set({
      settings: updated,
      tauriStats: systemMonitorService.getIpcStats(enabled),
    });
    void systemMonitorService.setPollingInterval(newInterval);
  },

  updateSettings: (partial) => {
    const updated = { ...get().settings, ...partial };
    saveStoredSettings(updated);
    set({ settings: updated });
    if (partial.refreshInterval !== undefined) {
      void systemMonitorService.setPollingInterval(partial.refreshInterval);
    }
  },

  killProcess: async (pid) => {
    return await systemMonitorService.killProcess(pid);
  },

  runBenchmark: async () => {
    set({ isBenchmarking: true });
    try {
      const res = await systemMonitorService.runBenchmark();
      set({ benchmarkResult: res, isBenchmarking: false });
    } catch {
      set({ isBenchmarking: false });
    }
  },

  applyOverview: (overview) => {
    if (get().isPaused && get().overview !== null) {
      return;
    }

    const now = new Date();
    const timeLabel = `${now.getHours().toString().padStart(2, '0')}:${now
      .getMinutes()
      .toString()
      .padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

    const currentActiveId = get().activeGpuId;
    const selectedGpu =
      overview.gpus.find((g) => g.id === currentActiveId) || overview.gpus[0];
    const nextActiveGpuId = selectedGpu ? selectedGpu.id : '';

    const primaryDisk = overview.disks.find((d) => d.isSystem) || overview.disks[0];

    const newPoint: MetricHistoryPoint = {
      timestamp: overview.timestamp,
      timeLabel,
      cpu: overview.cpu.usagePercent,
      memory: overview.memory.usagePercent,
      gpu: selectedGpu?.utilizationPercent ?? 0,
      vram: selectedGpu?.vramUsagePercent ?? 0,
      diskReadMB:
        primaryDisk?.readSpeedBytesSec != null
          ? parseFloat((primaryDisk.readSpeedBytesSec / (1024 * 1024)).toFixed(1))
          : 0,
      diskWriteMB:
        primaryDisk?.writeSpeedBytesSec != null
          ? parseFloat((primaryDisk.writeSpeedBytesSec / (1024 * 1024)).toFixed(1))
          : 0,
      netRxMB: parseFloat((overview.network.downloadSpeedBytesSec / (1024 * 1024)).toFixed(2)),
      netTxMB: parseFloat((overview.network.uploadSpeedBytesSec / (1024 * 1024)).toFixed(2)),
      cpuTemp: overview.cpu.temperatureC,
      gpuTemp: selectedGpu?.temperatureC ?? null,
    };

    const maxPoints = get().settings.chartTimeframe;
    const history = [...get().metricHistory, newPoint].slice(-maxPoints);
    const tauriStats = systemMonitorService.getIpcStats(get().settings.turboMode);

    set({
      overview,
      activeGpuId: nextActiveGpuId,
      metricHistory: history,
      isLoading: false,
      lastUpdated: Date.now(),
      tauriStats,
    });
  },

  applyProcesses: (processes) => {
    if (get().isPaused && get().processes.length > 0) {
      return;
    }
    let currentSelected = get().selectedProcess;
    if (currentSelected) {
      currentSelected =
        processes.find((p) => p.pid === currentSelected?.pid) || currentSelected;
    }
    set({
      processes,
      selectedProcess: currentSelected,
    });
  },

  fetchProcessesOnly: async () => {
    if (inFlightProcs || (get().isPaused && get().processes.length > 0)) {
      return;
    }
    inFlightProcs = true;
    try {
      const processes = await systemMonitorService.getProcesses();
      get().applyProcesses(processes);
    } catch (err) {
      console.error('Process telemetry poll error:', err);
    } finally {
      inFlightProcs = false;
    }
  },

  fetchTick: async () => {
    if (inFlightTick || (get().isPaused && get().overview !== null)) {
      return;
    }
    inFlightTick = true;

    try {
      const [overview, processes] = await Promise.all([
        systemMonitorService.getSystemOverview(),
        systemMonitorService.getProcesses(),
      ]);
      get().applyOverview(overview);
      get().applyProcesses(processes);
    } catch (err) {
      console.error('System telemetry poll error:', err);
    } finally {
      inFlightTick = false;
    }
  },
}));
