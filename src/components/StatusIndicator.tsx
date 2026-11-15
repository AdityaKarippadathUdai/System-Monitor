import React from 'react';
import { HealthStatus } from '../types/system';
import { getStatusColorClass } from '../utils/formatters';

interface StatusIndicatorProps {
  status: HealthStatus;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  showPulse?: boolean;
  className?: string;
}

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({
  status,
  label,
  size = 'md',
  showPulse = true,
  className = '',
}) => {
  const colors = getStatusColorClass(status);

  const dotSize = size === 'sm' ? 'w-1.5 h-1.5' : size === 'lg' ? 'w-2.5 h-2.5' : 'w-2 h-2';
  const textSize = size === 'sm' ? 'text-[11px]' : size === 'lg' ? 'text-xs' : 'text-xs';

  const defaultLabels: Record<HealthStatus, string> = {
    healthy: 'Normal',
    moderate: 'Moderate',
    warning: 'High',
    critical: 'Critical',
  };

  const displayLabel = label || defaultLabels[status];

  return (
    <div
      id={`status-indicator-${status}`}
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border font-mono-num ${colors.bg} ${colors.border} ${colors.text} ${textSize} ${className}`}
    >
      <span className="relative flex items-center justify-center">
        {showPulse && status !== 'healthy' && (
          <span
            className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${colors.indicator}`}
          />
        )}
        <span className={`relative inline-flex rounded-full ${dotSize} ${colors.indicator}`} />
      </span>
      <span className="font-medium tracking-wide">{displayLabel}</span>
    </div>
  );
};
