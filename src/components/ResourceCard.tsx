import React from 'react';
import { LucideIcon } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area } from 'recharts';
import { StatusIndicator } from './StatusIndicator';
import { getResourceStatus } from '../utils/formatters';

interface MiniPoint {
  val: number;
}

interface ResourceCardProps {
  id: string;
  title: string;
  value: number; // percentage
  valueDisplay?: string;
  subTitle?: string;
  icon: LucideIcon;
  colorScheme: 'blue' | 'green' | 'cyan' | 'amber';
  historyData: number[];
  details: { label: string; value: string | React.ReactNode }[];
  onClick?: () => void;
}

export const ResourceCard: React.FC<ResourceCardProps> = ({
  id,
  title,
  value,
  valueDisplay,
  subTitle,
  icon: Icon,
  colorScheme,
  historyData,
  details,
  onClick,
}) => {
  const status = getResourceStatus(value);

  const colorConfig = {
    blue: {
      stroke: '#3B82F6',
      fill: 'rgba(59, 130, 246, 0.15)',
      iconColor: 'text-blue-400',
      iconBg: 'bg-blue-500/10',
      borderHover: 'hover:border-blue-500/40',
      accentBar: 'bg-blue-500',
    },
    green: {
      stroke: '#10B981',
      fill: 'rgba(16, 185, 129, 0.15)',
      iconColor: 'text-emerald-400',
      iconBg: 'bg-emerald-500/10',
      borderHover: 'hover:border-emerald-500/40',
      accentBar: 'bg-emerald-500',
    },
    cyan: {
      stroke: '#06B6D4',
      fill: 'rgba(6, 182, 212, 0.15)',
      iconColor: 'text-cyan-400',
      iconBg: 'bg-cyan-500/10',
      borderHover: 'hover:border-cyan-500/40',
      accentBar: 'bg-cyan-500',
    },
    amber: {
      stroke: '#F59E0B',
      fill: 'rgba(245, 158, 11, 0.15)',
      iconColor: 'text-amber-400',
      iconBg: 'bg-amber-500/10',
      borderHover: 'hover:border-amber-500/40',
      accentBar: 'bg-amber-500',
    },
  };

  const currentTheme = colorConfig[colorScheme];

  // Convert number[] to recharts array
  const chartData: MiniPoint[] = historyData.map((val) => ({ val }));

  return (
    <div
      id={id}
      onClick={onClick}
      className={`relative bg-[#0B1118] border border-[#1A2633] rounded-lg p-4 transition-all duration-200 ${
        onClick ? 'cursor-pointer hover:bg-[#101720]' : ''
      } ${currentTheme.borderHover} group shadow-sm flex flex-col justify-between`}
    >
      {/* Top Header */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-md ${currentTheme.iconBg} ${currentTheme.iconColor}`}>
              <Icon className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-200 tracking-tight">{title}</h3>
              {subTitle && <p className="text-[11px] text-slate-400">{subTitle}</p>}
            </div>
          </div>
          <StatusIndicator status={status} size="sm" />
        </div>

        {/* Large Metric Display & Sparkline */}
        <div className="grid grid-cols-12 items-end gap-2 my-2">
          <div className="col-span-5 font-mono-num">
            <div className="text-2xl font-bold text-slate-100 tracking-tight">
              {valueDisplay || `${Math.round(value)}%`}
            </div>
            <div className="text-[11px] text-slate-400 font-medium">
              Utilization: <span className="text-slate-200">{value.toFixed(1)}%</span>
            </div>
          </div>

          {/* Sparkline */}
          <div className="col-span-7 h-12 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id={`grad-${id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={currentTheme.stroke} stopOpacity={0.4} />
                    <stop offset="95%" stopColor={currentTheme.stroke} stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="val"
                  stroke={currentTheme.stroke}
                  strokeWidth={1.5}
                  fillOpacity={1}
                  fill={`url(#grad-${id})`}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Details Grid */}
      <div className="pt-3 border-t border-[#131c26] grid grid-cols-2 gap-x-3 gap-y-1.5 font-mono-num text-[11px]">
        {details.map((detail, idx) => (
          <div key={idx} className="flex justify-between items-center">
            <span className="text-slate-400">{detail.label}</span>
            <span className="text-slate-200 font-medium">{detail.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
