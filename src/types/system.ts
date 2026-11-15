export interface CpuCache {
  l1: string | null;
  l2: string | null;
  l3: string | null;
}

export interface CpuStats {
  usagePercent: number;
  frequencyGhz: number | null;
  maxFrequencyGhz: number | null;
  temperatureC: number | null;
  coresCount: number;
  threadsCount: number;
  manufacturer: string;
  modelName: string;
  loadAverage: [number, number, number] | null; // 1m, 5m, 15m (Linux)
  perCoreUsage: number[];
  cache: CpuCache;
  governor: string | null;
  uptimeSeconds: number;
}

export interface MemoryStats {
  totalBytes: number;
  usedBytes: number;
  availableBytes: number;
  cachedBytes: number | null;
  buffersBytes: number | null;
  freeBytes: number;
  usagePercent: number;
  swapTotalBytes: number;
  swapUsedBytes: number;
  swapFreeBytes: number;
  swapPercent: number;
  virtualTotalBytes: number;
  virtualUsedBytes: number;
  virtualPercent: number;
  type: string | null;
  speedMhz: number | null;
}

export interface GpuStats {
  id: string;
  name: string;
  vendor: string;
  gpuType: 'discrete' | 'integrated' | 'virtual' | 'unknown' | string;
  driverVersion: string | null;
  utilizationPercent: number | null;
  vramTotalBytes: number | null;
  vramUsedBytes: number | null;
  vramUsagePercent: number | null;
  temperatureC: number | null;
  powerWatts: number | null;
  powerLimitWatts: number | null;
  coreClockMhz: number | null;
  memoryClockMhz: number | null;
  fanSpeedPercent: number | null;
  pciBusId: string | null;
  computeCapability?: string | null;
}

export interface DiskStats {
  id: string;
  name: string;
  mountPoint: string;
  filesystem: string;
  totalBytes: number;
  usedBytes: number;
  availableBytes: number;
  usagePercent: number;
  readSpeedBytesSec: number | null;
  writeSpeedBytesSec: number | null;
  readOpsSec: number | null;
  writeOpsSec: number | null;
  temperatureC?: number | null;
  isSystem: boolean;
  diskType: string;
}

export interface NetworkInterface {
  name: string;
  displayName: string;
  type: 'wifi' | 'ethernet' | 'vpn' | 'virtual' | 'loopback';
  ip4: string | null;
  ip6: string | null;
  mac: string | null;
  isUp: boolean;
  rxBytesTotal: number;
  txBytesTotal: number;
  rxSpeedBytesSec: number;
  txSpeedBytesSec: number;
  packetLossPercent: number | null;
}

export interface NetworkStats {
  downloadSpeedBytesSec: number;
  uploadSpeedBytesSec: number;
  totalDownloadedBytes: number;
  totalUploadedBytes: number;
  activeInterface: string;
  interfaces: NetworkInterface[];
}

export interface SystemInfo {
  osName: string;
  osVersion: string;
  kernelVersion: string;
  hostname: string;
  architecture: string;
  manufacturer: string | null;
  model: string | null;
  uptimeSeconds: number;
  bootTime: string;
  platform: 'linux' | 'windows' | 'macos' | string;
  cpuModel: string;
  totalMemoryGB: number;
  processCount: number;
  threadCount: number | null;
  displayServer: string | null;
  desktopEnvironment: string | null;
}

export type HealthStatus = 'healthy' | 'moderate' | 'warning' | 'critical';

export interface SystemOverview {
  cpu: CpuStats;
  memory: MemoryStats;
  gpus: GpuStats[];
  disks: DiskStats[];
  network: NetworkStats;
  systemInfo: SystemInfo;
  timestamp: number;
  overallStatus: HealthStatus;
}

export interface MetricHistoryPoint {
  timestamp: number;
  timeLabel: string;
  cpu: number;
  memory: number;
  gpu: number;
  vram: number;
  diskReadMB: number;
  diskWriteMB: number;
  netRxMB: number;
  netTxMB: number;
  cpuTemp: number | null;
  gpuTemp: number | null;
}

export interface PingResult {
  target: string;
  latencyMs: number | null;
  reachable: boolean;
  method: string;
  error: string | null;
  timestamp: number;
}
