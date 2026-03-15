import { cn } from '@/lib/utils';

interface DogsAheadBadgeProps {
  dogsAhead: number;
  result?: 'Q' | 'NQ' | string;
  staleMinutes?: number;
  className?: string;
}

export function DogsAheadBadge({
  dogsAhead,
  result,
  staleMinutes,
  className,
}: DogsAheadBadgeProps) {
  let text: string;
  let style: string;

  if (dogsAhead < 0 && result) {
    text = result;
    style = result === 'Q' ? 'bg-green-500/10 text-green-600' : 'bg-muted text-muted-foreground';
  } else if (dogsAhead === 0) {
    text = 'In Ring';
    style = 'bg-primary/10 text-primary animate-pulse';
  } else if (dogsAhead === 1) {
    text = "You're next!";
    style = 'bg-orange-500/10 text-orange-600';
  } else {
    text = `${dogsAhead} dogs ahead`;
    style = 'bg-muted text-muted-foreground';
  }

  return (
    <div className={cn('flex flex-col items-end gap-0.5', className)}>
      <span className={cn('px-3 py-1 rounded-lg text-sm font-medium', style)}>{text}</span>
      {staleMinutes !== undefined && staleMinutes > 0 && (
        <span className="text-xs text-muted-foreground/60">Updated {staleMinutes}m ago</span>
      )}
    </div>
  );
}
