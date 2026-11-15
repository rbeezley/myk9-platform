/**
 * MYK9-1975: a show's junior handler fee can never be above the lowest regular fee.
 *
 * Checkout charges the lower of the junior fee and the class's regular fee
 * (`getShowEntryFee`, `private.price_entry_fee`), while the premium prints the junior
 * fee alone. A junior fee above a regular fee would promise an amount checkout will
 * not charge, so show setup refuses it. The server enforces the same limit
 * (`private.show_lowest_regular_fee`, migration 20261115062527); this is its mirror,
 * so the secretary sees the reason beside the field instead of a failed save.
 *
 * "Lowest regular fee" is the lowest normal fee a junior entry could be priced at:
 * the pre-entry fee when it is set (0 counts), the day-of fee when it is above 0, and
 * each class's own fee only when the show has no pre-entry fee (the only time a class
 * fee is charged).
 */

export interface ShowFeeTiers {
  /** The pre-entry fee as it will be stored; null when there is none. */
  preEntryFee: number | null;
  /** The day-of-show fee; null or 0 is no day-of tier. */
  dayOfShowFee: number | null;
  /** Each live class's own fee. Read only when `preEntryFee` is null. */
  classFees?: readonly number[] | undefined;
}

/** The lowest regular fee, or null when the show has no fee to compare against. */
export function lowestRegularFee(tiers: ShowFeeTiers): number | null {
  const candidates: number[] = [];
  if (tiers.preEntryFee !== null && Number.isFinite(tiers.preEntryFee)) {
    candidates.push(tiers.preEntryFee);
  }
  if (tiers.dayOfShowFee !== null && Number.isFinite(tiers.dayOfShowFee)) {
    if (tiers.dayOfShowFee > 0) candidates.push(tiers.dayOfShowFee);
  }
  if (tiers.preEntryFee === null) {
    candidates.push(...(tiers.classFees ?? []).filter(fee => Number.isFinite(fee)));
  }
  return candidates.length > 0 ? Math.min(...candidates) : null;
}

/** "$15" for whole dollars, "$15.50" otherwise; the server words it the same way. */
export function formatFeeDollars(amount: number): string {
  return `$${amount.toFixed(2).replace(/\.00$/, '')}`;
}

export function juniorFeeLimitMessage(limit: number): string {
  return `The junior fee can't be more than ${formatFeeDollars(limit)}, the lowest class fee in this show.`;
}

/**
 * The message to show when `juniorFee` is above the lowest regular fee, else undefined.
 * A junior fee that is missing, not a number, or 0 is "no junior tier" and is never limited.
 */
export function juniorFeeLimitError(
  juniorFee: number | null | undefined,
  tiers: ShowFeeTiers
): string | undefined {
  if (juniorFee === null || juniorFee === undefined || !Number.isFinite(juniorFee)) {
    return undefined;
  }
  if (juniorFee <= 0) return undefined;
  const limit = lowestRegularFee(tiers);
  return limit !== null && juniorFee > limit ? juniorFeeLimitMessage(limit) : undefined;
}

/** A fee typed into the show edit form: "", "25", "25.50" (a "$" or "," is tolerated). */
function parseFormFee(value: string | undefined): number | null {
  const fee = parseFloat((value ?? '').replace(/[$,]/g, ''));
  return Number.isFinite(fee) ? fee : null;
}

/** The fees as the show edit form holds them, typed or as it was opened with. */
export interface ShowFormFees {
  preEntryFee?: string | undefined;
  dayOfShowFee?: string | undefined;
  juniorHandlerFee?: string | undefined;
}

/** The three fees as the save stores them; see `showFormJuniorFeeLimitError`. */
function storedFormFees(fees: ShowFormFees) {
  return {
    junior: parseFormFee(fees.juniorHandlerFee?.trim()),
    preEntry: parseFormFee(fees.preEntryFee) || null,
    dayOfShow: parseFormFee(fees.dayOfShowFee),
  };
}

/**
 * The show edit form's check (the Fees tab). Reads the fees the way the save stores them:
 * a pre-entry fee of 0 or blank is saved as no pre-entry fee (`mapShowInputToUpdate`), and
 * ASCA has no junior tier (the field is hidden and the save clears it).
 *
 * Like the server trigger, it refuses only a save that changes the junior, pre-entry or
 * day-of fee from the values the form opened with (`feesAsOpened`): a show saved before the
 * limit with a junior fee already above it can still be renamed.
 *
 * Class fees come from the trials the form was opened with, when they were loaded. They are
 * the limit only with no pre-entry fee, and then a class with no fee counts as $0, which is
 * what checkout charges for it (the class read already maps a missing fee to 0). The
 * server is the full check.
 */
export function showFormJuniorFeeLimitError(
  form: ShowFormFees & {
    organization?: string | undefined;
    feesAsOpened?: ShowFormFees | undefined;
    trials?:
      readonly { classes?: readonly { entryFee?: number | undefined }[] | undefined }[] | undefined;
  }
): string | undefined {
  if (form.organization === 'ASCA') return undefined;
  const now = storedFormFees(form);
  if (form.feesAsOpened) {
    const opened = storedFormFees(form.feesAsOpened);
    if (
      now.junior === opened.junior &&
      now.preEntry === opened.preEntry &&
      now.dayOfShow === opened.dayOfShow
    ) {
      return undefined;
    }
  }
  const classFees = (form.trials ?? []).flatMap(trial =>
    (trial.classes ?? []).map(cls => cls.entryFee ?? 0)
  );
  return juniorFeeLimitError(now.junior, {
    preEntryFee: now.preEntry,
    dayOfShowFee: now.dayOfShow,
    classFees,
  });
}
