import { CLASS_STATUS } from '@myk9/core';
import type { ClassStatusValue } from '@myk9/core';
import { cn } from '@/lib/utils';

// Neutral states (scheduled/upcoming/cancelled) use the semantic
// --muted-foreground token, which themes itself in light and dark; only the
// active states carry status hue (warning = in progress, success = completed).
const STATUS_DOT_COLORS: Record<ClassStatusValue, string> = {
  [CLASS_STATUS.SCHEDULED]: 'bg-muted-foreground',
  [CLASS_STATUS.UPCOMING]: 'bg-muted-foreground',
  [CLASS_STATUS.IN_PROGRESS]: 'bg-warning',
  [CLASS_STATUS.COMPLETED]: 'bg-success',
  [CLASS_STATUS.CANCELLED]: 'bg-muted-foreground',
};

interface StatusDotProps {
  status: ClassStatusValue;
  className?: string;
}

export function StatusDot({ status, className }: StatusDotProps) {
  return (
    <div
      className={cn('h-2.5 w-2.5 flex-shrink-0 rounded-full', STATUS_DOT_COLORS[status], className)}
      aria-label={`Status: ${status}`}
    />
  );
}
