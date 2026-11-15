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

// Singleton Service Instance
export const systemMonitorService: ISystemMonitorService = new RealSystemMonitorService();
