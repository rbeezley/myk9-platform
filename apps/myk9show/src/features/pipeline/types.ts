/** Pipeline stage numbers (1-6) */
export type PipelineStage = 1 | 2 | 3 | 4 | 5 | 6;

export const PIPELINE_STAGES = [1, 2, 3, 4, 5, 6] as const;

export interface PipelineStageMeta {
  stage: PipelineStage;
  label: string;
  shortLabel: string;
  description: string;
}

/** Checklist item as stored in the database */
export interface ChecklistItemRow {
  id: string;
  trial_id: string;
  stage: PipelineStage;
  item_key: string;
  item_type: 'canned' | 'custom';
  label: string | null;
  completed: boolean;
  completed_at: string | null;
  completed_by: string | null;
  auto_completed: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/** Canned checklist item definition (code-driven) */
export interface CannedChecklistDef {
  key: string;
  stage: PipelineStage;
  label: string;
  blocking: boolean;
  /** Returns true if the item should auto-complete based on trial data */
  evaluate: (ctx: ChecklistEvalContext) => boolean;
  /** Panel key to open when clicking this item */
  navigateTo?: string;
  /** Only show this item when the condition is true */
  conditional?: (ctx: ChecklistEvalContext) => boolean;
}

/** Context passed to auto-complete evaluators */
export interface ChecklistEvalContext {
  trial: TrialPipelineData;
  classes: ClassPipelineData[];
  entries: EntryPipelineData[];
  hasRunningOrder: boolean;
  hasConflicts: boolean;
  hasWaitlist: boolean;
}

/** Minimal trial data needed for pipeline evaluation */
export interface TrialPipelineData {
  id: string;
  show_id: string;
  name: string;
  date: string;
  pipeline_stage: PipelineStage;
  status: string;
  venue_name: string | null;
  planned_start_time: string | null;
  judge_count: number;
  has_fee_schedule: boolean;
  entry_open_date: string | null;
  entry_close_date: string | null;
  entry_count: number;
  results_visible: boolean;
}

/** Minimal class data for pipeline evaluation */
export interface ClassPipelineData {
  id: string;
  status: string;
  has_time_limit: boolean;
  has_hide_count: boolean;
  has_entry_limit: boolean;
  total_entries: number;
  scored_entries: number;
}

/** Minimal entry data for pipeline evaluation */
export interface EntryPipelineData {
  id: string;
  has_result: boolean;
  has_conflict: boolean;
}

/** Resolved checklist item for display (merged canned def + DB state) */
export interface ResolvedChecklistItem {
  key: string;
  stage: PipelineStage;
  type: 'canned' | 'custom';
  label: string;
  completed: boolean;
  completedAt: string | null;
  completedBy: string | null;
  autoCompleted: boolean;
  blocking: boolean;
  navigateTo?: string | undefined;
  sortOrder: number;
}

/** Activity log entry */
export interface ActivityLogEntry {
  id: string;
  trial_id: string;
  action_type: string;
  description: string;
  actor_id: string | null;
  actor_name: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

/** Filters for the activity log feed */
export interface ActivityLogFilters {
  actionType?: string | undefined;
  actorId?: string | undefined;
  dateFrom?: string | undefined;
  dateTo?: string | undefined;
}
