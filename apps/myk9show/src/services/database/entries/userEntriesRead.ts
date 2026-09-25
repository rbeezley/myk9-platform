/**
 * The account-level own-entry read and the ONE rule for whether the money it
 * carries may be stated as fact.
 *
 * Extracted from `search.ts` (MYK9-563 item 7 / MYK9-629): that file had grown
 * past 700 lines around a cluster that has nothing to do with armband search.
 * The move is verbatim except for the `stale` boolean, which became the
 * {@link UserEntriesSource} discriminator below.
 *
 * @module services/database/entries/userEntriesRead
 */

import { supabase, createDatabaseError, logQuery, type DatabaseError } from '../supabaseClient';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import { replicatedDogsTable } from '@/services/replication/ReplicatedDogsTable';
import { replicatedClassesTable } from '@/services/replication/ReplicatedClassesTable';
import { replicatedShowsTable } from '@/services/replication/ReplicatedShowsTable';
import { replicatedTrialsTable } from '@/services/replication/ReplicatedTrialsTable';
import { logger } from '@/services/LoggingService';
import { buildMapFromArray } from '../_shared/maps';
import { withTimeout, DEFAULT_TIMEOUT_MS } from '@myk9/core';
import { buildReplicatedUserEntryRows } from './userEntriesReplication';
import { applyOrderReferenceRule } from './orderReferenceRule';
import { buildUserEntriesSelect } from './userEntriesSelect';
export { USER_ENTRIES_SELECT } from './userEntriesSelect';
import { selectOwnedDogIds } from '@/utils/dogOwnership';
import {
  isMoveUpLinkSchemaUnavailable,
  isRegistrationConfirmationNumberSchemaUnavailable,
} from '@/features/payments/pullRefundSchemaCompatibility';

/**
 * Where an account-level entry read's rows came from.
 *
 * A boolean `stale` could not tell the two replica cases apart, and they are
 * not the same event: `replica-offline` is the EXPECTED show-day case (no
 * network, the snapshot is all there is), while `replica-after-error` means the
 * server was reachable and declined to confirm these rows — it failed, timed
 * out, or came back empty over a populated snapshot. Both withhold money;
 * only the second is worth a warning in the logs.
 */
export type UserEntriesSource =
  'confirmed' | 'confirmed-move-up-link-unavailable' | 'replica-offline' | 'replica-after-error';

/**
 * The ONE rule for whether a money figure derived from these rows may be
 * stated as fact.
 *
 * Every money derivation — `deriveShowMoneyState`, the entry balance summary —
 * asks this and returns an explicit "unknown" state when it answers false. No
 * surface may re-derive the decision from the source itself: that is how a
 * dollar amount and a live pay link survived two review rounds inside a third
 * strip on the same page (PR #2301, MYK9-629).
 *
 * Receipts are NOT a claim about money still owed and are deliberately outside
 * this gate: a receipt records a payment already taken, so it stays reachable
 * on every source, carrying the unconfirmed notice (decision (a)).
 */
export function isMoneyConfirmed(source: UserEntriesSource): boolean {
  return source === 'confirmed';
}

// Routes own-entry reads through the cascade-aware authenticated view so scored
// columns (final_placement, result_status, etc.) are nulled until the
// visibility cascade releases them. The view is owner-run and embeds the same
// manager/own-entry row gate as entries_select, so it keeps working after
// scored columns are revoked from the shared authenticated role.
const USER_ENTRIES_PAGE_SIZE = 1000;
const USER_ENTRIES_MAX_PAGES = 100;

