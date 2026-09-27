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
import { ListFilterBar, ListViewTabs } from '@/components/list-toolkit';
import type { ListView } from '@/components/list-toolkit';
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
  const [search, setSearch] = useState('');
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

  const searched = search.trim()
    ? sorted.filter(t => t.title.toLowerCase().includes(search.trim().toLowerCase()))
    : sorted;

  const visible = showCompleted ? searched : searched.filter(t => t.status !== 'done');

  const views: ListView[] = [
    { id: 'open', label: 'Open', count: searched.filter(t => t.status !== 'done').length },
    { id: 'all', label: 'All', count: searched.length },
  ];

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
      <div className="mb-3 flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <ListViewTabs
            label="Task views"
            views={views}
            activeId={showCompleted ? 'all' : 'open'}
            onSelect={id => setShowCompleted(id === 'all')}
          />
          <div className="ml-auto flex items-center gap-2">
            <ViewToggle modes={TASK_VIEW_MODES} active={viewMode} onChange={setViewMode} />
            {clubId && (
              <button
                onClick={() => setShowAddForm(true)}
                className="min-h-11 rounded border border-border bg-background px-3 py-1 text-xs text-foreground hover:bg-muted"
              >
                + Add Task
              </button>
            )}
          </div>
        </div>
        <ListFilterBar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search tasks..."
          fields={[]}
        />
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
          // role="status" permits `aria-label` here — a bare <div> is `generic`,
          // which forbids naming attrs (axe `aria-prohibited-attr`) — and is the
          // right semantics for a loading region (implicit aria-live="polite").
          role="status"
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
          tasks={searched}
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
              {tasks.length === 0
                ? "No personal tasks. Per-show tasks live in each show's Tools sheet."
                : 'No tasks match your search.'}
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
    </>
  );
}
