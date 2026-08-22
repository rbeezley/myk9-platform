/**
 * Per-tab empty-state content for the My Shows page
 * (exhibitor-my-shows-legibility). Replaces the one-size-fits-all "Browse All
 * Shows" recovery with copy and a CTA appropriate to each filter tab.
 *
 * The `cta.to` values are plain routes/query strings so this table stays a
 * serializable pure lookup — the page component is responsible for wiring
 * `to: '?tab=upcoming'` style values to an actual tab-switch action if it
 * prefers not to navigate via query string.
 *
 * @module MyEntriesPage/modules/emptyStates
 */

import type { EntryStatusFilter, EntryTabFilter } from './my-entries-types';

export interface EmptyStateCta {
  label: string;
  /** Route or in-page target the page wires up (e.g. a Link `to` or a tab switch). */
  to: string;
}

export interface EmptyStateContent {
  heading: string;
  body: string;
  cta: EmptyStateCta;
}

/**
 * Lookup table: one empty-state definition per entry filter tab. Every entry
 * has heading + body + a single recovery CTA.
 */
export const EMPTY_STATE_BY_TAB: Record<EntryTabFilter, EmptyStateContent> = {
  all: {
    heading: 'No entries yet',
    body: "You haven't entered any shows yet. Find one to get started.",
    cta: { label: 'Browse All Shows', to: '/shows' },
  },
  // Phase A retired the pending/accepted/waitlist TABS; those states are now a
  // status filter composed with these tabs, so their empty states no longer
  // belong here. An empty status filter shows this tab's empty state instead —
  // one fewer copy variant to keep in step with the filter model.
  upcoming: {
    heading: 'No upcoming shows',
    body: "You don't have any shows coming up. Find one to enter.",
    cta: { label: 'Browse All Shows', to: '/shows' },
  },
  completed: {
    heading: 'No completed shows yet',
    body: 'Shows you finish will show up here with your results. Check Upcoming for what’s next.',
    cta: { label: 'View Upcoming', to: '?tab=upcoming' },
  },
};

/**
 * Empty states for the STATUS axis, used when a status filter is active and
 * nothing matches.
 *
 * Phase A retired Pending/Accepted/Waitlist as tabs, but the reassurance they
 * carried is the reason those empty states existed — an exhibitor staring at an
 * empty Pending view wants to be told the secretary reviews entries as they
 * come in, not shown a generic "nothing here". The tab went away; the copy
 * should not.
 */
export const EMPTY_STATE_BY_STATUS: Record<
  Exclude<EntryStatusFilter, 'any'>,
  EmptyStateContent
> = {
  pending: {
    heading: 'Nothing pending review',
    body: "The show secretary is reviewing entries as they come in. When you submit a new entry, it will show up here until it's accepted.",
    cta: { label: 'Browse All Shows', to: '/shows' },
  },
  accepted: {
    heading: 'No accepted entries yet',
    body: 'Once the show secretary accepts an entry, it will appear here.',
    cta: { label: 'Browse All Shows', to: '/shows' },
  },
  waitlist: {
    heading: 'No waitlisted entries',
    body: "Waitlisting happens when a class is full — you're in line and will be moved in automatically if a spot opens up. Nothing to do here right now.",
    cta: { label: 'Browse All Shows', to: '/shows' },
  },
};

/**
 * Pick the empty state for the current filter pair.
 *
 * The status filter wins when one is active: it is the narrower, more recently
 * chosen constraint, and its copy explains WHY the list is empty. With no
 * status filter the tab's own copy applies.
 */
export function resolveEmptyState(
  tab: EntryTabFilter,
  status: EntryStatusFilter
): EmptyStateContent {
  return status === 'any' ? EMPTY_STATE_BY_TAB[tab] : EMPTY_STATE_BY_STATUS[status];
}
