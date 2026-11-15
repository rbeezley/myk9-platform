/**
 * The junior handler fee can never be more than the lowest regular fee (MYK9-1975).
 *
 * Checkout charges the lower of the junior fee and the regular fee (`getShowEntryFee`
 * and `private.price_entry_fee`), but the premium and the landing page print the junior
 * fee alone. A junior fee above a regular fee therefore promised an amount checkout
 * would never charge. Show setup now refuses that, here and in the database trigger
 * `trg_shows_junior_fee_within_regular` (migration 20261115172300).
 *
 * "Lowest regular fee" is the lowest price a junior entry's regular fee can be, the
 * second argument of that LEAST:
 *   - the pre-entry fee, when it is set (zero included: zero is a free entry);
 *   - the day-of-show fee, when it is above zero (zero means "no day-of tier");
 *   - each class's own fee, but ONLY when the show has no pre-entry fee, because that
 *     is the only time pricing reads it. The show forms cannot see class fees, so that
 *     case is the database trigger's alone.
 *
 * ASCA has no junior tier (the field is hidden and a save clears it), so it is never
 * checked here.
 */

type FeeInput = string | number | null | undefined;

/** A fee as a number, or null when blank or not a number. Strips `$` and commas. */
function parseFee(value: FeeInput): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === 'number' ? value : parseFloat(value.replace(/[$,]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

const toCents = (dollars: number) => Math.round(dollars * 100);

/**
 * The lowest show-level fee a junior entry could be priced at, or null when the show
 * sets neither tier (then only class fees could apply, which the trigger checks).
 */
export function lowestShowRegularFee(tiers: {
  preEntryFee?: FeeInput;
  dayOfShowFee?: FeeInput;
}): number | null {
  const candidates: number[] = [];
  const pre = parseFee(tiers.preEntryFee);
  if (pre !== null && pre >= 0) candidates.push(pre);
  const dayOf = parseFee(tiers.dayOfShowFee);
  if (dayOf !== null && dayOf > 0) candidates.push(dayOf);
  return candidates.length > 0 ? Math.min(...candidates) : null;
}

/** "$15" for whole dollars, "$15.50" otherwise. The database message uses the same shape. */
export function formatFeeLimit(dollars: number): string {
  const cents = toCents(dollars);
  const whole = cents % 100 === 0;
  return `$${(cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  })}`;
}

export function juniorFeeLimitMessage(limit: number): string {
  return `The junior fee can't be more than ${formatFeeLimit(limit)}, the lowest class fee in this show.`;
}

/**
 * The message that blocks saving, or undefined when the junior fee is within the limit,
 * is blank or zero (no junior tier), or the show is ASCA.
 */
export function juniorFeeLimitError(show: {
  organization?: string | undefined;
  juniorHandlerFee?: FeeInput;
  preEntryFee?: FeeInput;
  dayOfShowFee?: FeeInput;
}): string | undefined {
  if (show.organization === 'ASCA') return undefined;
  const junior = parseFee(show.juniorHandlerFee);
  if (junior === null || junior <= 0) return undefined;
  const limit = lowestShowRegularFee(show);
  if (limit === null) return undefined;
  return toCents(junior) > toCents(limit) ? juniorFeeLimitMessage(limit) : undefined;
}
