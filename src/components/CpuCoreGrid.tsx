import React from 'react';
import { UsageBar } from './UsageBar';
import { formatFrequency } from '../utils/formatters';

interface CpuCoreGridProps {
  cores: number[];
  frequencyGhz: number | null;
  className?: string;
}

export const CpuCoreGrid: React.FC<CpuCoreGridProps> = ({
  cores,
  frequencyGhz,
  className = '',
}) => {
  return (
    <div
      id="cpu-cores-grid"
      className={`bg-[#0B1118] border border-[#1A2633] rounded-lg p-4 ${className}`}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider font-mono-num">
          Logical Processors Activity ({cores.length} Threads)
        </h3>
        <span className="text-xs font-mono-num text-slate-400">
          Clock: <span className="text-slate-200">{formatFrequency(frequencyGhz)}</span>
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
        {cores.map((usage, idx) => {
          return (
            <div
              key={idx}
              className="bg-[#101720] border border-[#14202c] rounded p-2 flex flex-col justify-between"
            >
              <div className="flex items-center justify-between text-xs font-mono-num mb-1.5">
                <span className="text-slate-400">CPU {idx}</span>
                <span
                  className={`font-semibold ${
                    usage >= 80
                      ? 'text-amber-400'
                      : usage >= 60
                      ? 'text-cyan-400'
                      : 'text-slate-200'
                  }`}
                >
                  {usage.toFixed(1)}%
                </span>
              </div>
              <UsageBar value={usage} height="xs" colorScheme="auto" />
            </div>
          );
        })}
      </div>
    </div>
  );
};
