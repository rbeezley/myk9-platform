import { format, isPast, isToday } from 'date-fns';
import type { SecretaryTask } from './types';

interface TaskRowProps {
  task: SecretaryTask;
  showName: string;
  onToggleDone: (id: string) => void;
  onDelete: (id: string) => void;
}

function borderColor(task: SecretaryTask): string {
  if (task.status === 'done') return 'border-l-border';
  if (!task.dueDate) return 'border-l-border';
  const date = new Date(task.dueDate);
  if (isPast(date) || isToday(date)) return 'border-l-error-red';
  const sevenDays = new Date(Date.now() + 7 * 86400000);
  if (date <= sevenDays) return 'border-l-warning-orange';
  return 'border-l-border';
}

export function TaskRow({ task, showName, onToggleDone, onDelete }: TaskRowProps) {
  const isDone = task.status === 'done';
  return (
    <div
      className={`flex items-center gap-3 rounded-lg border border-border border-l-4 bg-card px-3 py-2.5 ${borderColor(task)}`}
    >
      <input
        type="checkbox"
        checked={isDone}
        onChange={() => onToggleDone(task.id)}
        className="h-4 w-4 accent-primary"
        aria-label={`Mark "${task.title}" as ${isDone ? 'todo' : 'done'}`}
      />
      <div className="min-w-0 flex-1">
        <p
          className={`text-sm ${isDone ? 'text-muted-foreground line-through' : 'text-foreground'}`}
        >
          {task.title}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {task.dueDate ? `Due ${format(new Date(task.dueDate), 'MMM d')}` : 'No due date'}
        </p>
      </div>
      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
        {showName}
      </span>
      <button
        onClick={() => onDelete(task.id)}
        className="text-muted-foreground hover:text-foreground"
        aria-label={`Delete "${task.title}"`}
      >
        ×
      </button>
    </div>
  );
}
