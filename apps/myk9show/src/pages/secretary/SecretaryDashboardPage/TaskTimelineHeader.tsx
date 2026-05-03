import { format, isToday } from 'date-fns';
import { cn } from '@/lib/utils';

interface TaskTimelineHeaderProps {
  days: Date[];
  columnWidth: number;
}

export function TaskTimelineHeader({ days, columnWidth }: TaskTimelineHeaderProps) {
  return (
    <div className="flex border-b border-border">
      {/* Label column spacer */}
      <div className="w-48 shrink-0" />
      {/* Day columns */}
      <div className="flex flex-1 overflow-hidden">
        {days.map(day => (
          <div
            key={day.toISOString()}
            style={{ minWidth: columnWidth, width: columnWidth }}
            className={cn(
              'shrink-0 border-r border-border/50 py-1 text-center text-xs text-muted-foreground',
              isToday(day) && 'bg-primary/5 font-semibold text-primary'
            )}
          >
            <div>{format(day, 'EEE')}</div>
            <div>{format(day, 'd')}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
