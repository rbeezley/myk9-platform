import React from 'react';
import { cn } from '@/lib/utils';
import { CheckInStatus, getCheckInStatusConfig, requiresAction } from '@/types/check-in-types';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';

interface CheckInStatusIndicatorProps {
  status: CheckInStatus;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  showTooltip?: boolean;
  className?: string | undefined;
  animated?: boolean;
}

const sizeClasses = {
  sm: {
    dot: 'h-2 w-2',
    container: 'text-xs',
    icon: 'text-[10px]',
    padding: 'px-2 py-0.5',
  },
  md: {
    dot: 'h-3 w-3',
    container: 'text-sm',
    icon: 'text-xs',
    padding: 'px-3 py-1',
  },
  lg: {
    dot: 'h-4 w-4',
    container: 'text-base',
    icon: 'text-sm',
    padding: 'px-4 py-1.5',
  },
};

export const CheckInStatusIndicator: React.FC<CheckInStatusIndicatorProps> = ({
  status,
  size = 'md',
  showLabel = false,
  showTooltip = true,
  className,
  animated = true,
}) => {
  const config = getCheckInStatusConfig(status);
  const sizes = sizeClasses[size];
  const shouldAnimate = animated && requiresAction(status);

  const indicator = (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-medium',
        showLabel && sizes.padding,
        showLabel && config.backgroundColor,
        showLabel && config.borderColor,
        showLabel && 'border',
        config.color,
        className
      )}
    >
      <div className="relative">
        <div
          className={cn(
            'rounded-full flex items-center justify-center',
            sizes.dot,
            config.backgroundColor,
            config.borderColor,
            'border',
            shouldAnimate && 'animate-pulse'
          )}
        >
          {config.icon && (
            <span className={cn(sizes.icon, 'font-bold leading-none')}>{config.icon}</span>
          )}
        </div>
        {/* Ripple effect for urgent statuses */}
        {shouldAnimate && (
          <div
            className={cn(
              'absolute inset-0 rounded-full',
              config.backgroundColor,
              'animate-ping opacity-75'
            )}
          />
        )}
      </div>
      {showLabel && <span className={sizes.container}>{config.label}</span>}
    </div>
  );

  if (!showTooltip) {
    return indicator;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{indicator}</TooltipTrigger>
        <TooltipContent>
          <div className="space-y-1">
            <p className="font-semibold">{config.label}</p>
            <p className="text-xs text-muted-foreground">{config.description}</p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

// Convenience component for inline status display
export const CheckInStatusBadge: React.FC<{
  status: CheckInStatus;
  className?: string;
}> = ({ status, className }) => {
  return (
    <CheckInStatusIndicator
      status={status}
      size="sm"
      showLabel={true}
      showTooltip={false}
      className={className}
    />
  );
};

// Component for displaying multiple statuses in a grid
export const CheckInStatusLegend: React.FC<{
  statuses?: CheckInStatus[];
  className?: string;
}> = ({
  statuses = ['no-status', 'checked-in', 'conflict', 'pulled', 'at-gate', 'come-to-gate'],
  className,
}) => {
  return (
    <div className={cn('grid grid-cols-2 md:grid-cols-3 gap-3', className)}>
      {statuses.map(status => {
        const config = getCheckInStatusConfig(status);
        return (
          <div key={status} className="flex items-center gap-2">
            <CheckInStatusIndicator
              status={status}
              size="sm"
              showTooltip={false}
              animated={false}
            />
            <span className="text-sm text-muted-foreground">{config.label}</span>
          </div>
        );
      })}
    </div>
  );
};

// Quick action component for common status updates
export const CheckInQuickActions: React.FC<{
  currentStatus: CheckInStatus;
  onUpdateStatus: (status: CheckInStatus) => void;
  className?: string;
}> = ({ currentStatus, onUpdateStatus, className }) => {
  const quickActions = [
    { from: 'no-status' as CheckInStatus, to: 'checked-in' as CheckInStatus, label: 'Check In' },
    {
      from: 'checked-in' as CheckInStatus,
      to: 'come-to-gate' as CheckInStatus,
      label: 'Call to Gate',
    },
    { from: 'come-to-gate' as CheckInStatus, to: 'at-gate' as CheckInStatus, label: 'At Gate' },
  ];

  const availableAction = quickActions.find(action => action.from === currentStatus);

  if (!availableAction) return null;

  return (
    <Button
      size="sm"
      onClick={() => onUpdateStatus(availableAction.to)}
      className={cn('bg-primary text-primary-foreground', className)}
    >
      <ArrowRight className="h-4 w-4 mr-1" />
      {availableAction.label}
    </Button>
  );
};
