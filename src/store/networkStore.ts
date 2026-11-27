import { create } from 'zustand';
import {
  BandwidthUnit,
  NetworkConnection,
  NetworkHistoryResponse,
  NetworkStreamPayload,
  NetworkTimePeriod,
  NetworkTrafficOverview,
  ProcessNetworkDetails,
  ProcessNetworkUsage,
} from '../types/system';
import { systemMonitorService } from '../services/systemMonitor';

interface NetworkStoreState {
  overview: NetworkTrafficOverview | null;
  processes: ProcessNetworkUsage[];
  connections: NetworkConnection[];
  history: NetworkHistoryResponse | null;
  selectedInterface: string;
  selectedPeriod: NetworkTimePeriod;
  analyticsPeriod: NetworkTimePeriod;
  bandwidthUnit: BandwidthUnit;
  monitorIntervalMs: number;
  selectedPid: number | null;
  selectedAppDetails: ProcessNetworkDetails | null;
  isLoading: boolean;
  isRefreshingProcesses: boolean;
  isRefreshingConnections: boolean;
  isLoadingDetails: boolean;
  error: string | null;
  lastUpdated: number;

  setSelectedInterface: (iface: string) => Promise<void>;
  setSelectedPeriod: (period: NetworkTimePeriod) => Promise<void>;
  setAnalyticsPeriod: (period: NetworkTimePeriod) => Promise<void>;
  setBandwidthUnit: (unit: BandwidthUnit) => void;
  setMonitorIntervalMs: (ms: number) => Promise<void>;
  selectApplication: (pid: number | null) => Promise<void>;
  applyStreamPayload: (payload: NetworkStreamPayload) => void;
  refreshAll: () => Promise<void>;
  refreshProcesses: () => Promise<void>;
  refreshConnections: () => Promise<void>;
  refreshHistory: () => Promise<void>;
  refreshSelectedAppDetails: () => Promise<void>;
}

let inFlightAll = false;
let inFlightProcs = false;
let inFlightConns = false;
let inFlightHistory = false;

