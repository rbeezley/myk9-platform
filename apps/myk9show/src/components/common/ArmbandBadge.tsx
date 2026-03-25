import { cn } from '@/lib/utils';

interface ArmbandBadgeProps {
  armband: string | number | null | undefined;
  className?: string;
}

export function ArmbandBadge({ armband, className }: ArmbandBadgeProps) {
  if (!armband) {
    return <span className="text-muted-foreground">--</span>;
  }

  return (
    <span
      className={cn(
        'inline-flex items-center justify-center size-9 rounded-lg bg-primary text-primary-foreground font-bold text-sm tabular-nums',
        className
      )}
    >
      {armband}
    </span>
  );
}
