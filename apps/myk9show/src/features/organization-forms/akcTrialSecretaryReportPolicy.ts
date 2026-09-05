import { isNonRunningEntry } from '@/features/_shared/entryAccounting';
import type { ReportEntry } from '@/lib/reports/types';

const FEE_RATE_BY_YEAR = {
  2025: 3.5,
  2026: 4.5,
} as const;

type SupportedFeeYear = keyof typeof FEE_RATE_BY_YEAR;
type DateFailureReason = 'missing' | 'invalid' | 'unsupported';

export const AKC_TRIAL_SECRETARY_CANONICAL_FORM = {
  revision: 'JSW001 (11/25)',
  timing:
    'Upon completion of a Scent Work Trial, the Superintendent/Event Secretary shall complete a copy of this form for each event (one event per form) and send it with the marked and signed catalog along with the necessary fees so as to reach the AKC office within seven (7) days after the close of the event.',
  address:
    'The American Kennel Club, Event Operations - Scent Work, PO Box 900051, Raleigh, NC 27675-9051',
} as const;

const EXCLUDED_RUN_STATUS_CODES = new Set([
  'abs',
  'cancelled',
  'no show',
  'no-show',
  'pulled',
  'scratch',
  'scratched',
  'wd',
  'withdrawn',
]);

export type AKCTrialSecretaryReportPolicy =
  | {
      ok: true;
      feeYear: SupportedFeeYear;
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
  if (isNonRunningEntry({ entryStatus: entry.entryStatus })) return true;

  return [entry.entryStatus, entry.checkInStatus, entry.resultText]
    .map(status => status?.trim().toLowerCase())
    .filter((status): status is string => Boolean(status))
    .some(
      status => EXCLUDED_RUN_STATUS_CODES.has(status) || isNonRunningEntry({ entryStatus: status })
    );
}

function readTrialYear(trialDate: string | null | undefined): SupportedFeeYear | DateFailureReason {
  if (!trialDate?.trim()) return 'missing';

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trialDate.trim());
  if (!match) return 'invalid';

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return 'invalid';
  }

  return year in FEE_RATE_BY_YEAR ? (year as SupportedFeeYear) : 'unsupported';
}

export function resolveAKCTrialSecretaryReportPolicy(
  trialDate: string | null | undefined,
  entries: ReportEntry[]
): AKCTrialSecretaryReportPolicy {
  const feeYear = readTrialYear(trialDate);
  if (typeof feeYear === 'string') {
    return {
      ok: false,
      reason: feeYear,
      recovery:
        feeYear === 'unsupported'
          ? 'This fee schedule covers 2025 and 2026 events only. Confirm the current AKC rate before generating this report.'
          : 'Set a valid trial date before generating this report.',
    };
  }

  const totalEntries = entries.length;
  const excludedRuns = entries.filter(isExcludedRun).length;
  const paidRuns = Math.max(0, totalEntries - excludedRuns);
  const feeRate = FEE_RATE_BY_YEAR[feeYear];
  const totalFee = paidRuns * feeRate;

  return {
    ok: true,
    feeYear,
    totalEntries,
    excludedRuns,
    paidRuns,
    feeRate,
    formattedRate: feeRate.toFixed(2),
    totalFee,
    formattedTotal: totalFee.toFixed(2),
  };
}
