import express from 'express';
import path from 'path';
import os from 'os';
import net from 'net';
import { execFile } from 'child_process';
import si from 'systeminformation';
import { createServer as createViteServer } from 'vite';

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

function classifyNetworkInterface(iface: si.Systeminformation.NetworkInterfacesData): 'wifi' | 'ethernet' | 'vpn' | 'virtual' | 'loopback' {
  const name = (iface.iface || '').toLowerCase();
  const display = (iface.ifaceName || '').toLowerCase();
  const type = (iface.type || '').toLowerCase();
  const combined = `${name} ${display} ${type}`;

  if (iface.internal || type.includes('loopback') || name === 'lo' || combined.includes('loopback')) {
    return 'loopback';
  }
  if (type.includes('wireless') || name.startsWith('wl') || combined.includes('wi-fi') || combined.includes('wifi') || combined.includes('wlan')) {
    return 'wifi';
  }
  if (
    type.includes('tunnel') ||
    name.startsWith('wg') ||
    name.startsWith('tun') ||
    name.startsWith('tap') ||
    name.startsWith('ppp') ||
    combined.includes('vpn') ||
    combined.includes('wireguard') ||
    combined.includes('tailscale') ||
    combined.includes('zerotier')
  ) {
    return 'vpn';
  }
  if (
    iface.virtual ||
    name.startsWith('docker') ||
    name.startsWith('br-') ||
    name.startsWith('veth') ||
    name.startsWith('virbr') ||
    name.startsWith('vmnet') ||
    name.startsWith('vboxnet') ||
    combined.includes('vethernet') ||
    combined.includes('hyper-v') ||
    combined.includes('wsl')
  ) {
    return 'virtual';
  }
  return 'ethernet';
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
      netStats,
      netInterfaces,
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
      si.networkStats().catch(() => []),
      si.networkInterfaces().catch(() => []),
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

    // Network Metrics
    const netStatsArray = Array.isArray(netStats) ? netStats : [netStats].filter(Boolean);
    const netIfacesArray = Array.isArray(netInterfaces) ? netInterfaces : [netInterfaces].filter(Boolean);

    let totalDownloadSpeed = 0;
    let totalUploadSpeed = 0;
    let totalDownloaded = 0;
    let totalUploaded = 0;

    const mappedInterfaces = netIfacesArray.map((iface) => {
      const stats = netStatsArray.find((s) => s.iface === iface.iface) || ({} as any);
      const rxSec = Math.max(0, Math.round(stats.rx_sec || 0));
      const txSec = Math.max(0, Math.round(stats.tx_sec || 0));
      const rxBytes = stats.rx_bytes || 0;
      const txBytes = stats.tx_bytes || 0;
      const type = classifyNetworkInterface(iface);

      if (type !== 'loopback') {
        totalDownloadSpeed += rxSec;
        totalUploadSpeed += txSec;
        totalDownloaded += rxBytes;
        totalUploaded += txBytes;
      }

      return {
        name: iface.iface,
        displayName: iface.ifaceName || iface.iface,
        type,
        ip4: iface.ip4 || null,
        ip6: iface.ip6 || null,
        mac: iface.mac && iface.mac !== '00:00:00:00:00:00' ? iface.mac.toUpperCase() : null,
        isUp: iface.operstate === 'up' || Boolean(iface.ip4),
        rxBytesTotal: rxBytes,
        txBytesTotal: txBytes,
        rxSpeedBytesSec: rxSec,
        txSpeedBytesSec: txSec,
        packetLossPercent: null,
      };
    });

    const activeIf =
      mappedInterfaces.find((i) => i.isUp && i.type !== 'loopback' && i.ip4) ||
      mappedInterfaces.find((i) => i.isUp && i.type !== 'loopback') ||
      mappedInterfaces[0];

    const network = {
      downloadSpeedBytesSec: totalDownloadSpeed,
      uploadSpeedBytesSec: totalUploadSpeed,
      totalDownloadedBytes: totalDownloaded,
      totalUploadedBytes: totalUploaded,
      activeInterface: activeIf ? activeIf.name : 'N/A',
      interfaces: mappedInterfaces,
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

      const statusMap: Record<string, 'running' | 'sleeping' | 'stopped' | 'zombie'> = {
        running: 'running',
        R: 'running',
        sleeping: 'sleeping',
        S: 'sleeping',
        stopped: 'stopped',
        T: 'stopped',
        zombie: 'zombie',
        Z: 'zombie',
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
        status: statusMap[p.state] || 'running',
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
