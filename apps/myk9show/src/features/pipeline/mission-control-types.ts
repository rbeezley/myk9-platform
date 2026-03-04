/**
 * Types for the Mission Control class-level pipeline dashboard.
 */

/** Visual pipeline columns for classes */
export type ClassPipelineStage = 'not-started' | 'setup' | 'in-progress' | 'results' | 'closed';

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
  {
    label: string;
    /** Abbreviated label for collapsed/empty columns */
    shortLabel: string;
    description: string;
    /** Subtle column background tint */
    columnBg: string;
    /** Header bottom-border accent */
    headerBorder: string;
  }
> = {
  'not-started': {
    label: 'Not Started',
    shortLabel: 'Not Started',
    description: 'Awaiting setup',
    columnBg: 'bg-muted-foreground/5',
    headerBorder: 'border-muted-foreground/20',
  },
  setup: {
    label: 'Setup / Briefing / Break',
    shortLabel: 'Setup',
    description: 'Judge is setting up, briefing handlers, or on break',
    columnBg: 'bg-yellow-500/10',
    headerBorder: 'border-yellow-500/40',
  },
  'in-progress': {
    label: 'In Progress',
    shortLabel: 'In Progress',
    description: 'Scoring underway',
    columnBg: 'bg-green-500/10',
    headerBorder: 'border-green-500/40',
  },
  results: {
    label: 'Review / Reporting',
    shortLabel: 'Review',
    description: 'Scoring complete — review and report',
    columnBg: 'bg-blue-500/10',
    headerBorder: 'border-blue-500/40',
  },
  closed: {
    label: 'Closed',
    shortLabel: 'Closed',
    description: 'Results finalized',
    columnBg: 'bg-muted-foreground/3',
    headerBorder: 'border-muted-foreground/15',
  },
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
