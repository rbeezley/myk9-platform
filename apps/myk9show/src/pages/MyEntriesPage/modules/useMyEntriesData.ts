/**
 * Data hook for MyEntriesPage
 * Handles fetching, transformation, and real-time updates
 * @module MyEntriesPage/hooks
 */

import { useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useCurrentUserPersonId } from '@/hooks/useRoleBasedData';
import {
  accountEntriesQueryKey,
  useAccountEntries,
  type AccountEntriesRead,
} from '@/hooks/queries/useAccountEntries';
import { deriveEntriesIdentityState, type EntriesIdentityState } from './entriesIdentityState';
import { auditService } from '@/services/AuditService';
import { AuditAction } from '@/types/audit-types';
import { CheckInStatus } from '@/types/check-in-types';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import { logger } from '@/services/LoggingService';
import {
  mapEntryStatus,
  mapPaymentStatus,
  mapClassEntryStatus,
} from '@/utils/entryManagementUtils';
import { resolveEffectivePaymentStatus } from '@/utils/effectivePaymentStatus';
import {
  mapEntryRowToBalanceSource,
  summarizeEntryBalances,
  type EntryBalanceRawRow,
  type EntryBalanceSummary,
} from '@/features/payments/entryBalanceSummary';
import { resolveTrialTimezone, type EntryRowTrial } from './entryRowTrial';
import { parseShowDate } from './myEntriesStats.helpers';
import { normalizeCheckInStatus } from './myEntriesUtils';
import { groupEntriesByOrder } from './groupEntriesByOrder';
import type { MyEntry, EntryClass } from './my-entries-types';
import {
  getEntryStatusKindForDisplay,
  type EntryStatusKind,
} from '@/services/entryDisplay/entryDisplaySelectors';

interface UseMyEntriesDataReturn {
  entries: MyEntry[];
  /**
   * Amount-due summary computed from the same RAW, ungrouped per-class rows
   * (via `mapEntryRowToBalanceSource` + `summarizeEntryBalances`) that My
   * Payments uses — not from the grouped `entries` cards above. Grouping
   * cards by order/dog (see `groupEntriesByOrder`) is lossy for money math:
   * it only keeps the first row's `payment_status` per order, so a
   * registration-less order whose class rows have different payment
   * statuses would otherwise show a different amount due here than on My
   * Payments. See `exhibitor-money-clarity` spec + `crossSurfaceAmountDue.test.ts`.
   */
  balanceSummary: EntryBalanceSummary;
  /**
   * The rows on screen came from the per-show replication snapshot without the
   * authoritative account view confirming them — it failed, timed out, or came
   * back empty against a populated snapshot (MYK9-563 item 2). `getUserEntries`
   * returns `error: null` on those paths because the rows ARE real, so this is
   * the only signal the page has that a hard-deleted entry may still be sitting
   * in the list and its fee in the amount due. The fee strip withholds a zero
   * figure and labels a non-zero one; see `CompactStatsRow`.
   */
  degraded: boolean;
  /**
   * Whether we know which person these entries belong to. `unresolved` is a
   * real state, distinct from "no entries": the `people` lookup pauses
   * offline, so an empty list under an unresolved identity proves nothing.
   */
  identityState: EntriesIdentityState;
  isLoading: boolean;
  isError: boolean;
  refreshing: boolean;
  refreshEntries: () => Promise<void>;
  updateEntryCheckIn: (
    entryId: string,
    classId: string,
    status: CheckInStatus,
    notes?: string
  ) => Promise<void>;
}

interface PersistCheckInStatusInput {
  entryId: string;
  classId: string;
  newStatus: CheckInStatus;
}

interface UseMyEntriesDataOptions {
  persistCheckInStatus: (input: PersistCheckInStatusInput) => Promise<unknown>;
}

type OwnEntryResultRow = Record<string, unknown> & {
  class_results_released_at?: string | null;
  dog_image_url?: string | null;
  deleted_at?: string | null;
  refund_amount?: number | null;
  refunded_at?: string | null;
  /** Present on BOTH read paths (USER_ENTRIES_SELECT and the replication mapper). */
  show_id?: string | null;
};

/**
 * Keep the historical financial record for a deleted show, but do not expose
 * an individually removed entry as if it were still active. The show
 * tombstone is carried by the nested show relation on the online path and by
 * the replicated show mapper when that relation is available.
 */
