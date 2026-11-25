import { isSupersededMoveUpEntry } from '@/features/financial/moneyRoot';
import { PENDING_NOT_RUNNING_LABEL } from '@/features/emergency-trial-packet/types';
import {
  getEntryStatusKind,
  getStatusLabel,
  type EntryStatusKind,
} from '@/services/entryDisplay/entryDisplaySelectors';

/**
 * MYK9-2082, MYK9-2376, MYK9-2387: which entries belong on a class's sheets, and which of those run.
 *
 * Listed (the Check-in & Running Order sheet): every entry that belongs to the class, so the
 * secretary sees each one with its status. Only the source half of a move-up and a declined
 * (rejected) entry stay off both sheets, since they sit in another class or never ran. The
 * `emergency_packet_input` RPC still filters more strictly; that is MYK9-2389.
 *
 * Running (a run order, and the judge's Score Sheet): a listed entry that is not Pending,
 * Withdrawn, Pulled (scratched or `check_in_status = 'pulled'`) or Absent. A dog that is not
 * running gets a blank run order and a status label, never "Order 1".
 */
export interface RunSheetEntryInput {
  entryStatus?: string | null | undefined;
  checkInStatus?: string | null | undefined;
}

/** True for an entry the check-in sheet lists, running or not. */
export function isEntryListedOnCheckIn(entry: RunSheetEntryInput): boolean {
  if (isSupersededMoveUpEntry({ entryStatus: entry.entryStatus ?? null })) return false;
  return getEntryStatusKind(entry.entryStatus) !== 'not_accepted';
}

/**
 * The status the sheet prints for a listed entry that will not run, or `null` when it runs. The
 * wording is the app's own (`getStatusLabel`), so the sheet says what every other screen says.
 */
export function notRunningStatusLabel(entry: RunSheetEntryInput): string | null {
  if (entry.checkInStatus === 'pulled') return getStatusLabel('scratched');
  const kind = getEntryStatusKind(entry.entryStatus);
  if (kind === 'pending') return PENDING_NOT_RUNNING_LABEL;
  return NOT_RUNNING_KINDS.has(kind) ? getStatusLabel(kind) : null;
}

const NOT_RUNNING_KINDS: ReadonlySet<EntryStatusKind> = new Set([
  'pending',
  'withdrawn',
  'scratched',
  'absent',
]);
