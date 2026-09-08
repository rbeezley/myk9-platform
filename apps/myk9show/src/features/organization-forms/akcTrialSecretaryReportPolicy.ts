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

const AKC_POST_CLOSING_WITHDRAWAL_CODES = new Set(['ais', 'ajc']);

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
