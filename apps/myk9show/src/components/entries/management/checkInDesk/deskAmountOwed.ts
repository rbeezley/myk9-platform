import type { EntryManagementEntry } from '@/types/entry-management-types';
import { groupEntriesByEnrollment } from '@/utils/enrollmentGrouping';
import { enrollmentRemainingDollars } from '../enrollmentPayment';

/** What one person still owes on this show, and where the secretary records it (MYK9-1937). */
export interface DeskAmountOwed {
  /** Dollars the forms this person placed still show as due; 0 shows nothing on the card. */
  amount: number;
  /** Some of a form's money could not be traced, so the figure is not a confident total. */
  unknown: boolean;
  /** Forms that still owe, by the key Entries opens a form with (`?registration=`). */
  formKeys: string[];
}

const cents = (dollars: number) => Math.round(dollars * 100);

/**
 * The desk's money figures, by the person each entry form belongs to (MYK9-1937). The form's
 * money is its PAYER's (`enrollments.handler_id`, the person who placed it), never the handler
 * running the dog, so a pro handler's card shows nothing for clients' forms. Each form is
 * counted once, at exactly what the entry form shows as due (`enrollmentRemainingDollars`:
 * its total less everything received, every non-waived entry included), so the two never
 * disagree. A form with no enrollment row falls back to its dog's owner. Pure: it reads only
 * the entries the desk already holds, so it works offline.
 */
export function deskOwedByPayer(
  entries: readonly EntryManagementEntry[]
): Map<string, DeskAmountOwed> {
  const byPayer = new Map<string, DeskAmountOwed & { cents: number }>();

  for (const group of groupEntriesByEnrollment([...entries])) {
    const first = group.entries[0];
    const payerId = first?.enrollmentPayerId ?? first?.ownerId ?? null;
    if (!payerId) continue;
    const unknown = group.entries.some(entry => entry.moneyRootUnresolved === true);
    const due = cents(Math.max(0, enrollmentRemainingDollars(group)));
    if (due <= 0 && !unknown) continue;

    const owed = byPayer.get(payerId) ?? { amount: 0, unknown: false, formKeys: [], cents: 0 };
    owed.cents += due;
    owed.unknown ||= unknown;
    owed.formKeys.push(group.groupKey);
    byPayer.set(payerId, owed);
  }

  return new Map(
    [...byPayer].map(([payerId, { cents: total, ...owed }]) => [
      payerId,
      { ...owed, amount: total / 100 },
    ])
  );
}

/** "Owes $25.00": always two decimals, as the entry form's "$X.XX due" reads. */
export function owesLabel(amount: number): string {
  return `Owes $${amount.toFixed(2)}`;
}

/** What the card says when part of the money could not be traced. */
export const AMOUNT_NOT_AVAILABLE = 'Amount not available';

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
