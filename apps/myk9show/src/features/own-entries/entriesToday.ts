/**
 * Pure selection for the Home "Your entries today" card: the viewer's live entries in shows
 * happening today, one line per dog and class.
 */

import type { EntryStatusKind } from '@/services/entryDisplay/entryDisplaySelectors';
import type { MyEntry } from '@/pages/MyEntriesPage/modules/my-entries-types';
import { PaymentStatus } from '@/types/show-registration-types';

/** An own entry labelled for the card: the dog's call name and the class. */
export interface OwnEntryLabel {
  entryId: string;
  showId: string;
  /** The canonical display kind, from the same read My Shows renders. */
  kind: EntryStatusKind;
  checkInStatus: string | undefined;
  dogCallName: string;
  classLabel: string;
}

/**
 * One label per class row of the entries My Shows already loaded. A removed, withdrawn or moved
 * row is dropped here; an online order still awaiting payment is not an entry yet (the grouped
 * rows no longer carry the raw `pending-payment` status, so unpaid online money stands in for it).
 */
export function labelsFromMyEntries(entries: readonly MyEntry[]): OwnEntryLabel[] {
  return entries.flatMap(entry => {
    const dogs = entry.dogs.length
      ? entry.dogs
      : [{ id: entry.id, dogId: entry.dogId, dogName: entry.dogName, classes: entry.classes }];
    return dogs.flatMap(dog =>
      dog.classes.flatMap(row => {
        if (row.deletedAt || row.status !== 'entered') return [];
        if (
          row.entryStatusKind === 'pending' &&
          row.paymentMethod === 'online' &&
          row.rawPaymentStatus === PaymentStatus.PENDING
        ) {
          return [];
        }
        return [
          {
            entryId: row.id,
            showId: entry.showId,
            kind: row.entryStatusKind,
            checkInStatus: row.checkInStatus,
            dogCallName: dog.dogName || 'Your dog',
            classLabel: row.unresolved ? '' : row.name,
          },
        ];
      })
    );
  });
}

/** Live entries, and finished ones (shown as "Done"); never withdrawn, pulled or unpaid. */
function isShownToday(kind: EntryStatusKind, checkInStatus: string | undefined): boolean {
  if (checkInStatus === 'pulled') return false;
  return kind === 'completed' || isLiveKind(kind);
}

function isLiveKind(kind: EntryStatusKind): boolean {
  return (
    kind === 'pending' ||
    kind === 'accepted' ||
    kind === 'waitlist' ||
    kind === 'in_ring' ||
    kind === 'move_up_requested'
  );
}

export interface EntryTodayLine {
  entryId: string;
  showId: string;
  dogCallName: string;
  classLabel: string;
  /** Where the dog stands, in the exhibitor's words; "Check in" until they are checked in. */
  statusLabel: string;
}

const STATUS_LABELS: Record<string, string> = {
  'checked-in': 'Checked in',
  'at-gate': 'At the gate',
  'come-to-gate': 'Come to the gate',
  'in-ring': 'In the ring',
  conflict: 'Conflict, see the secretary',
  completed: 'Done',
};

export function entryStatusLabel(
  checkInStatus: string | undefined,
  kind?: EntryStatusKind
): string {
  if (kind === 'completed') return STATUS_LABELS.completed;
  return (checkInStatus && STATUS_LABELS[checkInStatus]) || 'Check in';
}

export function selectEntriesToday(
  labels: readonly OwnEntryLabel[],
  todayShowIds: ReadonlySet<string>
): EntryTodayLine[] {
  return labels
    .filter(
      label => todayShowIds.has(label.showId) && isShownToday(label.kind, label.checkInStatus)
    )
    .map(label => ({
      entryId: label.entryId,
      showId: label.showId,
      dogCallName: label.dogCallName,
      classLabel: label.classLabel,
      statusLabel: entryStatusLabel(label.checkInStatus, label.kind),
    }));
}
