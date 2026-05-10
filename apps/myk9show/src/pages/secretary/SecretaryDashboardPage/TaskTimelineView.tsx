import type { SecretaryTask, UpdateTaskInput } from './types';
import { TaskTimelineHeader } from './TaskTimelineHeader';
import { TaskTimelineRow } from './TaskTimelineRow';
import { TaskTimelineTaskCell } from './TaskTimelineTaskCell';
import { calcDateRange, groupByShow, calcSummary, splitDatedUndated } from './taskTimelineUtils';
import { TaskTimelineSummary } from './TaskTimelineSummary';

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
  onDelete: (id: string) => void;
}

const COLUMN_WIDTH = 40; // px per day column
const LABEL_WIDTH = 256;

export function TaskTimelineView({
  tasks,
  shows,
  showIdFilter,
  showCompleted,
  onToggleDone,
  onUpdate,
  onDelete,
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
        <div style={{ minWidth: LABEL_WIDTH + dateRange.days.length * COLUMN_WIDTH }}>
          <TaskTimelineHeader
            days={dateRange.days}
            columnWidth={COLUMN_WIDTH}
            labelWidth={LABEL_WIDTH}
          />

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
                  labelWidth={LABEL_WIDTH}
                  shows={shows}
                  onToggleDone={onToggleDone}
                  onUpdate={onUpdate}
                  onDelete={onDelete}
                />
              ))}

              {/* Undated tasks section */}
              {group.undatedTasks.length > 0 && (
                <div>
                  <div className="flex border-b border-border/30 bg-muted/10">
                    <div
                      className="shrink-0 px-3 py-1 text-xs text-muted-foreground italic"
                      style={{ width: LABEL_WIDTH }}
                    >
                      No due date
                    </div>
                    <div className="flex-1" />
                  </div>
                  {group.undatedTasks.map(task => (
                    <div
                      key={task.id}
                      className="flex min-h-[44px] items-center border-b border-border/30 last:border-0"
                    >
                      <TaskTimelineTaskCell
                        task={task}
                        shows={shows}
                        labelWidth={LABEL_WIDTH}
                        onToggleDone={onToggleDone}
                        onUpdate={onUpdate}
                        onDelete={onDelete}
                      />
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
