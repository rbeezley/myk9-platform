import { PENDING_NOT_RUNNING_LABEL } from './types.ts';

/**
 * MYK9-2387: the one rule for which entries a class's paper sheets list and which of those run.
 *
 * Pure and import-free (beyond a constant), so the app and a Deno edge function read the same
 * file (the edge input builder adopts it in MYK9-2389). The status words and aliases below mirror
 * `getEntryStatusKind` / `getStatusLabel` in the app and `notRunningReasonOf` in Ringside's
 * `runQueue.ts`; `apps/myk9show/src/lib/reports/sheetEntryRule.test.ts` fails when either side drifts.
 *
 * Precedence for a dog that will not run: withdrawn, then absent, then pulled (scratched or a
 * check-in `pulled`), then Pending. A lifecycle or recorded-result `withdrawn` / `absent` wins
 * over a check-in `pulled`, as in `notRunningReasonOf`. A declined (rejected) entry and the
 * source half of a move-up are not listed at all.
 */
export interface SheetEntryStateInput {
  entryStatus?: string | null | undefined;
  checkInStatus?: string | null | undefined;
  /** The recorded result (`result_status` / the report entry's `resultText`). */
  resultStatus?: string | null | undefined;
}

export interface SheetEntryState {
  /** On the check-in sheet (running or not). */
  listed: boolean;
  /** The status the sheet prints for a listed dog that will not run; null when it runs. */
  notRunningLabel: string | null;
  /**
   * Whether the entry catalog lists it: decided on the lifecycle and check-in status alone (a
   * runner or a Pending dog), as before MYK9-2387. A result recorded as absent or withdrawn
   * changes the sheet label, not the catalog.
   */
  inCatalog: boolean;
}

const WITHDRAWN_STATUSES: ReadonlySet<string> = new Set(['withdrawn', 'cancelled']);
// `paid` (taken but not yet confirmed) and `promotion-expired` stay in the pending bucket by owner
// decision, as the secretary's `isPendingEntryStatus` has them.
const NOT_ACCEPTED_STATUSES: ReadonlySet<string> = new Set(['not_accepted', 'rejected']);
const PENDING_STATUSES: ReadonlySet<string> = new Set([
  'submitted',
  'pending',
  'draft',
  'no-status',
  'pending-payment',
  'paid',
  'promotion-expired',
]);

export const SHEET_WITHDRAWN_LABEL = 'Withdrawn';
export const SHEET_ABSENT_LABEL = 'Absent';
/** Stored `scratched`, printed "Pulled": the same act, one word (MYK9-632). */
export const SHEET_PULLED_LABEL = 'Pulled';

function norm(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

function lifecycleLabel(status: string, checkIn: string): string | null {
  if (WITHDRAWN_STATUSES.has(status)) return SHEET_WITHDRAWN_LABEL;
  if (status === 'absent') return SHEET_ABSENT_LABEL;
  if (status === 'scratched' || checkIn === 'pulled') return SHEET_PULLED_LABEL;
  if (PENDING_STATUSES.has(status)) return PENDING_NOT_RUNNING_LABEL;
  return null;
}

export function sheetEntryState(input: SheetEntryStateInput): SheetEntryState {
  // The raw value is matched exactly in the app's classifier; a trimmed, lowercased match is a
  // superset that only differs for odd casing, which the database never stores.
  const status = norm(input.entryStatus);
  const checkIn = norm(input.checkInStatus);
  const result = norm(input.resultStatus);

  if (status === 'moved' || NOT_ACCEPTED_STATUSES.has(status)) {
    return { listed: false, notRunningLabel: null, inCatalog: false };
  }
  const fromLifecycle = lifecycleLabel(status, checkIn);
  const inCatalog = fromLifecycle === null || fromLifecycle === PENDING_NOT_RUNNING_LABEL;
  // Precedence: withdrawn, then absent, then pulled, then Pending; a recorded result counts as the
  // lifecycle word, and a lifecycle withdrawn or absent beats a check-in pull.
  let label = fromLifecycle;
  if (result === 'withdrawn' && label !== SHEET_WITHDRAWN_LABEL) label = SHEET_WITHDRAWN_LABEL;
  else if (result === 'absent' && label !== SHEET_WITHDRAWN_LABEL) label = SHEET_ABSENT_LABEL;
  return { listed: true, notRunningLabel: label, inCatalog };
}
