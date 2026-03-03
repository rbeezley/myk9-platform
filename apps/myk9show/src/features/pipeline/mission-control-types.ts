/**
 * Types for the Mission Control class-level pipeline dashboard.
 */

/** Visual pipeline columns for classes */
export type ClassPipelineStage =
  | 'not-started'
  | 'setup'
  | 'in-progress'
  | 'results'
  | 'closed';

/** Ordered list of class pipeline stages for rendering columns */
export const CLASS_PIPELINE_STAGES: ClassPipelineStage[] = [
  'not-started',
  'setup',
  'in-progress',
  'results',
  'closed',
];

/** Display metadata for each class pipeline stage */
export const CLASS_STAGE_META: Record<
  ClassPipelineStage,
  { label: string; description: string }
> = {
  'not-started': { label: 'Not Started', description: 'Awaiting setup' },
  setup: { label: 'Setup', description: 'Judge is setting up hides' },
  'in-progress': { label: 'In Progress', description: 'Scoring underway' },
  results: { label: 'Results', description: 'Scoring complete — review needed' },
  closed: { label: 'Closed', description: 'Results finalized' },
};

/** Class data shaped for pipeline display */
export interface ClassPipelineItem {
  id: string;
  name: string;
  judge_name: string | null;
  status: string | null;
  stage: ClassPipelineStage;
  scored_count: number;
  total_entries: number;
  is_scoring_finalized: boolean;
  /** True when secretary has reviewed results (enables Publish action) */
  is_results_reviewed: boolean;
  start_time: string | null;
  planned_start_time: string | null;
}

/** Stats computed for a show or trial context row */
export interface ContextStats {
  trialCount: number;
  classCount: number;
  scoredCount: number;
  totalEntries: number;
  percentComplete: number;
  percentQualified: number | null;
}
