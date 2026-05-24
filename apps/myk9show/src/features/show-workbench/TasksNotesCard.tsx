import { useState } from 'react';
import { ClipboardList, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useSecretaryTasks,
  useCreateTask,
  useUpdateTask,
  useDeleteTask,
} from '@/hooks/queries/useSecretaryTasks';
import { TaskRow } from '@/pages/secretary/SecretaryDashboardPage/TaskRow';
import { TaskAddForm } from '@/pages/secretary/SecretaryDashboardPage/TaskAddForm';
import type {
  SecretaryTask,
  UpdateTaskInput,
} from '@/pages/secretary/SecretaryDashboardPage/types';

interface TasksNotesCardProps {
  showId: string;
  clubId: string;
}

// INTENT: Show Desk Tools sheet's per-show task manager (D2 of the dashboard
// refocus). Owns the full create/edit/delete flow for tasks scoped to this
// show — previously this card just showed a count and bounced to the
// dashboard with `?showId=`, but D2 removes that round-trip and makes this
// the sole home for per-show task management.
export function TasksNotesCard({ showId, clubId }: TasksNotesCardProps) {
  const { data: tasks = [], isLoading, isError, refetch } = useSecretaryTasks(showId);
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();

  const [showAddForm, setShowAddForm] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);

  const sorted = [...tasks].sort((a: SecretaryTask, b: SecretaryTask) => {
    if (a.status !== b.status) return a.status === 'todo' ? -1 : 1;
    const ad = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
    const bd = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
    return ad - bd;
  });
  const visible = showCompleted
    ? sorted
    : sorted.filter((t: SecretaryTask) => t.status !== 'done');
  const openCount = tasks.filter((t: SecretaryTask) => t.status === 'todo').length;
  const hasCompleted = sorted.some((t: SecretaryTask) => t.status === 'done');

  function handleToggleDone(id: string) {
    const task = tasks.find((t: SecretaryTask) => t.id === id);
    if (!task) return;
    updateTask.mutate({ id, update: { status: task.status === 'done' ? 'todo' : 'done' } });
  }

  function handleUpdate(id: string, update: UpdateTaskInput) {
    updateTask.mutate({ id, update }, { onError: () => toast.error('Failed to update task.') });
  }

  function handleDelete(id: string) {
    deleteTask.mutate(id, { onError: () => toast.error('Failed to delete task.') });
  }

  return (
    <section className="rounded-md border bg-card p-4" aria-labelledby="tasks-notes-card-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 id="tasks-notes-card-title" className="text-base font-semibold">
            Tasks &amp; Notes
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Reminders and follow-ups for this show. Personal tasks stay on the dashboard.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {openCount > 0 ? (
            <Badge variant="secondary" data-testid="tasks-notes-open-count">
              {openCount} open
            </Badge>
          ) : (
            <Badge variant="outline" data-testid="tasks-notes-open-count">
              None open
            </Badge>
          )}
          <ClipboardList className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => setShowAddForm(v => !v)}
          aria-expanded={showAddForm}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          {showAddForm ? 'Close' : 'Add task'}
        </Button>
      </div>

      {showAddForm && (
        <div className="mt-3">
          <TaskAddForm
            clubId={clubId}
            lockedShowId={showId}
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
        <div className="mt-3 flex items-center justify-between rounded border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs">
          <span className="text-destructive">Couldn't load tasks for this show.</span>
          <button
            onClick={() => refetch()}
            className="font-medium text-destructive underline hover:opacity-80"
          >
            Retry
          </button>
        </div>
      ) : isLoading ? (
        <div className="mt-3 flex flex-col gap-2" aria-busy="true" aria-label="Loading tasks">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          {visible.length === 0 ? (
            <p className="py-3 text-center text-xs text-muted-foreground">
              No tasks for this show yet.
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

      {hasCompleted && (
        <button
          onClick={() => setShowCompleted(v => !v)}
          className="mt-3 text-xs text-muted-foreground hover:text-foreground"
        >
          {showCompleted ? 'Hide completed' : 'Show completed'}
        </button>
      )}
    </section>
  );
}
