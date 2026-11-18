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

/** What the premium carries: the statement as printed, and the rate behind it. */
export interface PremiumRecordingFee {
  registry: 'AKC';
  amountCents: number;
  /** "AKC recording fee: $5.50 per entry". */
  text: string;
}

/**
 * The recording fee statement for a show, or null: only an AKC show states one, and a show date
 * with no rate in force states none (a rate is never guessed).
 */
export function buildPremiumRecordingFee(
  organization: string | null,
  showDate: string | null | undefined,
  rates: readonly RecordingFeeRate[]
): PremiumRecordingFee | null {
  if (organization !== 'AKC') return null;
  const rate = recordingFeeRateInForce(rates, 'AKC', showDate);
  if (!rate) return null;
  return {
    registry: 'AKC',
    amountCents: rate.amountCents,
    text: `AKC recording fee: $${formatRecordingFeeAmount(rate.amountCents)} per entry`,
  };
}
