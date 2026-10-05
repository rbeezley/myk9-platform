import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface CompactRecordListProps<T> {
  items: T[];
  /** The record open in the detail pane, if any. */
  selectedId: string | undefined;
  /** Accessible name of the list, e.g. "People". */
  label: string;
  getId: (item: T) => string;
  /** The record's own route; rows are links to it, so open-in-new-tab and Back behave as usual. */
  getHref: (item: T) => string;
  /** Spoken in the "Showing details for …" announcement when a record opens. */
  getName: (item: T) => string;
  /** Two short lines: what it is, then a muted detail (an empty one renders an em dash). */
  renderRow: (item: T) => { title: string; subtitle: string };
}

/**
 * One line per record, for the left pane of a master-detail layout. The full table needs ~720px;
 * this fits a narrow pane.
 *
 * Up/Down while a row has focus moves to the previous/next record and opens it, so a list can be
 * worked through from the keyboard. It replaces history entries rather than adding one per press.
 */
export function CompactRecordList<T>({
  items,
  selectedId,
  label,
  getId,
  getHref,
  getName,
  renderRow,
}: CompactRecordListProps<T>) {
  const navigate = useNavigate();

  const handleKeyDown = (event: React.KeyboardEvent<HTMLUListElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    // Cmd+Down, Alt+Up and the like belong to the browser and the OS.
    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    const rows = Array.from(event.currentTarget.querySelectorAll('a'));
    const row = (event.target as HTMLElement).closest('a');
    const from = row ? rows.indexOf(row) : -1;
    const to = from + (event.key === 'ArrowDown' ? 1 : -1);
    const next = items[to];
    if (from === -1 || !next) return;
    event.preventDefault();
    rows[to]?.focus();
    navigate(getHref(next), { replace: true });
  };

  const opened = items.find(item => getId(item) === selectedId);

  return (
    <>
      {/* Focus stays on the list row, so the right pane changing is otherwise silent. */}
      <p role="status" className="sr-only">
        {opened ? `Showing details for ${getName(opened)}` : ''}
      </p>
      <ul
        className="divide-y divide-border rounded-lg border bg-card"
        aria-label={label}
        onKeyDown={handleKeyDown}
      >
        {items.map(item => {
          const id = getId(item);
          const { title, subtitle } = renderRow(item);
          return (
            <li key={id}>
              <Link
                to={getHref(item)}
                aria-current={id === selectedId ? 'page' : undefined}
                className={cn(
                  'flex min-h-14 flex-col justify-center px-3 py-2 transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none',
                  id === selectedId && 'bg-primary/10 hover:bg-primary/10'
                )}
              >
                <span className="truncate text-sm font-medium">{title}</span>
                <span className="truncate text-xs text-muted-foreground">{subtitle || '—'}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
