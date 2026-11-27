import express from 'express';
import fs from 'fs';
import path from 'path';
import os from 'os';
import net from 'net';
import { execFile } from 'child_process';
import si from 'systeminformation';
import { createServer as createViteServer } from 'vite';
import { hostNetworkMonitor } from './server-network';

const app = express();
const PORT = 3000;

app.use(express.json());

// Cache static hardware metadata once so 250ms-1000ms polling stays lightweight
interface CachedStaticSpecs {
  manufacturer: string | null;
  model: string | null;
  memType: string | null;
  memSpeedMhz: number | null;
  cpuInfo: si.Systeminformation.CpuData | null;
  osInfo: si.Systeminformation.OsData | null;
}

let cachedStatic: CachedStaticSpecs | null = null;
let staticInitPromise: Promise<CachedStaticSpecs> | null = null;

async function getStaticSpecs(): Promise<CachedStaticSpecs> {
  if (cachedStatic) return cachedStatic;
  if (staticInitPromise) return staticInitPromise;

  staticInitPromise = (async () => {
    const [sysData, memLayout, cpuInfo, osInfo] = await Promise.all([
      si.system().catch(() => null),
      si.memLayout().catch(() => []),
      si.cpu().catch(() => null),
      si.osInfo().catch(() => null),
    ]);

    const cleanPlaceholder = (val?: string | null): string | null => {
      if (!val) return null;
      const t = val.trim();
      if (
        !t ||
        t === 'To Be Filled By O.E.M.' ||
        t === 'Default string' ||
        t === 'System Product Name' ||
        t === 'System Manufacturer' ||
        t === 'None'
      ) {
        return null;
      }
      return t;
    };

    const validModule = Array.isArray(memLayout)
      ? memLayout.find((m) => m && (m.type || m.clockSpeed))
      : undefined;

    cachedStatic = {
      manufacturer: cleanPlaceholder(sysData?.manufacturer),
      model: cleanPlaceholder(sysData?.model),
      memType: validModule?.type && validModule.type !== 'Unknown' ? validModule.type : null,
      memSpeedMhz: validModule?.clockSpeed && validModule.clockSpeed > 0 ? validModule.clockSpeed : null,
      cpuInfo,
      osInfo,
    };
    return cachedStatic;
  })();

  return staticInitPromise;
}

function normalizeManufacturer(raw?: string | null, model?: string | null): string {
  const v = (raw || '').trim();
  if (v === 'GenuineIntel') return 'Intel';
  if (v === 'AuthenticAMD') return 'AMD';
  if (v && v !== 'Unknown') return v;
  const m = (model || '').toLowerCase();
  if (m.includes('intel')) return 'Intel';
  if (m.includes('amd') || m.includes('ryzen') || m.includes('epyc')) return 'AMD';
  if (m.includes('apple')) return 'Apple';
  return 'Unknown';
}

