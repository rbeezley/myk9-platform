/**
 * MYK9-2044: the registry recording fee in force on a date.
 *
 * A rate row says "from `effectiveFrom`, this registry charges `amountCents` per entry". The
 * rate in force on a date is the row with the latest `effectiveFrom` on or before it; no such
 * row means no rate, and callers fail closed (the report refuses, the premium prints no line).
 * A rate is never guessed.
 *
 * Dates are calendar dates (`YYYY-MM-DD`) compared as written, with no `Date` and so no
 * timezone shift: a show dated 2027-01-01 is 2027-01-01 everywhere.
 *
 * MIRRORED BY supabase/functions/generate-premium/recordingFeeRate.ts, which cannot import
 * this package. recordingFeeRateParity.test.ts fails if the two drift.
 */

export interface RecordingFeeRate {
  registry: string;
  /** `YYYY-MM-DD`. */
  effectiveFrom: string;
  amountCents: number;
}

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

/** The rate in force for `registry` on `date`, or null when none is. */
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

/** Integer cents as dollars with two decimals, no symbol: 550 -> "5.50". */
export function formatRecordingFeeAmount(amountCents: number): string {
  return (amountCents / 100).toFixed(2);
}
