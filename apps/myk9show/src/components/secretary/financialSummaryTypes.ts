export interface TrialFinancialEntryRow {
  id: string;
  /**
   * MYK9-639: carried so the superseded half of a move-up can be dropped before
   * anything is summed — the dog runs once, in the destination class.
   */
  entryStatus: string | null;
  /**
   * MYK9-639: set on the DESTINATION of a move-up. The destination holds no
   * money of its own, so `resolveShowFinancialRows` reads this run's fee and
   * payment back off the entry it points at.
   */
  movedFromEntryId?: string | null | undefined;
  handler: string | null;
  dogName: string;
  ownerName: string;
  className: string;
  entryFee: number;
  discountAmount: number;
  promoCode: string | null;
  paymentStatus: string;
  comped: boolean;
  compedReason: string | null;
}

export interface ShowFinancialEntryRow extends TrialFinancialEntryRow {
  trialId: string;
  trialName: string;
}

export interface TrialSubtotal {
  trialId: string;
  trialName: string;
  entryCount: number;
  totalFees: number;
  totalDiscounts: number;
  totalComped: number;
  netAmount: number;
}
