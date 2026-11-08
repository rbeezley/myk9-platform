/**
 * StatusTileGrid — tall, two-column entry-status tiles for phone taps (MYK9-1773).
 *
 * Presentation only: the caller owns which statuses show, what a tap does, and
 * any confirmation. The current status is marked selected (ring, tint, "Current"
 * tag, `aria-pressed`) so a steward sees where the dog stands before changing it.
 * Two columns down to 320px; the tile text wraps instead of overflowing.
 */
import type React from 'react';
import type { CheckInStatus } from '@myk9/core';
import { cn } from '@/lib/utils';
import { StatusIcon, getStatusDescriptor, getStatusSurfaceClasses } from '@/components/status';

export interface StatusTileGridProps {
  statuses: readonly CheckInStatus[];
  currentStatus?: CheckInStatus | undefined;
  onSelect: (status: CheckInStatus) => void;
  className?: string;
}

export const StatusTileGrid: React.FC<StatusTileGridProps> = ({
  statuses,
  currentStatus,
  onSelect,
  className,
}) => (
  <div className={cn('grid grid-cols-2 gap-3', className)}>
    {statuses.map(status => {
      const descriptor = getStatusDescriptor('entry', status);
      const selected = status === currentStatus;
      return (
        <button
          key={status}
          type="button"
          aria-pressed={selected}
          onClick={() => onSelect(status)}
          className={cn(
            'flex min-h-20 min-w-0 flex-col items-center justify-center gap-1.5 rounded-lg border p-3',
            'text-center transition-colors hover:bg-muted/60',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            selected ? 'border-primary bg-primary/5 ring-2 ring-primary' : 'border-border bg-card'
          )}
        >
          <span
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
              getStatusSurfaceClasses('entry', status)
            )}
          >
            <StatusIcon family="entry" status={status} size="lg" decorative />
          </span>
          <span className="max-w-full break-words text-sm font-semibold leading-tight text-foreground">
            {descriptor.label}
          </span>
          {selected && <span className="text-xs font-medium text-primary">Current</span>}
        </button>
      );
    })}
  </div>
);