async function postgrestGetUserEntries() {
  const rows: Record<string, unknown>[] = [];
  // Local to THIS read, never module state: a flag at module scope would leak
  // one page's schema verdict into every later read (and into the next test in
  // a shuffled run). MYK9-659's view column and MYK9-639's are tracked
  // separately: INDEPENDENT migrations back them, so one missing must not drop
  // the other.
  let includeRegistrationConfirmationNumber = true;
  // MYK9-639's view column is independently optional while deployments catch up.
  let includeMoveUpLink = true;
  let moveUpLinkUnavailable = false;
  // ONE deadline for the whole paged read, not one per page. `withTimeout`
  // only races the promise it is given, so when it wins, the loop below is
  // still in flight — a per-page signal would let each SUBSEQUENT page start a
  // fresh 15s of its own and go on fetching pages nobody awaits. Sharing a
  // single signal across every page stops the orphaned paging at the same
  // instant the caller gives up.
  const deadline = AbortSignal.timeout(USER_ENTRIES_VIEW_TIMEOUT_MS);
  let cursorCreatedAt: string | null = null;
  let cursorId: string | null = null;

  for (let page = 0; page < USER_ENTRIES_MAX_PAGES; page++) {
    const runPage = () => {
      let query = supabase
        .from('view_authenticated_entry_results')
        .select(
          buildUserEntriesSelect({
            includeRegistrationConfirmationNumber,
            includeMoveUpLink,
          })
        )
        // My Entries is OWN entries only. The view returns can_manage OR
        // is_own_entry rows, so without this filter a secretary/admin would receive
        // every manageable show entry here. is_own_entry is a SQL-resolved column
        // (handler is me OR I own the dog), so this scopes every read path —
        // including the replication-failure fallback — at the source.
        .eq('is_own_entry', true)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .abortSignal(deadline);

      if (cursorCreatedAt && cursorId) {
        query = query.or(
          `created_at.lt.${cursorCreatedAt},and(created_at.eq.${cursorCreatedAt},id.lt.${cursorId})`
        );
      }

      return query.range(0, USER_ENTRIES_PAGE_SIZE - 1);
    };

    let response;
    while (true) {
      response = await runPage();
      if (
        includeRegistrationConfirmationNumber &&
        isRegistrationConfirmationNumberSchemaUnavailable(response.error)
      ) {
        // Pre-20260918193700 database. Drop the column, re-ask this page, and
        // go without it for every later page. SAY SO: this warning is the only
        // evidence anywhere that the push is outstanding. The
        // online receipt falls back to the `registration:registration_id(...)`
        // embed's confirmation number, which is what it read before MYK9-659.
        includeRegistrationConfirmationNumber = false;
        logger.warn(
          'My Entries read without registration_confirmation_number: migration 20260918193700 is not applied',
          'database',
          { column: 'registration_confirmation_number', migration: '20260918193700' }
        );
        continue;
      }
      if (includeMoveUpLink && isMoveUpLinkSchemaUnavailable(response.error)) {
        includeMoveUpLink = false;
        moveUpLinkUnavailable = true;
        logger.warn(
          'My Entries read without moved_from_entry_id: migration 20260918193300 is not applied',
          'database',
          { column: 'moved_from_entry_id', migration: '20260918193300' }
        );
        continue;
      }
      break;
    }
    const { data, error } = response;

    if (error) {
      throw createDatabaseError(error, 'view_authenticated_entry_results', 'select_user_entries');
    }

    // `as unknown as` rather than a direct cast: supabase-js resolves the select
    // string at the TYPE level, and `buildUserEntriesSelect` returns a plain
    // `string` (the remaining optional columns make it non-literal), so `data`
    // arrives as a GenericStringError union that does not overlap the row
    // shape. Rechecked when MYK9-654 folded `withdrawal_reason_code` in. Every consumer reads this as an untyped row bag
    // anyway — `transformEntry` casts each field — so nothing is lost here that
    // was ever enforced; `search.test.ts` is what pins the column list.
    const pageRows = (data || []) as unknown as Record<string, unknown>[];
    // One rule, both paths: the view's own column decides the order reference,
    // the embed only backs it up. See applyOrderReferenceRule.
    for (const row of pageRows) applyOrderReferenceRule(row);
    rows.push(...pageRows);
    if (pageRows.length < USER_ENTRIES_PAGE_SIZE) {
      return { data: rows, error: null, moveUpLinkUnavailable };
    }

    const lastRow = pageRows[pageRows.length - 1];
    if (!lastRow?.created_at || !lastRow.id) {
      throw createDatabaseError(
        new Error('User entries page is missing its stable pagination cursor'),
        'view_authenticated_entry_results',
        'select_user_entries'
      );
    }
    cursorCreatedAt = String(lastRow.created_at);
    cursorId = String(lastRow.id);
  }

  throw createDatabaseError(
    new Error(
      `User entries exceeded the ${USER_ENTRIES_MAX_PAGES * USER_ENTRIES_PAGE_SIZE} row safety limit`
    ),
    'view_authenticated_entry_results',
    'select_user_entries'
  );
}

function isOfflineFetchError(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return true;
  }

  return /Failed to fetch|NetworkError|Load failed/i.test(errorMessageOf(error));
}

/**
 * The human message of anything thrown on a read path.
 *
 * Not every rejection here is an `Error`: `postgrestGetUserEntries` throws a
 * `DatabaseError` OBJECT, so a bare `String(error)` yields "[object Object]"
 * and any log built from it says nothing. Shared by the offline test and the
 * stale-replica warning so both read the same value.
 */
function errorMessageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

