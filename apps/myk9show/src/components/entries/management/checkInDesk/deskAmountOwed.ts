import type { EntryManagementEntry } from '@/types/entry-management-types';
import { EntryStatus } from '@/types/show-registration-types';
import { entryAmountOwed } from '@/utils/entryAmountOwed';
import { groupEntriesByEnrollment } from '@/utils/enrollmentGrouping';
import { receivedDollars } from '../enrollmentPayment';

/** What one person still owes on this show, and where the secretary records it (MYK9-1937). */
export interface DeskAmountOwed {
  /** Dollars owed across this person's entry forms; 0 shows nothing on the card. */
  amount: number;
  /** An accepted entry's money could not be traced, so the figure is not a confident total. */
  unknown: boolean;
  /** Forms that still owe, by the key Entries opens a form with (`?registration=`). */
  formKeys: string[];
}

const cents = (dollars: number) => Math.round(dollars * 100);

/**
 * The desk's money figure for one person. Each accepted entry's debt is
 * `entryAmountOwed` (the one amount-owed rule, MYK9-1908); a form's debt is that sum, held to
 * what the form itself still shows as due (total less everything received), so a part-paid
 * form quotes the same balance as its Payment card. Entries not yet accepted owe nothing yet.
 * Pure: it reads only the entries the desk already holds, so it works offline.
 */
export function deskAmountOwed(entries: readonly EntryManagementEntry[]): DeskAmountOwed {
  const formKeys: string[] = [];
  let totalCents = 0;
  let unknown = false;

  for (const group of groupEntriesByEnrollment([...entries])) {
    const accepted = group.entries.filter(entry => entry.entryStatus === EntryStatus.ACCEPTED);
    const entryOwed = accepted.reduce(
      (sum, entry) =>
        sum +
        cents(
          entryAmountOwed({
            totalFee: entry.totalFee,
            paidAmount: entry.paidAmount,
            paymentStatus: entry.paymentStatus,
            enrollmentPaymentStatus: entry.enrollmentPaymentStatus,
            cardPaid: entry.cardPaid,
            comped: entry.comped,
          })
        ),
      0
    );
    if (accepted.some(entry => entry.moneyRootUnresolved === true)) unknown = true;
    if (entryOwed <= 0) continue;

    const total = group.totalAmountUnit === 'cents' ? group.totalAmount / 100 : group.totalAmount;
    const formDue = cents(Math.max(0, total - receivedDollars(group)));
    const owed = group.totalAmountUnit === 'cents' ? Math.min(entryOwed, formDue) : entryOwed;
    if (owed <= 0) continue;
    totalCents += owed;
    formKeys.push(group.groupKey);
  }

  return { amount: totalCents / 100, unknown, formKeys };
}

/** "Owes $25" or "Owes $25.50": whole dollars read plain, a part dollar keeps its cents. */
export function owesLabel(amount: number): string {
  const text = Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
  return `Owes $${text}`;
}

/**
 * Where tapping the figure goes: the one form that owes, or Entries filtered to the person
 * when several do (one exhibitor can have several forms).
 */
export function deskOwedHref(showId: string, personName: string, formKeys: readonly string[]) {
  const base = `/shows/${encodeURIComponent(showId)}/entries`;
  const params = new URLSearchParams();
  if (formKeys.length === 1) params.set('registration', formKeys[0]!);
  else params.set('search', personName);
  return `${base}?${params.toString()}`;
}
