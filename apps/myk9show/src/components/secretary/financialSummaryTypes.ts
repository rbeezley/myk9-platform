export interface TrialFinancialEntryRow {
  id: string;
  /**
   * MYK9-639: carried so the superseded half of a move-up can be dropped before
   * anything is summed. The destination entry now holds the money, so counting
   * the source too would report one paid run as two entries at twice the fee.
   */
  entryStatus: string | null;
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
