/**
 * Did the secretary change a show's judge list? Order-insensitive, by judge.
 *
 * The Edit Show save replaces every show-level judge assignment with the
 * form's list. The list the page loaded can be empty because a device read
 * failed, not because the show has no judges (MYK9-772), and replacing on an
 * untouched form then deleted every real judge. Only a list the secretary
 * actually changed may be written back.
 */
export function showJudgesChanged(
  loaded: ReadonlyArray<{ judgeId: string }>,
  saved: ReadonlyArray<{ judgeId: string }>
): boolean {
  const before = new Set(loaded.map(judge => judge.judgeId));
  const after = new Set(saved.map(judge => judge.judgeId));
  if (before.size !== after.size) return true;
  for (const judgeId of after) if (!before.has(judgeId)) return true;
  return false;
}
