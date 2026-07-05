export interface TrialFinancialEntryRow {
  id: string;
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
