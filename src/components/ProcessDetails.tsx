import React, { useState } from 'react';
import {
  X,
  Cpu,
  MemoryStick,
  MonitorCog,
  HardDrive,
  Network,
  Clock,
  Terminal,
  AlertTriangle,
  User,
  Hash,
  Activity,
  Layers,
  PowerOff,
  CheckCircle,
} from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip } from 'recharts';
import { ProcessInfo } from '../types/process';
import { formatBytes, formatSpeed } from '../utils/formatters';

interface ProcessDetailsProps {
  process: ProcessInfo | null;
  onClose: () => void;
  onKillProcess: (pid: number) => Promise<{ success: boolean; message: string }>;
}

export const ProcessDetails: React.FC<ProcessDetailsProps> = ({
  process,
  onClose,
  onKillProcess,
}) => {
  const [killMessage, setKillMessage] = useState<{ text: string; success: boolean } | null>(null);
  const [confirmingKill, setConfirmingKill] = useState(false);
  const [isKilling, setIsKilling] = useState(false);
  const [lastPid, setLastPid] = useState<number | null>(null);

  if (!process) return null;

  if (lastPid !== process.pid) {
    setLastPid(process.pid);
    setConfirmingKill(false);
    setKillMessage(null);
  }

  const handleEndProcess = async () => {
    setIsKilling(true);
    try {
      const res = await onKillProcess(process.pid);
      setKillMessage({ text: res.message, success: res.success });
      setConfirmingKill(false);
      setTimeout(() => {
        setKillMessage(null);
      }, 4500);
    } finally {
      setIsKilling(false);
    }
  };

  const chartData = (process.history || []).map((h, i) => ({
    time: i,
    cpu: h.cpu,
    ram: h.ramMB,
  }));

  const totalDisk = process.diskReadBytesSec + process.diskWriteBytesSec;
  const hasNetTelemetry =
    process.netRxBytesSec !== null && process.netTxBytesSec !== null;
  const totalNet = hasNetTelemetry
    ? (process.netRxBytesSec ?? 0) + (process.netTxBytesSec ?? 0)
    : null;

  return (
    <div
      id="process-detail-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div className="bg-[#0B1118] border border-[#1A2633] rounded-lg shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-4 border-b border-[#1A2633] bg-[#0D1117] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <Terminal className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-100 tracking-tight">
                  {process.name}
                </h2>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono-num bg-slate-800 text-slate-300 border border-slate-700">
                  PID: {process.pid}
                </span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono-num bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase">
                  {process.status}
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono-num truncate max-w-md mt-0.5">
                {process.executablePath}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            id="close-process-detail-btn"
            className="p-1.5 rounded hover:bg-[#1A2633] text-slate-400 hover:text-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 overflow-y-auto space-y-4 font-mono-num text-xs">
          {/* Key Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="bg-[#101720] border border-[#14202c] p-2.5 rounded">
              <div className="flex items-center gap-1.5 text-slate-400 text-[11px] mb-1">
                <Cpu className="w-3.5 h-3.5 text-blue-400" />
                <span>CPU Usage</span>
              </div>
              <div className="text-lg font-bold text-slate-100">{process.cpuPercent.toFixed(1)}%</div>
              <div className="text-[10px] text-slate-500">
                {process.threads !== null ? `${process.threads} Active Threads` : 'Threads: N/A'}
              </div>
            </div>

            <div className="bg-[#101720] border border-[#14202c] p-2.5 rounded">
              <div className="flex items-center gap-1.5 text-slate-400 text-[11px] mb-1">
                <MemoryStick className="w-3.5 h-3.5 text-emerald-400" />
                <span>Memory</span>
              </div>
              <div className="text-lg font-bold text-slate-100">{formatBytes(process.memoryBytes)}</div>
              <div className="text-[10px] text-slate-500">{process.memoryPercent.toFixed(1)}% of System RAM</div>
            </div>

            <div className="bg-[#101720] border border-[#14202c] p-2.5 rounded">
              <div className="flex items-center gap-1.5 text-slate-400 text-[11px] mb-1">
                <MonitorCog className="w-3.5 h-3.5 text-cyan-400" />
                <span>GPU / VRAM</span>
              </div>
              <div className="text-lg font-bold text-slate-100">
                {process.gpuPercent !== null ? `${process.gpuPercent.toFixed(1)}%` : 'N/A'}
              </div>
              <div className="text-[10px] text-slate-500">
                {process.vramBytes !== null ? `${formatBytes(process.vramBytes)} VRAM` : 'VRAM: N/A'}
              </div>
            </div>

            <div className="bg-[#101720] border border-[#14202c] p-2.5 rounded">
              <div className="flex items-center gap-1.5 text-slate-400 text-[11px] mb-1">
                <HardDrive className="w-3.5 h-3.5 text-amber-400" />
                <span>Disk I/O</span>
              </div>
              <div className="text-lg font-bold text-slate-100">{formatSpeed(totalDisk)}</div>
              <div className="text-[10px] text-slate-500">
                R: {formatSpeed(process.diskReadBytesSec)} | W: {formatSpeed(process.diskWriteBytesSec)}
              </div>
            </div>
          </div>

          {/* Real-Time Sparkline History */}
          <div className="bg-[#101720] border border-[#14202c] p-3 rounded">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-blue-400" />
                Live Process Telemetry
              </span>
              <div className="flex items-center gap-3 text-[10px]">
                <span className="flex items-center gap-1 text-blue-400">
                  <span className="w-2 h-0.5 bg-blue-400 inline-block" /> CPU (%)
                </span>
                <span className="flex items-center gap-1 text-emerald-400">
                  <span className="w-2 h-0.5 bg-emerald-400 inline-block" /> RAM (MB)
                </span>
              </div>
            </div>

            <div className="h-28 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <XAxis hide />
                  <YAxis hide domain={['auto', 'auto']} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0B1118',
                      borderColor: '#1A2633',
                      fontSize: '11px',
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="cpu"
                    stroke="#3B82F6"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="ram"
                    stroke="#10B981"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Process Meta Details List */}
          <div className="bg-[#080B10] border border-[#1A2633] rounded p-3 space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-4">
              <div className="flex justify-between items-center py-1 border-b border-[#131c26]">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-slate-500" /> User:
                </span>
                <span className="text-slate-200 font-semibold">{process.user || 'N/A'}</span>
              </div>

              <div className="flex justify-between items-center py-1 border-b border-[#131c26]">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Hash className="w-3.5 h-3.5 text-slate-500" /> Parent PID (PPID):
                </span>
                <span className="text-slate-200">{process.ppid}</span>
              </div>

              <div className="flex justify-between items-center py-1 border-b border-[#131c26]">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-slate-500" /> Started:
                </span>
                <span className="text-slate-200">{process.startTime}</span>
              </div>

              <div className="flex justify-between items-center py-1 border-b border-[#131c26]">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-slate-500" /> Priority (Niceness):
                </span>
                <span className="text-slate-200">
                  {process.priority !== null ? process.priority : 'N/A'}
                </span>
              </div>

              <div className="flex justify-between items-center py-1 border-b border-[#131c26]">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Network className="w-3.5 h-3.5 text-slate-500" /> Network Bandwidth:
                </span>
                <span className="text-slate-200">
                  {totalNet !== null ? formatSpeed(totalNet) : 'N/A'}
                </span>
              </div>

              <div className="flex justify-between items-center py-1 border-b border-[#131c26]">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-slate-500" /> Category:
                </span>
                <span className="text-slate-200 capitalize">{process.category}</span>
              </div>
            </div>

            {/* Command line execution string */}
            <div className="pt-2">
              <span className="text-slate-400 block mb-1">Command Line:</span>
              <div className="bg-[#05070A] p-2 rounded border border-[#14202c] text-[11px] text-emerald-400/90 font-mono break-all select-text">
                {process.command}
              </div>
            </div>
          </div>

          {/* Feedback banner */}
          {killMessage && (
            <div
              className={`p-2.5 rounded border text-xs flex items-center gap-2 ${
                killMessage.success
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-red-500/10 border-red-500/30 text-red-300'
              }`}
            >
              {killMessage.success ? (
                <CheckCircle className="w-4 h-4 shrink-0 text-emerald-400" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
              )}
              <span>{killMessage.text}</span>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3 border-t border-[#1A2633] bg-[#0D1117] flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500/70 shrink-0" />
            <span>Critical system PIDs are protected; OS user permissions apply.</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded text-xs text-slate-300 hover:bg-[#1A2633] transition-colors cursor-pointer"
            >
              Close
            </button>

            {!confirmingKill ? (
              <button
                onClick={() => setConfirmingKill(true)}
                id="end-process-btn"
                className="px-3.5 py-1.5 rounded text-xs font-semibold bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/40 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <PowerOff className="w-3.5 h-3.5" />
                <span>End Process</span>
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setConfirmingKill(false)}
                  disabled={isKilling}
                  className="px-2.5 py-1.5 rounded text-xs bg-[#101720] hover:bg-[#1A2633] text-slate-300 border border-[#1A2633] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleEndProcess}
                  disabled={isKilling}
                  id="confirm-end-process-btn"
                  className="px-3 py-1.5 rounded text-xs font-semibold bg-red-600 hover:bg-red-500 text-white border border-red-500 inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-60"
                >
                  <PowerOff className="w-3.5 h-3.5" />
                  <span>{isKilling ? 'Terminating...' : `Confirm Kill (${process.pid})`}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
