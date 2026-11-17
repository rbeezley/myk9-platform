import { resolveClassJudgeName } from '@/utils/classJudgeDisplay';
import type { ShowJudgeAssignment } from '@/types/judge-types';
import type { DbClass } from '@/types/database-mappings';

type JudgeSourceRow = { judge_assignments?: unknown; judge_resolved?: boolean | undefined };
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
 * Recording is deliberately NOT blocked for that reason; only the card verdict is withheld, for
 * the window before the class's judge enrichment has run (`paperworkJudgeUnknown`).
 */
export function paperworkJudgeName(
  classItem: unknown,
  assignedJudges: ReadonlyArray<ShowJudgeAssignment> = []
): string {
  return resolveClassJudgeName(classItem as ClassJudgeInput, assignedJudges);
}

/**
 * True when the class's judge is not known yet: the replica holds no name for it, no
 * `assignedJudges` entry names one, and the `get_show_judges` enrichment has not run
 * (`judge_resolved === false`). A verdict built now would read "changed" and then flip back as the
 * judge loads. Rows from PostgREST, legacy or cold replica rows carry `judge_resolved: undefined`
 * and count as known.
 */
export function paperworkJudgeUnknown(
  classItem: unknown,
  assignedJudges: ReadonlyArray<ShowJudgeAssignment> = []
): boolean {
  const row = classItem as JudgeSourceRow;
  return (
    row.judge_resolved === false &&
    paperworkJudgeName(classItem, assignedJudges) === paperworkJudgeName(null)
  );
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
