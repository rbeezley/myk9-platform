import type { SecretaryTask, UpdateTaskInput } from './types';
import { TaskTimelineHeader } from './TaskTimelineHeader';
import { TaskTimelineRow } from './TaskTimelineRow';
import { calcDateRange, groupByShow, calcSummary, splitDatedUndated } from './taskTimelineUtils';
import { TaskTimelineSummary } from './TaskTimelineSummary';
import { cn } from '@/lib/utils';

interface Show {
  id: string;
  name: string;
}

interface TaskTimelineViewProps {
  tasks: SecretaryTask[];
  shows: Show[];
  showIdFilter: string;
  showCompleted: boolean;
  onToggleDone: (id: string) => void;
  onUpdate: (id: string, update: UpdateTaskInput) => void;
}

const COLUMN_WIDTH = 40; // px per day column

export function TaskTimelineView({
  tasks,
  shows,
  showIdFilter,
  showCompleted,
  onToggleDone,
  onUpdate,
}: TaskTimelineViewProps) {
  const showNameMap = Object.fromEntries(shows.map(s => [s.id, s.name]));

  const visibleTasks = showCompleted ? tasks : tasks.filter(t => t.status !== 'done');

  const { dated: allDated } = splitDatedUndated(visibleTasks);
  const dateRange = calcDateRange(allDated);

  const groups = groupByShow(visibleTasks, showNameMap, showIdFilter);
  const summary = calcSummary(visibleTasks.filter(t => t.status !== 'done'));

  const totalDated = groups.reduce((acc, g) => acc + g.datedTasks.length, 0);
  const totalUndated = groups.reduce((acc, g) => acc + g.undatedTasks.length, 0);

  if (totalDated === 0 && totalUndated === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        {showIdFilter === 'all' ? 'No open tasks.' : 'No tasks for this show.'}
      </p>
    );
  }

  return (
    <div>
      <TaskTimelineSummary summary={summary} />

      <div className="overflow-x-auto rounded-lg border border-border">
        <div style={{ minWidth: 192 + dateRange.days.length * COLUMN_WIDTH }}>
          <TaskTimelineHeader days={dateRange.days} columnWidth={COLUMN_WIDTH} />

          {groups.map(group => (
            <div key={group.showId ?? 'general'}>
              {/* Group header — only shown when there are multiple groups */}
              {groups.length > 1 && (
                <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-3 py-1">
                  <span className="text-xs font-semibold text-muted-foreground">
                    {group.showName}
                  </span>
                </div>
              )}

              {/* Dated task rows */}
              {group.datedTasks.map(datedTask => (
                <TaskTimelineRow
                  key={datedTask.task.id}
                  datedTask={datedTask}
                  dateRange={dateRange}
                  columnWidth={COLUMN_WIDTH}
                  onToggleDone={onToggleDone}
                  onUpdate={onUpdate}
                />
              ))}

              {/* Undated tasks section */}
              {group.undatedTasks.length > 0 && (
                <div>
                  <div className="flex border-b border-border/30 bg-muted/10">
                    <div className="w-48 shrink-0 px-3 py-1 text-xs text-muted-foreground italic">
                      No due date
                    </div>
                    <div className="flex-1" />
                  </div>
                  {group.undatedTasks.map(task => (
                    <div
                      key={task.id}
                      className="flex min-h-[44px] items-center border-b border-border/30 last:border-0"
                    >
                      <div className="flex w-48 shrink-0 items-center gap-2 pr-2">
                        <input
                          type="checkbox"
                          checked={task.status === 'done'}
                          onChange={() => onToggleDone(task.id)}
                          className="h-4 w-4 shrink-0 accent-primary"
                          aria-label={`Mark "${task.title}" as ${task.status === 'done' ? 'todo' : 'done'}`}
                        />
                        <span
                          className={cn(
                            'truncate text-xs',
                            task.status === 'done'
                              ? 'text-muted-foreground line-through'
                              : 'text-foreground'
                          )}
                          title={task.title}
                        >
                          {task.title}
                        </span>
                      </div>
                      <div className="flex-1" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
