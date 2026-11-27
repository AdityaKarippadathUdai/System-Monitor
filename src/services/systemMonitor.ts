/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CpuStats,
  MemoryStats,
  GpuStats,
  DiskStats,
  NetworkStats,
  NetworkInterface,
  NetworkTrafficOverview,
  NetworkConnection,
  ProcessNetworkUsage,
  NetworkHistoryResponse,
  ProcessNetworkDetails,
  NetworkStreamPayload,
  NetworkTimePeriod,
  SystemInfo,
  SystemOverview,
  PingResult,
} from '../types/system';
import { ProcessInfo } from '../types/process';
import {
  isTauriEnvironment,
  invokeTauriCommand,
  listenToTauriStream,
  getTauriIpcStats,
  runIpcBenchmark,
  TauriIpcStats,
} from './tauriBridge';
import type { UnlistenFn } from '@tauri-apps/api/event';

export interface ISystemMonitorService {
  getSystemOverview(): Promise<SystemOverview>;
  getCpuStats(): Promise<CpuStats>;
  getMemoryStats(): Promise<MemoryStats>;
  getGpuStats(): Promise<GpuStats[]>;
  getDiskStats(): Promise<DiskStats[]>;
  getNetworkStats(): Promise<NetworkStats>;
  getSystemInfo(): Promise<SystemInfo>;
  getProcesses(): Promise<ProcessInfo[]>;
  killProcess(pid: number): Promise<{ success: boolean; message: string }>;
  setPollingInterval(intervalMs: number): Promise<void>;
  subscribeToOverviewStream(handler: (overview: SystemOverview) => void): Promise<UnlistenFn>;
  pingTarget(target: string, port?: number): Promise<PingResult>;
  isTauriAvailable(): boolean;
  getIpcStats(turbo?: boolean): TauriIpcStats;
  runBenchmark(): Promise<{
    avgLatencyMs: number;
    minLatencyMs: number;
    maxLatencyMs: number;
    opsPerSec: number;
  }>;

  // Enhanced Network Monitoring APIs
  setNetworkMonitoringActive(active: boolean, intervalMs?: number): Promise<void>;
  subscribeToNetworkStream(handler: (payload: NetworkStreamPayload) => void): Promise<UnlistenFn>;
  getNetworkInterfaces(): Promise<NetworkInterface[]>;
  getNetworkOverview(): Promise<NetworkTrafficOverview>;
  getNetworkProcesses(): Promise<ProcessNetworkUsage[]>;
  getNetworkConnections(): Promise<NetworkConnection[]>;
  getProcessNetworkDetails(pid: number): Promise<ProcessNetworkDetails | null>;
  setNetworkInterface(interfaceName: string): Promise<string>;
  getNetworkHistory(period: NetworkTimePeriod, interfaceName?: string): Promise<NetworkHistoryResponse>;
}

class RealSystemMonitorService implements ISystemMonitorService {
  isTauriAvailable(): boolean {
    return isTauriEnvironment();
  }

  getIpcStats(turbo: boolean = false): TauriIpcStats {
    return getTauriIpcStats(turbo);
  }

  async runBenchmark() {
    return await runIpcBenchmark(25);
  }

  async setPollingInterval(intervalMs: number): Promise<void> {
    if (this.isTauriAvailable()) {
      try {
        await invokeTauriCommand<number>('set_polling_interval', { intervalMs });
      } catch (err) {
        console.warn('[SystemMonitor] Failed to update Tauri polling interval:', err);
      }
    }
  }

  async subscribeToOverviewStream(handler: (overview: SystemOverview) => void): Promise<UnlistenFn> {
    return await listenToTauriStream<SystemOverview>('system_metrics_stream', handler);
  }

  async setNetworkMonitoringActive(active: boolean, intervalMs?: number): Promise<void> {
    if (this.isTauriAvailable()) {
      try {
        await invokeTauriCommand<boolean>('set_network_monitoring_active', {
          active,
          intervalMs: intervalMs ?? null,
        });
      } catch (err) {
        console.warn('[SystemMonitor] Failed to toggle network monitoring state:', err);
      }
    }
  }

  async subscribeToNetworkStream(handler: (payload: NetworkStreamPayload) => void): Promise<UnlistenFn> {
    return await listenToTauriStream<NetworkStreamPayload>('network_metrics_stream', handler);
  }

  async getNetworkInterfaces(): Promise<NetworkInterface[]> {
    if (this.isTauriAvailable()) {
      try {
        return await invokeTauriCommand<NetworkInterface[]>('get_network_interfaces');
      } catch (err) {
        console.warn('[SystemMonitor] Tauri get_network_interfaces fallback:', err);
      }
    }
    const res = await fetch('/api/network/interfaces');
    if (!res.ok) throw new Error(`Failed to fetch network interfaces: ${res.statusText}`);
    return await res.json();
  }

  async getNetworkOverview(): Promise<NetworkTrafficOverview> {
    if (this.isTauriAvailable()) {
      try {
        return await invokeTauriCommand<NetworkTrafficOverview>('get_network_overview');
      } catch (err) {
        console.warn('[SystemMonitor] Tauri get_network_overview fallback:', err);
      }
    }
    const res = await fetch('/api/network/overview');
    if (!res.ok) throw new Error(`Failed to fetch network overview: ${res.statusText}`);
    return await res.json();
  }

