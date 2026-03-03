import type { ClassPipelineStage } from '../mission-control-types';

/**
 * Maps a database class status + finalization flag to a visual pipeline stage.
 *
 * DB statuses (from CHECK constraint on classes table):
 *   no-status, setup, briefing, break, start_time, in_progress, offline-scoring, completed
 *
 * Pipeline columns:
 *   not-started  <- no-status (or null)
 *   setup        <- setup
 *   in-progress  <- briefing, start_time, in_progress, break, offline-scoring
 *   results      <- completed AND NOT finalized
 *   closed       <- completed AND finalized (is_scoring_finalized = true)
 */
export function mapClassToStage(
  status: string | null | undefined,
  isScoringFinalized: boolean | null | undefined,
): ClassPipelineStage {
  const s = status ?? 'no-status';

  if (s === 'completed') {
    return isScoringFinalized ? 'closed' : 'results';
  }

  switch (s) {
    case 'setup':
      return 'setup';
    case 'briefing':
    case 'start_time':
    case 'in_progress':
    case 'break':
    case 'offline-scoring':
      return 'in-progress';
    case 'no-status':
    default:
      return 'not-started';
  }
}

/**
 * Groups an array of class items by their pipeline stage.
 */
export function groupClassesByStage<T extends { stage: ClassPipelineStage }>(
  classes: T[],
): Map<ClassPipelineStage, T[]> {
  const map = new Map<ClassPipelineStage, T[]>();
  for (const stage of [
    'not-started',
    'setup',
    'in-progress',
    'results',
    'closed',
  ] as ClassPipelineStage[]) {
    map.set(stage, []);
  }
  for (const cls of classes) {
    map.get(cls.stage)!.push(cls);
  }
  return map;
}