export function shouldRenderOwnEntry(row: OwnEntryResultRow): boolean {
  if (!row.deleted_at) return true;
  const show = row.show as { deleted_at?: string | null } | null | undefined;
  return Boolean(show?.deleted_at);
}

function getOwnEntryStatusKind(
  rawStatus: string | null | undefined,
  rawCheckInStatus: string | null | undefined,
  isShowCancelled: boolean
): EntryStatusKind {
  return isShowCancelled ? 'withdrawn' : getEntryStatusKindForDisplay(rawStatus, rawCheckInStatus);
}

function getOwnEntryPaymentStatus(
  entry: OwnEntryResultRow,
  registrationPaymentStatus: string | null | undefined,
  isShowCancelled: boolean
) {
  // The card badge reads from the same rule as the balance: an order's `paid`
  // may not mask an entry that is still `pending` (MYK9-495), or the card says
  // "Paid" over live debt. A cancelled show still reads the entry row alone —
  // the refund reconciliation below owns that case.
  const rowStatus = entry.payment_status as string | null | undefined;
  const status = isShowCancelled
    ? mapPaymentStatus(rowStatus as string)
    : (resolveEffectivePaymentStatus(
        rowStatus != null ? mapPaymentStatus(rowStatus) : null,
        registrationPaymentStatus != null ? mapPaymentStatus(registrationPaymentStatus) : null
      ) ?? PaymentStatus.PENDING);
  const refundAmount = Number(entry.refund_amount ?? 0);
  const entryFee = Number(entry.entry_fee ?? 0);
  if (
    isShowCancelled &&
    refundAmount > 0 &&
    status !== PaymentStatus.REFUNDED &&
    status !== PaymentStatus.PARTIAL_REFUND
  ) {
    return refundAmount >= entryFee ? PaymentStatus.REFUNDED : PaymentStatus.PARTIAL_REFUND;
  }
  return status;
}

/**
 * Hook for managing user entries data
 * Handles loading, real-time updates, and check-in status changes
 */
/** Stable empty values, so a re-render never hands the page a new array. */
const EMPTY_ENTRIES: MyEntry[] = [];
const EMPTY_BALANCE_SUMMARY: EntryBalanceSummary = summarizeEntryBalances([]);

/**
 * Project the shared account read into what My Shows renders.
 *
 * Module-level and therefore stable, which is what React Query needs of a
 * `select` — an inline one re-runs on every render and re-projects every row.
 */
function selectMyEntriesData(read: AccountEntriesRead): {
  entries: MyEntry[];
  balanceSummary: EntryBalanceSummary;
  degraded: boolean;
} {
  const rawRows = (read.rows as OwnEntryResultRow[]).filter(shouldRenderOwnEntry);
  return {
    entries: groupEntriesByOrder(rawRows.map(transformEntry)),
    // Money math runs on the same raw, ungrouped rows My Payments uses —
    // see the `balanceSummary` doc comment on the return type.
    balanceSummary: summarizeEntryBalances(
      rawRows.map(row => mapEntryRowToBalanceSource(row as EntryBalanceRawRow))
    ),
    degraded: read.degraded,
  };
}

/**
 * One raw account-read row -> one MyEntry card row.
 *
 * Module-level and pure. It used to be a `useCallback` with `[]` deps inside
 * the hook, which is the same thing said less clearly; lifting it lets the
 * shared account read project through it in a stable React Query `select`.
 */
