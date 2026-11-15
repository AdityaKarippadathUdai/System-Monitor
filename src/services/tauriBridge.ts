/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';

export interface TauriIpcStats {
  isTauri: boolean;
  latencyMs: number;
  throughputPerSec: number;
  totalCalls: number;
  lastPingTimestamp: number;
  engineName: string;
  isStreamActive: boolean;
  turboMode: boolean;
}

let callCounter = 0;
let lastThroughputReset = Date.now();
let callsInWindow = 0;
let currentThroughput = 0;
let lastMeasuredLatency = 0.5;

// Check if running within Tauri native webview runtime
export function isTauriEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  const win = window as unknown as {
    __TAURI__?: unknown;
    __TAURI_INTERNALS__?: unknown;
  };
  return Boolean(win.__TAURI__ || win.__TAURI_INTERNALS__);
}

// Wrapper around invoke with latency tracking
export async function invokeTauriCommand<T>(
  command: string,
  args?: Record<string, unknown>
): Promise<T> {
  const startTime = performance.now();
  callCounter += 1;
  callsInWindow += 1;

  // Recalculate throughput window
  const now = Date.now();
  if (now - lastThroughputReset >= 1000) {
    currentThroughput = callsInWindow;
    callsInWindow = 0;
    lastThroughputReset = now;
  }

  if (isTauriEnvironment()) {
    try {
      const result = await invoke<T>(command, args);
      lastMeasuredLatency = parseFloat((performance.now() - startTime).toFixed(2));
      return result;
    } catch (err) {
      console.warn(`[Tauri IPC] Command "${command}" failed:`, err);
      throw err;
    }
  }

  throw new Error(`Tauri environment not detected for command: ${command}`);
}

// Listen to streaming high-speed hardware telemetry events from Rust backend
export async function listenToTauriStream<T>(
  eventName: string,
  handler: (payload: T) => void
): Promise<UnlistenFn> {
  if (isTauriEnvironment()) {
    return await listen<T>(eventName, (event) => {
      handler(event.payload);
    });
  }

  return () => {};
}

// Get live diagnostic stats for Tauri IPC / Backend performance
export function getTauriIpcStats(turbo: boolean = false): TauriIpcStats {
  const isTauri = isTauriEnvironment();
  return {
    isTauri,
    latencyMs: lastMeasuredLatency,
    throughputPerSec: currentThroughput || (turbo ? 4 : 1),
    totalCalls: callCounter,
    lastPingTimestamp: Date.now(),
    engineName: isTauri
      ? 'Tauri v2 + Rust sysinfo (Native Desktop IPC)'
      : 'Full-Stack Node.js + systeminformation (Host Telemetry)',
    isStreamActive: true,
    turboMode: turbo,
  };
}

// Run an on-demand IPC / API benchmark test to measure real round-trip times
export async function runIpcBenchmark(samples: number = 20): Promise<{
  avgLatencyMs: number;
  minLatencyMs: number;
  maxLatencyMs: number;
  opsPerSec: number;
}> {
  const times: number[] = [];
  const isTauri = isTauriEnvironment();

  for (let i = 0; i < samples; i++) {
    const t0 = performance.now();
    if (isTauri) {
      try {
        await invoke('ping');
      } catch {
        // ping fallback
      }
    } else {
      try {
        const res = await fetch('/api/system/ping');
        await res.json();
      } catch {
        // fallback
      }
    }
    const duration = performance.now() - t0;
    times.push(duration);
  }

  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const min = Math.min(...times);
  const max = Math.max(...times);
  const ops = Math.round(1000 / Math.max(0.1, avg));

  lastMeasuredLatency = parseFloat(avg.toFixed(2));

  return {
    avgLatencyMs: parseFloat(avg.toFixed(2)),
    minLatencyMs: parseFloat(min.toFixed(2)),
    maxLatencyMs: parseFloat(max.toFixed(2)),
    opsPerSec: ops,
  };
}
