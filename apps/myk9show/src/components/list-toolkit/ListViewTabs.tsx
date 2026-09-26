/**
 * Built-in views with live counts — the list toolkit's replacement for stat
 * cards. The count on a view IS the stat, and pressing it applies the view.
 *
 * A view that lives on another page (a request queue) renders as a link, so
 * the list links to that surface instead of duplicating it (CLAUDE.md,
 * "consolidate, don't duplicate").
 */

import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import type { ListView } from './types';

interface ListViewTabsProps {
  views: ListView[];
  /** The view the current filters match exactly, or null for a custom filter. */
  activeId: string | null;
  onSelect: (id: string) => void;
  label: string;
  className?: string;
}

const TAB =
  'inline-flex h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

function Count({ value, active }: { value: number; active: boolean }) {
  return (
    <span
      className={cn(
        'rounded-full px-2 text-xs font-semibold tabular-nums',
        active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
      )}
    >
      {value.toLocaleString()}
    </span>
  );
}

export function ListViewTabs({ views, activeId, onSelect, label, className }: ListViewTabsProps) {
  return (
    <nav
      aria-label={label}
      className={cn('flex items-end gap-1 overflow-x-auto border-b border-border', className)}
    >
      {views.map(view => {
        const active = view.id === activeId;
        const content = (
          <>
            {view.label}
            {view.count !== undefined && <Count value={view.count} active={active} />}
          </>
        );
        return view.href ? (
          <Link
            key={view.id}
            to={view.href}
            className={cn(TAB, 'border-transparent text-muted-foreground hover:text-foreground')}
          >
            {content}
          </Link>
        ) : (
          <button
            key={view.id}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(view.id)}
            className={cn(
              TAB,
              active
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {content}
          </button>
        );
      })}
    </nav>
  );
}