function formatCacheSize(bytes?: number | null): string | null {
  if (!bytes || bytes <= 0 || !Number.isFinite(bytes)) return null;
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(bytes % (1024 * 1024) === 0 ? 0 : 1)} MB`;
  }
  return `${Math.round(bytes / 1024)} KB`;
}

function classifyGpuVendor(rawVendor?: string | null, name?: string | null): string {
  const combined = `${rawVendor || ''} ${name || ''}`.toLowerCase();
  if (combined.includes('nvidia') || combined.includes('geforce') || combined.includes('quadro') || combined.includes('rtx')) {
    return 'NVIDIA';
  }
  if (combined.includes('amd') || combined.includes('radeon') || combined.includes('advanced micro')) {
    return 'AMD';
  }
  if (combined.includes('intel') || combined.includes('uhd') || combined.includes('iris') || combined.includes('arc')) {
    return 'Intel';
  }
  return rawVendor?.trim() || 'Unknown';
}

// Real system overview telemetry endpoint
app.get('/api/system/overview', async (_req, res) => {
  try {
    const [
      staticSpecs,
      cpuLoad,
      cpuSpeed,
      cpuTemp,
      mem,
      graphics,
      fsList,
      disksIO,
      netSummary,
      procSummary,
      timeInfo,
    ] = await Promise.all([
      getStaticSpecs(),
      si.currentLoad().catch(() => null),
      si.cpuCurrentSpeed().catch(() => null),
      si.cpuTemperature().catch(() => null),
      si.mem().catch(() => null),
      si.graphics().catch(() => null),
      si.fsSize().catch(() => []),
      si.disksIO().catch(() => null),
      hostNetworkMonitor.collectInterfaces(),
      si.processes().catch(() => null),
      si.time(),
    ]);

    const hostPlatform = os.platform();
    const isWindows = hostPlatform === 'win32';
    const cpuInfo = staticSpecs.cpuInfo;
    const osInfo = staticSpecs.osInfo;

    // CPU Metrics (no fabricated fallback values)
    const osCpus = os.cpus() || [];
    const threadsCount = cpuInfo?.cores || osCpus.length || 1;
    const coresCount = cpuInfo?.physicalCores || threadsCount;
    const rawBrand =
      cpuInfo?.brand && cpuInfo.brand !== 'unknown'
        ? cpuInfo.brand
        : osCpus.length > 0 && osCpus[0].model && osCpus[0].model !== 'unknown'
        ? osCpus[0].model
        : `Host Processor (${coresCount} Cores)`;
    const modelName = rawBrand.replace(/\(R\)|\(TM\)/g, '').trim();
    const manufacturer = normalizeManufacturer(cpuInfo?.manufacturer || cpuInfo?.vendor, modelName);

    const rawFreqGhz =
      cpuSpeed?.avg && cpuSpeed.avg > 0
        ? cpuSpeed.avg
        : cpuInfo?.speed && cpuInfo.speed > 0
        ? cpuInfo.speed
        : osCpus.length > 0 && osCpus[0].speed > 0
        ? osCpus[0].speed / 1000
        : null;

    const maxFreqGhz =
      cpuInfo?.speedMax && cpuInfo.speedMax > 0
        ? parseFloat(cpuInfo.speedMax.toFixed(2))
        : cpuSpeed?.max && cpuSpeed.max > 0
        ? parseFloat(cpuSpeed.max.toFixed(2))
        : null;

    const currentCpuPercent =
      cpuLoad?.currentLoad != null ? parseFloat(cpuLoad.currentLoad.toFixed(1)) : 0;

    const perCoreUsage: number[] = cpuLoad?.cpus?.length
      ? cpuLoad.cpus.map((c) => parseFloat(c.load.toFixed(1)))
      : osCpus.map(() => currentCpuPercent);

    const tempC =
      cpuTemp?.main != null && cpuTemp.main > 1 && cpuTemp.main < 130
        ? parseFloat(cpuTemp.main.toFixed(1))
        : null;

    const rawLoadAvg = os.loadavg() as [number, number, number];
    const loadAverage: [number, number, number] | null = isWindows
      ? null
      : [
          parseFloat(rawLoadAvg[0].toFixed(2)),
          parseFloat(rawLoadAvg[1].toFixed(2)),
          parseFloat(rawLoadAvg[2].toFixed(2)),
        ];

    const cpu = {
      usagePercent: currentCpuPercent,
      frequencyGhz: rawFreqGhz != null ? parseFloat(rawFreqGhz.toFixed(2)) : null,
      maxFrequencyGhz: maxFreqGhz,
      temperatureC: tempC,
      coresCount,
      threadsCount,
      manufacturer,
      modelName,
      loadAverage,
      perCoreUsage,
      cache: {
        l1: formatCacheSize(cpuInfo?.cache?.l1d ? cpuInfo.cache.l1d + (cpuInfo.cache.l1i || 0) : null),
        l2: formatCacheSize(cpuInfo?.cache?.l2),
        l3: formatCacheSize(cpuInfo?.cache?.l3),
      },
      governor: cpuInfo?.governor || (isWindows ? 'Windows Power Plan' : null),
      uptimeSeconds: Math.floor(os.uptime() || timeInfo.uptime || 0),
    };

    // Memory Metrics (normalized in bytes)
    const totalMem = mem?.total || os.totalmem() || 1;
    const freeMem = mem?.free ?? os.freemem() ?? 0;
    const availableMem = mem?.available ?? freeMem;
    const usedMem = mem?.active ?? totalMem - availableMem;
    const cachedMem = mem?.cached != null ? mem.cached : mem?.buffcache != null ? mem.buffcache : null;
    const buffersMem = mem?.buffers != null ? mem.buffers : null;

    const swapTotal = mem?.swaptotal || 0;
    const swapUsed = mem?.swapused || 0;
    const swapFree = mem?.swapfree != null ? mem.swapfree : Math.max(0, swapTotal - swapUsed);
    const virtualTotal = totalMem + swapTotal;
    const virtualUsed = usedMem + swapUsed;

    const memory = {
      totalBytes: totalMem,
      usedBytes: usedMem,
      availableBytes: availableMem,
      cachedBytes: cachedMem,
      buffersBytes: buffersMem,
      freeBytes: freeMem,
      usagePercent: parseFloat(((usedMem / totalMem) * 100).toFixed(1)),
      swapTotalBytes: swapTotal,
      swapUsedBytes: swapUsed,
      swapFreeBytes: swapFree,
      swapPercent: swapTotal > 0 ? parseFloat(((swapUsed / swapTotal) * 100).toFixed(1)) : 0,
      virtualTotalBytes: virtualTotal,
      virtualUsedBytes: virtualUsed,
      virtualPercent: virtualTotal > 0 ? parseFloat(((virtualUsed / virtualTotal) * 100).toFixed(1)) : 0,
      type: staticSpecs.memType,
      speedMhz: staticSpecs.memSpeedMhz,
    };

    // GPU Metrics (no fabricated values)
    const controllers = graphics?.controllers || [];
    const gpus = controllers
      .filter((g) => g && (g.model || g.name) && !(g.model || '').includes('Basic Render'))
      .map((g, idx) => {
        const name = g.model || g.name || `Graphics Adapter ${idx}`;
        const vendor = classifyGpuVendor(g.vendor, name);
        const vramTotal =
          g.memoryTotal && g.memoryTotal > 0
            ? g.memoryTotal * 1024 * 1024
            : g.vram && g.vram > 0
            ? g.vram * 1024 * 1024
            : null;
        const vramUsed =
          g.memoryUsed != null && g.memoryUsed >= 0 ? g.memoryUsed * 1024 * 1024 : null;
        const vramPct =
          vramTotal && vramTotal > 0 && vramUsed != null
            ? parseFloat(((vramUsed / vramTotal) * 100).toFixed(1))
            : null;
        const isDiscrete =
          (vramTotal != null && vramTotal >= 512 * 1024 * 1024) ||
          vendor === 'NVIDIA' ||
          name.toLowerCase().includes('rx ') ||
          name.toLowerCase().includes('arc');

        return {
          id: `gpu-${idx}`,
          name,
          vendor,
          gpuType: isDiscrete ? 'discrete' : 'integrated',
          driverVersion: g.driverVersion || null,
          utilizationPercent:
            g.utilizationGpu != null && Number.isFinite(g.utilizationGpu)
              ? parseFloat(g.utilizationGpu.toFixed(1))
              : null,
          vramTotalBytes: vramTotal,
          vramUsedBytes: vramUsed,
          vramUsagePercent: vramPct,
          temperatureC:
            g.temperatureGpu != null && g.temperatureGpu > 0
              ? parseFloat(g.temperatureGpu.toFixed(1))
              : null,
          powerWatts:
            g.powerDraw != null && Number.isFinite(g.powerDraw)
              ? parseFloat(g.powerDraw.toFixed(1))
              : null,
          powerLimitWatts:
            g.powerLimit != null && Number.isFinite(g.powerLimit)
              ? parseFloat(g.powerLimit.toFixed(1))
              : null,
          coreClockMhz: g.clockCore && g.clockCore > 0 ? Math.round(g.clockCore) : null,
          memoryClockMhz: g.clockMemory && g.clockMemory > 0 ? Math.round(g.clockMemory) : null,
          fanSpeedPercent: g.fanSpeed != null && g.fanSpeed >= 0 ? Math.round(g.fanSpeed) : null,
          pciBusId: g.bus || null,
          computeCapability: g.metalVersion || (vendor === 'NVIDIA' ? 'CUDA' : 'OpenGL / Vulkan'),
        };
      });

    // Prioritize discrete GPUs first
    gpus.sort((a, b) => (a.gpuType === 'discrete' ? 0 : 1) - (b.gpuType === 'discrete' ? 0 : 1));

    // Disk Metrics
    const sysDrive = (process.env.SystemDrive || 'C:').toUpperCase();
    const disks = (Array.isArray(fsList) ? fsList : [])
      .filter((fs) => fs.size > 0 && fs.type !== 'squashfs' && !String(fs.mount || '').startsWith('/snap/'))
      .map((fs, idx) => {
        const total = fs.size || 0;
        const used = fs.used || 0;
        const available = fs.available ?? Math.max(0, total - used);
        const pct = fs.use != null ? fs.use : total > 0 ? (used / total) * 100 : 0;
        const mount = fs.mount || '/';
        const isSys = isWindows ? mount.toUpperCase().startsWith(sysDrive) : mount === '/';

        return {
          id: `disk-${idx}`,
          name: fs.fs || mount || `Storage Volume ${idx + 1}`,
          mountPoint: mount,
          filesystem: fs.type || 'Unknown',
          totalBytes: total,
          usedBytes: used,
          availableBytes: available,
          usagePercent: parseFloat(pct.toFixed(1)),
          readSpeedBytesSec: disksIO?.rIO_sec != null ? Math.round(disksIO.rIO_sec * 4096) : null,
          writeSpeedBytesSec: disksIO?.wIO_sec != null ? Math.round(disksIO.wIO_sec * 4096) : null,
          readOpsSec: disksIO?.rIO_sec != null ? Math.round(disksIO.rIO_sec) : null,
          writeOpsSec: disksIO?.wIO_sec != null ? Math.round(disksIO.wIO_sec) : null,
          temperatureC: null,
          isSystem: isSys,
          diskType: isSys ? 'System SSD' : 'Storage Volume',
        };
      });

    // Network Metrics (real /proc/net/dev + interface metadata, zero unspec drop-offs)
    const network = {
      downloadSpeedBytesSec: netSummary.totalDownloadSpeed,
      uploadSpeedBytesSec: netSummary.totalUploadSpeed,
      totalDownloadedBytes: netSummary.totalDownloaded,
      totalUploadedBytes: netSummary.totalUploaded,
      activeInterface: netSummary.activeInterface,
      interfaces: netSummary.interfaces,
    };

    const platform = hostPlatform === 'win32' ? 'windows' : hostPlatform === 'darwin' ? 'macos' : 'linux';
    const systemInfo = {
      osName: osInfo?.distro || os.type() || (isWindows ? 'Windows' : 'Linux'),
      osVersion: osInfo?.release || os.release() || 'Unknown',
      kernelVersion: osInfo?.kernel || os.version() || os.release() || 'Unknown',
      hostname: os.hostname() || 'localhost',
      architecture: os.arch() || 'x64',
      manufacturer: staticSpecs.manufacturer,
      model: staticSpecs.model,
      uptimeSeconds: Math.floor(os.uptime()),
      bootTime: new Date(Date.now() - os.uptime() * 1000).toLocaleString(),
      platform: platform as 'linux' | 'windows' | 'macos',
      cpuModel: cpu.modelName,
      totalMemoryGB: Math.round(totalMem / (1024 * 1024 * 1024)),
      processCount: procSummary?.all || procSummary?.list?.length || 0,
      threadCount: null,
      displayServer: isWindows
        ? 'Desktop Window Manager (DWM)'
        : process.env.WAYLAND_DISPLAY
        ? 'Wayland'
        : process.env.DISPLAY
        ? 'X11'
        : 'Headless Server',
      desktopEnvironment: isWindows
        ? 'Windows Shell'
        : process.env.XDG_CURRENT_DESKTOP || process.env.DESKTOP_SESSION || 'Console / Server',
    };

    const maxLoad = Math.max(cpu.usagePercent, memory.usagePercent);
    const overallStatus: 'healthy' | 'moderate' | 'warning' | 'critical' =
      maxLoad > 90 ? 'critical' : maxLoad > 75 ? 'warning' : maxLoad > 55 ? 'moderate' : 'healthy';

    res.json({
      cpu,
      memory,
      gpus,
      disks,
      network,
      systemInfo,
      timestamp: Date.now(),
      overallStatus,
    });
  } catch (err: any) {
    console.error('Error gathering system telemetry:', err);
    res.status(500).json({ error: err.message || 'Failed to gather system metrics' });
  }
});

// Real running processes endpoint
app.get('/api/system/processes', async (_req, res) => {
  try {
    const procData = await si.processes();
    const totalMem = os.totalmem() || 1;
    const isWindows = os.platform() === 'win32';

    const list = (procData.list || []).map((p) => {
      const memBytes = (p.memRss || p.memVsz || 0) * 1024;
      const rawMem = Number(p.mem);
      const memPct =
        !isNaN(rawMem) && isFinite(rawMem)
          ? parseFloat(rawMem.toFixed(1))
          : parseFloat(((memBytes / totalMem) * 100).toFixed(1)) || 0;
      const rawCpu = Number(p.cpu);
      const cpuPct = !isNaN(rawCpu) && isFinite(rawCpu) ? parseFloat(rawCpu.toFixed(1)) : 0;

      const name = p.name || 'process';
      const lower = name.toLowerCase();

      const isSystem = isWindows
        ? p.pid <= 4 ||
          ['system', 'registry', 'smss.exe', 'csrss.exe', 'wininit.exe', 'services.exe', 'lsass.exe', 'winlogon.exe', 'dwm.exe'].includes(lower)
        : p.pid <= 2 ||
          p.user === 'root' ||
          lower.includes('systemd') ||
          lower.includes('init') ||
          lower.includes('kworker') ||
          lower.includes('kernel');

      const isBackground = isWindows
        ? lower.includes('svchost') || lower.includes('service') || lower.includes('host') || lower.includes('agent')
        : lower.endsWith('d') ||
          lower.includes('node') ||
          lower.includes('server') ||
          lower.includes('postgres') ||
          lower.includes('redis') ||
          lower.includes('docker') ||
          lower.includes('container');

      const category: 'app' | 'background' | 'system' = isSystem
        ? 'system'
        : isBackground
        ? 'background'
        : 'app';

      const statusMap: Record<string, 'running' | 'sleeping' | 'stopped' | 'zombie' | 'unknown'> = {
        running: 'running',
        R: 'running',
        sleeping: 'sleeping',
        S: 'sleeping',
        D: 'sleeping',
        I: 'sleeping',
        stopped: 'stopped',
        T: 'stopped',
        t: 'stopped',
        zombie: 'zombie',
        Z: 'zombie',
        unknown: 'unknown',
      };

      return {
        pid: p.pid,
        ppid: p.parentPid || 0,
        name: p.name,
        command: p.command || p.params || p.name,
        executablePath: p.path || p.name,
        user: p.user || null,
        cpuPercent: cpuPct,
        memoryBytes: memBytes,
        memoryPercent: parseFloat(memPct.toFixed(1)),
        gpuPercent: null,
        vramBytes: null,
        diskReadBytesSec: 0,
        diskWriteBytesSec: 0,
        netRxBytesSec: null,
        netTxBytesSec: null,
        status: statusMap[p.state] || 'unknown',
        category,
        startTime: p.started || 'Active',
        threads: null,
        priority: p.priority ?? null,
        history: [],
      };
    });

    list.sort((a, b) => b.cpuPercent - a.cpuPercent || b.memoryBytes - a.memoryBytes);
    res.json(list);
  } catch (err: any) {
    console.error('Error fetching processes:', err);
    res.status(500).json({ error: err.message || 'Failed to list processes' });
  }
});

// Safe cross-platform process termination endpoint
app.post('/api/system/kill', async (req, res) => {
  const { pid } = req.body;
  if (typeof pid !== 'number' || !Number.isInteger(pid) || pid < 0) {
    return res.status(400).json({ success: false, message: 'Invalid or missing process PID.' });
  }

  const isWindows = os.platform() === 'win32';
  if (pid === 0 || pid === 1 || (isWindows && pid === 4) || pid === process.pid) {
    return res.status(403).json({
      success: false,
      message: `Refused to terminate protected system/monitoring PID ${pid}.`,
    });
  }

  try {
    const procData = await si.processes().catch(() => null);
    const targetProc = procData?.list?.find((p) => p.pid === pid);
    const targetName = (targetProc?.name || '').toLowerCase();
    const protectedNames = new Set([
      'init',
      'systemd',
      'kthreadd',
      'system',
      'system idle process',
      'registry',
      'smss.exe',
      'csrss.exe',
      'wininit.exe',
      'services.exe',
      'lsass.exe',
      'winlogon.exe',
    ]);

    if (protectedNames.has(targetName)) {
      return res.status(403).json({
        success: false,
        message: `Refused to terminate critical OS process "${targetProc?.name}" (PID ${pid}).`,
      });
    }

    process.kill(pid, 'SIGTERM');
    return res.json({
      success: true,
      message: `Process PID ${pid} was terminated via SIGTERM.`,
    });
  } catch (err: any) {
    const code = err?.code;
    const msg =
      code === 'EPERM' || code === 'EACCES'
        ? `Permission denied: insufficient privileges to terminate PID ${pid}.`
        : code === 'ESRCH'
        ? `Process PID ${pid} was not found.`
        : err.message;
    return res.status(code === 'EPERM' ? 403 : 500).json({
      success: false,
      message: msg,
    });
  }
});

// Ping endpoint for IPC/server latency benchmark
app.get('/api/system/ping', (_req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// Configurable network target latency probe (ICMP with TCP connect fallback)
app.get('/api/system/network-ping', async (req, res) => {
  const rawTarget = String(req.query.target || '1.1.1.1').trim();
  const port = Number(req.query.port || 443);

  if (!rawTarget || rawTarget.length > 253 || !/^[a-zA-Z0-9.\-:]+$/.test(rawTarget)) {
    return res.status(400).json({
      target: rawTarget,
      latencyMs: null,
      reachable: false,
      method: 'validation',
      error: 'Invalid hostname or IP target.',
      timestamp: Date.now(),
    });
  }

  const tryIcmp = (): Promise<number | null> =>
    new Promise((resolve) => {
      const isWin = os.platform() === 'win32';
      const args = isWin ? ['-n', '1', '-w', '2000', rawTarget] : ['-c', '1', '-W', '2', rawTarget];
      execFile('ping', args, { timeout: 2500 }, (err, stdout) => {
        if (err || !stdout) return resolve(null);
        const match = stdout.match(/time[=<]\s*([\d.]+)\s*ms/i);
        if (match && match[1]) {
          return resolve(parseFloat(parseFloat(match[1]).toFixed(2)));
        }
        if (/time<1ms/i.test(stdout)) return resolve(0.5);
        resolve(null);
      });
    });

  const icmpMs = await tryIcmp();
  if (icmpMs !== null) {
    return res.json({
      target: rawTarget,
      latencyMs: icmpMs,
      reachable: true,
      method: 'ICMP',
      error: null,
      timestamp: Date.now(),
    });
  }

  // TCP connect fallback
  const probePort = Number.isInteger(port) && port > 0 && port <= 65535 ? port : 443;
  const start = performance.now();
  await new Promise<void>((resolve) => {
    const socket = net.createConnection({ host: rawTarget, port: probePort, timeout: 2000 });
    socket.on('connect', () => {
      const rtt = parseFloat((performance.now() - start).toFixed(2));
      socket.destroy();
      res.json({
        target: rawTarget,
        latencyMs: rtt,
        reachable: true,
        method: `TCP:${probePort}`,
        error: null,
        timestamp: Date.now(),
      });
      resolve();
    });
    socket.on('timeout', () => {
      socket.destroy();
      res.json({
        target: rawTarget,
        latencyMs: null,
        reachable: false,
        method: `TCP:${probePort}`,
        error: 'Connection timed out (2000ms)',
        timestamp: Date.now(),
      });
      resolve();
    });
    socket.on('error', (err) => {
      socket.destroy();
      res.json({
        target: rawTarget,
        latencyMs: null,
        reachable: false,
        method: `TCP:${probePort}`,
        error: err.message,
        timestamp: Date.now(),
      });
      resolve();
    });
  });
});

// Network Monitor API endpoints
app.get('/api/network/interfaces', async (_req, res) => {
  try {
    const data = await hostNetworkMonitor.collectInterfaces();
    res.json(data.interfaces);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to collect network interfaces' });
  }
});

app.get('/api/network/overview', async (_req, res) => {
  try {
    const overview = await hostNetworkMonitor.getNetworkOverview();
    res.json(overview);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to gather network overview' });
  }
});

app.get('/api/network/processes', async (_req, res) => {
  try {
    const data = await hostNetworkMonitor.collectSocketsAndProcesses();
    res.json(data.processes);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to collect per-process network usage' });
  }
});

app.get('/api/network/connections', async (_req, res) => {
  try {
    const data = await hostNetworkMonitor.collectSocketsAndProcesses();
    res.json(data.connections);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to collect active connections' });
  }
});

app.get('/api/network/process/:pid', async (req, res) => {
  const pid = Number(req.params.pid);
  if (!Number.isInteger(pid) || pid <= 0) {
    return res.status(400).json({ error: 'Invalid PID' });
  }
  try {
    const details = await hostNetworkMonitor.getProcessDetails(pid);
    res.json(details);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to inspect process network details' });
  }
});

app.post('/api/network/interface', (req, res) => {
  const interfaceName = String(req.body?.interfaceName || 'all');
  const active = hostNetworkMonitor.setSelectedInterface(interfaceName);
  res.json({ selectedInterface: active });
});

app.get('/api/network/history', (req, res) => {
  const period = String(req.query.period || '5m');
  const iface = req.query.iface ? String(req.query.iface) : undefined;
  res.json(hostNetworkMonitor.getHistory(period, iface));
});

// Desktop Experience Host API endpoints (Web / Preview mode)
const DESKTOP_CONFIG_FILE = path.join(os.tmpdir(), 'sysmon-pro-desktop-config.json');

const DEFAULT_DESKTOP_CONFIG = {
  widget: {
    enabled: false,
    visible: false,
    x: 36,
    y: 48,
    width: 310,
    height: 360,
    opacity: 0.86,
    alwaysOnTop: true,
    clickThrough: false,
    showBorder: true,
    backgroundBlur: true,
    layoutMode: 'detailed',
    sizePreset: 'medium',
    showPinnedSection: true,
    metrics: [
      'cpu_usage',
      'cpu_temp',
      'gpu_usage',
      'gpu_temp',
      'ram_usage',
      'vram_usage',
      'net_down',
      'net_up',
      'battery',
      'fps',
    ],
  },
  overlay: {
    enabled: false,
    visible: false,
    x: 24,
    y: 24,
    width: 420,
    height: 76,
    opacity: 0.8,
    alwaysOnTop: true,
    clickThrough: true,
    showBorder: true,
    backgroundBlur: true,
    positionPreset: 'top-right',
    metrics: ['cpu_usage', 'cpu_temp', 'gpu_usage', 'gpu_temp', 'ram_usage', 'net_down', 'net_up'],
  },
  tray: {
    enabled: true,
    minimizeToTrayOnClose: true,
    showTooltipMetrics: true,
    startMinimized: false,
  },
  background: {
    enabled: true,
    intervalMs: 1000,
    pauseWhenAllHidden: false,
  },
  startup: {
    launchAtLogin: false,
    startMinimized: false,
    startFloatingWidget: false,
    startBackgroundMonitoring: true,
    manualGamingModeOnly: false,
  },
  appearance: {
    theme: 'dark',
    accentColor: '#3B82F6',
    widgetOpacity: 0.86,
    widgetBorder: true,
    cornerRadius: 10,
    fontSize: 'md',
    density: 'comfortable',
    backgroundBlur: true,
    metricColors: {
      cpu: '#3B82F6',
      gpu: '#06B6D4',
      memory: '#10B981',
      network: '#EC4899',
      battery: '#F59E0B',
      fps: '#22C55E',
    },
  },
  shortcuts: {
    toggleDashboard: 'Ctrl+Shift+M',
    toggleWidget: 'Ctrl+Shift+W',
    toggleGamingMode: 'Ctrl+Shift+G',
    toggleOverlay: 'Ctrl+Shift+O',
    toggleClickThrough: 'Ctrl+Shift+L',
  },
  gaming: {
    enabled: false,
    autoDetect: true,
    positionPreset: 'top-left',
    x: 20,
    y: 20,
    width: 280,
    height: 220,
    opacity: 0.78,
    compactMode: false,
    refreshIntervalMs: 1000,
    alwaysOnTop: true,
    clickThrough: true,
    metrics: [
      'fps',
      'cpu_usage',
      'cpu_temp',
      'gpu_usage',
      'gpu_temp',
      'ram_usage',
      'vram_usage',
      'gpu_power',
      'net_latency',
    ],
    latencyTarget: '1.1.1.1',
    exclusions: [],
    customGames: [],
    perGameOverrides: {},
  },
  pinnedMetrics: [
    {
      id: 'pin-cpu-temp',
      metric: 'cpu_temp',
      label: 'CPU Temp',
      displayFormat: 'absolute',
      warningThreshold: 75,
      criticalThreshold: 90,
      compact: true,
    },
    {
      id: 'pin-gpu-temp',
      metric: 'gpu_temp',
      label: 'GPU Temp',
      displayFormat: 'absolute',
      warningThreshold: 78,
      criticalThreshold: 88,
      compact: true,
    },
    {
      id: 'pin-ram',
      metric: 'ram_usage',
      label: 'RAM',
      displayFormat: 'combined',
      warningThreshold: 80,
      criticalThreshold: 92,
      compact: true,
    },
    {
      id: 'pin-net-dl',
      metric: 'net_down',
      label: 'Net Down',
      displayFormat: 'absolute',
      warningThreshold: null,
      criticalThreshold: null,
      compact: true,
    },
  ],
};

function readHostDesktopConfig() {
  try {
    if (fs.existsSync(DESKTOP_CONFIG_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(DESKTOP_CONFIG_FILE, 'utf-8'));
      return { ...DEFAULT_DESKTOP_CONFIG, ...parsed };
    }
  } catch {
    // fallback
  }
  return structuredClone(DEFAULT_DESKTOP_CONFIG);
}

function writeHostDesktopConfig(cfg: any) {
  try {
    fs.writeFileSync(DESKTOP_CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf-8');
  } catch {
    // ignore
  }
}

function getHostDesktopCapabilities() {
  const isWin = os.platform() === 'win32';
  const isWayland = !isWin && Boolean(process.env.WAYLAND_DISPLAY || process.env.XDG_SESSION_TYPE === 'wayland');
  const isX11 = !isWin && !isWayland && Boolean(process.env.DISPLAY);
  return {
    platform: isWin ? 'windows' : os.platform() === 'darwin' ? 'macos' : 'linux',
    displayServer: isWin ? 'Desktop Window Manager (DWM)' : isWayland ? 'Wayland' : isX11 ? 'X11' : 'Browser Preview',
    desktopEnvironment: isWin
      ? 'Windows Shell'
      : process.env.XDG_CURRENT_DESKTOP || process.env.DESKTOP_SESSION || 'Web Runtime',
    transparencySupported: true,
    blurSupported: isWin,
    clickThroughSupported: false,
    alwaysOnTopSupported: false,
    positioningSupported: false,
    globalShortcutsSupported: false,
    traySupported: false,
    limitations: [
      'Running in Browser / Express preview mode. Native desktop floating windows, system tray, always-on-top, and global OS hotkeys run inside the Tauri v2 desktop binary.',
    ],
  };
}

app.get('/api/desktop/config', (_req, res) => {
  res.json(readHostDesktopConfig());
});

app.post('/api/desktop/config', (req, res) => {
  const current = readHostDesktopConfig();
  const next = { ...current, ...(req.body || {}) };
  writeHostDesktopConfig(next);
  res.json(next);
});

app.get('/api/desktop/battery', async (_req, res) => {
  try {
    const bat = await si.battery();
    if (!bat || !bat.hasBattery) {
      return res.json(null);
    }
    res.json({
      percent: Number((bat.percent ?? 0).toFixed(1)),
      isCharging: Boolean(bat.isCharging),
      acOnline: Boolean(bat.acConnected || bat.isCharging),
      state: bat.isCharging ? 'Charging' : bat.acConnected ? 'AC Power' : 'Discharging',
      timeRemainingSecs: bat.timeRemaining && bat.timeRemaining > 0 ? Math.round(bat.timeRemaining * 60) : null,
      powerWatts: null,
    });
  } catch {
    res.json(null);
  }
});

app.get('/api/desktop/telemetry', async (_req, res) => {
  try {
    const cfg = readHostDesktopConfig();
    const [bat, procData] = await Promise.all([
      si.battery().catch(() => null),
      si.processes().catch(() => null),
    ]);

    const battery =
      bat && bat.hasBattery
        ? {
            percent: Number((bat.percent ?? 0).toFixed(1)),
            isCharging: Boolean(bat.isCharging),
            acOnline: Boolean(bat.acConnected || bat.isCharging),
            state: bat.isCharging ? 'Charging' : bat.acConnected ? 'AC Power' : 'Discharging',
            timeRemainingSecs:
              bat.timeRemaining && bat.timeRemaining > 0 ? Math.round(bat.timeRemaining * 60) : null,
            powerWatts: null,
          }
        : null;

    const exclusions = new Set((cfg.gaming?.exclusions || []).map((x: string) => x.toLowerCase()));
    const customGames = (cfg.gaming?.customGames || []).map((x: string) => x.toLowerCase());
    const detectedGames: any[] = [];

    for (const p of procData?.list || []) {
      const name = String(p.name || '');
      const cmd = String(p.command || p.path || '');
      const lower = `${name} ${cmd}`.toLowerCase();
      const matchedCustom = customGames.some((g: string) => g && lower.includes(g));
      const matchedStore =
        lower.includes('steamapps/common') ||
        lower.includes('proton') ||
        lower.includes('lutris') ||
        lower.includes('epic games') ||
        lower.includes('gog games');

      if (matchedCustom || matchedStore) {
        const isExcluded = exclusions.has(name.toLowerCase());
        detectedGames.push({
          pid: p.pid,
          name,
          executablePath: p.path || name,
          detectionSource: matchedCustom ? 'Custom Game List' : 'Game Launcher / Storefront',
          isExcluded,
          mangohudActive: false,
        });
      }
    }

    const activeGame = detectedGames.find((g) => !g.isExcluded) || null;
    const isWin = os.platform() === 'win32';

    res.json({
      battery,
      fps: {
        fps: null,
        frameTimeMs: null,
        source: 'Unavailable',
        activeGamePid: activeGame?.pid ?? null,
        activeGameName: activeGame?.name ?? null,
        available: false,
        requiredIntegration: isWin
          ? 'Requires RivaTuner Statistics Server (RTSS) in the native Tauri desktop app for live FPS.'
          : 'Requires MangoHud with logging enabled in the native Tauri desktop app for live FPS.',
      },
      gaming: {
        active: Boolean(cfg.gaming?.enabled || (cfg.gaming?.autoDetect && activeGame)),
        autoActivated: Boolean(!cfg.gaming?.enabled && cfg.gaming?.autoDetect && activeGame),
        detectedGames: detectedGames.slice(0, 12),
        activeGame,
      },
      config: cfg,
      capabilities: getHostDesktopCapabilities(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to gather desktop telemetry' });
  }
});

app.get('/api/desktop/startup', (_req, res) => {
  res.json({
    enabled: false,
    mechanism: 'Native Tauri Desktop Only',
    entryPath: '',
    note: 'System login autostart is configured via the native Tauri desktop application.',
  });
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SysMon full-stack server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
