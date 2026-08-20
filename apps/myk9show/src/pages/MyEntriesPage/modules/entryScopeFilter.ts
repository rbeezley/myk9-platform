/**
 * Inbound entry scope for My Shows.
 *
 * My Payments' per-row "Receipt" link arrives here carrying the order it came
 * from (`?showId=…&entryIds=…`, built by `buildEntryReceiptHref`). Without a
 * reader for those params the link dropped the exhibitor into every entry they
 * had ever made and left them to hunt for the one the payment covered.
 *
 * Matching is deliberately layered, because the ids in the URL are RAW entry
 * rows while the list is grouped one card per order (`groupEntriesByOrder`):
 *
 *  1. `entryIds` — a card matches when any of its class rows is in the set.
 *     This is the precise scope and the normal case.
 *  2. `showId` — used only when step 1 matched nothing. An entry row that has
 *     not replicated yet, or one since regrouped, would otherwise produce an
 *     empty page; narrowing to the show is still far better than the whole
 *     list, and it is honest because every id in an order shares its show.
 *  3. Neither matched — return every entry and say so. An empty My Shows
 *     would read as "your entries are gone", which is the one thing this page
 *     must never imply. The banner tells the exhibitor the link was stale.
 *
 * @module MyEntriesPage/modules/entryScopeFilter
 */

import {
  ENTRY_SCOPE_ENTRIES_PARAM,
  ENTRY_SCOPE_SHOW_PARAM,
} from '@/features/payments/entryReceiptHref';
import type { MyEntry } from './my-entries-types';

export interface EntryScope {
  showId: string | null;
  entryIds: string[];
}

/** How the scope resolved against the entries actually on screen. */
export type EntryScopeMatch =
  /** No scope params in the URL — the page is showing everything, as normal. */
  | { kind: 'none'; entries: MyEntry[]; scope: null }
  /** Narrowed to the exact entry rows the link named. */
  | { kind: 'entries'; entries: MyEntry[]; scope: EntryScope }
  /** Named ids matched nothing; narrowed to the show they belong to. */
  | { kind: 'show'; entries: MyEntry[]; scope: EntryScope }
  /** Nothing matched; showing everything rather than an empty page. */
  | { kind: 'unmatched'; entries: MyEntry[]; scope: EntryScope };

/**
 * Read the scope out of a query string. Returns null when neither param is
 * present or both are empty, so the common unscoped visit costs nothing.
 */
export function parseEntryScope(params: URLSearchParams): EntryScope | null {
  const showId = params.get(ENTRY_SCOPE_SHOW_PARAM)?.trim() || null;
  const entryIds = (params.get(ENTRY_SCOPE_ENTRIES_PARAM) ?? '')
    .split(',')
    .map(id => id.trim())
    .filter(Boolean);
  if (!showId && entryIds.length === 0) return null;
  return { showId, entryIds };
}

/** Strip the scope params from a query string, preserving everything else. */
export function clearEntryScopeParams(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params);
  next.delete(ENTRY_SCOPE_SHOW_PARAM);
  next.delete(ENTRY_SCOPE_ENTRIES_PARAM);
  return next;
}

export function applyEntryScope(entries: MyEntry[], scope: EntryScope | null): EntryScopeMatch {
  if (!scope) return { kind: 'none', entries, scope: null };

  if (scope.entryIds.length > 0) {
    const wanted = new Set(scope.entryIds);
    const matched = entries.filter(entry => entry.classes.some(cls => wanted.has(cls.id)));
    if (matched.length > 0) return { kind: 'entries', entries: matched, scope };
  }

  if (scope.showId) {
    const byShow = entries.filter(entry => entry.showId === scope.showId);
    if (byShow.length > 0) return { kind: 'show', entries: byShow, scope };
  }

  return { kind: 'unmatched', entries, scope };
}
