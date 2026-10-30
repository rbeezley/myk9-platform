/**
 * Pure selection for the Home "Your entries today" card: the viewer's live entries in shows
 * happening today, one line per dog and class.
 */

import { getEntryStatusKind } from '@/services/entryDisplay/entryDisplaySelectors';

/** An own entry labelled for the card: the dog's call name and the class. */
export interface OwnEntryLabel {
  entryId: string;
  showId: string;
  entryStatus: string | undefined;
  checkInStatus: string | undefined;
  dogCallName: string;
  classLabel: string;
}

/** The subset of a `getUserEntries` row the card reads. */
export interface UserEntryRow {
  id: string;
  show_id?: string | null;
  entry_status?: string | null;
  check_in_status?: string | null;
  deleted_at?: string | null;
  dog?: { name?: string | null; call_name?: string | null } | null;
  class?: { name?: string | null } | null;
}

export function labelsFromUserEntryRows(rows: readonly UserEntryRow[]): OwnEntryLabel[] {
  return rows.flatMap(row => {
    if (row.deleted_at || !row.show_id) return [];
    return [
      {
        entryId: row.id,
        showId: row.show_id,
        entryStatus: row.entry_status ?? undefined,
        checkInStatus: row.check_in_status ?? undefined,
        dogCallName: row.dog?.call_name || row.dog?.name || 'Your dog',
        classLabel: row.class?.name ?? '',
      },
    ];
  });
}

/** Live entries, and finished ones (shown as "Done"); never withdrawn, pulled or unpaid. */
function isShownToday(entryStatus: string | undefined, checkInStatus: string | undefined): boolean {
  if (checkInStatus === 'pulled' || entryStatus === 'pending-payment') return false;
  const kind = getEntryStatusKind(entryStatus);
  return kind === 'completed' || isLiveKind(kind);
}

function isLiveKind(kind: ReturnType<typeof getEntryStatusKind>): boolean {
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
  entryStatus?: string | undefined
): string {
  if (getEntryStatusKind(entryStatus) === 'completed') return STATUS_LABELS.completed;
  return (checkInStatus && STATUS_LABELS[checkInStatus]) || 'Check in';
}

export function selectEntriesToday(
  labels: readonly OwnEntryLabel[],
  todayShowIds: ReadonlySet<string>
): EntryTodayLine[] {
  return labels
    .filter(
      label =>
        todayShowIds.has(label.showId) && isShownToday(label.entryStatus, label.checkInStatus)
    )
    .map(label => ({
      entryId: label.entryId,
      showId: label.showId,
      dogCallName: label.dogCallName,
      classLabel: label.classLabel,
      statusLabel: entryStatusLabel(label.checkInStatus, label.entryStatus),
    }));
}
