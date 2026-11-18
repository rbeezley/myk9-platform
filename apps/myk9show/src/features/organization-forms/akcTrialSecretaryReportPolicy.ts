import { recordingFeeRateInForce, toCalendarDate, type RecordingFeeRate } from '@myk9/core';
import { isSupersededMoveUpEntry } from '@/features/financial/moneyRoot';
import type { ReportEntry } from '@/lib/reports/types';

// MYK9-2044: the per-entry rate is the AKC row of the dated table in @myk9/core
// (RECORDING_FEE_RATES) in force on the trial date, the same table generate-premium mirrors for
// the premium's recording fee line. Synchronous and in code, so it works offline.
type DateFailureReason = 'missing' | 'invalid' | 'unsupported';

export const AKC_TRIAL_SECRETARY_CANONICAL_FORM = {
  revision: 'JSW001 (11/25)',
  timing:
    'Upon completion of a Scent Work Trial, the Superintendent/Event Secretary shall complete a copy of this form for each event (one event per form) and send it with the marked and signed catalog along with the necessary fees so as to reach the AKC office within seven (7) days after the close of the event.',
  address:
    'The American Kennel Club, Event Operations - Scent Work, PO Box 900051, Raleigh, NC 27675-9051',
} as const;

const AKC_POST_CLOSING_WITHDRAWAL_CODES = new Set(['ais', 'ajc']);

export type AKCTrialSecretaryReportPolicy =
  | {
      ok: true;
      /** `YYYY-MM-DD` the rate in force started on. */
      rateEffectiveFrom: string;
      totalEntries: number;
      excludedRuns: number;
      paidRuns: number;
      feeRate: number;
      formattedRate: string;
      totalFee: number;
      formattedTotal: string;
    }
  | {
      ok: false;
      reason: DateFailureReason;
      recovery: string;
    };

function isExcludedRun(entry: ReportEntry): boolean {
  const resultCode = normalize(entry.resultText);
  if (AKC_POST_CLOSING_WITHDRAWAL_CODES.has(resultCode)) return true;

  const reason = normalize(entry.withdrawalReason);
  return (
    AKC_POST_CLOSING_WITHDRAWAL_CODES.has(reason) ||
    /\bjudge\s+(?:changes?|changed)\b/.test(reason) ||
    /\b(?:bitch|female)\b.*\bin\s+season\b/.test(reason)
  );
}

function normalize(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

function readTrialRate(trialDate: string | null | undefined): RecordingFeeRate | DateFailureReason {
  if (!trialDate?.trim()) return 'missing';

  // A bare calendar date only: a timestamp or an impossible day (2026-02-30) is not a trial date.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trialDate.trim())) return 'invalid';
  const day = toCalendarDate(trialDate);
  if (!day) return 'invalid';

  return recordingFeeRateInForce('AKC', day) ?? 'unsupported';
}

export function resolveAKCTrialSecretaryReportPolicy(
  trialDate: string | null | undefined,
  entries: ReportEntry[]
): AKCTrialSecretaryReportPolicy {
  const rate = readTrialRate(trialDate);
  if (typeof rate === 'string') {
    return {
      ok: false,
      reason: rate,
      recovery:
        rate === 'unsupported'
          ? 'This fee schedule covers events from January 1, 2025 through December 31, 2027. Confirm the AKC rate for this trial date before generating this report.'
          : 'Set a valid trial date before generating this report.',
    };
  }

  // MYK9-639: the superseded half of a move-up is not a run. The dog enters the
  // ring once, in the destination class, and AKC is owed one recording fee for
  // it — counting the vacated source too billed the club $9.00 for one $4.50
  // run. This is NOT the same question as MYK9-317 / MYK9-445 (whether
  // withdrawn / scratched / absent entries are billable), which `isExcludedRun`
  // owns and this change does not touch: those dogs held a real accepted entry,
  // and the pair here is one entry recorded in two rows.
  const countedEntries = entries.filter(entry => !isSupersededMoveUpEntry(entry));
  const totalEntries = countedEntries.length;
  const excludedRuns = countedEntries.filter(isExcludedRun).length;
  const paidRuns = Math.max(0, totalEntries - excludedRuns);
  const feeRate = rate.amountCents / 100;
  // Integer cents, so a run count times a rate never carries float error into the printed total.
  const totalFee = (paidRuns * rate.amountCents) / 100;

  return {
    ok: true,
    rateEffectiveFrom: rate.effectiveFrom,
    totalEntries,
    excludedRuns,
    paidRuns,
    feeRate,
    formattedRate: feeRate.toFixed(2),
    totalFee,
    formattedTotal: totalFee.toFixed(2),
  };
}
