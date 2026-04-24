import { cn } from '@/lib/utils';

interface ShowDateBlockProps {
  /** ISO date string for the first day of the show (e.g. "2026-04-26"). */
  startDate: string;
  /** ISO date string for the last day (omit for single-day shows). */
  endDate?: string;
  className?: string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Calendar-style date block used as the cover in show hero cards. */
export function ShowDateBlock({ startDate, endDate, className }: ShowDateBlockProps) {
  const start = new Date(startDate.split('T')[0] + 'T00:00:00');
  const end = endDate ? new Date(endDate.split('T')[0] + 'T00:00:00') : start;

  const month = MONTHS[start.getMonth()];
  const startDay = start.getDate();
  const endDay = end.getDate();
  const sameDay = startDay === endDay && start.getMonth() === end.getMonth();

  const dayLabel = sameDay ? String(startDay) : `${startDay}–${endDay}`;

  return (
    <div
      className={cn(
        'flex flex-col rounded-xl overflow-hidden border border-border/50 shadow-sm w-full aspect-square',
        className
      )}
    >
      {/* Month bar — picks up [data-accent] primary color */}
      <div className="bg-primary flex items-center justify-center py-2.5">
        <span className="text-primary-foreground text-xs font-bold uppercase tracking-widest">
          {month}
        </span>
      </div>

      {/* Day number */}
      <div className="flex-1 flex items-center justify-center bg-card">
        <span
          className="font-bold text-foreground leading-none"
          style={{ fontSize: 'clamp(2rem, 6vw, 3.5rem)' }}
        >
          {dayLabel}
        </span>
      </div>
    </div>
  );
}
