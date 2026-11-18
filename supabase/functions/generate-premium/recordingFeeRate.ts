/**
 * MYK9-2044: the registry recording fee the premium states (AKC Ch. 3 s.15: "AKC recording fee
 * shall be stated"), from the dated rate table kept in code.
 *
 * The premium looks the rate up on each of the show's trial dates, the same dates the Trial
 * Secretary Report prices, so the two never disagree: a show whose trials straddle a rate change
 * states both rates.
 *
 * MIRRORS `RECORDING_FEE_RATES` / `toCalendarDate` / `recordingFeeRateInForce` /
 * `formatRecordingFeeAmount` in packages/core/src/utils/recordingFeeRate.ts, which this function
 * cannot import (it deploys on its own). supabase/functions/generate-premium/recordingFeeRate.test.ts
 * imports both copies, compares the tables and replays both lookups over the same date grid, so it
 * fails if they drift. A new rate is added to both tables in the same change.
 */

export interface RecordingFeeRate {
  registry: string;
  /** `YYYY-MM-DD`. */
  effectiveFrom: string;
  amountCents: number;
}

/**
 * MIRRORS `RECORDING_FEE_RATES` in packages/core/src/utils/recordingFeeRate.ts.
 * Source for all three AKC rows: AKC Secretary's Page, September 2025, p. 28 (Board executive
 * session: the event service fee goes from $3.50 to $4.50 per entry on January 1, 2026 and to
 * $5.50 on January 1, 2027).
 */
export const RECORDING_FEE_RATES: readonly RecordingFeeRate[] = [
  { registry: 'AKC', effectiveFrom: '2025-01-01', amountCents: 350 },
  { registry: 'AKC', effectiveFrom: '2026-01-01', amountCents: 450 },
  { registry: 'AKC', effectiveFrom: '2027-01-01', amountCents: 550 },
];

/**
 * The last date the table above is known to cover. AKC has announced rates through 2027 only, so a
 * later date has no rate: the last row is not carried forward. Move this when AKC announces more.
 * MIRRORS the constant of the same name in packages/core/src/utils/recordingFeeRate.ts.
 */
export const RECORDING_FEE_RATES_KNOWN_THROUGH = '2027-12-31';

const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})/;

export function toCalendarDate(value: string | null | undefined): string | null {
  const match = CALENDAR_DATE.exec(value?.trim() ?? '');
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return `${match[1]}-${match[2]}-${match[3]}`;
}

export function recordingFeeRateInForce(
  registry: string,
  date: string | null | undefined,
  rates: readonly RecordingFeeRate[] = RECORDING_FEE_RATES,
  knownThrough: string | null = rates === RECORDING_FEE_RATES
    ? RECORDING_FEE_RATES_KNOWN_THROUGH
    : null
): RecordingFeeRate | null {
  const day = toCalendarDate(date);
  if (!day) return null;
  if (knownThrough !== null && day > knownThrough) return null;
  let inForce: RecordingFeeRate | null = null;
  for (const rate of rates) {
    if (rate.registry !== registry || rate.effectiveFrom > day) continue;
    if (inForce === null || rate.effectiveFrom > inForce.effectiveFrom) inForce = rate;
  }
  return inForce;
}

export function formatRecordingFeeAmount(amountCents: number): string {
  return (amountCents / 100).toFixed(2);
}

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
 * A trial the premium prints and prices: not cancelled and not soft-deleted. generate-premium
 * filters `show.trials` with this once and uses the result for both the printed schedule and the
 * recording fee dates, so a cancelled trial is neither advertised nor priced.
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
