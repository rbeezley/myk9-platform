/**
 * MYK9-2044: the registry recording fee statement a premium prints (AKC Ch. 3 s.15: "AKC
 * recording fee shall be stated"), canonical copy. generate-premium builds it from the show's
 * live trial dates, and the client builds it again when a published premium is edited and
 * republished without a Regenerate, so the two always state the same line.
 *
 * MIRRORED BY supabase/functions/generate-premium/recordingFeeRate.ts, which cannot import this
 * package. supabase/functions/generate-premium/recordingFeeRate.test.ts builds the statement with
 * both copies over the same date lists, so it fails if they drift.
 */
import {
  formatRecordingFeeAmount,
  RECORDING_FEE_RATES,
  recordingFeeRateInForce,
  toCalendarDate,
  type RecordingFeeRate,
} from './recordingFeeRate';

/** One rate the premium states; `appliesFrom` is null for the first, else its effective date. */
export interface PremiumRecordingFeeRate {
  amountCents: number;
  appliesFrom: string | null;
}

/** What the premium carries: the statement as printed, and the rates behind it, oldest first. */
export interface PremiumRecordingFee {
  registry: 'AKC';
  rates: PremiumRecordingFeeRate[];
  /** "AKC recording fee: $4.50 per entry; $5.50 per entry from January 1, 2027". */
  text: string;
}

/** The trial columns the date rule reads. */
export interface PremiumRecordingFeeTrial {
  date: string | null;
  status?: string | null;
  deleted_at?: string | null;
}

/**
 * A trial the premium prints and prices: not cancelled and not soft-deleted. generate-premium and
 * the client's edit-and-republish path each filter their trials with this once and use the result
 * for both the printed schedule and the recording fee dates, so a cancelled trial is neither
 * advertised nor priced.
 */
export function isLivePremiumTrial(trial: {
  status?: string | null;
  deleted_at?: string | null;
}): boolean {
  return !trial.deleted_at && trial.status !== 'cancelled';
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** "2027-01-01" -> "January 1, 2027", read from the text (no `Date`, so no timezone shift). */
export function formatCalendarDateLong(day: string): string {
  const [year, month, date] = day.split('-');
  return `${MONTHS[Number(month) - 1]} ${Number(date)}, ${year}`;
}

/**
 * The calendar dates the premium prices: each live (not cancelled, not deleted) trial's date,
 * oldest first and once each. A show with no dated trial yet falls back to its start date.
 */
export function premiumRecordingFeeDates(
  trials: readonly PremiumRecordingFeeTrial[] | null | undefined,
  showStartDate: string | null | undefined
): string[] {
  const days = new Set<string>();
  for (const trial of trials ?? []) {
    if (!isLivePremiumTrial(trial)) continue;
    const day = toCalendarDate(trial.date);
    if (day) days.add(day);
  }
  if (days.size > 0) return [...days].sort();
  const start = toCalendarDate(showStartDate);
  return start ? [start] : [];
}

/**
 * The recording fee statement for a show, or null. Only an AKC show states one. The rate in
 * force on every date is looked up; one distinct amount is one rate, and a later different amount
 * is named with the date it applies from. Any date with no rate in force states none at all (a
 * rate is never guessed, and the report refuses that trial too).
 */
export function buildPremiumRecordingFee(
  organization: string | null,
  dates: readonly string[],
  rates: readonly RecordingFeeRate[] = RECORDING_FEE_RATES
): PremiumRecordingFee | null {
  if (organization !== 'AKC' || dates.length === 0) return null;
  const stated: PremiumRecordingFeeRate[] = [];
  for (const date of [...dates].sort()) {
    const rate = recordingFeeRateInForce('AKC', date, rates);
    if (!rate) return null;
    if (stated.at(-1)?.amountCents === rate.amountCents) continue;
    stated.push({
      amountCents: rate.amountCents,
      appliesFrom: stated.length === 0 ? null : rate.effectiveFrom,
    });
  }
  const parts = stated.map(rate => {
    const amount = `$${formatRecordingFeeAmount(rate.amountCents)} per entry`;
    return rate.appliesFrom ? `${amount} from ${formatCalendarDateLong(rate.appliesFrom)}` : amount;
  });
  return { registry: 'AKC', rates: stated, text: `AKC recording fee: ${parts.join('; ')}` };
}
