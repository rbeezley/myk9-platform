import { useState } from 'react';
import { isToday } from 'date-fns';
import { toast } from 'sonner';
import {
  useSecretaryTasks,
  useCreateTask,
  useUpdateTask,
  useDeleteTask,
} from '@/hooks/queries/useSecretaryTasks';
import { TaskRow } from './TaskRow';
import { TaskAddForm } from './TaskAddForm';
import { ViewToggle } from '@/components/common/ViewToggle';
import { Skeleton } from '@/components/ui/skeleton';
import { TaskTimelineView } from './TaskTimelineView';
import { useTaskViewPreference, TASK_VIEW_MODES } from './useTaskViewPreference';
import type { SecretaryTask } from './types';

// Reserve vertical space while the tasks query is in flight so deferred-load
// shifts don't push the rest of the page down. ~280px matches the rendered
// height of 3-4 task rows, which is the typical loaded state.
// INTENT: prevent CLS on /secretary/dashboard — see PR "perf(shows): reserve
// layout space for deferred panels (CLS)".
export const TASKS_TAB_RESERVED_MIN_HEIGHT_PX = 280;

interface TasksTabProps {
  clubId: string;
}

// Personal tasks only (show_id IS NULL). Per-show tasks are managed in
// each show's Tools sheet via TasksNotesCard — see D2 of plan-dashboard-refocus.md.
export function TasksTab({ clubId }: TasksTabProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [viewMode, setViewMode] = useTaskViewPreference();

  const { data: tasks = [], isLoading, isError, refetch } = useSecretaryTasks('general');
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();

  const now = new Date();
  const sevenDays = new Date(now.getTime() + 7 * 86400000);

  const sorted = [...tasks].sort((a, b) => {
    const rank = (t: (typeof tasks)[number]) => {
      if (t.status === 'done') return 4;
      if (!t.dueDate) return 3;
      const d = new Date(t.dueDate);
      if (isNaN(d.getTime())) return 3;
      if (d < now && !isToday(d)) return 0;
      if (isToday(d)) return 1;
      if (d <= sevenDays) return 2;
      return 3;
    };
    return rank(a) - rank(b);
  });

  const visible = showCompleted ? sorted : sorted.filter(t => t.status !== 'done');
  const hasCompletedTasks = sorted.some(t => t.status === 'done');

  function handleToggleDone(id: string) {
    const task = tasks.find((t: SecretaryTask) => t.id === id);
    if (!task) return;
    updateTask.mutate({ id, update: { status: task.status === 'done' ? 'todo' : 'done' } });
  }

  function handleUpdate(id: string, update: Parameters<typeof updateTask.mutate>[0]['update']) {
    updateTask.mutate({ id, update }, { onError: () => toast.error('Failed to update task.') });
  }

  function handleDelete(id: string) {
    deleteTask.mutate(id, { onError: () => toast.error('Failed to delete task.') });
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="ml-auto flex items-center gap-2">
          <ViewToggle modes={TASK_VIEW_MODES} active={viewMode} onChange={setViewMode} />
          {clubId && (
            <button
              onClick={() => setShowAddForm(true)}
              className="rounded border border-border bg-background px-3 py-1 text-xs text-foreground hover:bg-muted"
            >
              + Add Task
            </button>
          )}
        </div>
      </div>

      {showAddForm && (
        <div className="mb-3">
          <TaskAddForm
            clubId={clubId}
            lockedShowId={null}
            onAdd={input => {
              createTask.mutate(input, {
                onSuccess: () => setShowAddForm(false),
                onError: () => toast.error('Failed to add task. Please try again.'),
              });
            }}
            onCancel={() => setShowAddForm(false)}
          />
        </div>
      )}

      {isError ? (
        <div className="flex items-center justify-between rounded border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm">
          <span className="text-destructive">Couldn't load your tasks.</span>
          <button
            onClick={() => refetch()}
            className="font-medium text-destructive underline hover:opacity-80"
          >
            Retry
          </button>
        </div>
      ) : isLoading ? (
        <div
          data-testid="tasks-tab-skeleton"
          className="flex flex-col gap-2"
          style={{ minHeight: `${TASKS_TAB_RESERVED_MIN_HEIGHT_PX}px` }}
          aria-busy="true"
          aria-label="Loading tasks"
        >
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : viewMode === 'timeline' ? (
        <TaskTimelineView
          tasks={sorted}
          shows={[]}
          showIdFilter="general"
          showCompleted={showCompleted}
          onToggleDone={handleToggleDone}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
        />
      ) : (
        <div className="flex flex-col gap-2">
          {visible.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No personal tasks. Per-show tasks live in each show's Tools sheet.
            </p>
          ) : (
            visible.map(task => (
              <TaskRow
                key={task.id}
                task={task}
                showName=""
                hideShowChip
                lockShowEdit
                onToggleDone={handleToggleDone}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
              />
            ))
          )}
        </div>
      )}

      {hasCompletedTasks && (
        <button
          onClick={() => setShowCompleted(v => !v)}
          className="mt-3 text-xs text-muted-foreground hover:text-foreground"
        >
          {showCompleted ? 'Hide completed' : 'Show completed'}
        </button>
      )}
    </>
  );
}
