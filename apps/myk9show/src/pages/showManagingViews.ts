/**
 * Find Shows' Managing tab built-in views (list-toolkit rollout, MYK9-798):
 * Draft, Open for entries, Closing soon, In progress, Completed, Cancelled —
 * plus All. Each is a filter preset over the secretary/admin's own shows;
 * `filters.status` (`useBrowseShowsFilters.ts`) carries the selected id and is
 * inert on every tab but Managing.
 *
 * "Open for entries" and "Closing soon" read the entry WINDOW (same rule as
 * the Browse "Entry Status" filter, `getEntryStatus`), not `show.status` —
 * a published show can be open, closing soon, or closed independent of its
 * lifecycle status. Draft/In progress/Completed/Cancelled are the show's own
 * lifecycle status and never overlap with the entry-window views.
 */

import type { ListView } from '@/components/list-toolkit';
import type { Show } from '@/types/show-types';
import type { SyncableShowEntry } from '@/store/entryStore';
import { getEntryStatus, userHasEntriesForShow } from '@/utils/entryStatusUtils';

interface ManagingViewDefinition {
  id: string;
  label: string;
}

const MANAGING_VIEWS: readonly ManagingViewDefinition[] = [
  { id: 'all', label: 'All' },
  { id: 'draft', label: 'Draft' },
  { id: 'open', label: 'Open for entries' },
  { id: 'closing_soon', label: 'Closing soon' },
  { id: 'in_progress', label: 'In progress' },
  { id: 'completed', label: 'Completed' },
  { id: 'cancelled', label: 'Cancelled' },
];

/** Every id `filters.status` may hold besides `'all'` (for the URL allowlist). */
export const MANAGING_VIEW_IDS: readonly string[] = MANAGING_VIEWS.filter(
  view => view.id !== 'all'
).map(view => view.id);

const LIFECYCLE_VIEW_IDS = new Set(['draft', 'in_progress', 'completed', 'cancelled']);

/** The single source of truth for the Managing tab's visible rows AND every view count. */
export function matchesManagingView(
  show: Show,
  entries: SyncableShowEntry[],
  viewId: string
): boolean {
  if (viewId === 'all') return true;
  if (LIFECYCLE_VIEW_IDS.has(viewId)) return show.status === viewId;
  if (viewId === 'open' || viewId === 'closing_soon') {
    // A draft, completed, or cancelled show is never "open" or "closing soon"
    // for entries, whatever its entry-window dates say.
    if (LIFECYCLE_VIEW_IDS.has(show.status)) return false;
    const status = getEntryStatus(show, userHasEntriesForShow(show.id, entries));
    return viewId === 'open' ? status.status === 'accepting' : status.status === 'closing_soon';
  }
  return false;
}

export function activeManagingViewId(status: string): string {
  return MANAGING_VIEWS.some(view => view.id === status) ? status : 'all';
}

export function managingViewFilters(id: string): string {
  return MANAGING_VIEWS.find(view => view.id === id)?.id ?? 'all';
}

/** Every built-in Managing view with its count over the secretary/admin's own shows. */
export function buildManagingViews(shows: Show[], entries: SyncableShowEntry[]): ListView[] {
  return MANAGING_VIEWS.map(view => ({
    id: view.id,
    label: view.label,
    count: shows.filter(show => matchesManagingView(show, entries, view.id)).length,
  }));
}
