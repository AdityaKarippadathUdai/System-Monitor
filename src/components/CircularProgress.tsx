import React from 'react';
import { getResourceStatus, getStatusColorClass } from '../utils/formatters';

interface CircularProgressProps {
  value: number; // 0-100
  secondaryValue?: number; // 0-100
  size?: number;
  strokeWidth?: number;
  label?: string;
  subLabel?: string;
  colorScheme?: 'auto' | 'blue' | 'green' | 'cyan';
  className?: string;
}

export const CircularProgress: React.FC<CircularProgressProps> = ({
  value,
  secondaryValue = 0,
  size = 140,
  strokeWidth = 10,
  label,
  subLabel,
  colorScheme = 'auto',
  className = '',
}) => {
  const clampedValue = Math.min(100, Math.max(0, value));
  const clampedSecondary = Math.min(100 - clampedValue, Math.max(0, secondaryValue));

  const center = size / 2;
  const radius = center - strokeWidth;
  const circumference = 2 * Math.PI * radius;

  const primaryOffset = circumference - (clampedValue / 100) * circumference;
  const secondaryOffset =
    circumference - ((clampedValue + clampedSecondary) / 100) * circumference;

  const status = getResourceStatus(clampedValue);
  const statusColors = getStatusColorClass(status);

  const getStrokeColor = () => {
    if (colorScheme === 'blue') return '#3B82F6';
    if (colorScheme === 'green') return '#10B981';
    if (colorScheme === 'cyan') return '#06B6D4';

    switch (status) {
      case 'critical':
        return '#EF4444';
      case 'warning':
        return '#F59E0B';
      case 'moderate':
        return '#06B6D4';
      case 'healthy':
      default:
        return '#10B981';
    }
  };

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`}>
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background track */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="transparent"
          stroke="#131c26"
          strokeWidth={strokeWidth}
        />

        {/* Secondary metric (e.g. Cached / Swap) */}
        {clampedSecondary > 0 && (
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="transparent"
            stroke="#334155"
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={secondaryOffset}
            strokeLinecap="round"
            className="transition-all duration-500 ease-out opacity-60"
          />
        )}

        {/* Primary metric bar */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="transparent"
          stroke={getStrokeColor()}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={primaryOffset}
          strokeLinecap="round"
          className="transition-all duration-500 ease-out"
        />
      </svg>

      {/* Centered label */}
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center select-none font-mono-num">
        <span className="text-2xl font-bold text-slate-100 tracking-tight">
          {clampedValue.toFixed(0)}
          <span className="text-sm font-normal text-slate-400 ml-0.5">%</span>
        </span>
        {label && <span className="text-[11px] font-medium text-slate-400 mt-0.5">{label}</span>}
        {subLabel && <span className="text-[10px] text-slate-500">{subLabel}</span>}
      </div>
    </div>
  );
};
