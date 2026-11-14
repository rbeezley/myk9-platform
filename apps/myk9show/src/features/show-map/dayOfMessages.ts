import { notRunningLabel } from '@myk9/ringside/run-queue';
import { getEntryStatusStateLabel } from '@/components/entries/management/reviewStateLabels';
import { EntryStatus } from '@/types/show-registration-types';

/**
 * What Show Desk says after a day-of change (MYK9-1940). Each message names the dog and the class,
 * and the not-running words come from Ringside's `notRunningLabel`, never typed here. Every day-of
 * Undo goes through `showUndoToast` with `STATUS_UNDO_WINDOW_MS`.
 */

/** "#110 Hazel", or the call name alone when the dog has no armband. */
export function dayOfDogLabel(entry: {
  armband?: string | number | null | undefined;
  dogName: string;
}): string {
  return entry.armband ? `#${entry.armband} ${entry.dogName}` : entry.dogName;
}

/** "#110 Hazel marked absent in Novice A". */
export function markedAbsentMessage(dog: string, className: string): string {
  return `${dog} marked ${notRunningLabel('absent').toLowerCase()} in ${className}`;
}

/** "#110 Hazel: Moved to Novice B". */
export function classChangedMessage(dog: string, toClassName: string | null): string {
  return `${dog}: ${notRunningLabel('moved', toClassName ?? undefined)}`;
}

const ENTRY_STATUS_DONE: Partial<Record<EntryStatus, string>> = {
  [EntryStatus.ACCEPTED]: 'accepted',
  [EntryStatus.PENDING]: 'marked pending',
  [EntryStatus.MISSING_INFO]: 'marked missing information',
  [EntryStatus.REJECTED]: 'rejected',
  [EntryStatus.WAITLIST]: 'moved to the waitlist',
  [EntryStatus.SCRATCHED]: 'pulled',
};

/** "Hazel accepted in Novice A", "Hazel pulled from Novice A": a status change on the Entries page. */
export function entryStatusChangedMessage(
  dog: string,
  className: string,
  status: EntryStatus
): string {
  if (status === EntryStatus.SCRATCHED) return `${dog} pulled from ${className}`;
  const done = ENTRY_STATUS_DONE[status] ?? getEntryStatusStateLabel(status).toLowerCase();
  return `${dog} ${done} in ${className}`;
}
