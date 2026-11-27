import React, { useState } from 'react';
import {
  Network,
  Wifi,
  Radio,
  Shield,
  Cpu,
  Globe,
  CheckCircle2,
  XCircle,
  Activity,
  Play,
  Layers,
} from 'lucide-react';
import { BandwidthUnit, NetworkInterface, PingResult } from '../../types/system';
import { formatBandwidthRate, formatBytes } from '../../utils/formatters';
import { systemMonitorService } from '../../services/systemMonitor';

interface NetworkInterfacesPanelProps {
  interfaces: NetworkInterface[];
  selectedInterface: string;
  activeInterface: string;
  unit: BandwidthUnit;
  onSelectInterface: (iface: string) => void;
}

const PRESET_TARGETS = ['1.1.1.1', '8.8.8.8', 'google.com', 'localhost'];

function getInterfaceIcon(type: NetworkInterface['type']) {
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
      return <Globe className="w-4 h-4 text-sky-400" />;
  }
}

export const NetworkInterfacesPanel: React.FC<NetworkInterfacesPanelProps> = ({
  interfaces,
  selectedInterface,
  activeInterface,
  unit,
  onSelectInterface,
}) => {
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

  const nonLoopbackUp = interfaces.filter((i) => i.isUp && i.type !== 'loopback');
  const allRxSpeed = nonLoopbackUp.reduce((acc, i) => acc + i.rxSpeedBytesSec, 0);
  const allTxSpeed = nonLoopbackUp.reduce((acc, i) => acc + i.txSpeedBytesSec, 0);

  return (
    <div className="bg-[#0B1118] border border-[#1A2633] rounded-lg p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider font-mono-num flex items-center gap-2">
            <Network className="w-3.5 h-3.5 text-blue-400" />
            Network Interfaces ({interfaces.length})
          </h3>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Select an interface to scope traffic charts and bandwidth totals, or view all physical/virtual links
          </p>
        </div>
      </div>

      {/* Interface Selector Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 font-mono-num text-xs">
        {/* All Interfaces Option Card */}
        <button
          type="button"
          onClick={() => onSelectInterface('all')}
          className={`text-left bg-[#101720] border rounded-lg p-3 flex flex-col justify-between space-y-2.5 transition-colors cursor-pointer ${
            selectedInterface === 'all'
              ? 'border-cyan-500/60 bg-[#121D29]'
              : 'border-[#1A2633] hover:border-slate-600'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="p-1.5 rounded bg-[#0B1118] border border-[#1A2633] shrink-0">
                <Layers className="w-4 h-4 text-cyan-400" />
              </div>
              <div className="min-w-0">
                <div className="font-bold text-slate-100 truncate">All Interfaces</div>
                <div className="text-[10px] text-slate-400 truncate">
                  Aggregated non-loopback · {nonLoopbackUp.length} active
                </div>
              </div>
            </div>
            {selectedInterface === 'all' && (
              <span className="text-[10px] text-cyan-300 font-semibold shrink-0">Selected</span>
            )}
          </div>

          <div className="bg-[#080B10] p-2 rounded border border-[#14202c] space-y-1 text-[11px]">
            <div className="flex justify-between gap-2">
              <span className="text-slate-400">Primary Link:</span>
              <span className="text-slate-200 font-semibold truncate">{activeInterface || 'N/A'}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-slate-400">Scope:</span>
              <span className="text-slate-300">Excludes Loopback</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1 text-[10px] text-slate-400 pt-1 border-t border-[#14202c]">
            <div>
              RX:{' '}
              <span className="text-emerald-400 font-semibold">
                {formatBandwidthRate(allRxSpeed, unit)}
              </span>
            </div>
            <div className="text-right">
              TX:{' '}
              <span className="text-sky-400 font-semibold">
                {formatBandwidthRate(allTxSpeed, unit)}
              </span>
            </div>
          </div>
        </button>

        {/* Individual Interfaces */}
        {interfaces.map((iface) => {
          const isSelected = selectedInterface === iface.name;
          const isDefault = iface.name === activeInterface;

          return (
            <button
              key={iface.name}
              type="button"
              onClick={() => onSelectInterface(iface.name)}
              className={`text-left bg-[#101720] border rounded-lg p-3 flex flex-col justify-between space-y-2.5 transition-colors cursor-pointer ${
                isSelected
                  ? 'border-cyan-500/60 bg-[#121D29]'
                  : iface.isUp
                  ? 'border-[#1A2633] hover:border-slate-600'
                  : 'border-[#141E28] opacity-65 hover:opacity-90'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="p-1.5 rounded bg-[#0B1118] border border-[#1A2633] shrink-0">
                    {getInterfaceIcon(iface.type)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-slate-100 truncate">{iface.name}</span>
                      {isDefault && (
                        <span className="text-[10px] text-sky-400 font-medium shrink-0">· Primary</span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-400 truncate" title={iface.displayName}>
                      {iface.type.toUpperCase()}
                      {iface.speedMbps ? ` · ${iface.speedMbps} Mbps` : ''}
                      {iface.mtu ? ` · MTU ${iface.mtu}` : ''}
                    </div>
                  </div>
                </div>

                {iface.isUp ? (
                  <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 shrink-0">
                    <CheckCircle2 className="w-3 h-3" /> UP
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] text-slate-500 shrink-0">
                    <XCircle className="w-3 h-3" /> DOWN
                  </span>
                )}
              </div>

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
                <div className="flex justify-between gap-2">
                  <span className="text-slate-400 shrink-0">Totals:</span>
                  <span className="text-slate-300 text-[10px] truncate">
                    {formatBytes(iface.rxBytesTotal)} / {formatBytes(iface.txBytesTotal)}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-1 text-[10px] text-slate-400 pt-1 border-t border-[#14202c]">
                <div>
                  RX:{' '}
                  <span className="text-emerald-400 font-semibold">
                    {formatBandwidthRate(iface.rxSpeedBytesSec, unit)}
                  </span>
                </div>
                <div className="text-right">
                  TX:{' '}
                  <span className="text-sky-400 font-semibold">
                    {formatBandwidthRate(iface.txSpeedBytesSec, unit)}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Preserved Configurable Latency Monitor */}
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
                type="button"
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
            type="button"
            onClick={() => void handlePing()}
            disabled={isPinging}
            className="px-3 py-1.5 rounded bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/40 flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
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
    </div>
  );
};
