import { resolveClassJudgeName } from '@/utils/classJudgeDisplay';
import type { ShowJudgeAssignment } from '@/types/judge-types';
import type { DbClass } from '@/types/database-mappings';

type ClassJudgeInput = Parameters<typeof resolveClassJudgeName>[0];

/**
 * The judge name the printed sheet shows, and so the one every paperwork fingerprint hashes
 * (MYK9-2116). This is `resolveClassJudgeName` with the show's `assignedJudges`, the exact call
 * `reportDataMapping` makes for the sheet's `judgeName`, so a pending-first assignment or a judge
 * known only through `assignedJudges` hashes what it prints. The fallback is the sheet's own
 * "TBD", so a class with no judge hashes as that label.
 *
 * A print recorded while the judge was unresolved therefore hashes "TBD" (what the paper says).
 * When the real judge loads, the card reads "changed", which is true: the paper lacks the judge.
 * Recording is deliberately NOT blocked for that reason. A cold or offline card may briefly read
 * "changed" until the judge loads, then corrects itself: it compares what would print now with
 * what was printed.
 */
export function paperworkJudgeName(
  classItem: unknown,
  assignedJudges: ReadonlyArray<ShowJudgeAssignment> = []
): string {
  return resolveClassJudgeName(classItem as ClassJudgeInput, assignedJudges);
}

/** The rows the shared builders take: each class with the name its sheet prints. */
export function withPaperworkJudge(
  classes: readonly DbClass[],
  assignedJudges: ReadonlyArray<ShowJudgeAssignment> = []
) {
  return classes.map(classItem => ({
    ...classItem,
    judgeName: paperworkJudgeName(classItem, assignedJudges),
  }));
}
