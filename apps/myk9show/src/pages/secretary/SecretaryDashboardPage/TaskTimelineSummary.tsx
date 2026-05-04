import type { TimelineSummary } from './taskTimelineUtils';

interface TaskTimelineSummaryProps {
  summary: TimelineSummary;
}

export function TaskTimelineSummary({ summary }: TaskTimelineSummaryProps) {
  const { overdue, dueThisWeek, unscheduled } = summary;
  if (overdue === 0 && dueThisWeek === 0 && unscheduled === 0) return null;

  return (
    <div className="mb-3 flex flex-wrap gap-3 text-xs">
      {overdue > 0 && (
        <span className="flex items-center gap-1 font-medium text-error-red">
          <span className="inline-block h-2 w-2 rounded-full bg-error-red" />
          {overdue} overdue
        </span>
      )}
      {dueThisWeek > 0 && (
        <span className="flex items-center gap-1 font-medium text-warning-orange">
          <span className="inline-block h-2 w-2 rounded-full bg-warning-orange" />
          {dueThisWeek} due this week
        </span>
      )}
      {unscheduled > 0 && (
        <span className="flex items-center gap-1 text-muted-foreground">
          <span className="inline-block h-2 w-2 rounded-full bg-muted-foreground/50" />
          {unscheduled} unscheduled
        </span>
      )}
    </div>
  );
}
