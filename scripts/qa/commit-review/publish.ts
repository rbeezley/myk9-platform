import { readBoundaryFromSha } from './record';
import type { GitFn, RunRecord } from './types';

export const BOUNDARY_PATH = 'docs/qa/audit-boundary.md';

export function reportPathFor(record: Pick<RunRecord, 'runId'>): string {
  return `docs/qa/codex-daily-commit-review-${record.runId.slice(0, 10)}.md`;
}

export interface PublishCheck {
  ok: boolean;
  reasons: string[];
  reportPath: string;
  cursorSha?: string;
}

/**
 * Read-only readback of the one-report-and-cursor commit on origin/main.
 * Succeeds when the report exists and names the run's target SHA, and the
 * cursor row is at the target or at a descendant of it (a newer stamp from the
 * Claude failover or a later run is never treated as a failure, and nothing
 * here writes, so an older stamp can never overwrite a newer one).
 */
export function publishCheck(
  record: Pick<RunRecord, 'runId' | 'boundary'>,
  git: GitFn
): PublishCheck {
  const reportPath = reportPathFor(record);
  const { toSha } = record.boundary;
  const reasons: string[] = [];
  let cursorSha: string | undefined;
  try {
    git(['fetch', 'origin', 'main']);
  } catch (err) {
    return {
      ok: false,
      reasons: [`git fetch origin main failed: ${(err as Error).message}`],
      reportPath,
    };
  }
  try {
    const report = git(['show', `origin/main:${reportPath}`]);
    if (!report.includes(toSha) && !report.includes(toSha.slice(0, 9)))
      reasons.push(`${reportPath} on origin/main does not name target ${toSha}`);
  } catch {
    reasons.push(`${reportPath} is not on origin/main`);
  }
  try {
    cursorSha = readBoundaryFromSha(git(['show', `origin/main:${BOUNDARY_PATH}`]));
    if (cursorSha !== toSha) {
      let descendant = false;
      try {
        git(['merge-base', '--is-ancestor', toSha, cursorSha]);
        descendant = true;
      } catch {
        descendant = false;
      }
      if (!descendant)
        reasons.push(`cursor row on origin/main is ${cursorSha}, not ${toSha} or a descendant`);
    }
  } catch (err) {
    reasons.push(`could not read the cursor row on origin/main: ${(err as Error).message}`);
  }
  return { ok: reasons.length === 0, reasons, reportPath, cursorSha };
}
