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
import { FilterChips } from './FilterChips';
import { ViewToggle } from '@/components/common/ViewToggle';
import { TaskTimelineView } from './TaskTimelineView';
import { useTaskViewPreference, TASK_VIEW_MODES } from './useTaskViewPreference';
import type { SecretaryTask } from './types';

interface Show {
  id: string;
  name: string;
}

interface TasksTabProps {
  shows: Show[];
  clubId: string;
}

type Filter = 'all' | 'general' | string;

export function TasksTab({ shows, clubId }: TasksTabProps) {
  const [filter, setFilter] = useState<Filter>('all');
  const [showAddForm, setShowAddForm] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [viewMode, setViewMode] = useTaskViewPreference();

  const { data: tasks = [], isLoading } = useSecretaryTasks(filter === 'all' ? undefined : filter);
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();

  const showNameMap = Object.fromEntries(shows.map(s => [s.id, s.name]));

  const filterOptions = ['all', ...shows.map(s => s.id), 'general'].map(v => ({
    value: v,
    label: v === 'all' ? 'All Shows' : v === 'general' ? 'General' : (showNameMap[v] ?? v),
  }));

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
        <FilterChips options={filterOptions} active={filter} onChange={setFilter} />
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
            shows={shows}
            clubId={clubId}
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

      {isLoading ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
      ) : viewMode === 'timeline' ? (
        <TaskTimelineView
          tasks={sorted}
          shows={shows}
          showIdFilter={filter}
          showCompleted={showCompleted}
          onToggleDone={handleToggleDone}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
        />
      ) : (
        <div className="flex flex-col gap-2">
          {visible.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {filter === 'all' ? 'No open tasks.' : 'No tasks for this show.'}
            </p>
          ) : (
            visible.map(task => (
              <TaskRow
                key={task.id}
                task={task}
                showName={task.showId ? (showNameMap[task.showId] ?? task.showId) : 'General'}
                shows={shows}
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
