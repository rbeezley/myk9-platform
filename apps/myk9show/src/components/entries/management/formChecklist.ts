import { isHeldEntry } from '@/features/dogs/identity';
import { getOperationalEntryState } from '@/features/entry-operations/attentionClassification';
import { PaymentStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { entryAttentionReasons, type ShowRegistrationGroup } from './showRegistrationProjection';

/** One open item on the entry form's "To finish this form" list. */
export type FormChecklistItem =
  | { kind: 'review'; id: string; title: string; detail: string; entryIds: string[] }
  | { kind: 'missing-information'; id: string; title: string; detail: string }
  | {
      kind: 'payment';
      id: string;
      title: string;
      detail: string;
      /** Manual payment exists only for enrollment (mail-in) forms; online-checkout forms have no row to record against. */
      canRecord: boolean;
    }
  | { kind: 'armband'; id: string; title: string; detail: string; entry: EntryManagementEntry }
  | {
      kind: 'registration-number';
      id: string;
      title: string;
      detail: string;
      entry: EntryManagementEntry;
    };

export interface FormChecklist {
  items: FormChecklistItem[];
  /** What is already finished, e.g. ["2 accepted", "$60.00 paid by check", "armband 201"]. */
  done: string[];
}

const dollars = (value: number) => `$${value.toFixed(2)}`;
const entriesWord = (count: number) => (count === 1 ? 'entry' : 'entries');

const PAID_BY: Partial<Record<PaymentStatus, string>> = {
  [PaymentStatus.PAID_BY_CHECK]: ' by check',
  [PaymentStatus.PAID_BY_CASH]: ' by cash',
  [PaymentStatus.PAID_ONLINE]: ' online',
};

/** The first entry of each dog that passes `matches`, one per dog, in form order. */
function onePerDog(
  entries: readonly EntryManagementEntry[],
  matches: (entry: EntryManagementEntry) => boolean
): EntryManagementEntry[] {
  const seen = new Set<string>();
  const found: EntryManagementEntry[] = [];
  for (const entry of entries) {
    const key = entry.dogId || entry.dogName;
    if (seen.has(key) || !matches(entry)) continue;
    seen.add(key);
    found.push(entry);
  }
  return found;
}

const dogNames = (entries: readonly EntryManagementEntry[]) =>
  [...new Set(entries.map(entry => entry.dogName))].join(', ');

/**
 * The open items of one entry form, and what is already done, derived from the
 * form's state. Review, missing-information and payment conditions come from the
 * same `entryAttentionReasons` the registration queue uses, so this list and the
 * queue row never disagree. A missing armband reads `armbandNumber` and a missing
 * registration number reads the server's held flag (MYK9-1162, `isHeldEntry`);
 * nothing here recomputes either.
 */
export function buildFormChecklist(
  registration: ShowRegistrationGroup,
  money: { paidDollars: number; remainingDollars: number }
): FormChecklist {
  const { entries } = registration;
  const withReason = (reason: 'pending_review' | 'missing_information' | 'payment_due') =>
    entries.filter(entry => entryAttentionReasons(entry).includes(reason));
  const items: FormChecklistItem[] = [];

  const review = withReason('pending_review');
  if (review.length > 0) {
    items.push({
      kind: 'review',
      id: 'review',
      title: `${review.length} ${entriesWord(review.length)} ${review.length === 1 ? 'needs' : 'need'} review`,
      detail: dogNames(review),
      entryIds: review.map(entry => entry.id),
    });
  }

  const missing = withReason('missing_information');
  if (missing.length > 0) {
    items.push({
      kind: 'missing-information',
      id: 'missing-information',
      title: `${missing.length} ${entriesWord(missing.length)} ${missing.length === 1 ? 'is' : 'are'} missing information`,
      detail: `${dogNames(missing)}. Use Edit entry on the entry's menu below.`,
    });
  }

  const unpaid = withReason('payment_due');
  if (unpaid.length > 0) {
    const due = Math.max(0, money.remainingDollars);
    items.push({
      kind: 'payment',
      id: 'payment',
      title: due > 0 ? `${dollars(due)} due` : 'Payment due',
      detail: `${unpaid.length} of ${entries.length} ${entriesWord(entries.length)} unpaid`,
      canRecord: Boolean(registration.enrollmentId),
    });
  }

  const live = (entry: EntryManagementEntry) =>
    getOperationalEntryState({
      entryStatus: entry.entryStatus,
      rawEntryStatus: entry.rawEntryStatus,
    }) !== 'terminal';
  for (const entry of onePerDog(entries, e => live(e) && !e.armbandNumber)) {
    items.push({
      kind: 'armband',
      id: `armband-${entry.dogId || entry.id}`,
      title: `${entry.dogName} has no armband`,
      detail: '',
      entry,
    });
  }

  for (const entry of onePerDog(entries, e =>
    isHeldEntry({
      entryStatus: e.rawEntryStatus ?? undefined,
      awaitingRegistrationNumber: e.awaitingRegistrationNumber,
    })
  )) {
    items.push({
      kind: 'registration-number',
      id: `registration-number-${entry.dogId || entry.id}`,
      title: `${entry.dogName} needs a registration number`,
      detail: '',
      entry,
    });
  }

  const done: string[] = [];
  const accepted = entries.filter(
    entry =>
      getOperationalEntryState({
        entryStatus: entry.entryStatus,
        rawEntryStatus: entry.rawEntryStatus,
      }) === 'accepted'
  );
  if (accepted.length > 0) done.push(`${accepted.length} accepted`);
  if (unpaid.length === 0 && money.paidDollars > 0) {
    done.push(`${dollars(money.paidDollars)} paid${PAID_BY[registration.paymentStatus] ?? ''}`);
  }
  const armbands = [
    ...new Set(
      entries
        .map(entry => entry.armbandNumber)
        .filter((n): n is NonNullable<typeof n> => Boolean(n))
    ),
  ];
  if (armbands.length > 0) done.push(`armband ${armbands.join(', ')}`);

  return { items, done };
}
