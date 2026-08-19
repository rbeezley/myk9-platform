import { cn } from '@/lib/utils';
import { formatArmbandDisplay, UNASSIGNED_ARMBAND_DISPLAY } from '@/utils/armbandUtils';

interface ArmbandBadgeProps {
  armband: string | number | null | undefined;
  className?: string;
}

export function ArmbandBadge({ armband, className }: ArmbandBadgeProps) {
  const display = formatArmbandDisplay(armband);

  if (display === UNASSIGNED_ARMBAND_DISPLAY) {
    return <span className="text-muted-foreground">{UNASSIGNED_ARMBAND_DISPLAY}</span>;
  }

  return (
    <span
      className={cn(
        // Fixed HEIGHT, growing width. This was `size-9` — a fixed square with
        // no horizontal padding — so a four-digit armband rendered edge to edge
        // and lost its first and last digit to the corner radius. Measured on
        // the live page: "100" sat with 3px/2px of side padding inside a 32px
        // box, "2009" with 0px/0px. Four digits are routine at a large show,
        // and the armband is the number an exhibitor is asked for all day.
        // Callers resize with height-only classes (`h-8 min-w-8`); a `size-*`
        // or `w-*` override reintroduces the clipping and is caught by test.
        'inline-flex items-center justify-center h-9 min-w-9 px-1.5 rounded-lg bg-primary text-primary-foreground font-bold text-sm tabular-nums',
        className
      )}
    >
      {display}
    </span>
  );
}
