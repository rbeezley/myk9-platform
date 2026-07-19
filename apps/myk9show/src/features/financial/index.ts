// Shared financial source of truth (unified-financial-dashboard, MYK9-54).
//
// This barrel is the single entry point every financial surface reads from. The
// printable show closeout math lives in components/reports/financialReportTotals
// and is re-exported UNCHANGED here so the report renderer and the shared service
// resolve the same function — the shared layer delegates to that closeout math for
// the overlapping subset rather than duplicating it.
export {
  calculateFinancialReportTotals,
  buildFinancialReportLine,
  isEntryIncludedInFinancialReport,
  getFinancialPaymentLabel,
  computeOutstandingAmount,
  type FinancialReportMode,
  type FinancialReportLine,
  type FinancialReportBucket,
  type FinancialReportTotals,
} from '@/components/reports/financialReportTotals';

export * from './entryAccounting';
export * from './chargeVerification';
export * from './payoutSettlement';
export * from './financialSummary';
export * from './financialReconciliation';
