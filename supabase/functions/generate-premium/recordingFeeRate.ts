/**
 * MYK9-2044: the registry recording fee the premium states (AKC Ch. 3 s.15: "AKC recording fee
 * shall be stated"), from the dated rate list in `registry_recording_fee_rates`.
 *
 * MIRRORS `recordingFeeRateInForce` / `formatRecordingFeeAmount` in
 * packages/core/src/utils/recordingFeeRate.ts, which this function cannot import (it deploys
 * on its own). recordingFeeRate.test.ts replays both over the same dates and fails on drift, so
 * the premium and the Trial Secretary report can never read two different rates.
 */

export interface RecordingFeeRate {
  registry: string;
  /** `YYYY-MM-DD`. */
  effectiveFrom: string;
  amountCents: number;
}

/** The columns read from `registry_recording_fee_rates`. */
export const PREMIUM_RECORDING_FEE_SELECT = 'registry, effective_from, amount_cents';

export interface RecordingFeeRateRow {
  registry: string;
  effective_from: string;
  amount_cents: number;
}

const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})/;

function toCalendarDate(value: string | null | undefined): string | null {
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
  rates: readonly RecordingFeeRate[],
  registry: string,
  date: string | null | undefined
): RecordingFeeRate | null {
  const day = toCalendarDate(date);
  if (!day) return null;
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

export function recordingFeeRatesFromRows(
  rows: readonly RecordingFeeRateRow[]
): RecordingFeeRate[] {
  return rows.map(row => ({
    registry: row.registry,
    effectiveFrom: row.effective_from,
    amountCents: row.amount_cents,
  }));
}

/** What the premium carries: the statement as printed, and the rate or rates behind it. */
export interface PremiumRecordingFee {
  registry: 'AKC';
  /** One entry per distinct rate in force across the show's dates, earliest first. */
  amountsCents: number[];
  /** "AKC recording fee: $5.50 per entry". */
  text: string;
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

function longDate(day: string): string {
  const [year, month, date] = day.split('-').map(Number);
  return `${MONTHS[month - 1]} ${date}, ${year}`;
}

function perEntry(amountCents: number): string {
  return `$${formatRecordingFeeAmount(amountCents)} per entry`;
}

/**
 * The recording fee statement for a show, or null: only an AKC show states one, and a date with
 * no rate in force states none (a rate is never guessed).
 *
 * The Trial Secretary Report bills each trial at the rate in force on that trial's date, so the
 * premium looks up every trial date it is given (the caller passes the non-cancelled trials').
 * One distinct rate prints the one line; two or more print one line naming the date each later
 * rate applies from. With no trial dates, `fallbackDate` (the show's start date) stands in.
 * Any date with no rate in force makes the whole statement null, so a premium never states a
 * fee for part of a show.
 */
export function buildPremiumRecordingFee(
  organization: string | null,
  trialDates: readonly (string | null | undefined)[],
  fallbackDate: string | null | undefined,
  rates: readonly RecordingFeeRate[]
): PremiumRecordingFee | null {
  if (organization !== 'AKC') return null;
  const dates = trialDates.filter((d): d is string => Boolean(d?.trim()));
  const lookups = (dates.length > 0 ? dates : [fallbackDate]).map(date => ({
    day: toCalendarDate(date),
    rate: recordingFeeRateInForce(rates, 'AKC', date),
  }));
  const found: { day: string; rate: RecordingFeeRate }[] = [];
  for (const { day, rate } of lookups) {
    if (!day || !rate) return null;
    found.push({ day, rate });
  }

  const distinct: RecordingFeeRate[] = [];
  for (const { rate } of found.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0))) {
    if (!distinct.some(d => d.effectiveFrom === rate.effectiveFrom)) distinct.push(rate);
  }
  const [first, ...later] = distinct;
  if (!first) return null;
  const parts = [
    perEntry(first.amountCents),
    ...later.map(r => `${perEntry(r.amountCents)} from ${longDate(r.effectiveFrom)}`),
  ];
  return {
    registry: 'AKC',
    amountsCents: distinct.map(r => r.amountCents),
    text: `AKC recording fee: ${parts.join('; ')}`,
  };
}
