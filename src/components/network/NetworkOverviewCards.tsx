import React from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Download,
  Upload,
  Cable,
  Wifi,
  Radio,
  Shield,
  Cpu,
  Globe,
} from 'lucide-react';
import { BandwidthUnit, NetworkInterface, NetworkTrafficOverview } from '../../types/system';
import { formatBandwidthRate, formatBytes } from '../../utils/formatters';

interface NetworkOverviewCardsProps {
  overview: NetworkTrafficOverview;
  unit: BandwidthUnit;
}

function getInterfaceIcon(type?: NetworkInterface['type']) {
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

export const NetworkOverviewCards: React.FC<NetworkOverviewCardsProps> = ({ overview, unit }) => {
  const selectedIfaceObj =
    overview.selectedInterface !== 'all'
      ? overview.interfaces.find((i) => i.name === overview.selectedInterface)
      : overview.interfaces.find((i) => i.name === overview.activeInterface) ||
        overview.interfaces.find((i) => i.isUp && i.type !== 'loopback');

  const interfaceTitle =
    overview.selectedInterface === 'all' ? 'All Interfaces' : overview.selectedInterface;

  const interfaceSubtitle =
    overview.selectedInterface === 'all'
      ? `Primary: ${overview.activeInterface || 'None'} · ${
          overview.interfaces.filter((i) => i.isUp && i.type !== 'loopback').length
        } up`
      : selectedIfaceObj
      ? `${selectedIfaceObj.type.toUpperCase()} · ${selectedIfaceObj.isUp ? 'UP' : 'DOWN'}${
          selectedIfaceObj.speedMbps ? ` · ${selectedIfaceObj.speedMbps} Mbps` : ''
        }`
      : 'Selected Interface';

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
      {/* 1. Download Speed */}
      <div className="bg-[#0B1118] border border-[#1A2633] rounded-lg p-3.5 flex flex-col justify-between min-w-0">
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider truncate">
            Download Speed
          </span>
          <div className="p-1.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
            <ArrowDownLeft className="w-3.5 h-3.5" />
          </div>
        </div>
        <div className="text-xl font-bold text-slate-100 font-mono-num truncate">
          {formatBandwidthRate(overview.downloadSpeedBytesSec, unit)}
        </div>
        <div className="text-[11px] text-slate-400 font-mono-num mt-1.5 truncate">
          Peak: <span className="text-emerald-400">{formatBandwidthRate(overview.peakDownloadBytesSec, unit)}</span>
        </div>
      </div>

      {/* 2. Upload Speed */}
      <div className="bg-[#0B1118] border border-[#1A2633] rounded-lg p-3.5 flex flex-col justify-between min-w-0">
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider truncate">
            Upload Speed
          </span>
          <div className="p-1.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 shrink-0">
            <ArrowUpRight className="w-3.5 h-3.5" />
          </div>
        </div>
        <div className="text-xl font-bold text-slate-100 font-mono-num truncate">
          {formatBandwidthRate(overview.uploadSpeedBytesSec, unit)}
        </div>
        <div className="text-[11px] text-slate-400 font-mono-num mt-1.5 truncate">
          Peak: <span className="text-sky-400">{formatBandwidthRate(overview.peakUploadBytesSec, unit)}</span>
        </div>
      </div>

      {/* 3. Total Downloaded */}
      <div className="bg-[#0B1118] border border-[#1A2633] rounded-lg p-3.5 flex flex-col justify-between min-w-0">
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider truncate">
            Total Downloaded
          </span>
          <div className="p-1.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
            <Download className="w-3.5 h-3.5" />
          </div>
        </div>
        <div className="text-xl font-bold text-slate-100 font-mono-num truncate">
          {formatBytes(overview.totalDownloadedBytes)}
        </div>
        <div className="text-[11px] text-slate-400 font-mono-num mt-1.5 truncate">
          Session: <span className="text-slate-200">{formatBytes(overview.sessionDownloadedBytes)}</span>
        </div>
      </div>

      {/* 4. Total Uploaded */}
      <div className="bg-[#0B1118] border border-[#1A2633] rounded-lg p-3.5 flex flex-col justify-between min-w-0">
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider truncate">
            Total Uploaded
          </span>
          <div className="p-1.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 shrink-0">
            <Upload className="w-3.5 h-3.5" />
          </div>
        </div>
        <div className="text-xl font-bold text-slate-100 font-mono-num truncate">
          {formatBytes(overview.totalUploadedBytes)}
        </div>
        <div className="text-[11px] text-slate-400 font-mono-num mt-1.5 truncate">
          Session: <span className="text-slate-200">{formatBytes(overview.sessionUploadedBytes)}</span>
        </div>
      </div>

      {/* 5. Active Connections */}
      <div className="bg-[#0B1118] border border-[#1A2633] rounded-lg p-3.5 flex flex-col justify-between min-w-0">
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider truncate">
            Active Connections
          </span>
          <div className="p-1.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shrink-0">
            <Cable className="w-3.5 h-3.5" />
          </div>
        </div>
        <div className="text-xl font-bold text-slate-100 font-mono-num truncate">
          {overview.activeConnectionsCount}
        </div>
        <div className="text-[11px] text-slate-400 font-mono-num mt-1.5 truncate">
          {overview.totalConnectionsCount} total sockets
        </div>
      </div>

      {/* 6. Network Interface */}
      <div className="bg-[#0B1118] border border-[#1A2633] rounded-lg p-3.5 flex flex-col justify-between min-w-0">
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider truncate">
            Network Interface
          </span>
          <div className="p-1.5 rounded bg-[#101720] border border-[#1A2633] shrink-0">
            {getInterfaceIcon(selectedIfaceObj?.type)}
          </div>
        </div>
        <div className="text-base font-bold text-slate-100 font-mono-num truncate" title={interfaceTitle}>
          {interfaceTitle}
        </div>
        <div className="text-[11px] text-slate-400 font-mono-num mt-1.5 truncate" title={interfaceSubtitle}>
          {interfaceSubtitle}
        </div>
      </div>
    </div>
  );
};
