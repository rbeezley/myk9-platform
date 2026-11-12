/**
 * MYK9-1844: what the show admin screens (the status pill, the shows list's bulk bar
 * and the show wizard's people pickers) say when a save fails. Each names the
 * action and ends with what to do next; database text never reaches the screen.
 */
export const SHOW_ADMIN_COPY = {
  /** The publish check could not read the club; nothing was written. */
  clubCheckFailed: "We couldn't check the club's status, so the show was not published. Try again.",
  exportFailed: "We couldn't export those shows. Try again.",
  /** One show update; on a refusal the pill still shows the status it had. */
  statusChangeFailed: "We couldn't change this show's status. Try again.",
  /** Every show in the selection came back refused. */
  bulkStatusAllFailed: "We couldn't change the selected shows. None of them changed. Try again.",
  /** The batch stopped part way, so some shows may have changed. */
  bulkStatusUnfinished:
    "We couldn't finish changing the selected shows. Some may have changed, so close this and check the list before you try again.",
  /** The person may have been added before the list refresh failed, so look before adding again. */
  officialSaveFailed:
    "We couldn't save this person. Search the list for them before you try again.",
  judgeCredentialsFailed: "We couldn't save this judge's number and email. Try again.",
  /** The judge may have been added before the list refresh failed. */
  newJudgeFailed:
    "We couldn't add this judge. Search the judge list for them before you try again.",
} as const;

/** Some, not all, of the selected shows were refused. */
export function bulkStatusPartialFailed(failedCount: number, total: number): string {
  return `We couldn't change ${failedCount} of ${total} shows.`;
}
