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
 *     This is the precise scope and the normal case. It only counts as EXACT
 *     when the named ids and the matched cards' rows agree in BOTH directions
 *     — nothing named is missing, and nothing unnamed rode along. Anything
 *     else resolves to `partial` so the copy cannot overclaim.
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
} from '@/features/payments/entryScopeParams';
import type { MyEntry } from './my-entries-types';

export interface EntryScope {
  showId: string | null;
  entryIds: string[];
}

/**
 * How the scope resolved against the entries actually on screen. Deliberately
 * carries no copy of the scope itself: callers need to know what they are
 * showing and why, never which raw entry ids produced it.
 */
export type EntryScopeMatch =
  /** No scope params in the URL — the page is showing everything, as normal. */
  | { kind: 'none'; entries: MyEntry[] }
  /** Narrowed to the entry rows the link named, and ALL of them were found. */
  | { kind: 'entries'; entries: MyEntry[] }
  /**
   * Narrowed, but the match is not one-to-one: named rows are missing (still
   * replicating, or since withdrawn), or a matched card carries rows this
   * payment did not cover. Kept separate from 'entries' because the copy must
   * not call this list the payment's contents when it demonstrably is not.
   */
  | { kind: 'partial'; entries: MyEntry[] }
  /** Named ids matched nothing; narrowed to the show they belong to. */
  | { kind: 'show'; entries: MyEntry[] }
  /** Nothing matched; showing everything rather than an empty page. */
  | { kind: 'unmatched'; entries: MyEntry[] };

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
  if (!scope) return { kind: 'none', entries };

  if (scope.entryIds.length > 0) {
    const wanted = new Set(scope.entryIds);
    // Track WHICH ids were found, not merely that something matched. A card is
    // one grouped order, so a single surviving class row makes its whole card
    // match — and reporting that as an exact scope would let the banner claim
    // "the ones your payment covered" while siblings are still replicating.
    const found = new Set<string>();
    const matched: MyEntry[] = [];
    for (const entry of entries) {
      let hit = false;
      for (const cls of entry.classes) {
        if (!wanted.has(cls.id)) continue;
        found.add(cls.id);
        hit = true;
      }
      if (hit) matched.push(entry);
    }
    if (matched.length > 0) {
      // Exact requires BOTH directions to line up: every named id present, and
      // no extra rows riding along on a matched card. A card is one grouped
      // registration, and a registration can be paid by more than one order
      // (a capacity split sends the overflow to the wait list, and its later
      // promotion pays separately). Checking only for missing ids would let a
      // card carrying a sibling order's classes still claim to BE this payment.
      const exact =
        found.size === wanted.size &&
        matched.every(entry => entry.classes.every(cls => wanted.has(cls.id)));
      return { kind: exact ? 'entries' : 'partial', entries: matched };
    }
  }

  if (scope.showId) {
    const byShow = entries.filter(entry => entry.showId === scope.showId);
    if (byShow.length > 0) return { kind: 'show', entries: byShow };
  }

  return { kind: 'unmatched', entries };
}
