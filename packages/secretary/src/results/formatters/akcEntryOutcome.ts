// packages/secretary/src/results/formatters/akcEntryOutcome.ts
//
// Classifies one entry into the single outcome AKC's electres schema records
// for it. Both the per-dog `actionCode`/`resultCode` pair and the per-class
// tallies (`numWithdrawals` / `numStarters` / `numQualifying`) are derived from
// this one classification, so a dog can never be counted as, say, a starter in
// the header while being reported absent in its own row.
//
// MYK9-323 — the vocabulary below is the one the DATABASE actually stores,
// verified against the applied CHECK constraints on `public.entries`:
//
//   entry_status     no-status | draft | submitted | paid | confirmed |
//                    checked-in | at-gate | in-ring | competing | completed |
//                    withdrawn | scratched | absent | moved | not_accepted |
//                    pending-payment | promotion-expired | scratch-requested |
//                    scratch_requested | move-up-requested | move_up_requested
//   check_in_status  no-status | checked-in | conflict | pulled | at-gate |
//                    come-to-gate | in-ring | completed
//   result_status    pending | qualified | nq | absent | excused | withdrawn
//
// The previous mapping tested `resultStatus === 'Q'`, `resultStatus ===
// 'disqualified'` and `checkInStatus === 'absent'`. None of those three values
// can exist in any of those columns, so all three branches were unreachable:
// every qualifying dog that had not been placed 1st-4th fell through to the
// final `NQ` fallback and was submitted to AKC as a non-qualifying run.

import type { AKCSubmissionEntry } from '../types';

/**
 * What AKC records for a dog. `unscored` is not an AKC outcome — it means the
 * secretary has not entered a result yet, and callers must block submission on
 * it rather than let it reach the file. See `countUnscoredAKCEntries`.
 */
export type AKCEntryOutcome =
  | 'withdrawn'
  | 'absent'
  | 'excused'
  | 'placed'
  | 'qualified'
  | 'not-qualified'
  | 'unscored';

/** Case- and separator-insensitive read of a free-text status column. */
function norm(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/_/g, '-');
}

// A dog pulled from the running order before the class, or whose entry was
// withdrawn/scratched, is reported to AKC as withheld. `scratch-requested` is
// deliberately absent: a request is not a scratch until a secretary acts on it.
const WITHDRAWN_ENTRY_STATUSES = new Set(['withdrawn', 'scratched']);

/**
 * Classify one entry. Order matters: a dog that never ran cannot also carry a
 * placement, and the terminal lifecycle states outrank whatever result_status
 * happens to be sitting on the row.
 */
export function classifyAKCEntryOutcome(entry: AKCSubmissionEntry): AKCEntryOutcome {
  const result = norm(entry.resultStatus);
  const entryStatus = norm(entry.entryStatus);
  const checkIn = norm(entry.checkInStatus);

  if (result === 'withdrawn' || WITHDRAWN_ENTRY_STATUSES.has(entryStatus)) return 'withdrawn';

  // Absence reaches us three ways depending on where it was recorded: the
  // judge's result sheet (`result_status`), the entry lifecycle
  // (`entry_status`), or the gate steward pulling the dog (`check_in_status`,
  // whose value for this is 'pulled' — there has never been an 'absent' one).
  if (result === 'absent' || entryStatus === 'absent' || checkIn === 'pulled') return 'absent';

  if (result === 'excused') return 'excused';

  if (result === 'qualified') {
    return entry.finalPlacement != null && entry.finalPlacement >= 1 && entry.finalPlacement <= 4
      ? 'placed'
      : 'qualified';
  }

  if (result === 'nq') return 'not-qualified';

  // 'pending' (the column default) and NULL both mean "no result entered yet".
  return 'unscored';
}

/**
 * AKC action/result code pair for an outcome.
 *
 * `unscored` maps to CNT/NQ as a last resort so a dog is never silently
 * dropped from a file AKC expects to account for every entry — but callers
 * must not let it get that far: `countUnscoredAKCEntries` exists so the
 * submission page can block sending until every dog has a real result.
 */
export function akcResultCodesForOutcome(
  outcome: AKCEntryOutcome,
  finalPlacement: number | null
): { actionCode: string; resultCode: string } {
  switch (outcome) {
    case 'withdrawn':
      return { actionCode: 'WHLD', resultCode: 'EXO' };
    case 'absent':
      return { actionCode: 'ABSN', resultCode: 'A' };
    case 'excused':
      return { actionCode: 'EXCU', resultCode: 'EXO' };
    case 'placed':
      return { actionCode: 'PLAC', resultCode: String(finalPlacement) };
    case 'qualified':
      return { actionCode: 'CNT', resultCode: 'Q' };
    case 'not-qualified':
    case 'unscored':
      return { actionCode: 'CNT', resultCode: 'NQ' };
  }
}

/** Outcomes AKC counts as a qualifying run for the class header. */
const QUALIFYING_OUTCOMES = new Set<AKCEntryOutcome>(['qualified', 'placed']);

export interface AKCClassTallies {
  numEntries: number;
  numStarters: number;
  numQualifying: number;
  numWithdrawals: number;
}

/** Per-class header counts, derived from the same classification as each row. */
export function tallyAKCClass(entries: AKCSubmissionEntry[]): AKCClassTallies {
  let numWithdrawals = 0;
  let numAbsent = 0;
  let numQualifying = 0;

  for (const entry of entries) {
    const outcome = classifyAKCEntryOutcome(entry);
    if (outcome === 'withdrawn') numWithdrawals += 1;
    else if (outcome === 'absent') numAbsent += 1;
    if (QUALIFYING_OUTCOMES.has(outcome)) numQualifying += 1;
  }

  const numEntries = entries.length - numWithdrawals;
  return {
    numEntries,
    // A withdrawn dog is already out of numEntries, so absences are only ever
    // subtracted once — the classification is exclusive between the two.
    numStarters: numEntries - numAbsent,
    numQualifying,
    numWithdrawals,
  };
}

/**
 * How many entries carry no result yet. A non-zero count means the file would
 * report real dogs to AKC as NQ purely because nobody has scored them.
 */
export function countUnscoredAKCEntries(entries: AKCSubmissionEntry[]): number {
  return entries.filter(entry => classifyAKCEntryOutcome(entry) === 'unscored').length;
}
