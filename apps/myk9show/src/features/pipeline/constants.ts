import type { PipelineStageMeta, CannedChecklistDef, PipelineStage } from './types';

// ── Stage metadata ──────────────────────────────────────────────

export const STAGE_META: Record<PipelineStage, PipelineStageMeta> = {
  1: { stage: 1, label: 'Trial Setup', shortLabel: 'Setup', description: 'Configure venue, dates, judges, and fees' },
  2: { stage: 2, label: 'Classes & Elements', shortLabel: 'Classes', description: 'Create and configure classes' },
  3: { stage: 3, label: 'Entry Period', shortLabel: 'Entries', description: 'Accept and manage exhibitor entries' },
  4: { stage: 4, label: 'Scoring Day', shortLabel: 'Scoring', description: 'Score all classes and entries' },
  5: { stage: 5, label: 'Results & Reports', shortLabel: 'Results', description: 'Publish results and prepare submissions' },
  6: { stage: 6, label: 'Closed', shortLabel: 'Closed', description: 'Trial archived — read-only' },
};

// ── Canned checklist items ──────────────────────────────────────

export const CANNED_CHECKLIST: CannedChecklistDef[] = [
  // Stage 1: Trial Setup
  {
    key: 'venue_assigned',
    stage: 1,
    label: 'Venue assigned',
    blocking: true,
    evaluate: (ctx) => ctx.trial.venue_name !== null,
    navigateTo: 'venue',
  },
  {
    key: 'dates_confirmed',
    stage: 1,
    label: 'Dates confirmed',
    blocking: true,
    evaluate: (ctx) => ctx.trial.date !== null && ctx.trial.planned_start_time !== null,
    navigateTo: 'dates',
  },
  {
    key: 'judges_assigned',
    stage: 1,
    label: 'Judge(s) assigned',
    blocking: true,
    evaluate: (ctx) => ctx.trial.judge_count > 0,
    navigateTo: 'judges',
  },
  {
    key: 'entry_fees_set',
    stage: 1,
    label: 'Entry fees set',
    blocking: false,
    evaluate: (ctx) => ctx.trial.has_fee_schedule,
    navigateTo: 'fees',
  },

  // Stage 2: Classes & Elements
  {
    key: 'classes_created',
    stage: 2,
    label: 'Classes created',
    blocking: true,
    evaluate: (ctx) => ctx.classes.length > 0,
    navigateTo: 'classes',
  },
  {
    key: 'time_limits_set',
    stage: 2,
    label: 'Time limits set',
    blocking: true,
    evaluate: (ctx) => ctx.classes.length > 0 && ctx.classes.every((c) => c.has_time_limit),
    navigateTo: 'classes',
  },
  {
    key: 'hide_counts_configured',
    stage: 2,
    label: 'Hide counts configured',
    blocking: true,
    evaluate: (ctx) => ctx.classes.length > 0 && ctx.classes.every((c) => c.has_hide_count),
    navigateTo: 'classes',
  },
  {
    key: 'class_capacity_set',
    stage: 2,
    label: 'Class capacity set',
    blocking: false,
    evaluate: (ctx) => ctx.classes.length > 0 && ctx.classes.every((c) => c.has_entry_limit),
    navigateTo: 'classes',
  },

  // Stage 3: Entry Period
  {
    key: 'opening_date_set',
    stage: 3,
    label: 'Opening date set',
    blocking: false,
    evaluate: (ctx) => ctx.trial.entry_open_date !== null,
    navigateTo: 'entry-dates',
  },
  {
    key: 'closing_date_set',
    stage: 3,
    label: 'Closing date set',
    blocking: true,
    evaluate: (ctx) => ctx.trial.entry_close_date !== null,
    navigateTo: 'entry-dates',
  },
  {
    key: 'entries_received',
    stage: 3,
    label: 'Entries received',
    blocking: false,
    evaluate: (ctx) => ctx.trial.entry_count > 0,
    navigateTo: 'entries',
  },
  {
    key: 'entry_conflicts_resolved',
    stage: 3,
    label: 'Entry conflicts resolved',
    blocking: true,
    evaluate: (ctx) => !ctx.hasConflicts,
    conditional: (ctx) => ctx.hasConflicts,
    navigateTo: 'entries',
  },
  {
    key: 'running_order_generated',
    stage: 3,
    label: 'Running order generated',
    blocking: true,
    evaluate: (ctx) => ctx.hasRunningOrder,
    navigateTo: 'run-order',
  },
  {
    key: 'waitlist_processed',
    stage: 3,
    label: 'Waitlist processed',
    blocking: false,
    evaluate: () => false,
    conditional: (ctx) => ctx.hasWaitlist,
    navigateTo: 'waitlist',
  },

  // Stage 4: Scoring Day
  {
    key: 'all_classes_started',
    stage: 4,
    label: 'All classes started',
    blocking: false,
    evaluate: (ctx) =>
      ctx.classes.length > 0 &&
      ctx.classes.every((c) => c.status === 'in-progress' || c.status === 'completed'),
    navigateTo: 'scoring-day',
  },
  {
    key: 'all_entries_scored',
    stage: 4,
    label: 'All entries scored',
    blocking: true,
    evaluate: (ctx) =>
      ctx.entries.length > 0 && ctx.entries.every((e) => e.has_result),
    navigateTo: 'scoring-day',
  },
  {
    key: 'results_reviewed',
    stage: 4,
    label: 'Results reviewed',
    blocking: true,
    evaluate: () => false,
  },

  // Stage 5: Results & Reports
  {
    key: 'results_published',
    stage: 5,
    label: 'Results published',
    blocking: true,
    evaluate: (ctx) => ctx.trial.results_visible,
    navigateTo: 'results',
  },
  {
    key: 'catalog_exported',
    stage: 5,
    label: "Catalog / judge's book exported",
    blocking: false,
    evaluate: () => false,
  },
  {
    key: 'org_submission_prepared',
    stage: 5,
    label: 'Organization submission prepared',
    blocking: false,
    evaluate: () => false,
  },
];

/** Get canned items for a specific stage */
export function getCannedItemsForStage(stage: PipelineStage): CannedChecklistDef[] {
  return CANNED_CHECKLIST.filter((item) => item.stage === stage);
}

/** Get all blocking items for a stage */
export function getBlockingItemsForStage(stage: PipelineStage): CannedChecklistDef[] {
  return CANNED_CHECKLIST.filter((item) => item.stage === stage && item.blocking);
}
