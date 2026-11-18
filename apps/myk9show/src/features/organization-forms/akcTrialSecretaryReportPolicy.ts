import { recordingFeeRateInForce, toCalendarDate, type RecordingFeeRate } from '@myk9/core';
import { isSupersededMoveUpEntry } from '@/features/financial/moneyRoot';
import type { ReportAsyncData, ReportEntry } from '@/lib/reports/types';

// MYK9-2044: the per-entry rate is the dated AKC row in `registry_recording_fee_rates` in force
// on the trial date (edited by a site admin on /admin/payouts), the same lookup generate-premium
// uses for the premium's recording fee line. Nothing is hardcoded here.
type DateFailureReason = 'missing' | 'invalid' | 'unsupported' | 'rates-unavailable';

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

/**
 * The AKC rate list the host resolved for this report, or null while it is loading or when it
 * could not be read. A list that was read and is empty is `[]`, which is a real answer (no rate
 * is in force), not the same as unread.
 */
export function readAKCRecordingFeeRates(
  rates: ReportAsyncData<RecordingFeeRate[]> | undefined
): RecordingFeeRate[] | null {
  if (!rates || rates.isLoading || rates.isError) return null;
  return rates.data;
}

function readTrialDate(
  trialDate: string | null | undefined
): { day: string } | { reason: 'missing' | 'invalid' } {
  if (!trialDate?.trim()) return { reason: 'missing' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trialDate.trim())) return { reason: 'invalid' };
  const day = toCalendarDate(trialDate);
  return day ? { day } : { reason: 'invalid' };
}

export function resolveAKCTrialSecretaryReportPolicy(
  trialDate: string | null | undefined,
  entries: ReportEntry[],
  rates: readonly RecordingFeeRate[] | null | undefined
): AKCTrialSecretaryReportPolicy {
  const date = readTrialDate(trialDate);
  if ('reason' in date) {
    return {
      ok: false,
      reason: date.reason,
      recovery: 'Set a valid trial date before generating this report.',
    };
  }
  if (!rates) {
    return {
      ok: false,
      reason: 'rates-unavailable',
      recovery:
        'The AKC recording fee schedule could not be loaded. Reconnect and reopen this report.',
    };
  }
  const rate = recordingFeeRateInForce(rates, 'AKC', date.day);
  if (!rate) {
    return {
      ok: false,
      reason: 'unsupported',
      recovery:
        'No AKC recording fee is set for this trial date. A site admin can add the rate on the Payouts page. Confirm the current AKC rate before generating this report.',
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
