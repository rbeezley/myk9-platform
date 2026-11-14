import type { EntryManagementEntry } from '@/types/entry-management-types';
import { buildMoneyAttribution } from '@/features/financial/moneyRoot';
import { groupEntriesByEnrollment } from '@/utils/enrollmentGrouping';
import { paidInFullDollars } from '../enrollmentPayment';
import { rosterPersonKey } from './peopleRoster';

/** One entry form that still owes, and the desk cards that hold its dogs (MYK9-1937). */
export interface DeskOwedForm {
  /** The key Entries opens the form with (`?registration=`). */
  formKey: string;
  /** Whose money the form is; null when that cannot be known (its enrollment row did not load). */
  payerId: string | null;
  /** The payer's name as the desk's entries give it; null when no entry names them. */
  payerName: string | null;
  /** Dollars the form still shows as due; 0 when `unknown`. */
  amount: number;
  /** Some of the form's money could not be traced, so no figure is quoted. */
  unknown: boolean;
  /** The cards (`PeopleRosterPerson.id`) holding at least one of the form's dogs. */
  cardIds: string[];
}

/** One owed line on one card. */
export interface DeskOwedLine {
  formKey: string;
  label: string;
}

const cents = (dollars: number) => Math.round(dollars * 100);

/** The key `groupEntriesByEnrollment` gives an entry's form, for a row it does not group. */
const formKeyOf = (entry: EntryManagementEntry) =>
  entry.registrationId ||
  (entry.stripePaymentIntentId ? `pi:${entry.stripePaymentIntentId}` : `entry:${entry.id}`);

const trimmed = (value: string | null | undefined) => value?.trim() || null;

/**
 * Whose money a form is: the payer on the enrollment row (`enrollments.handler_id`, the person
 * who placed it). A form with no enrollment row at all (online checkout) is its dog's owner's.
 * A form whose enrollment row should have loaded but did not (the read is online-only, so
 * offline it is empty) has no known payer.
 */
function payerOf(entries: readonly EntryManagementEntry[], enrollmentMissing: boolean) {
  const payer = entries.find(entry => entry.enrollmentPayerId)?.enrollmentPayerId;
  if (payer) return payer;
  return enrollmentMissing ? null : (entries[0]?.ownerId ?? null);
}

/** The payer's name from any entry on the desk that names them as owner or handler. */
function nameOf(payerId: string | null, entries: readonly EntryManagementEntry[]) {
  if (!payerId) return null;
  for (const entry of entries) {
    if (entry.ownerId === payerId && trimmed(entry.ownerName)) return trimmed(entry.ownerName);
    if (entry.handlerId === payerId) {
      const name = trimmed(entry.handlerPersonName) ?? trimmed(entry.handlerName);
      if (name) return name;
    }
  }
  return null;
}

/**
 * Every entry form on the desk that still owes, or whose money cannot be traced (MYK9-1937).
 * Each form is counted once, at exactly what the entry form's footer shows as due
 * (`paidInFullDollars`, MYK9-1961's rule: its total less everything received, with refunded
 * and comped fees out of the total and money the form still holds covering a later add-on), so
 * the two never disagree. There is no second owed rule here. Pure: it reads only the entries
 * the desk already holds.
 *
 * A form whose money cannot be traced is `unknown` and quotes no figure: its enrollment row did
 * not load (offline), or a move-up's money root is not in the read.
 */
export function deskOwedForms(entries: readonly EntryManagementEntry[]): DeskOwedForm[] {
  const forms: DeskOwedForm[] = [];
  const attribution = buildMoneyAttribution(entries);
  const unresolvedIds = new Set(attribution.unresolved.map(({ entryId }) => entryId));

  const add = (
    formEntries: readonly EntryManagementEntry[],
    formKey: string,
    due: number,
    unknown: boolean,
    enrollmentMissing: boolean
  ) => {
    const payerId = payerOf(formEntries, enrollmentMissing);
    forms.push({
      formKey,
      payerId,
      payerName: nameOf(payerId, [...formEntries, ...entries]),
      amount: unknown ? 0 : due / 100,
      unknown,
      cardIds: [...new Set(formEntries.map(rosterPersonKey))],
    });
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
    add(group.entries, group.groupKey, due, unknown, enrollmentMissing);
  }

  // A superseded move-up row nobody claims is in no group, but its money is real and lost.
  const liveIds = new Set(attribution.live.map(entry => entry.id));
  for (const entry of entries) {
    if (!unresolvedIds.has(entry.id) || liveIds.has(entry.id)) continue;
    const enrollmentMissing = Boolean(entry.registrationId) && entry.enrollmentTotalAmount == null;
    add([entry], formKeyOf(entry), 0, true, enrollmentMissing);
  }

  return forms;
}

/** "$25.00": always two decimals, as the entry form's "$X.XX due" reads. */
const dollars = (amount: number) => `$${amount.toFixed(2)}`;

/** What the card says when part of the money could not be traced. */
export const AMOUNT_NOT_AVAILABLE = 'Amount not available';

/**
 * The owed lines for one card: one per owing form holding a dog on the card, each form once.
 * The card's own forms read "Owes $40.00"; a form someone else placed names its payer, "Pat
 * Smith owes $40.00", so a payer with no card of their own is never hidden (owner decision,
 * 2026-11-14). Forms are never merged, so two payers never share one figure.
 */
export function deskOwedLines(forms: readonly DeskOwedForm[], cardId: string): DeskOwedLine[] {
  return forms
    .filter(form => form.cardIds.includes(cardId))
    .map(form => {
      // Not this card's form: say whose it is, or that it is an entry form's when no entry names them.
      const name = form.payerId === cardId ? null : (form.payerName ?? 'Entry form');
      const label = form.unknown
        ? name && form.payerId
          ? `${name}: amount not available`
          : AMOUNT_NOT_AVAILABLE
        : name
          ? `${name} owes ${dollars(form.amount)}`
          : `Owes ${dollars(form.amount)}`;
      return { formKey: form.formKey, label };
    });
}

/** Where tapping an owed line goes: that entry form, by its key, never a search by name. */
export function deskOwedHref(showId: string, formKey: string) {
  const params = new URLSearchParams({ registration: formKey });
  return `/shows/${encodeURIComponent(showId)}/entries?${params.toString()}`;
}
