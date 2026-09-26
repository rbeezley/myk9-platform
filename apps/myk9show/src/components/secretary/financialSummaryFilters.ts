/**
 * Search + payment-status filtering for the per-trial Financial Summary card
 * (list-toolkit rollout, MYK9-811) — the single function the visible rows and
 * every payment-status option count share, mirroring `filterUsers`
 * (`pages/admin/UserManagementPage.helpers.ts`).
 */
import type { TrialFinancialEntryRow } from './financialSummaryTypes';

export function filterFinancialEntries(
  entries: TrialFinancialEntryRow[],
  searchTerm: string,
  paymentStatus: string | null
): TrialFinancialEntryRow[] {
  let result = entries;
  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    result = result.filter(
      e =>
        e.dogName.toLowerCase().includes(term) ||
        e.ownerName.toLowerCase().includes(term) ||
        (e.handler?.toLowerCase().includes(term) ?? false) ||
        e.className.toLowerCase().includes(term)
    );
  }
  if (paymentStatus) {
    result =
      paymentStatus === 'comped'
        ? result.filter(e => e.comped)
        : result.filter(e => e.paymentStatus === paymentStatus && !e.comped);
  }
  return result;
}
