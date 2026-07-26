/**
 * Pinned copy strings for the My Shows page legibility remediation
 * (exhibitor-my-shows-legibility). Centralized so tests can assert exact
 * wording and so the same string is never duplicated inline across
 * `index.tsx` and `CompactStatsRow.tsx`.
 *
 * @module MyEntriesPage/modules/myShowsCopy
 */

/** Summary card label for the current (non-past accepted+pending) count. */
export const CURRENT_ENTRIES_LABEL = 'Current entries';

/** Sub-label clarifying the summary card's scope, distinct from "All entries". */
export const CURRENT_ENTRIES_QUALIFIER = 'Upcoming + in review';

/** Entries-section eyebrow label — the all-time, all-status count. */
export const ALL_ENTRIES_LABEL = 'All entries';

/** One-line note distinguishing the "All entries" scope from "Current entries". */
export const ALL_ENTRIES_SCOPE_NOTE = 'Includes past shows';

/**
 * Offline-first, non-blaming load-failure copy. Replaces "Failed to load your
 * entries. Please check your connection." — the product principle is that
 * offline is normal, not a user error to diagnose.
 */
export const ENTRIES_LOAD_ERROR =
  "We couldn't refresh your entries just now. Your saved information is still here — try again in a moment.";

/**
 * One-line reassurance shown on the `MyEntryCard` summary band while an
 * entry's status is "Pending Secretary Approval" — calms the "did this vanish
 * into a void?" anxiety before the exhibitor expands details.
 */
export const PENDING_REVIEW_REASSURANCE = 'The show secretary is reviewing this entry.';
