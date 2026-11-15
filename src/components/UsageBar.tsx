import React from 'react';
import { getResourceStatus } from '../utils/formatters';

interface UsageBarProps {
  value: number; // 0 to 100
  secondaryValue?: number; // e.g., cached or swap portion
  height?: 'xs' | 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  colorScheme?: 'auto' | 'blue' | 'green' | 'cyan' | 'purple';
  animate?: boolean;
  className?: string;
}

export const UsageBar: React.FC<UsageBarProps> = ({
  value,
  secondaryValue = 0,
  height = 'sm',
  showLabel = false,
  colorScheme = 'auto',
  animate = true,
  className = '',
}) => {
  const clampedValue = Math.min(100, Math.max(0, value));
  const clampedSecondary = Math.min(100 - clampedValue, Math.max(0, secondaryValue));

  const heightClasses = {
    xs: 'h-1',
    sm: 'h-1.5',
    md: 'h-2.5',
    lg: 'h-4',
  };

  const getBarColor = () => {
    if (colorScheme === 'blue') return 'bg-blue-500';
    if (colorScheme === 'green') return 'bg-emerald-500';
    if (colorScheme === 'cyan') return 'bg-cyan-500';
    if (colorScheme === 'purple') return 'bg-purple-500';

    // Auto threshold
    const status = getResourceStatus(clampedValue);
    switch (status) {
      case 'critical':
        return 'bg-red-500';
      case 'warning':
        return 'bg-amber-500';
      case 'moderate':
        return 'bg-cyan-500';
      case 'healthy':
      default:
        return 'bg-emerald-500';
    }
  };

  return (
    <div className={`w-full ${className}`}>
      {showLabel && (
        <div className="flex justify-between items-center text-xs mb-1 font-mono-num">
          <span className="text-slate-400">Usage</span>
          <span className="text-slate-200 font-semibold">{clampedValue.toFixed(1)}%</span>
        </div>
      )}
      <div className={`w-full bg-[#131c26] rounded-sm overflow-hidden flex ${heightClasses[height]}`}>
        <div
          className={`${getBarColor()} ${
            animate ? 'transition-all duration-500 ease-out' : ''
          }`}
          style={{ width: `${clampedValue}%` }}
        />
        {clampedSecondary > 0 && (
          <div
            className={`bg-slate-600/60 ${
              animate ? 'transition-all duration-500 ease-out' : ''
            }`}
            style={{ width: `${clampedSecondary}%` }}
          />
        )}
      </div>
    </div>
  );
};
