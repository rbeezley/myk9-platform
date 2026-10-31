/**
 * Tabs, search, sort and refresh for the at-show class picker (MYK9-1506).
 * Controlled and presentational: the page owns the state, and every control works
 * offline because it only narrows the list already on the device.
 */
import { RefreshCw, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  CLASS_LIST_SORTS,
  CLASS_LIST_TABS,
  isClassListSort,
  type ClassListSort,
  type ClassListTab,
} from './atShowClassListFilter';
import { CLASS_REFRESH_MESSAGES, type ClassRefreshPhase } from './useAtShowClassRefresh';

export const CLASS_LIST_PANEL_ID = 'at-show-class-list-panel';

interface AtShowClassListToolbarProps {
  tab: ClassListTab;
  onTabChange: (tab: ClassListTab) => void;
  counts: Record<ClassListTab, number>;
  search: string;
  onSearchChange: (search: string) => void;
  sort: ClassListSort;
  onSortChange: (sort: ClassListSort) => void;
}

export function AtShowClassListToolbar({
  tab,
  onTabChange,
  counts,
  search,
  onSearchChange,
  sort,
  onSortChange,
}: AtShowClassListToolbarProps) {
  return (
    <div className="mb-4 space-y-3">
      <div role="tablist" aria-label="Class status" className="grid grid-cols-4 gap-1">
        {CLASS_LIST_TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`at-show-class-tab-${id}`}
            aria-selected={tab === id}
            aria-controls={CLASS_LIST_PANEL_ID}
            onClick={() => onTabChange(id)}
            className={cn(
              'flex min-h-12 flex-col items-center justify-center rounded-lg border px-1 text-sm font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              tab === id
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-card text-foreground hover:bg-accent'
            )}
          >
            <span className="max-w-full truncate">{label}</span>
            <span className="text-xs tabular-nums">{counts[id]}</span>
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <Search
            size={16}
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="search"
            value={search}
            onChange={event => onSearchChange(event.target.value)}
            aria-label="Search classes"
            placeholder="Search class, judge, level"
            className="min-h-12 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <select
          value={sort}
          onChange={event => {
            if (isClassListSort(event.target.value)) onSortChange(event.target.value);
          }}
          aria-label="Sort classes"
          className="min-h-12 rounded-lg border border-input bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {CLASS_LIST_SORTS.map(({ id, label }) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

interface AtShowClassRefreshButtonProps {
  phase: ClassRefreshPhase;
  onRefresh: () => void;
}

/** Header refresh: the icon spins while syncing and the result is announced beside it. */
export function AtShowClassRefreshButton({ phase, onRefresh }: AtShowClassRefreshButtonProps) {
  const refreshing = phase === 'refreshing';
  return (
    <>
      <button
        type="button"
        onClick={onRefresh}
        disabled={refreshing}
        aria-label="Refresh classes"
        className="flex h-12 w-12 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <RefreshCw size={20} aria-hidden className={cn(refreshing && 'animate-spin')} />
      </button>
      <div role="status" aria-live="polite" className="sr-only">
        {phase === 'idle' ? '' : CLASS_REFRESH_MESSAGES[phase]}
      </div>
    </>
  );
}

/** The visible result of the last refresh, shown under the toolbar for a few seconds. */
export function AtShowClassRefreshResult({ phase }: { phase: ClassRefreshPhase }) {
  if (phase === 'idle' || phase === 'refreshing') return null;
  return (
    <p
      className={cn(
        'mb-3 rounded-lg px-3 py-2 text-center text-sm',
        phase === 'done' ? 'bg-muted text-foreground' : 'bg-warning/10 text-warning'
      )}
    >
      {CLASS_REFRESH_MESSAGES[phase]}
    </p>
  );
}
