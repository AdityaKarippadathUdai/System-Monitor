import { SystemOverview } from '../types/system';
import {
  BatteryStats,
  FpsTelemetry,
  PinnedDisplayFormat,
  PinnedMetricConfig,
  TelemetryMetricKey,
} from '../types/desktop';
import { formatBytes, formatSpeed, formatTemperature, formatWatts } from './formatters';

export interface ResolvedMetricCell {
  key: TelemetryMetricKey;
  label: string;
  shortLabel: string;
  valueText: string;
  subText?: string;
  numericPercent: number | null;
  rawNumber: number | null;
  supported: boolean;
  accentHex?: string;
  severity: 'normal' | 'warning' | 'critical';
}

export function resolveTelemetryMetric(
  key: TelemetryMetricKey,
  overview: SystemOverview | null,
  battery: BatteryStats | null,
  fps: FpsTelemetry,
  latencyMs: number | null,
  tempUnit: 'C' | 'F' = 'C',
  format: PinnedDisplayFormat = 'combined',
  warningThreshold: number | null = null,
  criticalThreshold: number | null = null
): ResolvedMetricCell {
  const cpu = overview?.cpu;
  const mem = overview?.memory;
  const gpu = overview?.gpus?.[0];
  const net = overview?.network;

  const evalSeverity = (val: number | null, defWarn?: number, defCrit?: number): 'normal' | 'warning' | 'critical' => {
    if (val === null || !Number.isFinite(val)) return 'normal';
    const warn = warningThreshold ?? defWarn ?? null;
    const crit = criticalThreshold ?? defCrit ?? null;
    if (crit !== null && val >= crit) return 'critical';
    if (warn !== null && val >= warn) return 'warning';
    return 'normal';
  };

  switch (key) {
    case 'cpu_usage': {
      const val = cpu ? cpu.usagePercent : null;
      return {
        key,
        label: 'CPU Usage',
        shortLabel: 'CPU',
        valueText: val !== null ? `${val.toFixed(1)}%` : 'N/A',
        subText: cpu?.frequencyGhz ? `${cpu.frequencyGhz.toFixed(2)} GHz` : undefined,
        numericPercent: val,
        rawNumber: val,
        supported: Boolean(cpu),
        severity: evalSeverity(val, 80, 92),
      };
    }
    case 'cpu_temp': {
      const val = cpu?.temperatureC ?? null;
      return {
        key,
        label: 'CPU Temp',
        shortLabel: 'CPU T',
        valueText: formatTemperature(val, tempUnit),
        numericPercent: val !== null ? Math.min(100, val) : null,
        rawNumber: val,
        supported: val !== null,
        severity: evalSeverity(val, 75, 90),
      };
    }
    case 'gpu_usage': {
      const val = gpu?.utilizationPercent ?? null;
      return {
        key,
        label: 'GPU Usage',
        shortLabel: 'GPU',
        valueText: val !== null ? `${val.toFixed(1)}%` : 'N/A',
        subText: gpu?.coreClockMhz ? `${gpu.coreClockMhz} MHz` : undefined,
        numericPercent: val,
        rawNumber: val,
        supported: Boolean(gpu) && val !== null,
        severity: evalSeverity(val, 85, 96),
      };
    }
    case 'gpu_temp': {
      const val = gpu?.temperatureC ?? null;
      return {
        key,
        label: 'GPU Temp',
        shortLabel: 'GPU T',
        valueText: formatTemperature(val, tempUnit),
        numericPercent: val !== null ? Math.min(100, val) : null,
        rawNumber: val,
        supported: Boolean(gpu) && val !== null,
        severity: evalSeverity(val, 78, 88),
      };
    }
    case 'ram_usage': {
      const val = mem ? mem.usagePercent : null;
      let text = 'N/A';
      if (mem) {
        if (format === 'percent') text = `${mem.usagePercent.toFixed(1)}%`;
        else if (format === 'absolute') text = `${formatBytes(mem.usedBytes)} / ${formatBytes(mem.totalBytes, 0)}`;
        else text = `${mem.usagePercent.toFixed(0)}% (${formatBytes(mem.usedBytes)})`;
      }
      return {
        key,
        label: 'RAM Usage',
        shortLabel: 'RAM',
        valueText: text,
        subText: mem ? `${formatBytes(mem.usedBytes)} / ${formatBytes(mem.totalBytes, 0)}` : undefined,
        numericPercent: val,
        rawNumber: val,
        supported: Boolean(mem),
        severity: evalSeverity(val, 80, 92),
      };
    }
    case 'vram_usage': {
      const used = gpu?.vramUsedBytes ?? null;
      const total = gpu?.vramTotalBytes ?? null;
      const pct = gpu?.vramUsagePercent ?? (used !== null && total ? (used / total) * 100 : null);
      let text = 'N/A';
      if (used !== null && total !== null) {
        text = format === 'percent' && pct !== null
          ? `${pct.toFixed(0)}%`
          : `${formatBytes(used)} / ${formatBytes(total, 0)}`;
      }
      return {
        key,
        label: 'VRAM',
        shortLabel: 'VRAM',
        valueText: text,
        numericPercent: pct,
        rawNumber: pct,
        supported: used !== null && total !== null,
        severity: evalSeverity(pct, 85, 95),
      };
    }
    case 'gpu_power': {
      const watts = gpu?.powerWatts ?? null;
      return {
        key,
        label: 'GPU Power',
        shortLabel: 'PWR',
        valueText: formatWatts(watts),
        numericPercent:
          watts !== null && gpu?.powerLimitWatts ? Math.min(100, (watts / gpu.powerLimitWatts) * 100) : null,
        rawNumber: watts,
        supported: watts !== null,
        severity: 'normal',
      };
    }
    case 'net_down': {
      const bps = net?.downloadSpeedBytesSec ?? null;
      return {
        key,
        label: 'Net Down',
        shortLabel: 'DL',
        valueText: formatSpeed(bps),
        numericPercent: null,
        rawNumber: bps,
        supported: bps !== null,
        severity: 'normal',
      };
    }
    case 'net_up': {
      const bps = net?.uploadSpeedBytesSec ?? null;
      return {
        key,
        label: 'Net Up',
        shortLabel: 'UL',
        valueText: formatSpeed(bps),
        numericPercent: null,
        rawNumber: bps,
        supported: bps !== null,
        severity: 'normal',
      };
    }
    case 'net_latency': {
      return {
        key,
        label: 'Latency',
        shortLabel: 'PING',
        valueText: latencyMs !== null ? `${latencyMs.toFixed(1)} ms` : 'N/A',
        numericPercent: null,
        rawNumber: latencyMs,
        supported: latencyMs !== null,
        severity: evalSeverity(latencyMs, 75, 140),
      };
    }
    case 'battery': {
      return {
        key,
        label: 'Battery',
        shortLabel: 'BAT',
        valueText: battery ? `${battery.percent.toFixed(0)}%` : 'N/A',
        subText: battery ? battery.state : undefined,
        numericPercent: battery ? battery.percent : null,
        rawNumber: battery ? battery.percent : null,
        supported: battery !== null,
        severity: battery && !battery.isCharging && battery.percent <= 15 ? 'critical' : 'normal',
      };
    }
    case 'fps': {
      return {
        key,
        label: 'FPS',
        shortLabel: 'FPS',
        valueText: fps.available && fps.fps !== null ? `${Math.round(fps.fps)}` : 'N/A',
        subText:
          fps.available && fps.frameTimeMs !== null
            ? `${fps.frameTimeMs.toFixed(1)} ms (${fps.source})`
            : fps.source,
        numericPercent: null,
        rawNumber: fps.fps,
        supported: true, // Always render FPS when configured so N/A + integration note is honest
        severity: 'normal',
      };
    }
  }
}

export function resolvePinnedMetric(
  pin: PinnedMetricConfig,
  overview: SystemOverview | null,
  battery: BatteryStats | null,
  fps: FpsTelemetry,
  latencyMs: number | null,
  tempUnit: 'C' | 'F'
): ResolvedMetricCell {
  const cell = resolveTelemetryMetric(
    pin.metric,
    overview,
    battery,
    fps,
    latencyMs,
    tempUnit,
    pin.displayFormat,
    pin.warningThreshold,
    pin.criticalThreshold
  );
  return {
    ...cell,
    label: pin.label || cell.label,
  };
}
