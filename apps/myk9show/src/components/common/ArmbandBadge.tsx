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
        'inline-flex items-center justify-center size-9 rounded-lg bg-primary text-primary-foreground font-bold text-sm tabular-nums',
        className
      )}
    >
      {display}
    </span>
  );
}