function transformEntry(entry: OwnEntryResultRow): MyEntry {
  // Type assertions for nested objects
  const dog = entry.dog as { id: string; name: string; call_name?: string } | null;
  const show = entry.show as {
    id: string;
    name: string;
    start_date: string;
    end_date?: string | null;
    deleted_at?: string | null;
    entry_close_date?: string | null;
    venue_name?: string;
    city?: string;
    state?: string;
  } | null;
  // Each entry row from getUserEntries represents one dog in one class.
  // The class data is available via the `class` join (class:class_id).
  const classData = entry.class as {
    id: string;
    name: string;
    class_number?: string;
    trial?: EntryRowTrial | null;
  } | null;
  // Discipline gates the jump-height field. Prefer entries.trial_id, but fall
  // back through class.trial_id so legacy entries with NULL trial_id still work.
  const trialData = entry.trial as EntryRowTrial | null;
  const armband = entry.armband ? String(entry.armband) : undefined;
  // Per-ROW payment facts, carried onto the class row so the grouped card can
  // reconcile money across rows instead of inheriting the first row's status
  // (exhibitor-money-clarity). Mirrors mapEntryRowToBalanceSource's
  // registration-overrides-row precedence.
  const rowRegistration = entry.registration as {
    id?: string;
    confirmation_number?: string;
    payment_status?: string | null;
  } | null;
  const rowPaymentMethod = (entry.payment_method as string | null) ?? null;
  const trialDate = parseShowDate(trialData?.date ?? classData?.trial?.date);
  const trialNumber = trialData?.trial_number ?? classData?.trial?.trial_number ?? undefined;
  const trialTimezone = resolveTrialTimezone(trialData, classData?.trial);
  const rawEntryStatus = entry.entry_status as string | null | undefined;
  const isShowCancelled = Boolean(show?.deleted_at);
  const rowPaymentStatus = getOwnEntryPaymentStatus(
    entry,
    rowRegistration?.payment_status,
    isShowCancelled
  );
  const entryStatusKind = getOwnEntryStatusKind(
    rawEntryStatus,
    entry.check_in_status as string | null | undefined,
    isShowCancelled
  );

  // Build a single-element classes array from this entry row's own data.
  // The `class:class_id` join can be unresolved during the partial-
  // replication window (the entry row synced before its class relation),
  // but the row's own fee/status/payment fields are still real — dropping
  // the row here (an empty `classes` array) is what let a mixed order's
  // balance undercount the raw-row `balanceSummary` used elsewhere on this
  // page. Emit the row with placeholder class-identity fields instead so
  // its money still flows into `groupEntriesByOrder` / `buildOrderBalance`.
  const classes: EntryClass[] = [
    {
      id: entry.id as string,
      entryStatus: mapEntryStatus(entry.entry_status as string),
      entryStatusKind,
      classId: classData?.id,
      // Money flows through even when the class join hasn't replicated yet,
      // but class-scoped actions (check-in) must not — see EntryClass.unresolved.
      unresolved: !classData,
      name: classData?.name || 'Unknown Class',
      number: classData?.class_number || '',
      fee: (entry.entry_fee as number) || 0,
      trialDate,
      trialNumber,
      trialTimezone,
      jumpHeight: (entry.jump_height as string) || undefined,
      trialType: trialData?.trial_type || classData?.trial?.trial_type || undefined,
      runOrder: (entry.run_order as number) || undefined,
      status: mapClassEntryStatus(entry.entry_status as string),
      handler: (entry.handler as string) || undefined,
      paymentStatus: rowPaymentStatus,
      paymentMethod: rowPaymentMethod,
      // Read the persisted check-in status instead of hardcoding undefined,
      // or the card always shows "Not Checked In" even after a check-in.
      checkInStatus: normalizeCheckInStatus(entry.check_in_status),
      // Written only by the optimistic check-in (the view carries no such
      // column), so this stays undefined on every server-sourced row — exactly
      // as it was when the card was local state.
      ...(entry.check_in_time ? { checkInTime: new Date(entry.check_in_time as string) } : {}),
      isScored: (entry.is_scored as boolean) || false,
      resultStatus: (entry.result_status as EntryClass['resultStatus']) ?? undefined,
      searchTimeSeconds: (entry.search_time_seconds as number) ?? undefined,
      totalFaults: (entry.total_faults as number) ?? undefined,
      finalPlacement: (entry.final_placement as number) ?? undefined,
      resultsReleasedAt: (entry.class_results_released_at as string | null) ?? undefined,
      dogImageUrl: (entry.dog_image_url as string | null) ?? undefined,
    },
  ];

  const entryStatus = isShowCancelled
    ? EntryStatus.CANCELLED
    : mapEntryStatus(entry.entry_status as string);
  // The joined registration's number, or nothing. The id-slice stand-in that
  // used to fill this gap looks exactly like a confirmation number, matches
  // no order the club can look up, and is not what the exhibitor was emailed
  // — and because it was applied HERE, the `?? slice` guards downstream could
  // never fire (MYK9-563 item 6). Secretary and mail-in entries legitimately
  // have no online registration; so does a replica read that lost the
  // enrichment.
  const confirmationNumber = rowRegistration?.confirmation_number;

  return {
    id: entry.id as string,
    // Preserve genuine nullness (secretary/mail-in entries have no online
    // registration) — groupEntriesByOrder falls back to a show+dog key for
    // these instead of merging them under a synthetic per-row id.
    registrationId: (entry.registration_id as string | null) ?? null,
    // The show RELATION can be unresolved during the partial-replication
    // window while the row's own `show_id` is already present — prefer it, or
    // every show-scoped action (payment cart, show link) loses its target.
    showId: show?.id || entry.show_id || '',
    showName: show?.name || 'Unknown Show',
    isShowCancelled,
    // Date-only DB columns ("YYYY-MM-DD") must be read as local days, not UTC,
    // or a show ending today is misread as yesterday (see parseShowDate).
    showDate: parseShowDate(show?.start_date) ?? new Date(),
    showEndDate: parseShowDate(show?.end_date),
    location: {
      venue: show?.venue_name || '',
      city: show?.city || '',
      state: show?.state || '',
    },
    dogName: dog?.call_name || dog?.name || 'Unknown Dog',
    dogId: dog?.id || '',
    armband,
    classes,
    // Rebuilt by groupEntriesByOrder from the top-level dog fields above —
    // this raw per-class-row shape never renders directly.
    dogs: [],
    totalFee: (entry.entry_fee as number) || 0,
    entryStatus,
    entryStatusKind,
    paymentStatus: rowPaymentStatus,
    paymentMethod: rowPaymentMethod,
    refundAmount: entry.refund_amount == null ? null : Number(entry.refund_amount),
    refundedAt: entry.refunded_at ? new Date(entry.refunded_at) : undefined,
    confirmationNumber,
    // A DATE column, not an instant: `new Date()` here read the midnight-UTC
    // round-trip as the previous evening (MYK9-384 / E28).
    entryCloseDate: parseShowDate(show?.entry_close_date),
    submittedAt: new Date((entry.submitted_at as string) || (entry.created_at as string)),
    lastUpdated: new Date(entry.updated_at as string),
  };
}

