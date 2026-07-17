import React from 'react';
import { cn } from '@/lib/utils';
import { CheckInStatus, getCheckInStatusMetadata, requiresAction } from '@/types/check-in-types';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';
import { StatusIcon, getStatusDescriptor } from '@/components/status';

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
    container: 'text-xs',
    padding: 'px-2 py-0.5',
    iconSize: 'sm' as const,
  },
  md: {
    container: 'text-sm',
    padding: 'px-3 py-1',
    iconSize: 'md' as const,
  },
  lg: {
    container: 'text-base',
    padding: 'px-4 py-1.5',
    iconSize: 'lg' as const,
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
  const metadata = getCheckInStatusMetadata(status);
  const descriptor = getStatusDescriptor('entry', status);
  const sizes = sizeClasses[size];
  const shouldAnimate = animated && requiresAction(status);

  const indicator = (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-medium',
        showLabel && sizes.padding,
        showLabel && 'bg-muted/40 border-border',
        showLabel && 'border',
        className
      )}
    >
      <div className={cn('relative inline-flex', shouldAnimate && 'animate-pulse')}>
        <StatusIcon
          family="entry"
          status={status}
          size={sizes.iconSize}
          decorative={showLabel}
        />
      </div>
      {showLabel && <span className={sizes.container}>{descriptor.label}</span>}
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
            <p className="font-semibold">{descriptor.label}</p>
            <p className="text-xs text-muted-foreground">{metadata.description}</p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
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
        const descriptor = getStatusDescriptor('entry', status);
        return (
          <div key={status} className="flex items-center gap-2">
            <CheckInStatusIndicator
              status={status}
              size="sm"
              showTooltip={false}
              animated={false}
            />
            <span className="text-sm text-muted-foreground">{descriptor.label}</span>
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
