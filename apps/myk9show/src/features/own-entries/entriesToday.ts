/**
 * Pure selection for the Home "Your entries today" card: the viewer's live entries in shows
 * happening today, one line per dog and class.
 */

import { isActiveSubmittedEntryStatus } from '@/services/entryDisplay/entryDisplaySelectors';
import type { OwnReplicaEntryLabel } from '@/services/database/entries/ownReplicaEntries';

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

export function entryStatusLabel(checkInStatus: string | undefined): string {
  return (checkInStatus && STATUS_LABELS[checkInStatus]) || 'Check in';
}

export function selectEntriesToday(
  labels: readonly OwnReplicaEntryLabel[],
  todayShowIds: ReadonlySet<string>
): EntryTodayLine[] {
  return labels
    .filter(
      label =>
        todayShowIds.has(label.showId) &&
        isActiveSubmittedEntryStatus(label.entryStatus, label.checkInStatus)
    )
    .map(label => ({
      entryId: label.entryId,
      showId: label.showId,
      dogCallName: label.dogCallName,
      classLabel: label.classLabel,
      statusLabel: entryStatusLabel(label.checkInStatus),
    }));
}
