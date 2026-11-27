import fs from 'fs/promises';
import fsSync from 'fs';
import os from 'os';
import path from 'path';
import si from 'systeminformation';

export interface ServerNetworkInterface {
  name: string;
  displayName: string;
  type: 'wifi' | 'ethernet' | 'vpn' | 'virtual' | 'loopback';
  ip4: string | null;
  ip6: string | null;
  mac: string | null;
  isUp: boolean;
  speedMbps: number | null;
  mtu: number | null;
  rxBytesTotal: number;
  txBytesTotal: number;
  rxSpeedBytesSec: number;
  txSpeedBytesSec: number;
  rxPackets: number | null;
  txPackets: number | null;
  rxErrors: number | null;
  txErrors: number | null;
  packetLossPercent: number | null;
}

export interface ServerNetworkCapabilities {
  level: 'full' | 'partial' | 'connections_only' | 'unavailable';
  perProcessBytesSupported: boolean;
  isElevated: boolean;
  platformMethod: string;
  limitationReason: string | null;
  unreadableProcessCount: number;
}

export interface ServerNetworkConnection {
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

export interface ServerProcessNetworkUsage {
  pid: number;
  name: string;
  executablePath: string | null;
  user: string | null;
  category: 'app' | 'background' | 'system';
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

export interface ServerNetworkHistoryPoint {
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

export interface ServerNetworkTrafficOverview {
  selectedInterface: string;
  activeInterface: string;
  downloadSpeedBytesSec: number;
  uploadSpeedBytesSec: number;
  peakDownloadBytesSec: number;
  peakUploadBytesSec: number;
  totalDownloadedBytes: number;
  totalUploadedBytes: number;
  sessionDownloadedBytes: number;
  sessionUploadedBytes: number;
  activeConnectionsCount: number;
  totalConnectionsCount: number;
  interfaces: ServerNetworkInterface[];
  capabilities: ServerNetworkCapabilities;
  timestamp: number;
}

interface PersistedBucket {
  bucketTsMs: number;
  interfaceName: string;
  sampleCount: number;
  sumDlSpeed: number;
  sumUlSpeed: number;
  peakDlSpeed: number;
  peakUlSpeed: number;
  totalDlBytes: number;
  totalUlBytes: number;
  lastConnections: number;
}

interface ProcNetDevRow {
  rxBytes: number;
  rxPackets: number;
  rxErrors: number;
  txBytes: number;
  txPackets: number;
  txErrors: number;
}

const MAX_RAW_SAMPLES = 3600;
const MAX_1M_BUCKETS = 1440;
const MAX_15M_BUCKETS = 672;
const HISTORY_FILE = path.join(process.cwd(), 'tmp', 'network-history.json');

export function classifyNetworkInterface(iface: si.Systeminformation.NetworkInterfacesData): 'wifi' | 'ethernet' | 'vpn' | 'virtual' | 'loopback' {
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

function isActiveState(state: string): boolean {
  return ['ESTABLISHED', 'SYN_SENT', 'SYN_RECV', 'FIN_WAIT1', 'FIN_WAIT2', 'CLOSE_WAIT', 'ACTIVE'].includes(
    state.toUpperCase()
  );
}

function isLoopbackIp(ip: string): boolean {
  return ip === '127.0.0.1' || ip === '::1' || ip.startsWith('127.');
}

function formatTsLabel(tsMs: number, includeDay = false): string {
  const d = new Date(tsMs);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  if (includeDay) {
    const mon = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${mon}/${day} ${hh}:${mm}`;
  }
  return `${hh}:${mm}:${ss}`;
}

function parseHexEndpoint(raw: string, isV6: boolean): { address: string; port: number } | null {
  const idx = raw.indexOf(':');
  if (idx === -1) return null;
  const addrHex = raw.slice(0, idx);
  const portHex = raw.slice(idx + 1);
  const port = parseInt(portHex, 16);
  if (!Number.isFinite(port)) return null;

  if (!isV6) {
    if (addrHex.length !== 8) return null;
    const num = parseInt(addrHex, 16);
    const buf = Buffer.allocUnsafe(4);
    if (os.endianness() === 'LE') {
      buf.writeUInt32LE(num, 0);
    } else {
      buf.writeUInt32BE(num, 0);
    }
    return { address: `${buf[0]}.${buf[1]}.${buf[2]}.${buf[3]}`, port };
  }

  if (addrHex.length !== 32) return null;
  const bytes = Buffer.allocUnsafe(16);
  for (let i = 0; i < 4; i++) {
    const chunk = parseInt(addrHex.slice(i * 8, (i + 1) * 8), 16);
    if (os.endianness() === 'LE') {
      bytes.writeUInt32LE(chunk, i * 4);
    } else {
      bytes.writeUInt32BE(chunk, i * 4);
    }
  }
  // Format compact IPv6 or standard hex groups
  const groups: string[] = [];
  for (let i = 0; i < 16; i += 2) {
    groups.push(bytes.readUInt16BE(i).toString(16));
  }
  const full = groups.join(':');
  if (full === '0:0:0:0:0:0:0:0') return { address: '::', port };
  if (full === '0:0:0:0:0:0:0:1') return { address: '::1', port };
  return { address: full, port };
}

function mapLinuxTcpState(hex: string): string {
  switch (hex.toUpperCase()) {
    case '01': return 'ESTABLISHED';
    case '02': return 'SYN_SENT';
    case '03': return 'SYN_RECV';
    case '04': return 'FIN_WAIT1';
    case '05': return 'FIN_WAIT2';
    case '06': return 'TIME_WAIT';
    case '07': return 'CLOSE';
    case '08': return 'CLOSE_WAIT';
    case '09': return 'LAST_ACK';
    case '0A': return 'LISTEN';
    case '0B': return 'CLOSING';
    default: return 'UNKNOWN';
  }
}

class HostNetworkMonitor {
  private selectedInterface = 'all';
  private lastIfacePollMs = 0;
  private prevIfaceBytes = new Map<string, { rx: number; tx: number }>();
  private sessionIface = new Map<
    string,
    { lastRx: number | null; lastTx: number | null; sessionRx: number; sessionTx: number; peakRx: number; peakTx: number }
  >();
  private allPeakRx = 0;
  private allPeakTx = 0;

  private rawByIface = new Map<string, ServerNetworkHistoryPoint[]>();
  private buckets1m: PersistedBucket[] = [];
  private buckets15m: PersistedBucket[] = [];
  private lastFlushMs = Date.now();
  private dirty = false;

  private cachedConnections: ServerNetworkConnection[] = [];
  private cachedProcesses: ServerProcessNetworkUsage[] = [];
  private cachedCapabilities: ServerNetworkCapabilities = {
    level: 'connections_only',
    perProcessBytesSupported: false,
    isElevated: typeof process.getuid === 'function' ? process.getuid() === 0 : false,
    platformMethod: 'Host Socket Table Inspection',
    limitationReason: null,
    unreadableProcessCount: 0,
  };

  constructor() {
    this.loadFromDisk();
  }

  private loadFromDisk() {
    try {
      if (fsSync.existsSync(HISTORY_FILE)) {
        const raw = fsSync.readFileSync(HISTORY_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed?.buckets1m)) this.buckets1m = parsed.buckets1m;
        if (Array.isArray(parsed?.buckets15m)) this.buckets15m = parsed.buckets15m;
      }
    } catch {
      // ignore corrupted cache
    }
  }

  private async maybeFlushToDisk() {
    if (!this.dirty || Date.now() - this.lastFlushMs < 60_000) return;
    this.dirty = false;
    this.lastFlushMs = Date.now();
    try {
      await fs.mkdir(path.dirname(HISTORY_FILE), { recursive: true });
      await fs.writeFile(
        HISTORY_FILE,
        JSON.stringify({ buckets1m: this.buckets1m, buckets15m: this.buckets15m }),
        'utf8'
      );
    } catch {
      // non-fatal
    }
  }

  public setSelectedInterface(iface: string): string {
    const clean = (iface || '').trim();
    this.selectedInterface = !clean || clean.toLowerCase() === 'all' ? 'all' : clean;
    return this.selectedInterface;
  }

  public getSelectedInterface(): string {
    return this.selectedInterface;
  }

  private async readLinuxProcNetDev(): Promise<Map<string, ProcNetDevRow>> {
    const map = new Map<string, ProcNetDevRow>();
    if (os.platform() !== 'linux') return map;
    try {
      const content = await fs.readFile('/proc/net/dev', 'utf8');
      for (const line of content.split('\n').slice(2)) {
        const colon = line.indexOf(':');
        if (colon === -1) continue;
        const name = line.slice(0, colon).trim();
        const cols = line
          .slice(colon + 1)
          .trim()
          .split(/\s+/)
          .map(Number);
        if (cols.length >= 11 && Number.isFinite(cols[0]) && Number.isFinite(cols[8])) {
          map.set(name, {
            rxBytes: cols[0],
            rxPackets: cols[1],
            rxErrors: cols[2],
            txBytes: cols[8],
            txPackets: cols[9],
            txErrors: cols[10],
          });
        }
      }
    } catch {
      // ignore
    }
    return map;
  }

  private async readLinuxSysClassNet(name: string): Promise<{ speedMbps: number | null; mtu: number | null; isUp: boolean | null }> {
    const base = `/sys/class/net/${name}`;
    const readNum = async (p: string): Promise<number | null> => {
      try {
        const s = (await fs.readFile(p, 'utf8')).trim();
        const n = Number(s);
        return Number.isFinite(n) && n > 0 ? n : null;
      } catch {
        return null;
      }
    };
    const [speed, mtu, operstate] = await Promise.all([
      readNum(`${base}/speed`),
      readNum(`${base}/mtu`),
      fs.readFile(`${base}/operstate`, 'utf8').then((s) => s.trim().toLowerCase()).catch(() => ''),
    ]);
    const isUp = operstate ? operstate === 'up' || (name === 'lo' && operstate === 'unknown') : null;
    return {
      speedMbps: speed && speed < 1_000_000 ? speed : null,
      mtu,
      isUp,
    };
  }

  public async collectInterfaces(): Promise<{
    interfaces: ServerNetworkInterface[];
    activeInterface: string;
    totalDownloadSpeed: number;
    totalUploadSpeed: number;
    totalDownloaded: number;
    totalUploaded: number;
  }> {
    const nowMs = performance.now();
    const elapsedSecs = this.lastIfacePollMs > 0 ? Math.max(0.05, (nowMs - this.lastIfacePollMs) / 1000) : 1;
    this.lastIfacePollMs = nowMs;

    const [netIfacesRaw, procDevMap, siStatsRaw] = await Promise.all([
      si.networkInterfaces().catch(() => []),
      this.readLinuxProcNetDev(),
      os.platform() === 'linux' ? Promise.resolve([]) : si.networkStats('*').catch(() => []),
    ]);

    const netIfaces = Array.isArray(netIfacesRaw) ? netIfacesRaw : [netIfacesRaw].filter(Boolean);
    const siStats = Array.isArray(siStatsRaw) ? siStatsRaw : [siStatsRaw].filter(Boolean);

    const mapped: ServerNetworkInterface[] = await Promise.all(
      netIfaces.map(async (iface) => {
        const name = iface.iface;
        const type = classifyNetworkInterface(iface);
        const procRow = procDevMap.get(name);
        const siStat = siStats.find((s) => s.iface === name);

        const rxTotal = procRow ? procRow.rxBytes : siStat?.rx_bytes || 0;
        const txTotal = procRow ? procRow.txBytes : siStat?.tx_bytes || 0;

        let rxSpeed = 0;
        let txSpeed = 0;
        if (procRow) {
          const prev = this.prevIfaceBytes.get(name);
          if (prev && this.lastIfacePollMs > 0) {
            const drx = rxTotal >= prev.rx ? rxTotal - prev.rx : 0;
            const dtx = txTotal >= prev.tx ? txTotal - prev.tx : 0;
            rxSpeed = Math.round(drx / elapsedSecs);
            txSpeed = Math.round(dtx / elapsedSecs);
          }
          this.prevIfaceBytes.set(name, { rx: rxTotal, tx: txTotal });
        } else {
          rxSpeed = Math.max(0, Math.round(siStat?.rx_sec || 0));
          txSpeed = Math.max(0, Math.round(siStat?.tx_sec || 0));
        }

        const sysMeta = os.platform() === 'linux' ? await this.readLinuxSysClassNet(name) : { speedMbps: null, mtu: null, isUp: null };
        const speedMbps =
          iface.speed && iface.speed > 0 ? Math.round(iface.speed) : sysMeta.speedMbps;
        const mtu = Number.isFinite(iface.mtu) && iface.mtu > 0 ? iface.mtu : sysMeta.mtu;
        const isUp = sysMeta.isUp !== null ? sysMeta.isUp : iface.operstate === 'up' || Boolean(iface.ip4);

        const rxPackets = procRow ? procRow.rxPackets : null;
        const txPackets = procRow ? procRow.txPackets : null;
        const rxErrors = procRow ? procRow.rxErrors : siStat?.rx_errors ?? null;
        const txErrors = procRow ? procRow.txErrors : siStat?.tx_errors ?? null;

        let packetLossPercent: number | null = null;
        if (rxPackets !== null && txPackets !== null && rxErrors !== null && txErrors !== null) {
          const tot = rxPackets + txPackets;
          const errs = rxErrors + txErrors;
          packetLossPercent = tot > 0 ? parseFloat(((errs / tot) * 100).toFixed(2)) : 0;
        }

        return {
          name,
          displayName: iface.ifaceName || name,
          type,
          ip4: iface.ip4 || null,
          ip6: iface.ip6 || null,
          mac: iface.mac && iface.mac !== '00:00:00:00:00:00' ? iface.mac.toUpperCase() : null,
          isUp,
          speedMbps,
          mtu,
          rxBytesTotal: rxTotal,
          txBytesTotal: txTotal,
          rxSpeedBytesSec: rxSpeed,
          txSpeedBytesSec: txSpeed,
          rxPackets,
          txPackets,
          rxErrors,
          txErrors,
          packetLossPercent,
        };
      })
    );

    mapped.sort((a, b) => {
      const score = (i: ServerNetworkInterface) => (i.isUp && i.type !== 'loopback' ? 0 : i.isUp ? 1 : 2);
      return score(a) - score(b) || b.rxBytesTotal + b.txBytesTotal - (a.rxBytesTotal + a.txBytesTotal);
    });

    let totalDownloadSpeed = 0;
    let totalUploadSpeed = 0;
    let totalDownloaded = 0;
    let totalUploaded = 0;

    for (const iface of mapped) {
      if (iface.type !== 'loopback') {
        totalDownloadSpeed += iface.rxSpeedBytesSec;
        totalUploadSpeed += iface.txSpeedBytesSec;
        totalDownloaded += iface.rxBytesTotal;
        totalUploaded += iface.txBytesTotal;
      }
    }

    const activeIf =
      mapped.find((i) => i.isUp && i.type !== 'loopback' && i.ip4) ||
      mapped.find((i) => i.isUp && i.type !== 'loopback') ||
      mapped[0];

    return {
      interfaces: mapped,
      activeInterface: activeIf ? activeIf.name : 'N/A',
      totalDownloadSpeed,
      totalUploadSpeed,
      totalDownloaded,
      totalUploaded,
    };
  }

  private updateTrafficAggregation(interfaces: ServerNetworkInterface[], timestampMs: number, activeConns: number) {
    let allRxSpeed = 0;
    let allTxSpeed = 0;
    let allRxTotal = 0;
    let allTxTotal = 0;
    let allSessionRx = 0;
    let allSessionTx = 0;
    let allDeltaRx = 0;
    let allDeltaTx = 0;
    const deltas = new Map<string, { drx: number; dtx: number }>();

    for (const iface of interfaces) {
      let acc = this.sessionIface.get(iface.name);
      if (!acc) {
        acc = {
          lastRx: null,
          lastTx: null,
          sessionRx: 0,
          sessionTx: 0,
          peakRx: 0,
          peakTx: 0,
        };
        this.sessionIface.set(iface.name, acc);
      }

      const drx = acc.lastRx !== null ? (iface.rxBytesTotal >= acc.lastRx ? iface.rxBytesTotal - acc.lastRx : iface.rxBytesTotal) : 0;
      const dtx = acc.lastTx !== null ? (iface.txBytesTotal >= acc.lastTx ? iface.txBytesTotal - acc.lastTx : iface.txBytesTotal) : 0;

      acc.lastRx = iface.rxBytesTotal;
      acc.lastTx = iface.txBytesTotal;
      acc.sessionRx += drx;
      acc.sessionTx += dtx;
      acc.peakRx = Math.max(acc.peakRx, iface.rxSpeedBytesSec);
      acc.peakTx = Math.max(acc.peakTx, iface.txSpeedBytesSec);
      deltas.set(iface.name, { drx, dtx });

      if (iface.type !== 'loopback') {
        allRxSpeed += iface.rxSpeedBytesSec;
        allTxSpeed += iface.txSpeedBytesSec;
        allRxTotal += iface.rxBytesTotal;
        allTxTotal += iface.txBytesTotal;
        allSessionRx += acc.sessionRx;
        allSessionTx += acc.sessionTx;
        allDeltaRx += drx;
        allDeltaTx += dtx;
      }
    }

    this.allPeakRx = Math.max(this.allPeakRx, allRxSpeed);
    this.allPeakTx = Math.max(this.allPeakTx, allTxSpeed);

    let effectiveIface = this.selectedInterface;
    let target = effectiveIface !== 'all' ? interfaces.find((i) => i.name === effectiveIface) : undefined;
    if (effectiveIface !== 'all' && !target) {
      this.selectedInterface = 'all';
      effectiveIface = 'all';
    }

    const dlSpeed = target ? target.rxSpeedBytesSec : allRxSpeed;
    const ulSpeed = target ? target.txSpeedBytesSec : allTxSpeed;
    const accTarget = target ? this.sessionIface.get(target.name) : undefined;
    const delta = target ? deltas.get(target.name) || { drx: 0, dtx: 0 } : { drx: allDeltaRx, dtx: allDeltaTx };

    this.recordHistorySample(effectiveIface, timestampMs, dlSpeed, ulSpeed, delta.drx, delta.dtx, activeConns);

    return {
      selectedInterface: effectiveIface,
      downloadSpeedBytesSec: dlSpeed,
      uploadSpeedBytesSec: ulSpeed,
      peakDownloadBytesSec: accTarget ? accTarget.peakRx : this.allPeakRx,
      peakUploadBytesSec: accTarget ? accTarget.peakTx : this.allPeakTx,
      totalDownloadedBytes: target ? target.rxBytesTotal : allRxTotal,
      totalUploadedBytes: target ? target.txBytesTotal : allTxTotal,
      sessionDownloadedBytes: accTarget ? accTarget.sessionRx : allSessionRx,
      sessionUploadedBytes: accTarget ? accTarget.sessionTx : allSessionTx,
    };
  }

  private recordHistorySample(
    interfaceName: string,
    tsMs: number,
    dlSpeed: number,
    ulSpeed: number,
    drx: number,
    dtx: number,
    activeConns: number
  ) {
    const ring = this.rawByIface.get(interfaceName) || [];
    ring.push({
      timestamp: tsMs,
      timeLabel: formatTsLabel(tsMs, false),
      downloadBytesSec: dlSpeed,
      uploadBytesSec: ulSpeed,
      peakDownloadBytesSec: dlSpeed,
      peakUploadBytesSec: ulSpeed,
      downloadedDeltaBytes: drx,
      uploadedDeltaBytes: dtx,
      activeConnections: activeConns,
    });
    if (ring.length > MAX_RAW_SAMPLES) {
      ring.splice(0, ring.length - MAX_RAW_SAMPLES);
    }
    this.rawByIface.set(interfaceName, ring);

    const b1mTs = Math.floor(tsMs / 60_000) * 60_000;
    this.upsertBucket(this.buckets1m, b1mTs, interfaceName, dlSpeed, ulSpeed, drx, dtx, activeConns, MAX_1M_BUCKETS, tsMs - 24 * 3600_000);

    const b15mTs = Math.floor(tsMs / 900_000) * 900_000;
    this.upsertBucket(this.buckets15m, b15mTs, interfaceName, dlSpeed, ulSpeed, drx, dtx, activeConns, MAX_15M_BUCKETS, tsMs - 7 * 24 * 3600_000);

    this.dirty = true;
    void this.maybeFlushToDisk();
  }

  private upsertBucket(
    buckets: PersistedBucket[],
    bucketTsMs: number,
    interfaceName: string,
    dlSpeed: number,
    ulSpeed: number,
    drx: number,
    dtx: number,
    conns: number,
    maxLen: number,
    cutoffMs: number
  ) {
    const existing = buckets.slice(-16).find((b) => b.bucketTsMs === bucketTsMs && b.interfaceName === interfaceName);
    if (existing) {
      existing.sampleCount += 1;
      existing.sumDlSpeed += dlSpeed;
      existing.sumUlSpeed += ulSpeed;
      existing.peakDlSpeed = Math.max(existing.peakDlSpeed, dlSpeed);
      existing.peakUlSpeed = Math.max(existing.peakUlSpeed, ulSpeed);
      existing.totalDlBytes += drx;
      existing.totalUlBytes += dtx;
      existing.lastConnections = conns;
    } else {
      buckets.push({
        bucketTsMs,
        interfaceName,
        sampleCount: 1,
        sumDlSpeed: dlSpeed,
        sumUlSpeed: ulSpeed,
        peakDlSpeed: dlSpeed,
        peakUlSpeed: ulSpeed,
        totalDlBytes: drx,
        totalUlBytes: dtx,
        lastConnections: conns,
      });
      const filtered = buckets.filter((b) => b.bucketTsMs >= cutoffMs);
      if (filtered.length !== buckets.length) {
        buckets.length = 0;
        buckets.push(...filtered.slice(-maxLen * 4));
      }
    }
  }

  public async collectSocketsAndProcesses(): Promise<{
    connections: ServerNetworkConnection[];
    processes: ServerProcessNetworkUsage[];
    capabilities: ServerNetworkCapabilities;
  }> {
    const isElevated = typeof process.getuid === 'function' ? process.getuid() === 0 : false;
    const procData = await si.processes().catch(() => null);
    const procMap = new Map<number, { name: string; path: string | null; user: string | null }>();
    for (const p of procData?.list || []) {
      procMap.set(p.pid, {
        name: p.name || `PID ${p.pid}`,
        path: p.path || null,
        user: p.user || null,
      });
    }

    let connections: ServerNetworkConnection[] = [];
    let unreadableCount = 0;

    if (os.platform() === 'linux') {
      const inodeToPid = new Map<string, number>();
      try {
        const procDirs = await fs.readdir('/proc');
        await Promise.all(
          procDirs.map(async (dir) => {
            if (!/^\d+$/.test(dir)) return;
            const pid = Number(dir);
            try {
              const fds = await fs.readdir(`/proc/${dir}/fd`);
              await Promise.all(
                fds.map(async (fd) => {
                  try {
                    const link = await fs.readlink(`/proc/${dir}/fd/${fd}`);
                    if (link.startsWith('socket:[') && link.endsWith(']')) {
                      inodeToPid.set(link.slice(8, -1), pid);
                    }
                  } catch {
                    // ignore closed fd
                  }
                })
              );
            } catch (err: any) {
              if (err?.code === 'EACCES' || err?.code === 'EPERM') {
                unreadableCount += 1;
              }
            }
          })
        );
      } catch {
        // ignore
      }

      const files: { path: string; protocol: string; isV6: boolean }[] = [
        { path: '/proc/net/tcp', protocol: 'TCP', isV6: false },
        { path: '/proc/net/tcp6', protocol: 'TCP6', isV6: true },
        { path: '/proc/net/udp', protocol: 'UDP', isV6: false },
        { path: '/proc/net/udp6', protocol: 'UDP6', isV6: true },
      ];

      await Promise.all(
        files.map(async (file) => {
          try {
            const content = await fs.readFile(file.path, 'utf8');
            for (const line of content.split('\n').slice(1)) {
              const cols = line.trim().split(/\s+/);
              if (cols.length < 10) continue;
              const local = parseHexEndpoint(cols[1], file.isV6);
              const remote = parseHexEndpoint(cols[2], file.isV6);
              if (!local || !remote) continue;

              const state = file.protocol.startsWith('UDP')
                ? cols[3] === '01'
                  ? 'ESTABLISHED'
                  : 'UNCONN'
                : mapLinuxTcpState(cols[3]);

              const uid = cols[7];
              const inode = cols[9];
              const pid = inode && inode !== '0' ? inodeToPid.get(inode) ?? null : null;
              const pInfo = pid !== null ? procMap.get(pid) : undefined;
              const processName = pInfo?.name || (pid !== null ? `PID ${pid}` : `UID ${uid}`);

              const loopback =
                isLoopbackIp(local.address) &&
                (isLoopbackIp(remote.address) || remote.port === 0 || remote.address === '0.0.0.0' || remote.address === '::');

              connections.push({
                id: `${file.protocol}:${pid ?? 0}:${inode || `${local.address}:${local.port}-${remote.address}:${remote.port}`}`,
                pid,
                processName,
                executablePath: pInfo?.path || null,
                protocol: file.protocol,
                localAddress: local.address,
                localPort: local.port,
                remoteAddress: remote.address,
                remotePort: remote.port === 0 ? null : remote.port,
                state,
                isLoopback: loopback,
                rxBytesTotal: null,
                txBytesTotal: null,
                rxSpeedBytesSec: null,
                txSpeedBytesSec: null,
              });
            }
          } catch {
            // file may not exist (e.g. ipv6 disabled)
          }
        })
      );
    }

    // Fallback to systeminformation socket inspection if /proc/net produced nothing (Windows / macOS)
    if (connections.length === 0) {
      const siConns = await si.networkConnections().catch(() => []);
      connections = (Array.isArray(siConns) ? siConns : []).map((c, idx) => {
        const pid = typeof c.pid === 'number' && c.pid > 0 ? c.pid : null;
        const pInfo = pid !== null ? procMap.get(pid) : undefined;
        const localPort = Number(c.localPort) || 0;
        const remotePortRaw = Number(c.peerPort);
        const remotePort = Number.isFinite(remotePortRaw) && remotePortRaw > 0 ? remotePortRaw : null;
        const localAddr = c.localAddress || '0.0.0.0';
        const remoteAddr = c.peerAddress || '*';
        return {
          id: `${c.protocol || 'TCP'}:${pid ?? 0}:${localAddr}:${localPort}-${remoteAddr}:${remotePort ?? 0}:${idx}`,
          pid,
          processName: c.process || pInfo?.name || (pid ? `PID ${pid}` : 'System'),
          executablePath: pInfo?.path || null,
          protocol: (c.protocol || 'TCP').toUpperCase(),
          localAddress: localAddr,
          localPort,
          remoteAddress: remoteAddr,
          remotePort,
          state: (c.state || 'UNKNOWN').toUpperCase(),
          isLoopback: isLoopbackIp(localAddr) && (isLoopbackIp(remoteAddr) || remotePort === null),
          rxBytesTotal: null,
          txBytesTotal: null,
          rxSpeedBytesSec: null,
          txSpeedBytesSec: null,
        };
      });
    }

    const grouped = new Map<
      number,
      {
        name: string;
        executablePath: string | null;
        user: string | null;
        activeConnections: number;
        totalSockets: number;
        protocols: Set<string>;
      }
    >();

    for (const conn of connections) {
      if (conn.pid === null || conn.pid <= 0) continue;
      let entry = grouped.get(conn.pid);
      if (!entry) {
        const pInfo = procMap.get(conn.pid);
        entry = {
          name: pInfo?.name || conn.processName,
          executablePath: pInfo?.path || conn.executablePath,
          user: pInfo?.user || null,
          activeConnections: 0,
          totalSockets: 0,
          protocols: new Set<string>(),
        };
        grouped.set(conn.pid, entry);
      }
      entry.totalSockets += 1;
      if (isActiveState(conn.state)) {
        entry.activeConnections += 1;
      }
      entry.protocols.add(conn.protocol.replace(/6$/, ''));
    }

    const processes: ServerProcessNetworkUsage[] = Array.from(grouped.entries()).map(([pid, g]) => {
      const lower = g.name.toLowerCase();
      const category: 'app' | 'background' | 'system' =
        pid <= 4 || g.user === 'root' || lower.includes('systemd')
          ? 'system'
          : lower.endsWith('d') || lower.includes('nginx') || lower.includes('node') || lower.includes('service')
          ? 'background'
          : 'app';

      return {
        pid,
        name: g.name,
        executablePath: g.executablePath,
        user: g.user,
        category,
        downloadSpeedBytesSec: null,
        uploadSpeedBytesSec: null,
        totalDownloadedBytes: null,
        totalUploadedBytes: null,
        combinedSpeedBytesSec: null,
        combinedTotalBytes: null,
        trafficSharePercent: null,
        isMeasured: false,
        measurementSource: 'socket_ownership_only',
        activeConnections: g.activeConnections,
        totalSockets: g.totalSockets,
        protocols: Array.from(g.protocols).sort(),
        status: g.activeConnections > 0 ? 'connected' : 'unmeasured',
      };
    });

    processes.sort((a, b) => b.activeConnections - a.activeConnections || b.totalSockets - a.totalSockets || a.name.localeCompare(b.name));
    connections.sort((a, b) => Number(isActiveState(b.state)) - Number(isActiveState(a.state)) || a.processName.localeCompare(b.processName));

    const capabilities: ServerNetworkCapabilities = {
      level: 'connections_only',
      perProcessBytesSupported: false,
      isElevated,
      platformMethod:
        os.platform() === 'linux'
          ? 'Host /proc/net + /proc/<pid>/fd'
          : 'Host systeminformation Socket Table',
      limitationReason:
        'Web Host API mode reports live OS socket ownership and active connections without fabricating per-process byte counters. Native Tauri desktop builds unlock Linux Netlink SOCK_DIAG (tcp_info) and Windows Administrator TCP EStats per-process byte accounting.',
      unreadableProcessCount: unreadableCount,
    };

    this.cachedConnections = connections;
    this.cachedProcesses = processes;
    this.cachedCapabilities = capabilities;

    return { connections, processes, capabilities };
  }

  public async getNetworkOverview(): Promise<ServerNetworkTrafficOverview> {
    const nowMs = Date.now();
    const [ifaceData, sockData] = await Promise.all([
      this.collectInterfaces(),
      this.collectSocketsAndProcesses(),
    ]);

    const activeConns = sockData.connections.filter((c) => isActiveState(c.state)).length;
    const agg = this.updateTrafficAggregation(ifaceData.interfaces, nowMs, activeConns);

    return {
      selectedInterface: agg.selectedInterface,
      activeInterface: ifaceData.activeInterface,
      downloadSpeedBytesSec: agg.downloadSpeedBytesSec,
      uploadSpeedBytesSec: agg.uploadSpeedBytesSec,
      peakDownloadBytesSec: agg.peakDownloadBytesSec,
      peakUploadBytesSec: agg.peakUploadBytesSec,
      totalDownloadedBytes: agg.totalDownloadedBytes,
      totalUploadedBytes: agg.totalUploadedBytes,
      sessionDownloadedBytes: agg.sessionDownloadedBytes,
      sessionUploadedBytes: agg.sessionUploadedBytes,
      activeConnectionsCount: activeConns,
      totalConnectionsCount: sockData.connections.length,
      interfaces: ifaceData.interfaces,
      capabilities: sockData.capabilities,
      timestamp: nowMs,
    };
  }

  public async getProcessDetails(pid: number) {
    if (this.cachedConnections.length === 0) {
      await this.collectSocketsAndProcesses();
    } else {
      await this.collectSocketsAndProcesses();
    }

    const usage =
      this.cachedProcesses.find((p) => p.pid === pid) || {
        pid,
        name: `PID ${pid}`,
        executablePath: null,
        user: null,
        category: 'app' as const,
        downloadSpeedBytesSec: null,
        uploadSpeedBytesSec: null,
        totalDownloadedBytes: null,
        totalUploadedBytes: null,
        combinedSpeedBytesSec: null,
        combinedTotalBytes: null,
        trafficSharePercent: null,
        isMeasured: false,
        measurementSource: 'socket_ownership_only',
        activeConnections: 0,
        totalSockets: 0,
        protocols: [],
        status: 'unmeasured',
      };

    return {
      usage,
      connections: this.cachedConnections.filter((c) => c.pid === pid),
      history: [],
      capabilities: this.cachedCapabilities,
    };
  }

  public getHistory(period: string, ifaceParam?: string) {
    const interfaceName = ifaceParam?.trim() || this.selectedInterface;
    const nowMs = Date.now();
    const ranges: Record<string, number> = {
      '1m': 60_000,
      '5m': 5 * 60_000,
      '15m': 15 * 60_000,
      '30m': 30 * 60_000,
      '1h': 60 * 60_000,
      '24h': 24 * 3600_000,
      '7d': 7 * 24 * 3600_000,
    };
    const cutoff = nowMs - (ranges[period] || 5 * 60_000);

    let points: ServerNetworkHistoryPoint[];
    if (period === '24h') {
      points = this.buckets1m
        .filter((b) => b.interfaceName === interfaceName && b.bucketTsMs >= cutoff)
        .map((b) => ({
          timestamp: b.bucketTsMs,
          timeLabel: formatTsLabel(b.bucketTsMs, false),
          downloadBytesSec: Math.round(b.sumDlSpeed / Math.max(1, b.sampleCount)),
          uploadBytesSec: Math.round(b.sumUlSpeed / Math.max(1, b.sampleCount)),
          peakDownloadBytesSec: b.peakDlSpeed,
          peakUploadBytesSec: b.peakUlSpeed,
          downloadedDeltaBytes: b.totalDlBytes,
          uploadedDeltaBytes: b.totalUlBytes,
          activeConnections: b.lastConnections,
        }));
    } else if (period === '7d') {
      points = this.buckets15m
        .filter((b) => b.interfaceName === interfaceName && b.bucketTsMs >= cutoff)
        .map((b) => ({
          timestamp: b.bucketTsMs,
          timeLabel: formatTsLabel(b.bucketTsMs, true),
          downloadBytesSec: Math.round(b.sumDlSpeed / Math.max(1, b.sampleCount)),
          uploadBytesSec: Math.round(b.sumUlSpeed / Math.max(1, b.sampleCount)),
          peakDownloadBytesSec: b.peakDlSpeed,
          peakUploadBytesSec: b.peakUlSpeed,
          downloadedDeltaBytes: b.totalDlBytes,
          uploadedDeltaBytes: b.totalUlBytes,
          activeConnections: b.lastConnections,
        }));
    } else {
      points = (this.rawByIface.get(interfaceName) || []).filter((p) => p.timestamp >= cutoff);
    }

    if (points.length === 0 && (period === '24h' || period === '7d')) {
      points = this.rawByIface.get(interfaceName) || [];
    }

    let peakDownloadBytesSec = 0;
    let peakUploadBytesSec = 0;
    let totalDownloadedBytes = 0;
    let totalUploadedBytes = 0;

    for (const p of points) {
      peakDownloadBytesSec = Math.max(peakDownloadBytesSec, p.peakDownloadBytesSec, p.downloadBytesSec);
      peakUploadBytesSec = Math.max(peakUploadBytesSec, p.peakUploadBytesSec, p.uploadBytesSec);
      totalDownloadedBytes += p.downloadedDeltaBytes;
      totalUploadedBytes += p.uploadedDeltaBytes;
    }

    return {
      period,
      interfaceName,
      points,
      peakDownloadBytesSec,
      peakUploadBytesSec,
      totalDownloadedBytes,
      totalUploadedBytes,
      topApplications: [],
    };
  }
}

export const hostNetworkMonitor = new HostNetworkMonitor();
