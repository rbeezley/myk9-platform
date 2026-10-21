import type { PipelineStageMeta, PipelineStage } from './types';

// ── Stage metadata ──────────────────────────────────────────────

export const STAGE_META: Record<PipelineStage, PipelineStageMeta> = {
  1: {
    stage: 1,
    label: 'Trial Setup',
    shortLabel: 'Setup',
    description: 'Configure venue, dates, judges, and fees',
  },
  2: {
    stage: 2,
    label: 'Classes & Elements',
    shortLabel: 'Classes',
    description: 'Create and configure classes',
  },
  3: {
    stage: 3,
    label: 'Entry Period',
    shortLabel: 'Entries',
    description: 'Accept and manage exhibitor entries',
  },
  4: {
    stage: 4,
    label: 'Scoring Day',
    shortLabel: 'Scoring',
    description: 'Score all classes and entries',
  },
  5: {
    stage: 5,
    label: 'Results & Reports',
    shortLabel: 'Results',
    description: 'Publish results and prepare submissions',
  },
  6: { stage: 6, label: 'Closed', shortLabel: 'Closed', description: 'Trial archived — read-only' },
};
