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
import { AtShowRefreshLiveRegion } from './atShowRefreshAnswer';

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
    <div className="mb-3 space-y-2">
      {/* Each tab is as wide as its word (MYK9-1697, D4): equal quarters cut
          "Favorites" while "Done" had room to spare. */}
      <div role="tablist" aria-label="Class status" className="flex gap-1">
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
              'flex min-h-12 min-w-0 flex-auto flex-col items-center justify-center rounded-lg border px-1 text-sm font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              tab === id
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-card text-foreground hover:bg-accent'
            )}
          >
            <span className="whitespace-nowrap">{label}</span>
            <span className="text-xs tabular-nums">{counts[id]}</span>
          </button>
        ))}
      </div>
      {/* One row at every width: stacked, the sort took a 48px row of its own. */}
      <div className="flex gap-2">
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
            placeholder="Search"
            className="min-h-12 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <select
          value={sort}
          onChange={event => {
            if (isClassListSort(event.target.value)) onSortChange(event.target.value);
          }}
          aria-label="Sort classes"
          className="min-h-12 w-40 shrink-0 rounded-lg border border-input bg-background px-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-auto sm:px-3"
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
      <AtShowRefreshLiveRegion phase={phase} />
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