export function useMyEntriesData({
  persistCheckInStatus,
}: UseMyEntriesDataOptions): UseMyEntriesDataReturn {
  const { user, userWithRoles, loading: authLoading } = useAuthContext();
  const legacyPersonId = useCurrentUserPersonId();
  const personId = legacyPersonId ?? userWithRoles?.databaseUserId ?? null;
  const queryClient = useQueryClient();
  // Whether we know WHO these entries belong to. The page gates its first-run
  // claim on this: `entries: []` from an unresolved identity is an absence of
  // knowledge, not an absence of entries (see entriesIdentityState).
  const identityState = deriveEntriesIdentityState({
    authLoading,
    hasUser: Boolean(user?.id),
    personId,
  });

  // The SAME cache entry the ringside chooser, the Browse Shows "entered" tab
  // and My Payments read (MYK9-563 item 3). This hook used to call
  // `getUserEntries` itself, which meant My Shows paid a second full paged read
  // of `view_authenticated_entry_results` and carried its own `degraded` flag
  // that could disagree with the one My Payments was showing for the same rows.
  //
  // Identity changes are handled by the key rather than by hand: `personId` is
  // part of it, so signing in as someone else reads a different cache entry and
  // can never render the previous account's dogs, shows or balance. A FAILED
  // refetch of the same key keeps the last successful data, which is the
  // INTENT the old manual machinery existed to preserve — "Your saved
  // information is still here" has to stay literally true.
  const { data, isLoading, isError, isRefetching, refetch } = useAccountEntries(
    personId,
    selectMyEntriesData,
    { enabled: Boolean(user?.id) }
  );

  const entries = data?.entries ?? EMPTY_ENTRIES;
  const balanceSummary = data?.balanceSummary ?? EMPTY_BALANCE_SUMMARY;
  const degraded = data?.degraded ?? false;

  useEffect(() => {
    auditService.log({
      action: AuditAction.READ,
      entityType: 'my_entries',
      entityId: user?.id || 'unknown',
      metadata: {
        page: 'my_entries',
        loadTime: new Date().toISOString(),
      },
    });
  }, [user?.id]);

  /**
   * Refreshes entries data.
   */
  const refreshEntries = useCallback(async () => {
    await refetch();
  }, [refetch]);

  /**
   * Rewrite the shared cache entry's RAW rows in place.
   *
   * The optimistic check-in edits the row the account read returned, not the
   * projected card, so every consumer of the shared key sees the same value and
   * `select` recomputes the card from it. Returns the rows as they were, for
   * the revert.
   */
  const patchCachedRow = useCallback(
    (rowId: string, patch: Record<string, unknown>): Record<string, unknown> | null => {
      const key = accountEntriesQueryKey(user?.id, personId);
      const current = queryClient.getQueryData<AccountEntriesRead>(key);
      const target = current?.rows.find(row => (row as { id?: string }).id === rowId) as
        Record<string, unknown> | undefined;
      if (!current || !target) return null;

      // Captured from the ROW, not from the projected card: reverting to the
      // card's normalized enum would write a display value back onto a raw row
      // and change what the next projection reads.
      const previousValues = Object.fromEntries(
        Object.keys(patch).map(field => [field, target[field]])
      );

      queryClient.setQueryData<AccountEntriesRead>(key, {
        ...current,
        rows: current.rows.map(row =>
          (row as { id?: string }).id === rowId ? { ...row, ...patch } : row
        ),
      });
      return previousValues;
    },
    [queryClient, user?.id, personId]
  );

  const updateEntryCheckIn = useCallback(
    async (entryId: string, classId: string, status: CheckInStatus, notes?: string) => {
      // After grouping, entry.id is the first class row's id and may differ from
      // classId. Find the grouped card that contains the target class instead.
      const entry = entries.find(e => e.id === entryId || e.classes.some(c => c.id === classId));
      const classEntry = entry?.classes.find(c => c.id === classId);

      if (!entry || !classEntry) return;

      const previousStatus = classEntry.checkInStatus;

      // Optimistic update, written to the RAW row in the shared cache entry
      // rather than to this hook's projection, so every consumer of the account
      // read sees it and `select` recomputes the card from it. `classId` IS the
      // individual entry row's id (see the DB target below).
      //
      // Outside the `try` on purpose: the revert needs this return value, and a
      // `let` reassigned across try/catch is what the React Compiler cannot
      // memoize through.
      const previousRowValues = patchCachedRow(classId, {
        check_in_status: status,
        check_in_time: new Date().toISOString(),
      });

      // `.catch()` rather than try/catch: the React Compiler cannot preserve a
      // `useCallback`'s memoization across a try block that calls into the
      // query cache, and an unmemoized handler here would change identity on
      // every render of the card list.
      //
      // classId is the individual entry row id — use it as the DB target so
      // grouped cards with multiple classes update the right row.
      await persistCheckInStatus({ entryId: classId, classId, newStatus: status }).catch(
        (error: unknown) => {
          logger.error('Failed to update check-in status:', 'pages', {}, error as Error);
          // Revert to the ROW's own values, captured by the patch above.
          // Reverting to the card's `checkInStatus` would write a normalized
          // display enum back onto a raw row.
          if (previousRowValues) patchCachedRow(classId, previousRowValues);
          throw error;
        }
      );

      // Log the check-in status change
      auditService.log({
        action: AuditAction.UPDATE,
        entityType: 'class_entry',
        entityId: classId,
        changes: {
          checkInStatus: { from: previousStatus || 'no-status', to: status },
        },
        metadata: {
          action: 'exhibitor_check_in',
          userId: user?.id,
          entryId,
          dogName: entry.dogName,
          className: classEntry.name,
          notes,
        },
      });
    },
    [entries, patchCachedRow, persistCheckInStatus, user?.id]
  );

  return {
    entries,
    balanceSummary,
    degraded,
    identityState,
    // Never loading without an identity to load for: a disabled query reports
    // isLoading forever, and the page would spin instead of showing its
    // identity-pending card.
    isLoading: Boolean(user?.id) && isLoading,
    isError: Boolean(user?.id) && isError,
    refreshing: isRefetching,
    refreshEntries,
    updateEntryCheckIn,
  };
}
