/** Copy for "Entry fee for this class" (MYK9-1931), kept beside the field. */

/** The field's hint; `showFee` is the show's pre-entry fee as "$25", or null when it has none. */
export function classEntryFeeHint(showFee: string | null): string {
  return showFee === null
    ? "Leave empty to charge the show's fee."
    : `Leave empty to charge the show's fee (${showFee}).`;
}

/** Shown when the class already has entries: their fee is fixed when they were made. */
export function existingEntriesFeeNote(entryCount: number): string {
  const existing =
    entryCount === 1
      ? '1 existing entry keeps the fee it was charged.'
      : `${entryCount} existing entries keep the fee they were charged.`;
  return `This changes the fee for new entries only. ${existing}`;
}

/** The show's fee field's note when some classes charge their own fee instead (MYK9-1931). */
export function ownFeeClassesNote(count: number): string {
  return count === 1 ? '1 class has its own fee.' : `${count} classes have their own fee.`;
}

/** The show's pre-entry fee as a number, or null when it has none ("" or unreadable). */
export function parseShowFee(value: string | undefined): number | null {
  const fee = parseFloat((value ?? '').replace(/[$,]/g, ''));
  return Number.isFinite(fee) && fee >= 0 ? fee : null;
}
