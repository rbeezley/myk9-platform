import { cn } from '@/lib/utils';

/**
 * Scored over total for one class, as a bar. Shared by the Ringside class card and the Show Desk
 * schedule card, so the two read alike (MYK9-2143). Draw it only when the count is known and
 * there is something to score.
 */
export function ClassProgressBar({
  label,
  done,
  total,
  className,
}: {
  /** What the bar measures, for screen readers ("Container Novice scoring progress"). */
  label: string;
  done: number;
  total: number;
  className?: string;
}) {
  const shown = Math.min(done, total);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={shown}
      aria-valuetext={`${shown} of ${total} scored`}
      className={cn('h-2 min-w-12 flex-1 overflow-hidden rounded-full bg-muted', className)}
    >
      <div
        className="h-full rounded-full bg-primary transition-[width]"
        style={{ width: `${total > 0 ? (shown / total) * 100 : 0}%` }}
      />
    </div>
  );
}
