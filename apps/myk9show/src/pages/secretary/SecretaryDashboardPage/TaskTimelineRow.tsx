import { cn } from '@/lib/utils';
import type { DatedTask, DateRange, UrgencyBucket } from './taskTimelineUtils';
import type { UpdateTaskInput } from './types';

interface TaskTimelineRowProps {
  datedTask: DatedTask;
  dateRange: DateRange;
  columnWidth: number;
  onToggleDone: (id: string) => void;
  onUpdate: (id: string, update: UpdateTaskInput) => void;
}

const urgencyPillClass: Record<UrgencyBucket, string> = {
  overdue: 'bg-error-red/80 text-white',
  today: 'bg-error-red/60 text-white',
  'this-week': 'bg-warning-orange/70 text-white',
  future: 'bg-primary/70 text-primary-foreground',
};

const urgencyLabel: Record<UrgencyBucket, string> = {
  overdue: 'Overdue',
  today: 'Due today',
  'this-week': 'Due this week',
  future: '',
};

export function TaskTimelineRow({
  datedTask,
  dateRange,
  columnWidth,
  onToggleDone,
}: TaskTimelineRowProps) {
  const { task, dueDate, urgency } = datedTask;
  const isDone = task.status === 'done';

  // Find which column index this due date falls on
  const dueDateMs = dueDate.getTime();
  const startMs = dateRange.start.getTime();
  const dayIndex = Math.round((dueDateMs - startMs) / 86400000);
  const clampedIndex = Math.max(0, Math.min(dayIndex, dateRange.days.length - 1));

  const pillLeft = clampedIndex * columnWidth;
  const pillWidth = Math.max(columnWidth, 24); // at least one column wide

  return (
    <div className="flex min-h-[44px] items-center border-b border-border/30 last:border-0">
      {/* Left: label */}
      <div className="flex w-48 shrink-0 items-center gap-2 pr-2">
        <input
          type="checkbox"
          checked={isDone}
          onChange={() => onToggleDone(task.id)}
          className="h-4 w-4 shrink-0 accent-primary"
          aria-label={`Mark "${task.title}" as ${isDone ? 'todo' : 'done'}`}
        />
        <span
          className={cn(
            'truncate text-xs',
            isDone ? 'text-muted-foreground line-through' : 'text-foreground'
          )}
          title={task.title}
        >
          {task.title}
        </span>
      </div>

      {/* Right: grid with pill */}
      <div className="relative flex flex-1 overflow-hidden">
        {/* Column guides */}
        {dateRange.days.map((day, i) => (
          <div
            key={day.toISOString()}
            style={{ minWidth: columnWidth, width: columnWidth }}
            className={cn(
              'shrink-0 self-stretch border-r border-border/30',
              i % 7 === 0 && 'bg-muted/20'
            )}
          />
        ))}

        {/* Due-date pill */}
        {!isDone && dayIndex >= 0 && dayIndex < dateRange.days.length && (
          <div
            className={cn(
              'absolute top-1/2 -translate-y-1/2 cursor-pointer rounded-full px-2 py-0.5 text-xs font-medium leading-tight',
              urgencyPillClass[urgency]
            )}
            style={{ left: pillLeft, width: pillWidth }}
            title={urgencyLabel[urgency] || task.title}
          >
            {urgencyLabel[urgency] || ''}
          </div>
        )}

        {/* Overdue pill that overflows left of range */}
        {!isDone && dayIndex < 0 && (
          <div
            className={cn(
              'absolute left-0 top-1/2 -translate-y-1/2 rounded-full px-2 py-0.5 text-xs font-medium leading-tight',
              urgencyPillClass.overdue
            )}
            style={{ width: pillWidth }}
            title="Overdue"
          >
            Overdue
          </div>
        )}
      </div>
    </div>
  );
}
