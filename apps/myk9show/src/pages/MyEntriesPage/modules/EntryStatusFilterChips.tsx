/**
 * Entry-status filter chips for the My Shows list.
 *
 * Status is a SECOND axis alongside the time tabs, so it cannot be a sibling of
 * them. As six flat tabs (All/Pending/Accepted/Waitlist/Upcoming/Completed) the
 * two axes each accounted for every entry independently: the counts summed to
 * double the total, and picking a status then a time replaced the filter rather
 * than refining it — "accepted AND still ahead of me" was unexpressable. See
 * docs/plan-ia-exhibitor-surface.md, Phase A.
 *
 * Rendered as a `radiogroup`, not tabs: these narrow the panel the tabs already
 * chose. Tab semantics would tell assistive tech this replaces the tab
 * selection, which is exactly the confusion being removed.
 *
 * @module MyEntriesPage/modules/EntryStatusFilterChips
 */

import React from 'react';
import { cn } from '@/lib/utils';
import { ENTRY_STATUS_FILTER_DEFS } from './entryTabDefs';
import type { EntryStatusFilter } from './my-entries-types';

interface EntryStatusFilterChipsProps {
  selectedStatus: EntryStatusFilter;
  onSelectStatus: (status: EntryStatusFilter) => void;
  /** Counts WITHIN the active tab, so a chip never promises rows it cannot show. */
  statusCounts: Record<EntryStatusFilter, number>;
}

export const EntryStatusFilterChips: React.FC<EntryStatusFilterChipsProps> = ({
  selectedStatus,
  onSelectStatus,
  statusCounts,
}) => (
  <div
    role="radiogroup"
    aria-label="Filter by entry status"
    className="-mt-2 flex flex-wrap items-center gap-2"
  >
    {ENTRY_STATUS_FILTER_DEFS.map(status => {
      const active = selectedStatus === status.id;
      return (
        <button
          key={status.id}
          type="button"
          role="radio"
          aria-checked={active}
          onClick={() => onSelectStatus(status.id)}
          // 44px: the exhibitors most likely to zoom are the ones least able to
          // hit a small control (same rule as the DogStrip action, MYK9-124).
          className={cn(
            'inline-flex min-h-[44px] items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors duration-state focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
            active
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-border text-muted-foreground hover:bg-accent'
          )}
        >
          {status.label}
          <span className="tabular-nums text-xs opacity-70">{statusCounts[status.id]}</span>
        </button>
      );
    })}
  </div>
);

export default EntryStatusFilterChips;
