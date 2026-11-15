/** Route of the Scores not sent list for a show (MYK9-2011). */
export function atShowScoresNotSentPath(showId: string): string {
  return `/at-show/${encodeURIComponent(showId)}/scores-not-sent`;
}

/** Where a "not sent yet" count leads: the list, when there is a show and a score to show. */
export function scoresNotSentHref(
  showId: string | undefined,
  unsentScoreCount: number
): string | undefined {
  return showId && unsentScoreCount > 0 ? atShowScoresNotSentPath(showId) : undefined;
}

/** `OfflineReadyBadge`'s note props from `useSyncNote()`, with the count linked to the list. */
export function syncNoteBadgeProps(
  showId: string | undefined,
  note: { label: string; needsAttention: boolean; unsentScoreCount: number }
): { note: string; noteNeedsAttention: boolean; noteHref: string | undefined } {
  return {
    note: note.label,
    noteNeedsAttention: note.needsAttention,
    noteHref: scoresNotSentHref(showId, note.unsentScoreCount),
  };
}
