import { useState } from 'react';

interface Show {
  id: string;
  name: string;
}

interface TaskAddFormProps {
  shows: Show[];
  clubId: string;
  onAdd: (input: { title: string; showId: string | null; clubId: string }) => void;
  onCancel: () => void;
}

export function TaskAddForm({ shows, clubId, onAdd, onCancel }: TaskAddFormProps) {
  const [title, setTitle] = useState('');
  const [showId, setShowId] = useState<string>('general');

  function submit() {
    const trimmed = title.trim();
    if (!trimmed) return;
    onAdd({ title: trimmed, showId: showId === 'general' ? null : showId, clubId });
    setTitle('');
    setShowId('general');
  }

  return (
    <div className="flex gap-2 rounded-lg border border-border bg-card p-2">
      <input
        autoFocus
        value={title}
        onChange={e => setTitle(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') submit();
          if (e.key === 'Escape') onCancel();
        }}
        placeholder="Task title…"
        className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
      />
      <select
        value={showId}
        onChange={e => setShowId(e.target.value)}
        className="rounded border border-border bg-background px-2 py-1 text-xs text-foreground"
      >
        <option value="general">General</option>
        {shows.map(s => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <button
        onClick={submit}
        className="rounded bg-primary px-3 py-1 text-xs text-primary-foreground hover:opacity-90"
      >
        Add
      </button>
      <button onClick={onCancel} className="text-xs text-muted-foreground hover:text-foreground">
        Cancel
      </button>
    </div>
  );
}
