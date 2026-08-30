/**
 * The My Shows filter strip: two composable axes in one visual language.
 *
 * Time used to be a `PrimaryTabs` tablist and status a chip `radiogroup` —
 * two different languages, and two different accessibility semantics, for the
 * same job. Tabs promise a different VIEW; both of these produce the same list
 * of the same cards, narrowed. That makes them filters, so they are drawn and
 * announced as filters.
 *
 * Both axes are also now NAMED. Nothing on the page previously said that one
 * row was time and the other status, which mattered because the status counts
 * re-scope to the selected time window (see `statusCounts`) — a composition
 * the strip performed invisibly.
 *
 * What did NOT change: the partition invariant (`upcoming + completed === all`,
 * pinned in useMyEntriesFilters.test.ts), the composition rules, the counts, or
 * the `?tab=` / `?status=` URL params. Phase A of
 * docs/plan-ia-exhibitor-surface.md chose time as the primary axis; it stays
 * first and is now labelled as such.
 *
 * @module MyEntriesPage/modules/EntryFilterStrip
 */

import React from 'react';
import { cn } from '@/lib/utils';
import { ENTRY_STATUS_FILTER_DEFS, ENTRY_TAB_DEFS } from './entryTabDefs';
import type { EntryStatusFilter, EntryTabFilter } from './my-entries-types';

interface FilterOption<T extends string> {
  id: T;
  label: string;
}

interface EntryFilterChipGroupProps<T extends string> {
  /** Visible axis name. The page never said what these rows filtered by. */
  label: string;
  ariaLabel: string;
  options: readonly FilterOption<T>[];
  value: T;
  onSelect: (id: T) => void;
  counts: Record<T, number>;
}

function EntryFilterChipGroup<T extends string>({
  label,
  ariaLabel,
  options,
  value,
  onSelect,
  counts,
}: EntryFilterChipGroupProps<T>) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
      <span
        aria-hidden="true"
        className="min-w-14 text-xs font-semibold uppercase tracking-widest text-muted-foreground"
      >
        {label}
      </span>
      <div role="radiogroup" aria-label={ariaLabel} className="flex flex-wrap items-center gap-2">
        {options.map(option => {
          const active = value === option.id;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onSelect(option.id)}
              // 44px: the exhibitors most likely to zoom are the ones least
              // able to hit a small control (same rule as the DogStrip action,
              // MYK9-124).
              className={cn(
                'inline-flex min-h-[44px] items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors duration-state focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                active
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:bg-accent'
              )}
            >
              {option.label}
              {/* Was `opacity-70`, which measured 2.98:1 in light and 3.03:1 in
                  dark against a 4.5:1 floor — and the count IS the
                  information. A full-strength token instead of a dimmed one. */}
              <span className="tabular-nums text-xs">{counts[option.id]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface EntryFilterStripProps {
  selectedTab: EntryTabFilter;
  onSelectTab: (tab: EntryTabFilter) => void;
  tabCounts: Record<EntryTabFilter, number>;
  selectedStatus: EntryStatusFilter;
  onSelectStatus: (status: EntryStatusFilter) => void;
  /** Counts WITHIN the active tab, so a chip never promises rows it cannot show. */
  statusCounts: Record<EntryStatusFilter, number>;
}

const TAB_OPTIONS: readonly FilterOption<EntryTabFilter>[] = ENTRY_TAB_DEFS.map(tab => ({
  id: tab.id,
  label: tab.label,
}));

export const EntryFilterStrip: React.FC<EntryFilterStripProps> = ({
  selectedTab,
  onSelectTab,
  tabCounts,
  selectedStatus,
  onSelectStatus,
  statusCounts,
}) => (
  <div className="flex flex-col gap-3">
    <EntryFilterChipGroup
      label="When"
      ariaLabel="Filter by time"
      options={TAB_OPTIONS}
      value={selectedTab}
      onSelect={onSelectTab}
      counts={tabCounts}
    />
    <EntryFilterChipGroup
      label="Status"
      ariaLabel="Filter by entry status"
      options={ENTRY_STATUS_FILTER_DEFS}
      value={selectedStatus}
      onSelect={onSelectStatus}
      counts={statusCounts}
    />
  </div>
);

export default EntryFilterStrip;
