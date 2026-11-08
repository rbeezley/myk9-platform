/**
 * StatusTileGrid — tall, two-column entry-status tiles for phone taps (MYK9-1773).
 *
 * Presentation only: the caller owns which statuses show, what a tap does, and
 * any confirmation. The current status is marked selected (ring, tint, "Current"
 * tag, `aria-current` in a labelled group, like ClassStatusDialog) so a steward sees where the dog stands before changing it.
 * Two columns down to 320px; the tile text wraps instead of overflowing.
 */
import type React from 'react';
import { Check } from 'lucide-react';
import type { CheckInStatus } from '@myk9/core';
import { cn } from '@/lib/utils';
import { StatusIcon, getStatusDescriptor, getStatusSurfaceClasses } from '@/components/status';

export interface StatusTileGridProps {
  statuses: readonly CheckInStatus[];
  currentStatus?: CheckInStatus | undefined;
  onSelect: (status: CheckInStatus) => void;
  className?: string;
  /** Names the group for screen readers. */
  label?: string;
}

export const StatusTileGrid: React.FC<StatusTileGridProps> = ({
  statuses,
  currentStatus,
  onSelect,
  className,
  label = 'Status options',
}) => (
  <div role="group" aria-label={label} className={cn('grid grid-cols-2 gap-3', className)}>
    {statuses.map(status => {
      const descriptor = getStatusDescriptor('entry', status);
      const selected = status === currentStatus;
      return (
        <button
          key={status}
          type="button"
          aria-current={selected || undefined}
          onClick={() => onSelect(status)}
          className={cn(
            'flex min-h-20 min-w-0 flex-col items-center justify-center gap-1.5 rounded-lg border p-3',
            'text-center transition-colors hover:bg-muted/60',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
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
          {selected && (
            // Foreground text, accent only on the icon and ring: accent text on a tinted tile
            // falls below 4.5:1 in some themes (MYK9-1556, as in ClassStatusDialog).
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-foreground">
              <Check className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              Current
            </span>
          )}
        </button>
      );
    })}
  </div>
);
