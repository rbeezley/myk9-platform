import { sheetEntryState } from '../../../../../supabase/functions/_shared/trialPacket/renderer/sheetEntryRule.ts';

/**
 * MYK9-2082, MYK9-2376, MYK9-2387: which entries belong on a class's sheets, and which of those run.
 * A thin adapter over the shared rule (`sheetEntryRule.ts`), which the edge function will read too.
 *
 * Listed (the Check-in & Running Order sheet): every entry that belongs to the class, so the
 * secretary sees each one with its status. Only the source half of a move-up and a declined
 * (rejected) entry stay off both sheets. The `emergency_packet_input` RPC still filters more
 * strictly; that is MYK9-2389.
 *
 * Running (a run order, and the judge's Score Sheet): a listed entry that is not Pending,
 * Withdrawn, Pulled or Absent. A dog that is not running gets a blank run order and a status
 * label, never "Order 1".
 */
export interface RunSheetEntryInput {
  entryStatus?: string | null | undefined;
  checkInStatus?: string | null | undefined;
  /** The recorded result text; a result of absent or withdrawn means the dog did not run. */
  resultText?: string | null | undefined;
}

function stateOf(entry: RunSheetEntryInput) {
  return sheetEntryState({
    entryStatus: entry.entryStatus,
    checkInStatus: entry.checkInStatus,
    resultStatus: entry.resultText,
  });
}

/** True for an entry the check-in sheet lists, running or not. */
export function isEntryListedOnCheckIn(entry: RunSheetEntryInput): boolean {
  return stateOf(entry).listed;
}

/** The status the sheet prints for a listed entry that will not run, or `null` when it runs. */
export function notRunningStatusLabel(entry: RunSheetEntryInput): string | null {
  return stateOf(entry).notRunningLabel;
}
