import type { PaymentMethod } from '@/types/show-registration-types';

/** The show fields that decide whether a junior handler fee can price an entry. */
export interface JuniorFeeShowInfo {
  organization?: string | undefined;
  juniorHandlerFee?: string | undefined;
  /** False when the device never received the show's junior fee column. */
  juniorFeeKnown?: boolean | undefined;
}

/**
 * One rule for the payment step's controls and for submit, so the UI never
 * offers a method that submit then refuses. A staff or desk entry may be
 * priced at the junior fee when the show has a positive fee, or when the
 * device cannot yet tell (an unsynced show). ASCA has no derivable age ceiling,
 * so its handlers never qualify. Exhibitors are priced by the server at
 * checkout, and a waived entry carries no fee.
 */
export function juniorFeeMayApply(
  show: JuniorFeeShowInfo,
  workflowMode: string,
  paymentMethod: PaymentMethod | undefined
): boolean {
  if (workflowMode === 'exhibitor' || paymentMethod === 'waived') return false;
  if (show.organization === 'ASCA') return false;
  return Number(show.juniorHandlerFee) > 0 || show.juniorFeeKnown === false;
}