export const useNetworkStore = create<NetworkStoreState>((set, get) => ({
  overview: null,
  processes: [],
  connections: [],
  history: null,
  selectedInterface: 'all',
  selectedPeriod: '5m',
  analyticsPeriod: '1h',
  bandwidthUnit: 'bytes',
  monitorIntervalMs: 1000,
  selectedPid: null,
  selectedAppDetails: null,
  isLoading: true,
  isRefreshingProcesses: false,
  isRefreshingConnections: false,
  isLoadingDetails: false,
  error: null,
  lastUpdated: 0,

  setSelectedInterface: async (iface) => {
    set({ selectedInterface: iface });
    try {
      const confirmed = await systemMonitorService.setNetworkInterface(iface);
      set({ selectedInterface: confirmed });
      await get().refreshAll();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to switch network interface' });
    }
  },

  setSelectedPeriod: async (period) => {
    set({ selectedPeriod: period });
    await get().refreshHistory();
  },

  setAnalyticsPeriod: async (period) => {
    set({ analyticsPeriod: period, selectedPeriod: period });
    await get().refreshHistory();
  },

  setBandwidthUnit: (unit) => set({ bandwidthUnit: unit }),

  setMonitorIntervalMs: async (ms) => {
    const clamped = Math.max(500, Math.min(10000, ms));
    set({ monitorIntervalMs: clamped });
    await systemMonitorService.setNetworkMonitoringActive(true, clamped);
  },

  selectApplication: async (pid) => {
    if (pid === null) {
      set({ selectedPid: null, selectedAppDetails: null, isLoadingDetails: false });
      return;
    }
    set({ selectedPid: pid, isLoadingDetails: true });
    try {
      const details = await systemMonitorService.getProcessNetworkDetails(pid);
      if (get().selectedPid === pid) {
        set({ selectedAppDetails: details, isLoadingDetails: false });
      }
    } catch (err) {
      set({
        isLoadingDetails: false,
        error: err instanceof Error ? err.message : 'Failed to load application network details',
      });
    }
  },

  applyStreamPayload: (payload) => {
    const { selectedPid, selectedAppDetails } = get();
    let nextDetails = selectedAppDetails;

    if (selectedPid !== null) {
      const matchedUsage = payload.processes.find((p) => p.pid === selectedPid);
      const matchedConns = payload.connections.filter((c) => c.pid === selectedPid);
      if (matchedUsage) {
        const prevHist = nextDetails?.history || [];
        const point = {
          timestamp: payload.overview.timestamp,
          timeLabel: new Date(payload.overview.timestamp).toLocaleTimeString([], {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          }),
          downloadBytesSec: matchedUsage.downloadSpeedBytesSec ?? 0,
          uploadBytesSec: matchedUsage.uploadSpeedBytesSec ?? 0,
          peakDownloadBytesSec: matchedUsage.downloadSpeedBytesSec ?? 0,
          peakUploadBytesSec: matchedUsage.uploadSpeedBytesSec ?? 0,
          downloadedDeltaBytes: 0,
          uploadedDeltaBytes: 0,
          activeConnections: matchedUsage.activeConnections,
        };
        nextDetails = {
          usage: matchedUsage,
          connections: matchedConns,
          history: [...prevHist, point].slice(-180),
          capabilities: payload.overview.capabilities,
        };
      }
    }

    const { history, selectedPeriod } = get();
    let nextHistory = history;
    if (
      history &&
      ['1m', '5m', '15m', '30m', '1h'].includes(selectedPeriod) &&
      history.interfaceName === payload.overview.selectedInterface
    ) {
      const livePoint = {
        timestamp: payload.overview.timestamp,
        timeLabel: new Date(payload.overview.timestamp).toLocaleTimeString([], {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
        downloadBytesSec: payload.overview.downloadSpeedBytesSec,
        uploadBytesSec: payload.overview.uploadSpeedBytesSec,
        peakDownloadBytesSec: Math.max(
          payload.overview.downloadSpeedBytesSec,
          payload.overview.peakDownloadBytesSec
        ),
        peakUploadBytesSec: Math.max(
          payload.overview.uploadSpeedBytesSec,
          payload.overview.peakUploadBytesSec
        ),
        downloadedDeltaBytes: 0,
        uploadedDeltaBytes: 0,
        activeConnections: payload.overview.activeConnectionsCount,
      };
      const maxPts =
        selectedPeriod === '1m'
          ? 60
          : selectedPeriod === '5m'
          ? 300
          : selectedPeriod === '15m'
          ? 900
          : selectedPeriod === '30m'
          ? 1800
          : 3600;
      const lastPt = history.points[history.points.length - 1];
      const nextPoints =
        lastPt && lastPt.timestamp === livePoint.timestamp
          ? [...history.points.slice(0, -1), livePoint]
          : [...history.points, livePoint].slice(-maxPts);
      nextHistory = {
        ...history,
        points: nextPoints,
        peakDownloadBytesSec: Math.max(
          history.peakDownloadBytesSec,
          payload.overview.downloadSpeedBytesSec
        ),
        peakUploadBytesSec: Math.max(
          history.peakUploadBytesSec,
          payload.overview.uploadSpeedBytesSec
        ),
      };
    }

    set({
      overview: payload.overview,
      selectedInterface: payload.overview.selectedInterface,
      processes: payload.processes,
      connections: payload.connections,
      history: nextHistory,
      selectedAppDetails: nextDetails,
      isLoading: false,
      error: null,
      lastUpdated: Date.now(),
    });
  },

  refreshAll: async () => {
    if (inFlightAll) return;
    inFlightAll = true;
    try {
      const period = get().selectedPeriod;
      const iface = get().selectedInterface;
      const [overview, processes, connections, history] = await Promise.all([
        systemMonitorService.getNetworkOverview(),
        systemMonitorService.getNetworkProcesses(),
        systemMonitorService.getNetworkConnections(),
        systemMonitorService.getNetworkHistory(period, iface),
      ]);

      const { selectedPid, selectedAppDetails } = get();
      let nextDetails = selectedAppDetails;
      if (selectedPid !== null) {
        const fresh = await systemMonitorService.getProcessNetworkDetails(selectedPid);
        if (fresh) nextDetails = fresh;
      }

      set({
        overview,
        selectedInterface: overview.selectedInterface,
        processes,
        connections,
        history,
        selectedAppDetails: nextDetails,
        isLoading: false,
        error: null,
        lastUpdated: Date.now(),
      });
    } catch (err) {
      set({
        isLoading: false,
        error: err instanceof Error ? err.message : 'Unable to query host network telemetry',
      });
    } finally {
      inFlightAll = false;
    }
  },

  refreshProcesses: async () => {
    if (inFlightProcs) return;
    inFlightProcs = true;
    set({ isRefreshingProcesses: true });
    try {
      const processes = await systemMonitorService.getNetworkProcesses();
      set({ processes, isRefreshingProcesses: false, lastUpdated: Date.now() });
    } catch (err) {
      set({
        isRefreshingProcesses: false,
        error: err instanceof Error ? err.message : 'Failed to refresh process network table',
      });
    } finally {
      inFlightProcs = false;
    }
  },

  refreshConnections: async () => {
    if (inFlightConns) return;
    inFlightConns = true;
    set({ isRefreshingConnections: true });
    try {
      const connections = await systemMonitorService.getNetworkConnections();
      set({ connections, isRefreshingConnections: false, lastUpdated: Date.now() });
    } catch (err) {
      set({
        isRefreshingConnections: false,
        error: err instanceof Error ? err.message : 'Failed to refresh connections table',
      });
    } finally {
      inFlightConns = false;
    }
  },

  refreshHistory: async () => {
    if (inFlightHistory) return;
    inFlightHistory = true;
    try {
      const history = await systemMonitorService.getNetworkHistory(
        get().selectedPeriod,
        get().selectedInterface
      );
      set({ history });
    } catch {
      // non-fatal
    } finally {
      inFlightHistory = false;
    }
  },

  refreshSelectedAppDetails: async () => {
    const pid = get().selectedPid;
    if (pid === null) return;
    set({ isLoadingDetails: true });
    try {
      const details = await systemMonitorService.getProcessNetworkDetails(pid);
      if (get().selectedPid === pid) {
        set({ selectedAppDetails: details, isLoadingDetails: false });
      }
    } catch {
      set({ isLoadingDetails: false });
    }
  },
}));
