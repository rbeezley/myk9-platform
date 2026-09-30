/**
 * The junior handler fee a wizard draft may write (MYK9-662 slice A2).
 *
 * `undefined` means "leave the column alone": no fee entered, a zero fee (NULL and 0 both
 * mean no junior tier, mirroring day_of_show_fee), or an ASCA show, which cannot derive
 * junior status. A draft that switched organization after typing a fee therefore never
 * writes it. Edit mode relies on the same rule: a draft that carries no fee sends no key.
 */
/** Exclusive upper bound; mirrors shows_junior_handler_fee_bounded (< 100000). */
export const JUNIOR_HANDLER_FEE_LIMIT = 100_000;

export function wizardJuniorHandlerFee(show: {
  organization: string;
  juniorHandlerFee?: number | undefined;
}): number | undefined {
  if (show.organization === 'ASCA') return undefined;
  const fee = show.juniorHandlerFee;
  return fee !== undefined && Number.isFinite(fee) && fee > 0 ? fee : undefined;
}

/** Spread into a draft built from a stored show: carries a positive fee, else no key. */
export function seedJuniorHandlerFee(stored: string | undefined): { juniorHandlerFee?: number } {
  const fee = parseFloat(stored ?? '');
  return Number.isFinite(fee) && fee > 0 ? { juniorHandlerFee: fee } : {};
}
