/**
 * MYK9-2044: the registry recording fee in force on a date, from a dated table kept in code.
 *
 * A rate row says "from `effectiveFrom`, this registry charges `amountCents` per entry". The
 * rate in force on a date is the row with the latest `effectiveFrom` on or before it; no such
 * row means no rate, and callers fail closed (the report refuses, the premium prints no line).
 * A rate is never guessed. A new AKC rate is a one-line change to `RECORDING_FEE_RATES`.
 *
 * Dates are calendar dates (`YYYY-MM-DD`) compared as written, with no `Date` arithmetic and so
 * no timezone shift: a show dated 2027-01-01 is 2027-01-01 everywhere.
 *
 * MIRRORED BY supabase/functions/generate-premium/recordingFeeRate.ts, which cannot import
 * this package. supabase/functions/generate-premium/recordingFeeRate.test.ts imports both copies,
 * compares the tables and replays both lookups over the same date grid, so it fails if they drift.
 */

export interface RecordingFeeRate {
  registry: string;
  /** `YYYY-MM-DD`. */
  effectiveFrom: string;
  amountCents: number;
}

/**
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
 */
export const RECORDING_FEE_RATES_KNOWN_THROUGH = '2027-12-31';

const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})/;

/** The leading `YYYY-MM-DD` of a date or timestamp string, or null when it is not a real date. */
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

/**
 * The rate in force for `registry` on `date`, or null when none is, including any date after
 * the table's known coverage. `rates` defaults to the table above; tests pass their own to
 * exercise the rule, and a table of their own has no coverage limit unless they pass one.
 */
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

/** Integer cents as dollars with two decimals, no symbol: 550 -> "5.50". */
export function formatRecordingFeeAmount(amountCents: number): string {
  return (amountCents / 100).toFixed(2);
}
