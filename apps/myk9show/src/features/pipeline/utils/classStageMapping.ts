import { CLASS_PIPELINE_STAGES, type ClassPipelineStage } from '../mission-control-types';

export function mapClassToStage(
  status: string | null | undefined,
  isScoringFinalized: boolean | null | undefined
): ClassPipelineStage {
  const s = status ?? 'upcoming';

  if (s === 'completed') {
    return isScoringFinalized ? 'closed' : 'results';
  }

  switch (s) {
    case 'setup':
      return 'setup';
    case 'in_progress':
      return 'in-progress';
    case 'upcoming':
    case 'cancelled':
    default:
      return 'not-started';
  }
}

export function stageToDefaultStatus(stage: ClassPipelineStage): {
  status: string;
  is_scoring_finalized?: boolean;
} {
  switch (stage) {
    case 'not-started':
      return { status: 'upcoming' };
    case 'setup':
      return { status: 'setup' };
    case 'in-progress':
      return { status: 'in_progress' };
    case 'results':
      return { status: 'completed', is_scoring_finalized: false };
    case 'closed':
      return { status: 'completed', is_scoring_finalized: true };
  }
}

export function groupClassesByStage<T extends { stage: ClassPipelineStage }>(
  classes: T[]
): Map<ClassPipelineStage, T[]> {
  const map = new Map<ClassPipelineStage, T[]>();
  for (const stage of CLASS_PIPELINE_STAGES) {
    map.set(stage, []);
  }
  for (const cls of classes) {
    map.get(cls.stage)!.push(cls);
  }
  return map;
}
