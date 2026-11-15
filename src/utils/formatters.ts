import { HealthStatus } from '../types/system';

/**
 * Format bytes into human-readable string (KB, MB, GB, TB)
 */
export function formatBytes(bytes: number | null | undefined, decimals: number = 1): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return 'N/A';
  if (bytes <= 0) return '0 B';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));
  if (i < 0) return `${bytes} B`;
  const safeIndex = Math.min(i, sizes.length - 1);

  return `${parseFloat((bytes / Math.pow(k, safeIndex)).toFixed(dm))} ${sizes[safeIndex]}`;
}

/**
 * Format transfer rates (bytes per second) into MB/s, KB/s, etc.
 */
export function formatSpeed(bytesPerSec: number | null | undefined, decimals: number = 1): string {
  if (bytesPerSec === null || bytesPerSec === undefined || !Number.isFinite(bytesPerSec)) return 'N/A';
  if (bytesPerSec <= 0) return '0 B/s';
  const formatted = formatBytes(bytesPerSec, decimals);
  return `${formatted}/s`;
}

/**
 * Format uptime seconds into d, h, m, s
 */
export function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / (3600 * 24));
  const hours = Math.floor((seconds % (3600 * 24)) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0 || days > 0) parts.push(`${hours}h`);
  if (minutes > 0 || hours > 0 || days > 0) parts.push(`${minutes}m`);
  parts.push(`${secs}s`);

  return parts.slice(0, 3).join(' ');
}

/**
 * Get status category and color based on usage percent
 */
export function getResourceStatus(percent: number): HealthStatus {
  if (percent >= 90) return 'critical';
  if (percent >= 80) return 'warning';
  if (percent >= 60) return 'moderate';
  return 'healthy';
}

export function getStatusColorClass(status: HealthStatus): {
  text: string;
  bg: string;
  border: string;
  glow: string;
  indicator: string;
} {
  switch (status) {
    case 'critical':
      return {
        text: 'text-red-400',
        bg: 'bg-red-500/10',
        border: 'border-red-500/30',
        glow: 'shadow-[0_0_12px_rgba(239,68,68,0.25)]',
        indicator: 'bg-red-500',
      };
    case 'warning':
      return {
        text: 'text-amber-400',
        bg: 'bg-amber-500/10',
        border: 'border-amber-500/30',
        glow: 'shadow-[0_0_12px_rgba(245,158,11,0.2)]',
        indicator: 'bg-amber-500',
      };
    case 'moderate':
      return {
        text: 'text-cyan-400',
        bg: 'bg-cyan-500/10',
        border: 'border-cyan-500/30',
        glow: 'shadow-[0_0_12px_rgba(6,182,212,0.2)]',
        indicator: 'bg-cyan-400',
      };
    case 'healthy':
    default:
      return {
        text: 'text-emerald-400',
        bg: 'bg-emerald-500/10',
        border: 'border-emerald-500/30',
        glow: 'shadow-[0_0_12px_rgba(34,197,94,0.15)]',
        indicator: 'bg-emerald-400',
      };
  }
}

/**
 * Format clock speed in GHz
 */
export function formatFrequency(ghz: number | null | undefined): string {
  if (ghz === null || ghz === undefined || !Number.isFinite(ghz) || ghz <= 0) return 'N/A';
  return `${ghz.toFixed(2)} GHz`;
}

/**
 * Format temperature in C or F
 */
export function formatTemperature(celsius: number | null | undefined, unit: 'C' | 'F' = 'C'): string {
  if (celsius === null || celsius === undefined || !Number.isFinite(celsius)) return 'N/A';
  if (unit === 'F') {
    const f = (celsius * 9) / 5 + 32;
    return `${Math.round(f)}°F`;
  }
  return `${Math.round(celsius)}°C`;
}

/**
 * Format optional percentage
 */
export function formatPercent(val: number | null | undefined, decimals: number = 1): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return 'N/A';
  return `${val.toFixed(decimals)}%`;
}

/**
 * Format optional watts
 */
export function formatWatts(watts: number | null | undefined, decimals: number = 1): string {
  if (watts === null || watts === undefined || !Number.isFinite(watts)) return 'N/A';
  return `${watts.toFixed(decimals)} W`;
}

/**
 * Format optional MHz clock speed
 */
export function formatMhz(mhz: number | null | undefined): string {
  if (mhz === null || mhz === undefined || !Number.isFinite(mhz) || mhz <= 0) return 'N/A';
  return `${Math.round(mhz)} MHz`;
}
