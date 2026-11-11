/**
 * MYK9-1844: what Entry Management says when a secretary's action fails. Database
 * and library text never reaches the screen; each sentence names the action and says
 * what to do next. Status, comp and armband writes go through replication or RPCs,
 * so a failure after the write started may still have landed: those sentences say to
 * check before trying again instead of claiming nothing changed.
 */
import { COMP_REFUSED_PAID_CODE, COMP_REFUSED_PAID_MESSAGE } from '@/services/database/entries';
import { isArmbandNumberTaken } from '@/services/replication/armbandInUse';

export const ENTRY_ACTION_COPY = {
  /** The write may have landed before a later step (the audit record) failed. */
  statusChangeFailed:
    "We couldn't change this entry's status. Check the entry before you try again.",
  bulkStatusChangeFailed:
    "We couldn't finish changing these entries. Some may have changed, so check the list before you try again.",
  armbandFailed:
    "We couldn't save this armband number. Check the dog's armband in the list before you try again.",
  /** The entries could not be read, so nothing was downloaded. */
  exportLoadFailed: "We couldn't load the entries to export. Try again.",
  /** A file may have downloaded before the export record failed. */
  exportFailed: "We couldn't finish the export. If no file downloaded, try again.",
  compFailed: "We couldn't make this entry free. Try again.",
  /** The entry may already show as comped: the record of the comp is what failed. */
  compUnfinished:
    "We couldn't finish making this entry free. Check its payment status before you try again.",
  uncompFailed: "We couldn't undo the free entry. Try again.",
  uncompUnfinished:
    "We couldn't finish undoing the free entry. Check this entry's payment status before you try again.",
  /** The status change is saved on this device and sent once the connection is back. */
  savedOffline: 'Saved on this device. It will be sent when you are back online.',
  resendEmailFailed: "We couldn't resend the confirmation email. Try again.",
  /**
   * A dog's Pull or Withdraw across its entries: the failed ones are put back on screen,
   * but a write may have landed before a later step failed, so the list says to check.
   */
  dogBulkFailedHeading: 'Check these entries before you try again:',
  dogBulkEntryFailed: "We couldn't change this entry's status.",
} as const;

export const MOVE_UP_COPY = {
  /** The tab's error card says what is unknown and offers Retry. */
  loadFailed: "We couldn't load the move-up requests. Try again.",
  /** Unchanged wording; moved here so the tab's approve handler stays one ternary. */
  targetFull: 'Target class is full. Consider adding to waitlist.',
  approveFailed:
    "We couldn't approve this move-up request. Press Refresh to see where it stands before you try again.",
  /** The status may have changed before the history record failed. */
  denyFailed:
    "We couldn't deny this move-up request. Press Refresh to see where it stands before you try again.",
  /** Something after the write failed (the list refresh), so the outcome is unknown. */
  unfinished: "We couldn't finish this move-up request. Press Refresh to see where it stands.",
} as const;

/** The armband number another dog in this show already wears. */
export function armbandInUseMessage(armband: string): string {
  return `Armband ${armband} is already in use by another dog in this show. Pick a different number.`;
}

function codeOf(error: unknown): unknown {
  return error && typeof error === 'object' ? (error as { code?: unknown }).code : undefined;
}

/** The armband dialog's line for a refused save. Never the error's own text. */
export function armbandSaveErrorMessage(error: unknown, armband: string): string {
  return isArmbandNumberTaken(error)
    ? armbandInUseMessage(armband)
    : ENTRY_ACTION_COPY.armbandFailed;
}

/** MYK9-1407: the server refuses a comp on a paid or refunded entry, in its own words. */
export function compErrorMessage(error: unknown): string {
  return codeOf(error) === COMP_REFUSED_PAID_CODE
    ? COMP_REFUSED_PAID_MESSAGE
    : ENTRY_ACTION_COPY.compFailed;
}
