import React, { useState } from 'react';
import {
  Network,
  Wifi,
  Radio,
  Shield,
  ArrowDownLeft,
  ArrowUpRight,
  Globe,
  Activity,
  CheckCircle2,
  XCircle,
  Cpu,
  Play,
} from 'lucide-react';
import { NetworkStats, NetworkInterface, PingResult } from '../types/system';
import { formatBytes, formatSpeed } from '../utils/formatters';
import { systemMonitorService } from '../services/systemMonitor';

interface NetworkCardProps {
  network: NetworkStats;
  className?: string;
}

const PRESET_TARGETS = ['1.1.1.1', '8.8.8.8', 'google.com', 'localhost'];

export const NetworkCard: React.FC<NetworkCardProps> = ({ network, className = '' }) => {
  const [pingTarget, setPingTarget] = useState('1.1.1.1');
  const [pingResult, setPingResult] = useState<PingResult | null>(null);
  const [isPinging, setIsPinging] = useState(false);

  const handlePing = async (targetOverride?: string) => {
    const target = (targetOverride ?? pingTarget).trim();
    if (!target || isPinging) return;
    setIsPinging(true);
    try {
      const res = await systemMonitorService.pingTarget(target);
      setPingResult(res);
    } finally {
      setIsPinging(false);
    }
  };

  const getInterfaceIcon = (type: NetworkInterface['type']) => {
    switch (type) {
      case 'wifi':
        return <Wifi className="w-4 h-4 text-cyan-400" />;
      case 'ethernet':
        return <Radio className="w-4 h-4 text-emerald-400" />;
      case 'vpn':
        return <Shield className="w-4 h-4 text-purple-400" />;
      case 'virtual':
        return <Cpu className="w-4 h-4 text-amber-400" />;
      default:
        return <Globe className="w-4 h-4 text-blue-400" />;
    }
  };

  return (
    <div
      id="network-card-container"
      className={`bg-[#0B1118] border border-[#1A2633] rounded-lg p-4 flex flex-col space-y-4 ${className}`}
    >
      {/* Top Speeds Header */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="bg-[#101720] border border-[#14202c] rounded-lg p-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <ArrowDownLeft className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs text-slate-400 font-mono-num block">Current Inbound (DL)</span>
              <span className="text-xl font-bold text-slate-100 font-mono-num">
                {formatSpeed(network.downloadSpeedBytesSec)}
              </span>
            </div>
          </div>
          <div className="text-right font-mono-num text-xs">
            <span className="text-slate-400 text-[11px] block">Total Downloaded</span>
            <span className="text-slate-200 font-semibold">
              {formatBytes(network.totalDownloadedBytes)}
            </span>
          </div>
        </div>

        <div className="bg-[#101720] border border-[#14202c] rounded-lg p-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <ArrowUpRight className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs text-slate-400 font-mono-num block">Current Outbound (UL)</span>
              <span className="text-xl font-bold text-slate-100 font-mono-num">
                {formatSpeed(network.uploadSpeedBytesSec)}
              </span>
            </div>
          </div>
          <div className="text-right font-mono-num text-xs">
            <span className="text-slate-400 text-[11px] block">Total Uploaded</span>
            <span className="text-slate-200 font-semibold">
              {formatBytes(network.totalUploadedBytes)}
            </span>
          </div>
        </div>
      </div>

      {/* Configurable Latency Monitor */}
      <div className="bg-[#101720] border border-[#14202c] rounded-lg p-3 font-mono-num text-xs space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-slate-200 font-semibold">
            <Activity className="w-3.5 h-3.5 text-cyan-400" />
            <span>Latency Monitor (Configurable Ping Target)</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {PRESET_TARGETS.map((preset) => (
              <button
                key={preset}
                onClick={() => {
                  setPingTarget(preset);
                  void handlePing(preset);
                }}
                className={`px-2 py-0.5 rounded text-[10px] border transition-colors cursor-pointer ${
                  pingTarget === preset
                    ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                    : 'bg-[#080B10] text-slate-400 border-[#1A2633] hover:text-slate-200'
                }`}
              >
                {preset}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={pingTarget}
            onChange={(e) => setPingTarget(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handlePing();
            }}
            placeholder="Hostname or IP (e.g. 1.1.1.1)"
            className="flex-1 min-w-[180px] bg-[#080B10] border border-[#1A2633] focus:border-cyan-500 focus:outline-none rounded px-2.5 py-1.5 text-slate-100 placeholder:text-slate-500"
          />
          <button
            onClick={() => void handlePing()}
            disabled={isPinging}
            className="px-3 py-1.5 rounded bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/40 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Play className={`w-3 h-3 ${isPinging ? 'animate-spin' : ''}`} />
            <span>{isPinging ? 'Probing...' : 'Ping Target'}</span>
          </button>

          {pingResult && (
            <div className="flex items-center gap-2 px-2.5 py-1 rounded bg-[#080B10] border border-[#1A2633]">
              <span
                className={`w-2 h-2 rounded-full ${
                  pingResult.reachable ? 'bg-emerald-400' : 'bg-red-400'
                }`}
              />
              <span className="text-slate-300">{pingResult.target}:</span>
              <span className={pingResult.reachable ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>
                {pingResult.latencyMs != null ? `${pingResult.latencyMs} ms` : 'Unreachable'}
              </span>
              <span className="text-[10px] text-slate-500">({pingResult.method})</span>
            </div>
          )}
        </div>
        {pingResult && !pingResult.reachable && pingResult.error && (
          <div className="text-[10px] text-red-400/90">{pingResult.error}</div>
        )}
      </div>

      {/* Interface List */}
      <div>
        <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider font-mono-num mb-2.5 flex items-center gap-2">
          <Network className="w-3.5 h-3.5 text-blue-400" />
          Configured Network Interfaces ({network.interfaces.length})
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {network.interfaces.map((iface) => {
            const isDefault = iface.name === network.activeInterface;

            return (
              <div
                key={iface.name}
                className={`bg-[#101720] border rounded-lg p-3 flex flex-col justify-between space-y-2.5 font-mono-num text-xs ${
                  iface.isUp ? 'border-[#1A2633]' : 'border-[#141e28] opacity-60'
                }`}
              >
                {/* Interface Header */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="p-1.5 rounded bg-[#0B1118] border border-[#1A2633] shrink-0">
                      {getInterfaceIcon(iface.type)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-slate-200 truncate">{iface.name}</span>
                        {isDefault && (
                          <span className="px-1 py-0.2 rounded text-[9px] bg-blue-500/20 text-blue-400 border border-blue-500/30 shrink-0">
                            Default
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400 block truncate">
                        {iface.displayName} • {iface.type.toUpperCase()}
                      </span>
                    </div>
                  </div>

                  {iface.isUp ? (
                    <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 shrink-0">
                      <CheckCircle2 className="w-3 h-3" /> UP
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700 shrink-0">
                      <XCircle className="w-3 h-3" /> DOWN
                    </span>
                  )}
                </div>

                {/* Network IP / MAC Info */}
                <div className="bg-[#080B10] p-2 rounded border border-[#14202c] space-y-1 text-[11px]">
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-400 shrink-0">IPv4:</span>
                    <span className="text-slate-200 font-semibold truncate">{iface.ip4 || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-400 shrink-0">IPv6:</span>
                    <span className="text-slate-300 text-[10px] truncate" title={iface.ip6 || 'N/A'}>
                      {iface.ip6 || 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-400 shrink-0">MAC:</span>
                    <span className="text-slate-400 text-[10px]">{iface.mac || 'N/A'}</span>
                  </div>
                </div>

                {/* Transfer Speeds */}
                <div className="grid grid-cols-2 gap-1 text-[10px] text-slate-400 pt-1 border-t border-[#14202c]">
                  <div>
                    <span>RX: </span>
                    <span className="text-emerald-400 font-semibold">
                      {formatSpeed(iface.rxSpeedBytesSec)}
                    </span>
                  </div>
                  <div className="text-right">
                    <span>TX: </span>
                    <span className="text-cyan-400 font-semibold">
                      {formatSpeed(iface.txSpeedBytesSec)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
