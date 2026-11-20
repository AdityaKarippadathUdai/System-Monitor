export type ProcessStatus = 'running' | 'sleeping' | 'stopped' | 'zombie' | 'unknown';
export type ProcessCategory = 'all' | 'app' | 'background' | 'system';

export interface ProcessMetricHistory {
  timestamp: number;
  cpu: number;
  ramMB: number;
}

export interface ProcessInfo {
  pid: number;
  ppid: number;
  name: string;
  command: string;
  executablePath: string;
  user: string | null;
  cpuPercent: number;
  memoryBytes: number;
  memoryPercent: number;
  gpuPercent: number | null;
  vramBytes: number | null;
  diskReadBytesSec: number;
  diskWriteBytesSec: number;
  netRxBytesSec: number | null;
  netTxBytesSec: number | null;
  status: ProcessStatus;
  category: 'app' | 'background' | 'system';
  startTime: string;
  threads: number | null;
  priority: number | null;
  iconName?: string;
  history: ProcessMetricHistory[];
}

export type ProcessSortField = 
  | 'cpuPercent' 
  | 'memoryBytes' 
  | 'gpuPercent' 
  | 'vramBytes' 
  | 'disk' 
  | 'name' 
  | 'pid';

export type ProcessSortOrder = 'asc' | 'desc';
