import type { EntryManagementEntry } from '@/types/entry-management-types';
import { buildMoneyAttribution } from '@/features/financial/moneyRoot';
import { groupEntriesByEnrollment } from '@/utils/enrollmentGrouping';
import { paidInFullDollars } from '../enrollmentPayment';

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

/** The key `groupEntriesByEnrollment` gives an entry's form, for a row it does not group. */
const formKeyOf = (entry: EntryManagementEntry) =>
  entry.registrationId ||
  (entry.stripePaymentIntentId ? `pi:${entry.stripePaymentIntentId}` : `entry:${entry.id}`);

/**
 * Whose card a form goes on. The payer when the enrollment row says who it is. A form with
 * no enrollment row at all (online checkout) falls back to its dog's owner. A form whose
 * enrollment row should have loaded but did not (the read is online-only, so offline it is
 * empty) has no known payer: it goes on everyone it names, as unknown, rather than on one
 * person who may not be the payer.
 */
function payersOf(entries: readonly EntryManagementEntry[], enrollmentMissing: boolean): string[] {
  const payer = entries.find(entry => entry.enrollmentPayerId)?.enrollmentPayerId;
  if (payer) return [payer];
  const named = enrollmentMissing
    ? entries.flatMap(entry => [entry.ownerId, entry.handlerId])
    : [entries[0]?.ownerId];
  return [...new Set(named.filter((id): id is string => Boolean(id)))];
}

/**
 * The desk's money figures, by the person each entry form belongs to (MYK9-1937). The form's
 * money is its PAYER's (`enrollments.handler_id`, the person who placed it), never the handler
 * running the dog, so a pro handler's card shows nothing for clients' forms. Each form is
 * counted once, at exactly what the entry form's footer shows as due (`paidInFullDollars`,
 * MYK9-1961's rule: its total less everything received, with refunded and comped fees out of
 * the total and money the form still holds covering a later add-on), so the two never
 * disagree. There is no second owed rule here. Pure: it reads only the entries the desk
 * already holds.
 *
 * A form whose money cannot be traced is `unknown` and adds no dollars: its enrollment row
 * did not load (offline), or a move-up's money root is not in the read. The desk then says
 * "Amount not available", never a figure built from entry-level fees.
 */
export function deskOwedByPayer(
  entries: readonly EntryManagementEntry[]
): Map<string, DeskAmountOwed> {
  const byPayer = new Map<string, DeskAmountOwed & { cents: number }>();
  const attribution = buildMoneyAttribution(entries);
  const unresolvedIds = new Set(attribution.unresolved.map(({ entryId }) => entryId));

  const add = (payerIds: string[], formKey: string, due: number, unknown: boolean) => {
    for (const payerId of payerIds) {
      const owed = byPayer.get(payerId) ?? { amount: 0, unknown: false, formKeys: [], cents: 0 };
      if (!unknown) owed.cents += due;
      owed.unknown ||= unknown;
      if (!owed.formKeys.includes(formKey)) owed.formKeys.push(formKey);
      byPayer.set(payerId, owed);
    }
  };

  for (const group of groupEntriesByEnrollment([...entries])) {
    const enrollmentMissing = group.enrollmentId != null && group.totalAmountUnit === 'dollars';
    const unknown =
      enrollmentMissing ||
      group.entries.some(
        entry => entry.moneyRootUnresolved === true || unresolvedIds.has(entry.id)
      );
    const due = cents(paidInFullDollars(group));
    if (due <= 0 && !unknown) continue;
    add(payersOf(group.entries, enrollmentMissing), group.groupKey, due, unknown);
  }

  // A superseded move-up row nobody claims is in no group, but its money is real and lost.
  const liveIds = new Set(attribution.live.map(entry => entry.id));
  for (const entry of entries) {
    if (!unresolvedIds.has(entry.id) || liveIds.has(entry.id)) continue;
    const enrollmentMissing = Boolean(entry.registrationId) && entry.enrollmentTotalAmount == null;
    add(payersOf([entry], enrollmentMissing), formKeyOf(entry), 0, true);
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