/**
 * How long the account-level view read may hang before the replica takes over.
 *
 * A dead venue wifi or a captive portal leaves `navigator.onLine` true and the
 * request simply never settles, so without a deadline the offline fallback is
 * unreachable exactly where show-day needs it. `DEFAULT_TIMEOUT_MS` is the
 * app's own network deadline (`@myk9/core`), used here rather than a bespoke
 * number so every timed read agrees.
 */
const USER_ENTRIES_VIEW_TIMEOUT_MS = DEFAULT_TIMEOUT_MS;

/**
 * The account-level read's result.
 *
 * Either replica `source` marks rows served from the per-show replication
 * snapshot without the authoritative view confirming them — it failed, timed
 * out, or came back empty against a populated replica. Those rows are real,
 * but they may describe a world the server no longer agrees with (a
 * hard-deleted entry, a reassigned dog), so a caller that would make a CLAIM
 * from them — an amount due, a "paid in full" — must route it through
 * {@link isMoneyConfirmed} instead of stating it. `error: null` alone cannot
 * carry that distinction, which is why this field exists.
 *
 * `source` is REQUIRED, not optional: an optional flag is one a new caller can
 * forget, and forgetting it here means quoting an unconfirmed dollar figure.
 */
export interface UserEntriesResult {
  data: Record<string, unknown>[];
  error: DatabaseError | null;
  /** Where the rows came from. The ONLY input to whether money may be stated. */
  source: UserEntriesSource;
}

/**
 * Account-level own-entry read (My Shows, My Payments, the exhibitor dashboard).
 *
 * The AUTHORITATIVE source here is the online view, not the replication store,
 * and that asymmetry is deliberate rather than a bypass of offline-first.
 * `replicatedEntriesTable.sync()` is scoped PER SHOW — it refuses to sync at
 * all without a show scope (`[entries] Skipping remote sync without show
 * scope`), so on a cross-show route like `/my-entries` no entries sync ever
 * runs. The snapshot that route reads is whatever some earlier per-show visit
 * left behind: complete for no query in particular, and unable to report its
 * own incompleteness. Preferring it whenever it merely LOOKED whole (every
 * relation hydrated, nothing scored) is what let a class added to an
 * already-synced enrollment vanish from My Entries — and its fee vanish from
 * the amount due — while the show-details page, which DOES carry a show scope
 * and so does sync, listed both classes (MYK9-536).
 *
 * So: read the authoritative account-scoped view first, and fall back to the
 * replicated snapshot when that read fails, times out, or comes back EMPTY
 * while the replica has rows.
 *
 * That last case is not paranoia. The view resolves ownership in SQL from
 * `auth.uid()`; the replica filter below resolves it from the client's
 * `personId` plus owned dog ids, and `people.id` is never `auth.uid()` in this
 * project. An identity-resolution mismatch therefore surfaces as a
 * successful-but-empty view read, and "you have no entries / $0 due" is a
 * positive claim this function is not entitled to make over a populated
 * replica. An empty view may confirm an empty replica; it may not contradict a
 * full one.
 *
 * NOTE ON OFFLINE REACH: this function's fallback is only as reachable as its
 * caller. React Query callers must set `networkMode: 'always'`, or the query
 * parks at `fetchStatus: 'paused'` offline and never invokes this code at all.
 */
