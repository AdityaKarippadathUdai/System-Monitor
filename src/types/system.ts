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
  speedMbps?: number | null;
  mtu?: number | null;
  rxBytesTotal: number;
  txBytesTotal: number;
  rxSpeedBytesSec: number;
  txSpeedBytesSec: number;
  rxPackets?: number | null;
  txPackets?: number | null;
  rxErrors?: number | null;
  txErrors?: number | null;
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

export type NetworkAttributionLevel = 'full' | 'partial' | 'connections_only' | 'unavailable';

export interface NetworkAttributionCapabilities {
  level: NetworkAttributionLevel;
  perProcessBytesSupported: boolean;
  isElevated: boolean;
  platformMethod: string;
  limitationReason: string | null;
  unreadableProcessCount: number;
}

export interface NetworkTrafficOverview {
  selectedInterface: string;
  activeInterface: string;
  downloadSpeedBytesSec: number;
  uploadSpeedBytesSec: number;
  peakDownloadBytesSec: number;
  uploadSpeedPeakBytesSec?: number;
  peakUploadBytesSec: number;
  totalDownloadedBytes: number;
  totalUploadedBytes: number;
  sessionDownloadedBytes: number;
  sessionUploadedBytes: number;
  activeConnectionsCount: number;
  totalConnectionsCount: number;
  interfaces: NetworkInterface[];
  capabilities: NetworkAttributionCapabilities;
  timestamp: number;
}

export interface NetworkConnection {
  id: string;
  pid: number | null;
  processName: string;
  executablePath: string | null;
  protocol: string;
  localAddress: string;
  localPort: number;
  remoteAddress: string;
  remotePort: number | null;
  state: string;
  isLoopback: boolean;
  rxBytesTotal: number | null;
  txBytesTotal: number | null;
  rxSpeedBytesSec: number | null;
  txSpeedBytesSec: number | null;
}

export interface ProcessNetworkUsage {
  pid: number;
  name: string;
  executablePath: string | null;
  user: string | null;
  category: 'app' | 'background' | 'system' | string;
  downloadSpeedBytesSec: number | null;
  uploadSpeedBytesSec: number | null;
  totalDownloadedBytes: number | null;
  totalUploadedBytes: number | null;
  combinedSpeedBytesSec: number | null;
  combinedTotalBytes: number | null;
  trafficSharePercent: number | null;
  isMeasured: boolean;
  measurementSource: string;
  activeConnections: number;
  totalSockets: number;
  protocols: string[];
  status: string;
}

export type NetworkTimePeriod = '1m' | '5m' | '15m' | '30m' | '1h' | '24h' | '7d';
export type BandwidthUnit = 'bytes' | 'bits';

export interface NetworkHistoryPoint {
  timestamp: number;
  timeLabel: string;
  downloadBytesSec: number;
  uploadBytesSec: number;
  peakDownloadBytesSec: number;
  peakUploadBytesSec: number;
  downloadedDeltaBytes: number;
  uploadedDeltaBytes: number;
  activeConnections: number;
}

export interface ProcessHistorySummary {
  pid: number;
  name: string;
  totalDownloadedBytes: number;
  totalUploadedBytes: number;
  peakDownloadBytesSec: number;
  peakUploadBytesSec: number;
  isMeasured: boolean;
}

export interface NetworkHistoryResponse {
  period: NetworkTimePeriod | string;
  interfaceName: string;
  points: NetworkHistoryPoint[];
  peakDownloadBytesSec: number;
  peakUploadBytesSec: number;
  totalDownloadedBytes: number;
  totalUploadedBytes: number;
  topApplications: ProcessHistorySummary[];
}

export interface ProcessNetworkDetails {
  usage: ProcessNetworkUsage;
  connections: NetworkConnection[];
  history: NetworkHistoryPoint[];
  capabilities: NetworkAttributionCapabilities;
}

export interface NetworkStreamPayload {
  overview: NetworkTrafficOverview;
  processes: ProcessNetworkUsage[];
  connections: NetworkConnection[];
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
