import { resolveClassJudgeFields } from '@/services/database/_shared/classJudgeFields';
import type { DbClass } from '@/types/database-mappings';

/** A class row that reads `judge_assignments` and says whether the judge enrichment ran. */
type JudgeSourceRow = { judge_assignments?: unknown; judge_resolved?: boolean | undefined };

/**
 * The class's confirmed judge as the app shows it (`resolveClassJudgeFields`), or null for none.
 * Every paperwork fingerprint hashes this one value, so the print-time and class-card fingerprints
 * cannot disagree (MYK9-2116).
 */
export function paperworkJudgeName(classItem: unknown): string | null {
  const row = classItem as JudgeSourceRow;
  return resolveClassJudgeFields({ judge_assignments: row.judge_assignments }).name ?? null;
}

/**
 * True when the class's judge is not known yet: the replica holds no name and the
 * `get_show_judges` enrichment has not run for it. "No judge" and "judge not loaded" hash the
 * same, so a verdict built now would flip a good print to "changed" and back once the judge loads.
 * Rows from PostgREST carry no flag and count as known.
 */
export function paperworkJudgeUnknown(classItem: unknown): boolean {
  const row = classItem as JudgeSourceRow;
  return row.judge_resolved === false && paperworkJudgeName(classItem) === null;
}

/** The rows the shared builders take: each class with its resolved judge name. */
export function withPaperworkJudge(classes: readonly DbClass[]) {
  return classes.map(classItem => ({ ...classItem, judgeName: paperworkJudgeName(classItem) }));
}