  async getNetworkProcesses(): Promise<ProcessNetworkUsage[]> {
    if (this.isTauriAvailable()) {
      try {
        return await invokeTauriCommand<ProcessNetworkUsage[]>('get_network_processes');
      } catch (err) {
        console.warn('[SystemMonitor] Tauri get_network_processes fallback:', err);
      }
    }
    const res = await fetch('/api/network/processes');
    if (!res.ok) throw new Error(`Failed to fetch network processes: ${res.statusText}`);
    return await res.json();
  }

  async getNetworkConnections(): Promise<NetworkConnection[]> {
    if (this.isTauriAvailable()) {
      try {
        return await invokeTauriCommand<NetworkConnection[]>('get_network_connections');
      } catch (err) {
        console.warn('[SystemMonitor] Tauri get_network_connections fallback:', err);
      }
    }
    const res = await fetch('/api/network/connections');
    if (!res.ok) throw new Error(`Failed to fetch network connections: ${res.statusText}`);
    return await res.json();
  }

  async getProcessNetworkDetails(pid: number): Promise<ProcessNetworkDetails | null> {
    if (this.isTauriAvailable()) {
      try {
        return await invokeTauriCommand<ProcessNetworkDetails | null>('get_process_network_details', {
          pid,
        });
      } catch (err) {
        console.warn('[SystemMonitor] Tauri get_process_network_details fallback:', err);
      }
    }
    const res = await fetch(`/api/network/process/${pid}`);
    if (!res.ok) return null;
    return await res.json();
  }

  async setNetworkInterface(interfaceName: string): Promise<string> {
    if (this.isTauriAvailable()) {
      try {
        return await invokeTauriCommand<string>('set_network_interface', { interfaceName });
      } catch (err) {
        console.warn('[SystemMonitor] Tauri set_network_interface fallback:', err);
      }
    }
    const res = await fetch('/api/network/interface', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ interfaceName }),
    });
    const data = await res.json();
    return data.selectedInterface || interfaceName;
  }

  async getNetworkHistory(
    period: NetworkTimePeriod,
    interfaceName?: string
  ): Promise<NetworkHistoryResponse> {
    if (this.isTauriAvailable()) {
      try {
        return await invokeTauriCommand<NetworkHistoryResponse>('get_network_history', {
          period,
          interfaceName: interfaceName ?? null,
        });
      } catch (err) {
        console.warn('[SystemMonitor] Tauri get_network_history fallback:', err);
      }
    }
    const params = new URLSearchParams({ period });
    if (interfaceName) params.set('iface', interfaceName);
    const res = await fetch(`/api/network/history?${params.toString()}`);
    if (!res.ok) throw new Error(`Failed to fetch network history: ${res.statusText}`);
    return await res.json();
  }

  async pingTarget(target: string, port?: number): Promise<PingResult> {
    if (this.isTauriAvailable()) {
      try {
        return await invokeTauriCommand<PingResult>('ping_target', {
          target,
          port: port ?? null,
        });
      } catch (err) {
        return {
          target,
          latencyMs: null,
          reachable: false,
          method: 'IPC',
          error: err instanceof Error ? err.message : String(err),
          timestamp: Date.now(),
        };
      }
    }

    const params = new URLSearchParams({ target });
    if (port) params.set('port', String(port));
    const res = await fetch(`/api/system/network-ping?${params.toString()}`);
    return await res.json();
  }

  async getSystemOverview(): Promise<SystemOverview> {
    if (this.isTauriAvailable()) {
      try {
        return await invokeTauriCommand<SystemOverview>('get_system_overview');
      } catch (err) {
        console.warn('[SystemMonitor] Tauri IPC overview failed, falling back to HTTP API:', err);
      }
    }

    const res = await fetch('/api/system/overview');
    if (!res.ok) {
      throw new Error(`Failed to fetch system overview: ${res.statusText}`);
    }
    return await res.json();
  }

  async getSystemInfo(): Promise<SystemInfo> {
    const overview = await this.getSystemOverview();
    return overview.systemInfo;
  }

  async getCpuStats(): Promise<CpuStats> {
    const overview = await this.getSystemOverview();
    return overview.cpu;
  }

  async getMemoryStats(): Promise<MemoryStats> {
    const overview = await this.getSystemOverview();
    return overview.memory;
  }

  async getGpuStats(): Promise<GpuStats[]> {
    const overview = await this.getSystemOverview();
    return overview.gpus;
  }

  async getDiskStats(): Promise<DiskStats[]> {
    const overview = await this.getSystemOverview();
    return overview.disks;
  }

  async getNetworkStats(): Promise<NetworkStats> {
    const overview = await this.getSystemOverview();
    return overview.network;
  }

  async getProcesses(): Promise<ProcessInfo[]> {
    if (this.isTauriAvailable()) {
      try {
        return await invokeTauriCommand<ProcessInfo[]>('get_processes');
      } catch (err) {
        console.warn('[SystemMonitor] Tauri IPC processes failed, falling back to HTTP API:', err);
      }
    }

    const res = await fetch('/api/system/processes');
    if (!res.ok) {
      throw new Error(`Failed to fetch processes: ${res.statusText}`);
    }
    return await res.json();
  }

  async killProcess(pid: number): Promise<{ success: boolean; message: string }> {
    if (this.isTauriAvailable()) {
      try {
        return await invokeTauriCommand<{ success: boolean; message: string }>('kill_process', { pid });
      } catch (err) {
        return {
          success: false,
          message: `Tauri IPC Error: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }

    try {
      const res = await fetch('/api/system/kill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pid }),
      });
      return await res.json();
    } catch (err: any) {
      return {
        success: false,
        message: err.message || 'Failed to communicate with host process manager.',
      };
    }
  }
}

export const systemMonitorService: ISystemMonitorService = new RealSystemMonitorService();
