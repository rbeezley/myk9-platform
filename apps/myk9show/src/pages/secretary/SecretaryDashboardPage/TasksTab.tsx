import { useState } from 'react';
import { toast } from 'sonner';
import { useSecretaryTasks, useCreateTask, useUpdateTask } from '@/hooks/queries/useSecretaryTasks';
import { TaskRow } from './TaskRow';
import { TaskAddForm } from './TaskAddForm';

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

  const { data: tasks = [] } = useSecretaryTasks(filter === 'all' ? undefined : filter);
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();

  const showNameMap = Object.fromEntries(shows.map(s => [s.id, s.name]));

  const sorted = [...tasks].sort((a, b) => {
    const rank = (t: (typeof tasks)[number]) => {
      if (t.status === 'done') return 4;
      if (!t.dueDate) return 3;
      const d = new Date(t.dueDate);
      const now = new Date();
      if (d <= now) return 0;
      return 1;
    };
    return rank(a) - rank(b);
  });

  const visible = showCompleted ? sorted : sorted.filter(t => t.status !== 'done');

  const filterOptions: Filter[] = ['all', ...shows.map(s => s.id), 'general'];

  return (
    <div className="p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-500">Filter:</span>
        {filterOptions.map(f => {
          const label =
            f === 'all' ? 'All Shows' : f === 'general' ? 'General' : (showNameMap[f] ?? f);
          return (
            <button
              key={f}
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-1 text-xs transition-colors ${
                filter === f
                  ? 'bg-blue-700 text-blue-200'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              {label}
            </button>
          );
        })}
        <button
          onClick={() => setShowAddForm(true)}
          className="ml-auto rounded bg-slate-700 px-3 py-1 text-xs text-slate-300 hover:bg-slate-600"
        >
          + Add Task
        </button>
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

      <div className="flex flex-col gap-2">
        {visible.map(task => (
          <TaskRow
            key={task.id}
            task={task}
            showName={task.showId ? (showNameMap[task.showId] ?? task.showId) : 'General'}
            onToggleDone={id =>
              updateTask.mutate({
                id,
                update: { status: task.status === 'done' ? 'todo' : 'done' },
              })
            }
            onDelete={() => {
              /* handled elsewhere */
            }}
          />
        ))}
        {visible.length === 0 && (
          <p className="py-6 text-center text-sm text-slate-500">
            {filter === 'all' ? 'No open tasks.' : 'No tasks for this show.'}
          </p>
        )}
      </div>

      {tasks.some((t: (typeof tasks)[number]) => t.status === 'done') && (
        <button
          onClick={() => setShowCompleted(v => !v)}
          className="mt-3 text-xs text-slate-500 hover:text-slate-300"
        >
          {showCompleted ? 'Hide completed' : 'Show completed'}
        </button>
      )}
    </div>
  );
}
