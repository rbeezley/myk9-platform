import { useState } from 'react';
import { format, isPast, isToday } from 'date-fns';
import { Pencil, X } from 'lucide-react';
import type { SecretaryTask, UpdateTaskInput } from './types';

interface Show {
  id: string;
  name: string;
}

interface TaskRowProps {
  task: SecretaryTask;
  showName: string;
  shows?: Show[];
  onToggleDone: (id: string) => void;
  onUpdate?: (id: string, update: UpdateTaskInput) => void;
  onDelete: (id: string) => void;
  // When `true`, the show selector is hidden in edit mode and `showId` is
  // omitted from update payloads — used by personal-only and show-scoped
  // surfaces to prevent the row from moving a task across scopes.
  lockShowEdit?: boolean;
  // When `true`, the show-name chip is hidden in the row view (used by
  // surfaces where every visible task belongs to the same scope, e.g. the
  // dashboard's personal tasks list or the per-show TasksNotesCard).
  hideShowChip?: boolean;
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

export function TaskRow({
  task,
  showName,
  shows = [],
  onToggleDone,
  onUpdate,
  onDelete,
  lockShowEdit = false,
  hideShowChip = false,
}: TaskRowProps) {
  const isDone = task.status === 'done';
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [editDueDate, setEditDueDate] = useState(task.dueDate ?? '');
  const [editShowId, setEditShowId] = useState<string>(task.showId ?? 'general');

  function openEdit() {
    setEditTitle(task.title);
    setEditDueDate(task.dueDate ?? '');
    setEditShowId(task.showId ?? 'general');
    setEditing(true);
  }

  function save() {
    const trimmed = editTitle.trim();
    if (!trimmed) return;
    onUpdate?.(task.id, {
      title: trimmed,
      dueDate: editDueDate || null,
      ...(lockShowEdit ? {} : { showId: editShowId === 'general' ? null : editShowId }),
    });
    setEditing(false);
  }

  function cancel() {
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary bg-card px-3 py-2.5">
        <input
          autoFocus
          value={editTitle}
          onChange={e => setEditTitle(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') save();
            if (e.key === 'Escape') cancel();
          }}
          className="flex-1 bg-transparent text-sm text-foreground focus:outline-none"
        />
        <input
          type="date"
          value={editDueDate}
          onChange={e => setEditDueDate(e.target.value)}
          className="rounded border border-border bg-background px-2 py-1 text-xs text-foreground"
        />
        {!lockShowEdit && (
          <select
            value={editShowId}
            onChange={e => setEditShowId(e.target.value)}
            className="rounded border border-border bg-background px-2 py-1 text-xs text-foreground"
          >
            <option value="general">General</option>
            {shows.map(s => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
        <button
          onClick={save}
          className="rounded bg-primary px-3 py-1 text-xs text-primary-foreground hover:opacity-90"
        >
          Save
        </button>
        <button onClick={cancel} className="text-xs text-muted-foreground hover:text-foreground">
          Cancel
        </button>
      </div>
    );
  }

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
      {!hideShowChip && (
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {showName}
        </span>
      )}
      <button
        onClick={openEdit}
        className="text-muted-foreground hover:text-foreground"
        aria-label={`Edit "${task.title}"`}
      >
        <Pencil className="h-4 w-4" />
      </button>
      <button
        onClick={() => onDelete(task.id)}
        className="text-muted-foreground hover:text-foreground"
        aria-label={`Delete "${task.title}"`}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
