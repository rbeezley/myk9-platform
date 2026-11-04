import { isJudgeSignedOff } from './classChecklist';
import type { SecretaryCockpitPaperwork } from './secretaryCockpitTypes';

/**
 * Whether a show has chosen to use print tracking and the class checklist (MYK9-1620). A feature
 * the secretary never chose to use is invisible, not unfinished: until it is used the cockpit
 * shows no "Not confirmed printed", no "Prepare" chips, no "X of 7 steps done". Derived from data
 * that already exists (print records, judge sign-offs); there is no setting.
 *
 * Computed once, where the cockpit snapshot is built. Consumers read the snapshot.
 */

/**
 * True once any sheet on the show was printed from the app or marked "Record as printed" (a
 * voided record still counts: someone used it). When the print records could not be read, it is
 * true as well: never hide show-day paperwork state because we could not find out.
 */
export function isPrintTrackingInUse(input: {
  paperworkByClassId: ReadonlyMap<string, readonly SecretaryCockpitPaperwork[]> | undefined;
  /** False when the class rows or the server print read failed (`useShowClassPaperwork`). */
  paperworkAvailable: boolean;
  /** Any raw print record exists for the show (`useShowClassPaperwork.hasPrintRecords`). */
  hasPrintRecords?: boolean | undefined;
}): boolean {
  if (!input.paperworkAvailable || input.hasPrintRecords) return true;
  for (const rows of input.paperworkByClassId?.values() ?? []) {
    for (const row of rows) {
      if (row.state === 'unknown' || row.printedAt || row.recordId) return true;
      if (row.history && row.history.length > 0) return true;
    }
  }
  return false;
}

/**
 * True once print tracking is in use, or a judge sign-off is recorded on the show. Auto-derived
 * items (class started, scoring complete) do not count, or every show would switch it on at its
 * first run.
 */
export function isChecklistInUse(input: {
  printTrackingInUse: boolean;
  /**
   * `judgeSignedOffAt` is the stored sign-off; `wrapUpStatus` is derived from the entries, so it
   * can mask a stored sign-off while the entries are unreadable.
   */
  classes: readonly {
    wrapUpStatus?: string | null | undefined;
    judgeSignedOffAt?: string | null | undefined;
  }[];
}): boolean {
  return (
    input.printTrackingInUse ||
    input.classes.some(cls => Boolean(cls.judgeSignedOffAt) || isJudgeSignedOff(cls.wrapUpStatus))
  );
}