export const getUserEntries = async (userId: string): Promise<UserEntriesResult> => {
  const startTime = Date.now();

  try {
    // postgrestGetUserEntries scopes to own entries in SQL (is_own_entry =
    // true), so this returns the complete authoritative set — including own
    // entries in shows the local replica has never synced — without leaking
    // manageable-not-own rows.
    const result = await withTimeout(
      postgrestGetUserEntries(),
      USER_ENTRIES_VIEW_TIMEOUT_MS,
      'My Entries account read'
    );

    if (result.data.length === 0) {
      const replica = await readReplicaUserEntryRows(userId);
      if (replica && replica.data.length > 0) {
        // The rows are kept, but they are NOT confirmed. The view retains the
        // caller's own withdrawn and soft-deleted entries, so it does not go
        // empty for a status change — this branch trips on a hard delete or
        // cascade, on a handler/owner reassignment, or on an identity mismatch.
        // In the first two the server is RIGHT and the replica is a ghost, so
        // serving it silently would state a phantom amount due as fact.
        logger.warn(
          'My Entries kept replica rows the authoritative view did not return',
          'database',
          { rows: replica.data.length }
        );
        logQuery('entries', 'select_user_entries_empty_view_replica_kept', Date.now() - startTime);
        return { ...replica, source: 'replica-after-error' };
      }
    }

    logQuery('entries', 'select_user_entries', Date.now() - startTime);
    if (typeof replicatedEntriesTable.refreshReceiptReferencesForUser === 'function') {
      void replicatedEntriesTable.refreshReceiptReferencesForUser(userId).catch(error => {
        logger.warn('My Entries receipt-reference refresh failed', 'database', {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }
    const { moveUpLinkUnavailable, ...confirmedResult } = result;
    return {
      ...confirmedResult,
      source: moveUpLinkUnavailable ? 'confirmed-move-up-link-unavailable' : 'confirmed',
    };
  } catch (error) {
    return readUserEntriesFromReplica(userId, error, startTime);
  }
};

/**
 * Rebuild the exhibitor's rows from the per-show replication snapshot, or
 * `null` when the snapshot itself cannot be read.
 *
 * The replicated rows carry raw scored columns WITHOUT the per-field visibility
 * cascade, which is not in replication scope; `buildReplicatedUserEntryRows`
 * nulls them (see `withholdScoredResultColumns`), so withheld results never
 * leak on this path.
 */
async function readReplicaUserEntryRows(
  userId: string
): Promise<{ data: Record<string, unknown>[]; error: null } | null> {
  try {
    const [allEntries, dogs, classes, shows, trials] = await Promise.all([
      replicatedEntriesTable.getAll(),
      replicatedDogsTable.getAllDogs(),
      replicatedClassesTable.getAll(),
      replicatedShowsTable.getAllShows(),
      replicatedTrialsTable.getAll(),
    ]);
    const dogsMap = buildMapFromArray(dogs, d => d.id);
    const classesMap = buildMapFromArray(classes, c => c.id);
    const showsMap = buildMapFromArray(shows, s => s.id);
    const trialsMap = buildMapFromArray(trials, t => t.id);
    const ownedDogIds = selectOwnedDogIds(dogs, userId);
    const filtered = allEntries.filter(
      e => e.handlerId === userId || (e.dogId ? ownedDogIds.has(e.dogId) : false)
    );

    return await buildReplicatedUserEntryRows(filtered, {
      dogsMap,
      classesMap,
      showsMap,
      trialsMap,
    });
  } catch {
    return null;
  }
}

/**
 * Offline/degraded fallback for {@link getUserEntries}, used when the view read
 * FAILED (rejected or timed out) rather than merely came back empty.
 *
 * The snapshot is known-incomplete for an account-level query (see above), so
 * this is a last resort, not a preference. When it has nothing to offer AND the
 * view failed for a reason other than being offline, the error is surfaced
 * instead of an empty list — "no entries" is a positive claim.
 */
async function readUserEntriesFromReplica(
  userId: string,
  viewError: unknown,
  startTime: number
): Promise<UserEntriesResult> {
  const replica = await readReplicaUserEntryRows(userId);

  if (!replica || (replica.data.length === 0 && !isOfflineFetchError(viewError))) {
    const dbError = createDatabaseError(viewError, 'entries', 'select_user_entries');
    logQuery(
      'entries',
      // Two different failures, and the success label belonged to neither: the
      // replica answered and had nothing, or the replica could not be read at
      // all.
      replica
        ? 'select_user_entries_empty_replica_error'
        : 'select_user_entries_replica_unreadable',
      Date.now() - startTime,
      dbError.message
    );
    return {
      data: [],
      error: dbError as DatabaseError,
      source: isOfflineFetchError(viewError) ? 'replica-offline' : 'replica-after-error',
    };
  }

  // Offline is the EXPECTED reason to be here and needs no alarm. A 403, a
  // 500 or an RLS denial is not: the exhibitor is served a per-show snapshot
  // that may be missing exactly the rows MYK9-536 was about, and silence would
  // make that symptom reachable again on a transient server error with nothing
  // in the logs to say so. Warn, and give the state its own query label.
  const offline = isOfflineFetchError(viewError);
  if (!offline) {
    logger.warn(
      'My Entries served a possibly-stale replica after a non-offline view error',
      'database',
      {
        rows: replica.data.length,
        error: errorMessageOf(viewError),
      }
    );
  }

  logQuery(
    'entries',
    replica.data.length === 0
      ? 'select_user_entries_empty_replica_offline'
      : offline
        ? 'select_user_entries_partial'
        : 'select_user_entries_stale_replica_after_error',
    Date.now() - startTime
  );
  // Unconfirmed by the view, exactly like the empty-view branch above.
  return { ...replica, source: offline ? 'replica-offline' : 'replica-after-error' };
}
