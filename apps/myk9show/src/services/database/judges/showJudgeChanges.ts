/**
 * What a secretary changed in a show's judge list: judges to add and judges to
 * remove, by judgeId, ignoring order.
 *
 * Judge edits are saved as this DIFFERENCE, never as "replace the list". The
 * list a form was loaded from can be empty because a device read failed, not
 * because the show has no judges; replacing with the form's list then deleted
 * every real judge (MYK9-772). A difference can only remove a judge the
 * secretary saw and took off the list.
 */
export function diffShowJudges(
  loaded: ReadonlyArray<{ judgeId: string }>,
  saved: ReadonlyArray<{ judgeId: string }>
): { add: string[]; remove: string[] } {
  const before = new Set(loaded.map(judge => judge.judgeId));
  const after = new Set(saved.map(judge => judge.judgeId));
  return {
    add: [...after].filter(judgeId => !before.has(judgeId)),
    remove: [...before].filter(judgeId => !after.has(judgeId)),
  };
}
