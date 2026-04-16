import { format, isPast, isToday } from 'date-fns';
import type { SecretaryTask } from './types';

interface TaskRowProps {
  task: SecretaryTask;
  showName: string;
  onToggleDone: (id: string) => void;
  onDelete: (id: string) => void;
}

function borderColor(task: SecretaryTask): string {
  if (task.status === 'done') return 'border-l-slate-600';
  if (!task.dueDate) return 'border-l-slate-600';
  const date = new Date(task.dueDate);
  if (isPast(date) || isToday(date)) return 'border-l-red-500';
  const sevenDays = new Date(Date.now() + 7 * 86400000);
  if (date <= sevenDays) return 'border-l-amber-500';
  return 'border-l-slate-600';
}

export function TaskRow({ task, showName, onToggleDone, onDelete }: TaskRowProps) {
  const isDone = task.status === 'done';
  return (
    <div
      className={`flex items-center gap-3 rounded-lg border-l-4 bg-slate-800 px-3 py-2.5 ${borderColor(task)}`}
    >
      <input
        type="checkbox"
        checked={isDone}
        onChange={() => onToggleDone(task.id)}
        className="h-4 w-4 accent-blue-500"
        aria-label={`Mark "${task.title}" as ${isDone ? 'todo' : 'done'}`}
      />
      <div className="min-w-0 flex-1">
        <p className={`text-sm ${isDone ? 'text-slate-500 line-through' : 'text-slate-100'}`}>
          {task.title}
        </p>
        <p className="mt-0.5 text-xs text-slate-500">
          {task.dueDate ? `Due ${format(new Date(task.dueDate), 'MMM d')}` : 'No due date'}
        </p>
      </div>
      <span className="rounded-full bg-slate-700 px-2 py-0.5 text-xs text-slate-300">
        {showName}
      </span>
      <button
        onClick={() => onDelete(task.id)}
        className="text-slate-600 hover:text-slate-400"
        aria-label={`Delete "${task.title}"`}
      >
        ×
      </button>
    </div>
  );
}
