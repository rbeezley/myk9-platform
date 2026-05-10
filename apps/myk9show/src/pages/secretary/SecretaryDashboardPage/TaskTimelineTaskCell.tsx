import { useState } from 'react';
import { Pencil, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SecretaryTask, UpdateTaskInput } from './types';

interface Show {
  id: string;
  name: string;
}

interface TaskTimelineTaskCellProps {
  task: SecretaryTask;
  shows: Show[];
  labelWidth: number;
  onToggleDone: (id: string) => void;
  onUpdate: (id: string, update: UpdateTaskInput) => void;
  onDelete: (id: string) => void;
}

export function TaskTimelineTaskCell({
  task,
  shows,
  labelWidth,
  onToggleDone,
  onUpdate,
  onDelete,
}: TaskTimelineTaskCellProps) {
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
    onUpdate(task.id, {
      title: trimmed,
      dueDate: editDueDate || null,
      showId: editShowId === 'general' ? null : editShowId,
    });
    setEditing(false);
  }

  if (editing) {
    return (
      <div
        className="flex min-h-[44px] shrink-0 flex-wrap items-center gap-2 border-r border-border/30 bg-card px-2 py-2"
        style={{ width: labelWidth }}
      >
        <input
          autoFocus
          value={editTitle}
          onChange={e => setEditTitle(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') save();
            if (e.key === 'Escape') setEditing(false);
          }}
          className="min-w-32 flex-1 rounded border border-border bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <input
          type="date"
          value={editDueDate}
          onChange={e => setEditDueDate(e.target.value)}
          className="rounded border border-border bg-background px-2 py-1 text-xs text-foreground"
        />
        <select
          value={editShowId}
          onChange={e => setEditShowId(e.target.value)}
          className="rounded border border-border bg-background px-2 py-1 text-xs text-foreground"
        >
          <option value="general">General</option>
          {shows.map(show => (
            <option key={show.id} value={show.id}>
              {show.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={save}
          className="rounded bg-primary px-3 py-1 text-xs text-primary-foreground hover:opacity-90"
        >
          Save
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div
      className="flex min-h-[44px] shrink-0 items-center gap-2 border-r border-border/30 pr-2"
      style={{ width: labelWidth }}
    >
      <input
        type="checkbox"
        checked={isDone}
        onChange={() => onToggleDone(task.id)}
        className="ml-2 h-4 w-4 shrink-0 accent-primary"
        aria-label={`Mark "${task.title}" as ${isDone ? 'todo' : 'done'}`}
      />
      <span
        className={cn(
          'min-w-0 flex-1 truncate text-xs',
          isDone ? 'text-muted-foreground line-through' : 'text-foreground'
        )}
        title={task.title}
      >
        {task.title}
      </span>
      <button
        type="button"
        onClick={openEdit}
        className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label={`Edit "${task.title}"`}
      >
        <Pencil className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => onDelete(task.id)}
        className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label={`Delete "${task.title}"`}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
