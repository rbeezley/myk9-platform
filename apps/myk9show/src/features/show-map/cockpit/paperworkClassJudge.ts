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
 * True when this class's judge cannot be told yet, so its card gives no verdict and no
 * confirmation. Both must hold:
 *   (a) its own row does not settle a judge: it resolves no name without `assignedJudges`, or the
 *       `get_show_judges` enrichment has not run (`judge_resolved === false`); and
 *   (b) the show's `assignedJudges` are not available (no show details, e.g. a cold offline open).
 * Otherwise the verdict is computed with `assignedJudges ?? []`. A class whose replica row carries
 * its judge still confirms offline; only classes that depend on `assignedJudges` stay unknown.
 * Rows from PostgREST, legacy or cold replica rows carry `judge_resolved: undefined`, which is not
 * `false`, so they count as settled when they name a judge.
 */
export function paperworkJudgeUnknown(classItem: unknown, assignedJudgesLoaded: boolean): boolean {
  if (assignedJudgesLoaded) return false;
  const row = classItem as JudgeSourceRow;
  const ownRowNamesJudge = paperworkJudgeName(classItem, []) !== paperworkJudgeName(null);
  return !ownRowNamesJudge || row.judge_resolved === false;
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
