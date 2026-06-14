# Phase 3: Pipeline Dashboard — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the secretary's tab-based dashboard with a Kanban-style pipeline showing every trial's progress through six stages, each with auto-completing checklists and an activity log.

**Architecture:** New database tables (`trial_checklist_state`, `activity_log`) + `pipeline_stage` column on `trials`. Zustand store for local state, React Query hooks for server state, reusable checklist components with SlideOverPanel for editing. The pipeline **replaces** the existing secretary dashboard at `/secretary/dashboard` as a full mission control center — stats bar, Kanban pipeline, alerts, quick actions, and activity feed all on one screen. Existing dashboard modules (`StatisticsCards`, `QuickActionsSection`, `useSecretaryDashboardData`) are reused.

**Tech Stack:** Supabase (PostgreSQL + RLS), React + TypeScript, Zustand, React Query, shadcn/ui + Tailwind CSS, existing SlideOverPanel system.

---

## Task 1: Database Migration

Create migration 046 with the three schema changes from the design doc.

**Files:**
- Create: `supabase/migrations/046_pipeline_dashboard.sql`

**Step 1: Write the migration SQL**

```sql
-- Migration 046: Pipeline Dashboard
-- Adds pipeline stage tracking, checklist state persistence, and activity logging.

-- =============================================
-- TRIALS TABLE — ADD PIPELINE STAGE
-- =============================================

ALTER TABLE trials
  ADD COLUMN IF NOT EXISTS pipeline_stage INTEGER NOT NULL DEFAULT 1
    CHECK (pipeline_stage >= 1 AND pipeline_stage <= 6);

CREATE INDEX IF NOT EXISTS idx_trials_pipeline_stage ON trials(pipeline_stage);

-- =============================================
-- TRIAL CHECKLIST STATE
-- =============================================

CREATE TABLE IF NOT EXISTS trial_checklist_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trial_id UUID NOT NULL REFERENCES trials(id) ON DELETE CASCADE,
  stage INTEGER NOT NULL CHECK (stage >= 1 AND stage <= 6),
  item_key TEXT NOT NULL,           -- canned item identifier or custom UUID
  item_type TEXT NOT NULL CHECK (item_type IN ('canned', 'custom')),
  label TEXT,                       -- display text (custom items only)
  completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  auto_completed BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT trial_checklist_unique UNIQUE (trial_id, item_key)
);

CREATE INDEX idx_checklist_trial_id ON trial_checklist_state(trial_id);
CREATE INDEX idx_checklist_trial_stage ON trial_checklist_state(trial_id, stage);

CREATE OR REPLACE TRIGGER set_trial_checklist_state_updated_at
  BEFORE UPDATE ON trial_checklist_state
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- ACTIVITY LOG
-- =============================================

CREATE TABLE IF NOT EXISTS activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trial_id UUID NOT NULL REFERENCES trials(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (action_type IN (
    'stage_transition', 'checklist_completed', 'checklist_uncompleted',
    'custom_item_added', 'custom_item_removed',
    'entry_added', 'entry_removed', 'score_submitted',
    'config_changed', 'note'
  )),
  description TEXT NOT NULL,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_name TEXT,
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_activity_log_trial_id ON activity_log(trial_id);
CREATE INDEX idx_activity_log_trial_created ON activity_log(trial_id, created_at DESC);
CREATE INDEX idx_activity_log_action_type ON activity_log(action_type);

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================

ALTER TABLE trial_checklist_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "checklist_select" ON trial_checklist_state
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "checklist_insert" ON trial_checklist_state
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "checklist_update" ON trial_checklist_state
  FOR UPDATE USING (auth.uid() IS NOT NULL);

CREATE POLICY "checklist_delete" ON trial_checklist_state
  FOR DELETE USING (auth.uid() IS NOT NULL);

ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "activity_log_select" ON activity_log
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "activity_log_insert" ON activity_log
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Activity log is append-only: no update/delete policies
```

**Step 2: Push the migration**

```bash
cd d:/AI-Projects/myk9-platform
source .env.local 2>/dev/null || true
npx supabase db push --db-url "postgresql://postgres.sojmvhhwsjxmfistvzbe:$SUPABASE_DB_PASSWORD@aws-1-us-east-2.pooler.supabase.com:5432/postgres"
```

Expected: Migration applies successfully.

**Step 3: Commit**

```bash
git add supabase/migrations/046_pipeline_dashboard.sql
git commit -m "feat(pipeline): add database migration for pipeline dashboard

Adds pipeline_stage column to trials, trial_checklist_state table,
and activity_log table with RLS policies."
```

---

## Task 2: Types & Pipeline Constants

Define the TypeScript types, stage definitions, and canned checklist item configurations.

**Files:**
- Create: `apps/myk9show/src/features/pipeline/types.ts`
- Create: `apps/myk9show/src/features/pipeline/constants.ts`

**Step 1: Create the pipeline types file**

Create `apps/myk9show/src/features/pipeline/types.ts`:

```typescript
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
  /** Route or panel to open when clicking this item */
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
  // Venue/judge/fee fields
  venue_name: string | null;
  planned_start_time: string | null;
  judge_count: number;
  has_fee_schedule: boolean;
  // Entry period
  entry_open_date: string | null;
  entry_close_date: string | null;
  entry_count: number;
  // Results
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
  navigateTo?: string;
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
  actionType?: string;
  actorId?: string;
  dateFrom?: string;
  dateTo?: string;
}
```

**Step 2: Create the canned checklist definitions**

Create `apps/myk9show/src/features/pipeline/constants.ts`:

```typescript
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
    navigateTo: 'venue', // [ADDED] slide-over panel key
  },
  {
    key: 'dates_confirmed',
    stage: 1,
    label: 'Dates confirmed',
    blocking: true,
    evaluate: (ctx) => ctx.trial.date !== null && ctx.trial.planned_start_time !== null,
    navigateTo: 'dates', // [ADDED]
  },
  {
    key: 'judges_assigned',
    stage: 1,
    label: 'Judge(s) assigned',
    blocking: true,
    evaluate: (ctx) => ctx.trial.judge_count > 0,
    navigateTo: 'judges', // [ADDED]
  },
  {
    key: 'entry_fees_set',
    stage: 1,
    label: 'Entry fees set',
    blocking: false,
    evaluate: (ctx) => ctx.trial.has_fee_schedule,
    navigateTo: 'fees', // [ADDED]
  },

  // Stage 2: Classes & Elements
  {
    key: 'classes_created',
    stage: 2,
    label: 'Classes created',
    blocking: true,
    evaluate: (ctx) => ctx.classes.length > 0,
    navigateTo: 'classes', // [ADDED]
  },
  {
    key: 'time_limits_set',
    stage: 2,
    label: 'Time limits set',
    blocking: true, // [CHANGED] was false — design says "at least one class fully configured" to advance
    evaluate: (ctx) => ctx.classes.length > 0 && ctx.classes.every((c) => c.has_time_limit),
    navigateTo: 'classes', // [ADDED]
  },
  {
    key: 'hide_counts_configured',
    stage: 2,
    label: 'Hide counts configured',
    blocking: true, // [CHANGED] part of "fully configured" requirement
    evaluate: (ctx) => ctx.classes.length > 0 && ctx.classes.every((c) => c.has_hide_count),
    navigateTo: 'classes', // [ADDED]
  },
  {
    key: 'class_capacity_set',
    stage: 2,
    label: 'Class capacity set',
    blocking: false,
    evaluate: (ctx) => ctx.classes.length > 0 && ctx.classes.every((c) => c.has_entry_limit),
    navigateTo: 'classes', // [ADDED]
  },

  // Stage 3: Entry Period
  {
    key: 'opening_date_set',
    stage: 3,
    label: 'Opening date set',
    blocking: false,
    evaluate: (ctx) => ctx.trial.entry_open_date !== null,
    navigateTo: 'entry-dates', // [ADDED]
  },
  {
    key: 'closing_date_set',
    stage: 3,
    label: 'Closing date set',
    blocking: true,
    evaluate: (ctx) => ctx.trial.entry_close_date !== null,
    navigateTo: 'entry-dates', // [ADDED]
  },
  {
    key: 'entries_received',
    stage: 3,
    label: 'Entries received',
    blocking: false,
    evaluate: (ctx) => ctx.trial.entry_count > 0,
    navigateTo: 'entries', // [ADDED]
  },
  {
    key: 'entry_conflicts_resolved',
    stage: 3,
    label: 'Entry conflicts resolved',
    blocking: true,
    evaluate: (ctx) => !ctx.hasConflicts,
    conditional: (ctx) => ctx.hasConflicts,
    navigateTo: 'entries', // [ADDED]
  },
  {
    key: 'running_order_generated',
    stage: 3,
    label: 'Running order generated',
    blocking: true,
    evaluate: (ctx) => ctx.hasRunningOrder,
    navigateTo: 'run-order', // [ADDED]
  },
  // [ADDED] Conditional: waitlist processing
  {
    key: 'waitlist_processed',
    stage: 3,
    label: 'Waitlist processed',
    blocking: false,
    evaluate: () => false, // Manual
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
    navigateTo: 'scoring-day', // [ADDED]
  },
  {
    key: 'all_entries_scored',
    stage: 4,
    label: 'All entries scored',
    blocking: true,
    evaluate: (ctx) =>
      ctx.entries.length > 0 && ctx.entries.every((e) => e.has_result),
    navigateTo: 'scoring-day', // [ADDED]
  },
  {
    key: 'results_reviewed',
    stage: 4,
    label: 'Results reviewed',
    blocking: true,
    evaluate: () => false, // Always manual
  },

  // Stage 5: Results & Reports
  {
    key: 'results_published',
    stage: 5,
    label: 'Results published',
    blocking: true,
    evaluate: (ctx) => ctx.trial.results_visible,
    navigateTo: 'results', // [ADDED]
  },
  {
    key: 'catalog_exported',
    stage: 5,
    label: "Catalog / judge's book exported",
    blocking: false,
    evaluate: () => false, // Always manual
  },
  {
    key: 'org_submission_prepared',
    stage: 5,
    label: 'Organization submission prepared',
    blocking: false,
    evaluate: () => false, // Always manual
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
```

**Step 3: Create the barrel export**

Create `apps/myk9show/src/features/pipeline/index.ts`:

```typescript
export * from './types';
export * from './constants';
```

**Step 4: Commit**

```bash
git add apps/myk9show/src/features/pipeline/
git commit -m "feat(pipeline): add pipeline types and checklist definitions

Defines 6 pipeline stages, canned checklist items with auto-complete
evaluators, and TypeScript types for the pipeline dashboard."
```

---

## Task 3: Pipeline Service Layer

Supabase queries for reading/writing checklist state and activity log.

**Files:**
- Create: `apps/myk9show/src/features/pipeline/services/checklistService.ts`
- Create: `apps/myk9show/src/features/pipeline/services/activityLogService.ts`
- Create: `apps/myk9show/src/features/pipeline/services/pipelineService.ts`
- Create: `apps/myk9show/src/features/pipeline/services/index.ts`

**Step 1: Create the checklist service**

Create `apps/myk9show/src/features/pipeline/services/checklistService.ts`:

```typescript
import { supabase } from '@myk9/supabase';
import type { ChecklistItemRow, PipelineStage } from '../types';

export const checklistService = {
  /** Fetch all checklist items for a trial */
  async getByTrial(trialId: string): Promise<ChecklistItemRow[]> {
    const { data, error } = await supabase
      .from('trial_checklist_state')
      .select('*')
      .eq('trial_id', trialId)
      .order('stage')
      .order('sort_order');

    if (error) throw error;
    return (data ?? []) as ChecklistItemRow[];
  },

  /** Upsert a checklist item (canned or custom) */
  async upsert(item: {
    trial_id: string;
    stage: PipelineStage;
    item_key: string;
    item_type: 'canned' | 'custom';
    label?: string;
    completed: boolean;
    completed_by?: string;
    auto_completed?: boolean;
    sort_order?: number;
  }): Promise<ChecklistItemRow> {
    const { data, error } = await supabase
      .from('trial_checklist_state')
      .upsert(
        {
          trial_id: item.trial_id,
          stage: item.stage,
          item_key: item.item_key,
          item_type: item.item_type,
          label: item.label ?? null,
          completed: item.completed,
          completed_at: item.completed ? new Date().toISOString() : null,
          completed_by: item.completed ? (item.completed_by ?? null) : null,
          auto_completed: item.auto_completed ?? false,
          sort_order: item.sort_order ?? 0,
        },
        { onConflict: 'trial_id,item_key' }
      )
      .select()
      .single();

    if (error) throw error;
    return data as ChecklistItemRow;
  },

  /** Delete a custom checklist item */
  async deleteCustomItem(trialId: string, itemKey: string): Promise<void> {
    const { error } = await supabase
      .from('trial_checklist_state')
      .delete()
      .eq('trial_id', trialId)
      .eq('item_key', itemKey)
      .eq('item_type', 'custom');

    if (error) throw error;
  },

  /** Toggle a manual checklist item */
  async toggleItem(
    trialId: string,
    itemKey: string,
    completed: boolean,
    userId: string
  ): Promise<ChecklistItemRow> {
    const { data, error } = await supabase
      .from('trial_checklist_state')
      .update({
        completed,
        completed_at: completed ? new Date().toISOString() : null,
        completed_by: completed ? userId : null,
        auto_completed: false,
      })
      .eq('trial_id', trialId)
      .eq('item_key', itemKey)
      .select()
      .single();

    if (error) throw error;
    return data as ChecklistItemRow;
  },
};
```

**Step 2: Create the activity log service**

Create `apps/myk9show/src/features/pipeline/services/activityLogService.ts`:

```typescript
import { supabase } from '@myk9/supabase';
import type { ActivityLogEntry, ActivityLogFilters } from '../types';

const PAGE_SIZE = 20;

export const activityLogService = {
  /** Fetch paginated activity log for a trial */
  async getByTrial(
    trialId: string,
    filters?: ActivityLogFilters,
    page = 0
  ): Promise<{ entries: ActivityLogEntry[]; hasMore: boolean }> {
    let query = supabase
      .from('activity_log')
      .select('*')
      .eq('trial_id', trialId)
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (filters?.actionType) {
      query = query.eq('action_type', filters.actionType);
    }
    if (filters?.actorId) {
      query = query.eq('actor_id', filters.actorId);
    }
    if (filters?.dateFrom) {
      query = query.gte('created_at', filters.dateFrom);
    }
    if (filters?.dateTo) {
      query = query.lte('created_at', filters.dateTo);
    }

    const { data, error } = await query;
    if (error) throw error;

    const entries = (data ?? []) as ActivityLogEntry[];
    return { entries, hasMore: entries.length === PAGE_SIZE };
  },

  /** Append an entry to the activity log */
  async log(entry: {
    trial_id: string;
    action_type: string;
    description: string;
    actor_id?: string;
    actor_name?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const { error } = await supabase.from('activity_log').insert({
      trial_id: entry.trial_id,
      action_type: entry.action_type,
      description: entry.description,
      actor_id: entry.actor_id ?? null,
      actor_name: entry.actor_name ?? null,
      metadata: entry.metadata ?? {},
    });

    if (error) throw error;
  },
};
```

**Step 3: Create the pipeline stage service**

Create `apps/myk9show/src/features/pipeline/services/pipelineService.ts`:

```typescript
import { supabase } from '@myk9/supabase';
import type { PipelineStage } from '../types';

export const pipelineService = {
  /** Advance a trial to the next pipeline stage */
  async advanceStage(
    trialId: string,
    currentStage: PipelineStage,
    userId: string,
    userName: string
  ): Promise<PipelineStage> {
    if (currentStage >= 6) throw new Error('Trial is already closed');
    const nextStage = (currentStage + 1) as PipelineStage;

    const { error: updateError } = await supabase
      .from('trials')
      .update({ pipeline_stage: nextStage })
      .eq('id', trialId);

    if (updateError) throw updateError;

    // Log the transition
    const { error: logError } = await supabase.from('activity_log').insert({
      trial_id: trialId,
      action_type: 'stage_transition',
      description: `Trial moved to stage ${nextStage}`,
      actor_id: userId,
      actor_name: userName,
      metadata: { from_stage: currentStage, to_stage: nextStage },
    });

    if (logError) {
      console.error('Failed to log stage transition:', logError);
    }

    return nextStage;
  },

  /** Move a trial back to a previous stage (unlock for editing) */
  async revertStage(
    trialId: string,
    targetStage: PipelineStage,
    userId: string,
    userName: string
  ): Promise<void> {
    const { error: updateError } = await supabase
      .from('trials')
      .update({ pipeline_stage: targetStage })
      .eq('id', trialId);

    if (updateError) throw updateError;

    const { error: logError } = await supabase.from('activity_log').insert({
      trial_id: trialId,
      action_type: 'stage_transition',
      description: `Trial reverted to stage ${targetStage}`,
      actor_id: userId,
      actor_name: userName,
      metadata: { to_stage: targetStage, reverted: true },
    });

    if (logError) {
      console.error('Failed to log stage revert:', logError);
    }
  },
};
```

**Step 4: Create barrel export**

Create `apps/myk9show/src/features/pipeline/services/index.ts`:

```typescript
export { checklistService } from './checklistService';
export { activityLogService } from './activityLogService';
export { pipelineService } from './pipelineService';
```

**Step 5: Commit**

```bash
git add apps/myk9show/src/features/pipeline/services/
git commit -m "feat(pipeline): add service layer for checklist, activity log, and stage management

Supabase queries for CRUD on trial_checklist_state, paginated
activity_log reads, and pipeline stage advancement/revert."
```

---

## Task 4: React Query Hooks

Query hooks for fetching pipeline data and mutations for state changes.

**Files:**
- Modify: `apps/myk9show/src/lib/queryClient.ts` (add query keys)
- Create: `apps/myk9show/src/features/pipeline/hooks/useTrialChecklist.ts`
- Create: `apps/myk9show/src/features/pipeline/hooks/useActivityLog.ts`
- Create: `apps/myk9show/src/features/pipeline/hooks/usePipelineMutations.ts`
- Create: `apps/myk9show/src/features/pipeline/hooks/index.ts`

**Step 1: Add pipeline query keys to queryClient.ts**

In `apps/myk9show/src/lib/queryClient.ts`, add to the `queryKeys` object (after the `trialFinancialSummary` line ~167):

```typescript
  // Pipeline
  trialChecklist: (trialId: string) => ['trials', trialId, 'checklist'] as const,
  trialActivityLog: (trialId: string) => ['trials', trialId, 'activity-log'] as const,
  trialPipeline: (trialId: string) => ['trials', trialId, 'pipeline'] as const,
  pipelineOverview: ['pipeline', 'overview'] as const,
```

**Step 2: Create useTrialChecklist hook**

Create `apps/myk9show/src/features/pipeline/hooks/useTrialChecklist.ts`:

```typescript
import { useQuery } from '@tanstack/react-query';
import { queryKeys, cacheStrategies } from '@/lib/queryClient';
import { checklistService } from '../services';
import { getCannedItemsForStage, CANNED_CHECKLIST } from '../constants';
import type {
  ChecklistItemRow,
  ResolvedChecklistItem,
  ChecklistEvalContext,
  PipelineStage,
} from '../types';

/** Merge canned definitions with DB state and auto-evaluate completions */
function resolveChecklist(
  stage: PipelineStage,
  dbItems: ChecklistItemRow[],
  evalCtx: ChecklistEvalContext
): ResolvedChecklistItem[] {
  const dbMap = new Map(dbItems.map((r) => [r.item_key, r]));
  const resolved: ResolvedChecklistItem[] = [];

  // Canned items for this stage
  const cannedDefs = getCannedItemsForStage(stage);
  for (const def of cannedDefs) {
    // Skip conditional items that don't apply
    if (def.conditional && !def.conditional(evalCtx)) continue;

    const dbRow = dbMap.get(def.key);
    const autoResult = def.evaluate(evalCtx);

    resolved.push({
      key: def.key,
      stage: def.stage,
      type: 'canned',
      label: def.label,
      completed: autoResult || (dbRow?.completed ?? false),
      completedAt: autoResult ? null : (dbRow?.completed_at ?? null),
      completedBy: dbRow?.completed_by ?? null,
      autoCompleted: autoResult,
      blocking: def.blocking,
      navigateTo: def.navigateTo,
      sortOrder: dbRow?.sort_order ?? 0,
    });
  }

  // Custom items for this stage
  const customItems = dbItems.filter(
    (r) => r.item_type === 'custom' && r.stage === stage
  );
  for (const item of customItems) {
    resolved.push({
      key: item.item_key,
      stage: item.stage as PipelineStage,
      type: 'custom',
      label: item.label ?? 'Untitled',
      completed: item.completed,
      completedAt: item.completed_at,
      completedBy: item.completed_by,
      autoCompleted: false,
      blocking: false, // Custom items never block
      sortOrder: item.sort_order,
    });
  }

  return resolved.sort((a, b) => {
    // Canned before custom, then by sort order
    if (a.type !== b.type) return a.type === 'canned' ? -1 : 1;
    return a.sortOrder - b.sortOrder;
  });
}

export function useTrialChecklist(
  trialId: string | undefined,
  stage: PipelineStage,
  evalCtx: ChecklistEvalContext | undefined
) {
  return useQuery({
    queryKey: queryKeys.trialChecklist(trialId ?? ''),
    queryFn: () => checklistService.getByTrial(trialId!),
    enabled: !!trialId,
    ...cacheStrategies.dynamic,
    select: (dbItems) => {
      if (!evalCtx) return [];
      return resolveChecklist(stage, dbItems, evalCtx);
    },
  });
}

/** Check whether all blocking items are complete for a stage */
export function useCanAdvanceStage(
  items: ResolvedChecklistItem[] | undefined
): boolean {
  if (!items) return false;
  return items.filter((i) => i.blocking).every((i) => i.completed);
}
```

**Step 3: Create useActivityLog hook**

Create `apps/myk9show/src/features/pipeline/hooks/useActivityLog.ts`:

```typescript
import { useInfiniteQuery } from '@tanstack/react-query';
import { queryKeys, cacheStrategies } from '@/lib/queryClient';
import { activityLogService } from '../services';
import type { ActivityLogFilters } from '../types';

export function useActivityLog(
  trialId: string | undefined,
  filters?: ActivityLogFilters
) {
  return useInfiniteQuery({
    queryKey: [...queryKeys.trialActivityLog(trialId ?? ''), filters],
    queryFn: ({ pageParam = 0 }) =>
      activityLogService.getByTrial(trialId!, filters, pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage, _allPages, lastPageParam) =>
      lastPage.hasMore ? lastPageParam + 1 : undefined,
    enabled: !!trialId,
    ...cacheStrategies.dynamic,
  });
}
```

**Step 4: Create usePipelineMutations hook**

Create `apps/myk9show/src/features/pipeline/hooks/usePipelineMutations.ts`:

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';
import { checklistService, pipelineService, activityLogService } from '../services';
import type { PipelineStage } from '../types';

export function usePipelineMutations(trialId: string) {
  const qc = useQueryClient();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: queryKeys.trialChecklist(trialId) });
    qc.invalidateQueries({ queryKey: queryKeys.trialActivityLog(trialId) });
    qc.invalidateQueries({ queryKey: queryKeys.trial(trialId) });
    qc.invalidateQueries({ queryKey: queryKeys.pipelineOverview });
  };

  const toggleItem = useMutation({
    mutationFn: (args: { itemKey: string; completed: boolean; userId: string }) =>
      checklistService.toggleItem(trialId, args.itemKey, args.completed, args.userId),
    onSuccess: invalidate,
  });

  const addCustomItem = useMutation({
    mutationFn: (args: {
      label: string;
      stage: PipelineStage;
      userId: string;
      userName: string;
    }) => {
      const itemKey = `custom_${crypto.randomUUID()}`;
      return checklistService
        .upsert({
          trial_id: trialId,
          stage: args.stage,
          item_key: itemKey,
          item_type: 'custom',
          label: args.label,
          completed: false,
        })
        .then(() =>
          activityLogService.log({
            trial_id: trialId,
            action_type: 'custom_item_added',
            description: `Custom item added: "${args.label}"`,
            actor_id: args.userId,
            actor_name: args.userName,
          })
        );
    },
    onSuccess: invalidate,
  });

  const deleteCustomItem = useMutation({
    mutationFn: (args: { itemKey: string; userId: string; userName: string }) =>
      checklistService.deleteCustomItem(trialId, args.itemKey).then(() =>
        activityLogService.log({
          trial_id: trialId,
          action_type: 'custom_item_removed',
          description: 'Custom checklist item removed',
          actor_id: args.userId,
          actor_name: args.userName,
        })
      ),
    onSuccess: invalidate,
  });

  const advanceStage = useMutation({
    mutationFn: (args: {
      currentStage: PipelineStage;
      userId: string;
      userName: string;
    }) => pipelineService.advanceStage(trialId, args.currentStage, args.userId, args.userName),
    onSuccess: invalidate,
  });

  const revertStage = useMutation({
    mutationFn: (args: {
      targetStage: PipelineStage;
      userId: string;
      userName: string;
    }) => pipelineService.revertStage(trialId, args.targetStage, args.userId, args.userName),
    onSuccess: invalidate,
  });

  return { toggleItem, addCustomItem, deleteCustomItem, advanceStage, revertStage };
}
```

**Step 5: Create barrel export**

Create `apps/myk9show/src/features/pipeline/hooks/index.ts`:

```typescript
export { useTrialChecklist, useCanAdvanceStage } from './useTrialChecklist';
export { useActivityLog } from './useActivityLog';
export { usePipelineMutations } from './usePipelineMutations';
```

**Step 6: Update feature barrel export**

Update `apps/myk9show/src/features/pipeline/index.ts`:

```typescript
export * from './types';
export * from './constants';
export * from './hooks';
export { checklistService, activityLogService, pipelineService } from './services';
```

**Step 7: Commit**

```bash
git add apps/myk9show/src/features/pipeline/hooks/ apps/myk9show/src/features/pipeline/index.ts apps/myk9show/src/lib/queryClient.ts
git commit -m "feat(pipeline): add React Query hooks for checklist and activity log

useTrialChecklist resolves canned defs + DB state with auto-evaluation.
useActivityLog supports infinite scroll. usePipelineMutations for all
CRUD + stage advancement."
```

---

## Task 5: Mission Control Dashboard (Replaces SecretaryDashboard)

The main secretary dashboard — a full mission control center with stats bar, Kanban pipeline, alerts sidebar, quick actions, and activity feed. Replaces the existing `SecretaryDashboard` at `/secretary/dashboard`.

**Layout:**

```
┌──────────────────────────────────────────────────────────────────┐
│ Mission Control                         [Clone Show] [New Show]  │
├──────────────────────────────────────────────────────────────────┤
│ [Active: 3] [Entries: 142] [Published: 67%] [Avg Time: 4.2min]  │  ← Stats bar (compact)
├─────────────────────────────────────────────┬────────────────────┤
│                                             │ Alerts (if any)    │
│  Pipeline Kanban (6 columns, scrollable)    │ Quick Actions      │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ...  │ Activity Feed      │
│  │Setup │ │Class │ │Entry │ │Score │       │                    │
│  │      │ │      │ │      │ │      │       │                    │
│  └──────┘ └──────┘ └──────┘ └──────┘       │                    │
│                                             │                    │
└─────────────────────────────────────────────┴────────────────────┘
```

**Files:**
- Create: `apps/myk9show/src/features/pipeline/components/PipelineDashboard.tsx`
- Create: `apps/myk9show/src/features/pipeline/components/PipelineColumn.tsx`
- Create: `apps/myk9show/src/features/pipeline/components/TrialPipelineCard.tsx`
- Create: `apps/myk9show/src/features/pipeline/components/MissionControlSidebar.tsx`
- Reuse: `apps/myk9show/src/pages/SecretaryDashboard/StatisticsCards.tsx`
- Reuse: `apps/myk9show/src/pages/SecretaryDashboard/QuickActionsSection.tsx`
- Reuse: `apps/myk9show/src/pages/SecretaryDashboard/useSecretaryDashboardData.ts`

**Step 1: Create TrialPipelineCard**

Create `apps/myk9show/src/features/pipeline/components/TrialPipelineCard.tsx`:

```typescript
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar, Users, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TrialPipelineData, PipelineStage } from '../types';

interface TrialPipelineCardProps {
  trial: TrialPipelineData;
  checklistProgress: { completed: number; total: number };
}

export const TrialPipelineCard: React.FC<TrialPipelineCardProps> = ({
  trial,
  checklistProgress,
}) => {
  const navigate = useNavigate();
  const pct = checklistProgress.total > 0
    ? Math.round((checklistProgress.completed / checklistProgress.total) * 100)
    : 0;

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow border-border/60"
      onClick={() => navigate(`/secretary/pipeline/${trial.id}`)}
    >
      <CardContent className="p-4 space-y-3">
        {/* Trial name */}
        <div className="font-semibold text-sm leading-tight truncate">
          {trial.name}
        </div>

        {/* Date */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Calendar className="h-3 w-3" />
          <span>{new Date(trial.date).toLocaleDateString()}</span>
        </div>

        {/* Entry count (if > 0) */}
        {trial.entry_count > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Users className="h-3 w-3" />
            <span>{trial.entry_count} entries</span>
          </div>
        )}

        {/* Checklist progress bar */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" />
              {checklistProgress.completed}/{checklistProgress.total}
            </span>
            <span className={cn(
              'font-medium',
              pct === 100 ? 'text-green-600' : 'text-muted-foreground'
            )}>
              {pct}%
            </span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-300',
                pct === 100 ? 'bg-green-500' : 'bg-primary'
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
```

**Step 2: Create PipelineColumn**

Create `apps/myk9show/src/features/pipeline/components/PipelineColumn.tsx`:

```typescript
import React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { STAGE_META } from '../constants';
import { TrialPipelineCard } from './TrialPipelineCard';
import type { PipelineStage, TrialPipelineData } from '../types';

interface PipelineColumnProps {
  stage: PipelineStage;
  trials: TrialPipelineData[];
  checklistProgressMap: Map<string, { completed: number; total: number }>;
  isCurrentStage?: boolean;
}

export const PipelineColumn: React.FC<PipelineColumnProps> = ({
  stage,
  trials,
  checklistProgressMap,
  isCurrentStage,
}) => {
  const meta = STAGE_META[stage];

  return (
    <div className={cn(
      'flex flex-col min-w-[280px] max-w-[320px] rounded-lg',
      'bg-muted/30 border border-border/40',
      isCurrentStage && 'ring-2 ring-primary/30'
    )}>
      {/* Column header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-sm">{meta.label}</h3>
          <Badge variant="secondary" className="text-xs px-1.5 py-0">
            {trials.length}
          </Badge>
        </div>
      </div>

      {/* Trial cards */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {trials.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">
            No trials
          </p>
        ) : (
          trials.map((trial) => (
            <TrialPipelineCard
              key={trial.id}
              trial={trial}
              checklistProgress={
                checklistProgressMap.get(trial.id) ?? { completed: 0, total: 0 }
              }
            />
          ))
        )}
      </div>
    </div>
  );
};
```

**Step 3: Create MissionControlSidebar**

Create `apps/myk9show/src/features/pipeline/components/MissionControlSidebar.tsx`:

```typescript
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertTriangle,
  FileText,
  Download,
  ExternalLink,
  Activity,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { DashboardStatistics, TrialOverview } from '@/pages/SecretaryDashboard/secretary-dashboard-types';

interface MissionControlSidebarProps {
  statistics: DashboardStatistics;
  activeTrials: TrialOverview[];
}

export const MissionControlSidebar: React.FC<MissionControlSidebarProps> = ({
  statistics,
  activeTrials,
}) => {
  const navigate = useNavigate();

  return (
    <div className="space-y-4 w-[320px] flex-shrink-0">
      {/* Alerts section — only shows when there are issues */}
      {statistics.activeTrials > 0 && (
        <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Needs Attention
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="space-y-2 text-sm">
              {statistics.totalEntries === 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">No entries yet</span>
                  <Badge variant="outline" className="text-xs">Action needed</Badge>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                {activeTrials.length} active trial{activeTrials.length !== 1 ? 's' : ''} in progress
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Actions */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-sm gap-2"
            onClick={() => navigate('/secretary/entries')}
          >
            <FileText className="h-4 w-4" />
            Manage Entries
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-sm gap-2"
            onClick={() => navigate('/secretary/day-of')}
          >
            <Activity className="h-4 w-4" />
            Day-of Operations
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-sm gap-2"
            onClick={() => navigate('/secretary/waitlist')}
          >
            <ExternalLink className="h-4 w-4" />
            Waitlist
          </Button>
        </CardContent>
      </Card>

      {/* Recent Activity placeholder — will use ActivityLogFeed in detail view */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <p className="text-xs text-muted-foreground text-center py-4">
            Activity feed loads when viewing a specific trial
          </p>
        </CardContent>
      </Card>
    </div>
  );
};
```

**Step 4: Create PipelineDashboard page (Mission Control)**

Create `apps/myk9show/src/features/pipeline/components/PipelineDashboard.tsx`:

```typescript
import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Plus, Copy } from 'lucide-react';
import { SecretaryLayout } from '@/components/secretary/SecretaryLayout';
import { DelightfulLoading } from '@/components/ui/DelightfulLoading';
import { ShowCloneDialog } from '@/components/shows/cloning';
import { StatisticsCards } from '@/pages/SecretaryDashboard/StatisticsCards';
import {
  useSecretaryDashboardData,
} from '@/pages/SecretaryDashboard/useSecretaryDashboardData';
import { PipelineColumn } from './PipelineColumn';
import { MissionControlSidebar } from './MissionControlSidebar';
import { PIPELINE_STAGES } from '../constants';
import { getCannedItemsForStage } from '../constants';
import type { PipelineStage, TrialPipelineData } from '../types';
import { PIPELINE_STAGES as STAGES_ARRAY } from '../types';

export const PipelineDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [showCloneDialog, setShowCloneDialog] = useState(false);

  // Reuse existing dashboard data hook
  const { shows, allTrials, activeTrials, upcomingTrials, completedTrials, statistics } =
    useSecretaryDashboardData();

  const isLoading = allTrials.length === 0 && shows.length === 0;

  // Map trials into pipeline data format
  const pipelineTrials = useMemo<TrialPipelineData[]>(() => {
    return allTrials.map((t) => ({
      id: t.id,
      show_id: t.showId,
      name: t.name ?? `Trial`,
      date: t.date instanceof Date ? t.date.toISOString() : String(t.date),
      pipeline_stage: ((t as unknown as { pipeline_stage?: number }).pipeline_stage ?? 1) as PipelineStage,
      status: t.status,
      venue_name: null,
      planned_start_time: null,
      judge_count: 0,
      has_fee_schedule: false,
      entry_open_date: null,
      entry_close_date: null,
      entry_count: 0,
      results_visible: false,
    }));
  }, [allTrials]);

  // Group by stage
  const trialsByStage = useMemo(() => {
    const map = new Map<PipelineStage, TrialPipelineData[]>();
    for (const s of STAGES_ARRAY) map.set(s, []);
    for (const t of pipelineTrials) {
      const bucket = map.get(t.pipeline_stage) ?? [];
      bucket.push(t);
      map.set(t.pipeline_stage, bucket);
    }
    return map;
  }, [pipelineTrials]);

  // Progress per trial
  const checklistProgressMap = useMemo(() => {
    const map = new Map<string, { completed: number; total: number }>();
    for (const t of pipelineTrials) {
      const cannedCount = getCannedItemsForStage(t.pipeline_stage).length;
      map.set(t.id, { completed: 0, total: cannedCount });
    }
    return map;
  }, [pipelineTrials]);

  if (isLoading) {
    return (
      <SecretaryLayout>
        <DelightfulLoading message="Loading mission control..." />
      </SecretaryLayout>
    );
  }

  return (
    <SecretaryLayout>
      <div className="space-y-6 pt-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Mission Control</h1>
            <p className="text-muted-foreground mt-1">
              {statistics.activeTrials} active trial{statistics.activeTrials !== 1 ? 's' : ''} • {statistics.totalEntries} total entries
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowCloneDialog(true)}
            >
              <Copy className="h-4 w-4 mr-1.5" />
              Clone Show
            </Button>
            <Button
              size="sm"
              onClick={() => navigate('/secretary/create-show/wizard')}
            >
              <Plus className="h-4 w-4 mr-1.5" />
              New Show
            </Button>
          </div>
        </div>

        {/* Compact stats bar */}
        <StatisticsCards statistics={statistics} totalTrialsCount={allTrials.length} />

        {/* Main content: Pipeline + Sidebar */}
        <div className="flex gap-6">
          {/* Kanban pipeline (grows to fill) */}
          <div className="flex-1 overflow-x-auto">
            <div className="flex gap-3 pb-4 min-w-0">
              {STAGES_ARRAY.map((stage) => (
                <PipelineColumn
                  key={stage}
                  stage={stage}
                  trials={trialsByStage.get(stage) ?? []}
                  checklistProgressMap={checklistProgressMap}
                />
              ))}
            </div>
          </div>

          {/* Mission control sidebar */}
          <MissionControlSidebar
            statistics={statistics}
            activeTrials={activeTrials}
          />
        </div>

        {/* Clone dialog */}
        <ShowCloneDialog open={showCloneDialog} onOpenChange={setShowCloneDialog} />
      </div>
    </SecretaryLayout>
  );
};

export default PipelineDashboard;
```

**Step 4: Commit**

```bash
git add apps/myk9show/src/features/pipeline/components/
git commit -m "feat(pipeline): add Kanban pipeline dashboard with stage columns and trial cards

PipelineDashboard shows 6 columns. TrialPipelineCard displays name,
date, entry count, and checklist progress bar."
```

---

## Task 6: Trial Pipeline Detail View (Checklist + Activity)

When clicking a trial card, show the full checklist for the current stage plus the activity log.

**Files:**
- Create: `apps/myk9show/src/features/pipeline/components/TrialPipelineDetail.tsx`
- Create: `apps/myk9show/src/features/pipeline/components/ChecklistSection.tsx`
- Create: `apps/myk9show/src/features/pipeline/components/ChecklistItem.tsx`
- Create: `apps/myk9show/src/features/pipeline/components/AddCustomItemForm.tsx`
- Create: `apps/myk9show/src/features/pipeline/components/StageNavigation.tsx`

**Step 1: Create ChecklistItem component**

Create `apps/myk9show/src/features/pipeline/components/ChecklistItem.tsx`:

```typescript
import React from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Trash2, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ResolvedChecklistItem } from '../types';

interface ChecklistItemProps {
  item: ResolvedChecklistItem;
  onToggle: (key: string, completed: boolean) => void;
  onDelete?: (key: string) => void;
  onNavigate?: (navigateTo: string) => void; // [ADDED] opens slide-over panel
  disabled?: boolean;
}

export const ChecklistItem: React.FC<ChecklistItemProps> = ({
  item,
  onToggle,
  onDelete,
  onNavigate, // [ADDED]
  disabled,
}) => {
  return (
    <div className={cn(
      'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors',
      'hover:bg-muted/50',
      item.completed && 'opacity-70'
    )}>
      <Checkbox
        checked={item.completed}
        onCheckedChange={(checked) => {
          if (item.autoCompleted) return; // Can't uncheck auto-completed
          onToggle(item.key, !!checked);
        }}
        disabled={disabled || item.autoCompleted}
        className={cn(
          item.autoCompleted && 'data-[state=checked]:bg-green-500 data-[state=checked]:border-green-500'
        )}
      />

      {/* [ADDED] Clickable label opens slide-over panel for canned items */}
      <div
        className={cn('flex-1 min-w-0', item.navigateTo && 'cursor-pointer')}
        onClick={() => item.navigateTo && onNavigate?.(item.navigateTo)}
      >
        <span className={cn(
          'text-sm',
          item.completed && 'line-through text-muted-foreground',
          item.navigateTo && 'hover:underline hover:text-primary'
        )}>
          {item.label}
        </span>
      </div>

      <div className="flex items-center gap-1.5 flex-shrink-0">
        {item.autoCompleted && (
          <Badge variant="outline" className="text-[10px] gap-0.5 px-1.5 py-0 text-green-600 border-green-200">
            <Zap className="h-2.5 w-2.5" />
            Auto
          </Badge>
        )}
        {item.blocking && !item.completed && (
          <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
            Required
          </Badge>
        )}
        {item.type === 'custom' && onDelete && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(item.key);
            }}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  );
};
```

**Step 2: Create AddCustomItemForm**

Create `apps/myk9show/src/features/pipeline/components/AddCustomItemForm.tsx`:

```typescript
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus } from 'lucide-react';

interface AddCustomItemFormProps {
  onAdd: (label: string) => void;
  disabled?: boolean;
}

export const AddCustomItemForm: React.FC<AddCustomItemFormProps> = ({
  onAdd,
  disabled,
}) => {
  const [label, setLabel] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = label.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setLabel('');
    setIsOpen(false);
  };

  if (!isOpen) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-start text-muted-foreground text-xs gap-1.5"
        onClick={() => setIsOpen(true)}
        disabled={disabled}
      >
        <Plus className="h-3 w-3" />
        Add custom item
      </Button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 px-1">
      <Input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="e.g., Order ribbons"
        className="h-8 text-sm"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setIsOpen(false);
            setLabel('');
          }
        }}
      />
      <Button type="submit" size="sm" className="h-8" disabled={!label.trim()}>
        Add
      </Button>
    </form>
  );
};
```

**Step 3: Create ChecklistSection**

Create `apps/myk9show/src/features/pipeline/components/ChecklistSection.tsx`:

```typescript
import React from 'react';
import { ChecklistItem } from './ChecklistItem';
import { AddCustomItemForm } from './AddCustomItemForm';
import type { ResolvedChecklistItem } from '../types';

interface ChecklistSectionProps {
  items: ResolvedChecklistItem[];
  onToggle: (key: string, completed: boolean) => void;
  onDeleteCustom: (key: string) => void;
  onAddCustom: (label: string) => void;
  disabled?: boolean;
}

export const ChecklistSection: React.FC<ChecklistSectionProps> = ({
  items,
  onToggle,
  onDeleteCustom,
  onAddCustom,
  disabled,
}) => {
  const cannedItems = items.filter((i) => i.type === 'canned');
  const customItems = items.filter((i) => i.type === 'custom');

  return (
    <div className="space-y-1">
      {/* Canned items */}
      {cannedItems.map((item) => (
        <ChecklistItem
          key={item.key}
          item={item}
          onToggle={onToggle}
          disabled={disabled}
        />
      ))}

      {/* Custom items */}
      {customItems.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border/40 space-y-1">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium px-3 pb-1">
            Your items
          </p>
          {customItems.map((item) => (
            <ChecklistItem
              key={item.key}
              item={item}
              onToggle={onToggle}
              onDelete={onDeleteCustom}
              disabled={disabled}
            />
          ))}
        </div>
      )}

      {/* Add custom item */}
      <div className="pt-2">
        <AddCustomItemForm onAdd={onAddCustom} disabled={disabled} />
      </div>
    </div>
  );
};
```

**Step 4: Create StageNavigation**

Create `apps/myk9show/src/features/pipeline/components/StageNavigation.tsx`:

```typescript
import React from 'react';
import { cn } from '@/lib/utils';
import { Check, Lock } from 'lucide-react';
import { STAGE_META } from '../constants';
import { PIPELINE_STAGES } from '../types';
import type { PipelineStage } from '../types';

interface StageNavigationProps {
  currentStage: PipelineStage;
  viewingStage: PipelineStage;
  onSelectStage: (stage: PipelineStage) => void;
}

export const StageNavigation: React.FC<StageNavigationProps> = ({
  currentStage,
  viewingStage,
  onSelectStage,
}) => {
  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-2">
      {PIPELINE_STAGES.map((stage) => {
        const meta = STAGE_META[stage];
        const isCompleted = stage < currentStage;
        const isCurrent = stage === currentStage;
        const isFuture = stage > currentStage;
        const isViewing = stage === viewingStage;

        return (
          <button
            key={stage}
            onClick={() => onSelectStage(stage)}
            disabled={isFuture}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap',
              isViewing && 'ring-2 ring-primary ring-offset-1',
              isCompleted && 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
              isCurrent && !isViewing && 'bg-primary/10 text-primary',
              isFuture && 'bg-muted text-muted-foreground opacity-50 cursor-not-allowed',
              !isViewing && !isCompleted && !isCurrent && !isFuture && 'bg-muted/50 text-muted-foreground hover:bg-muted'
            )}
          >
            {isCompleted && <Check className="h-3 w-3" />}
            {isFuture && <Lock className="h-3 w-3" />}
            {meta.shortLabel}
          </button>
        );
      })}
    </div>
  );
};
```

**Step 5: Create TrialPipelineDetail page**

Create `apps/myk9show/src/features/pipeline/components/TrialPipelineDetail.tsx`:

```typescript
import React, { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, ArrowRight, ChevronLeft } from 'lucide-react';
import { SecretaryLayout } from '@/components/secretary/SecretaryLayout';
import { DelightfulLoading } from '@/components/ui/DelightfulLoading';
import { useTrialStore } from '@/store/trialStore';
import { useAuth } from '@/context/AuthContext';
import { StageNavigation } from './StageNavigation';
import { ChecklistSection } from './ChecklistSection';
import { ActivityLogFeed } from './ActivityLogFeed';
import { useTrialChecklist, useCanAdvanceStage } from '../hooks/useTrialChecklist';
import { usePipelineMutations } from '../hooks/usePipelineMutations';
import { STAGE_META, getCannedItemsForStage } from '../constants';
import type { PipelineStage, ChecklistEvalContext } from '../types';

export const TrialPipelineDetail: React.FC = () => {
  const { trialId } = useParams<{ trialId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { getTrialById } = useTrialStore();

  const trial = trialId ? getTrialById(trialId) : null;
  const pipelineStage = ((trial as unknown as { pipeline_stage?: number })?.pipeline_stage ?? 1) as PipelineStage;
  const [viewingStage, setViewingStage] = useState<PipelineStage>(pipelineStage);

  // Build evaluation context (simplified — will be hydrated with real data)
  const evalCtx = useMemo<ChecklistEvalContext | undefined>(() => {
    if (!trial) return undefined;
    return {
      trial: {
        id: trial.id,
        show_id: trial.showId,
        name: trial.name ?? '',
        date: trial.trialDate,
        pipeline_stage: pipelineStage,
        status: trial.status,
        venue_name: null,
        planned_start_time: trial.plannedStartTime ?? null,
        judge_count: 0,
        has_fee_schedule: false,
        entry_open_date: null,
        entry_close_date: null,
        entry_count: 0,
        results_visible: false,
      },
      classes: [],
      entries: [],
      hasRunningOrder: false,
      hasConflicts: false,
      hasWaitlist: false,
    };
  }, [trial, pipelineStage]);

  const { data: checklistItems } = useTrialChecklist(trialId, viewingStage, evalCtx);
  const canAdvance = useCanAdvanceStage(checklistItems);
  const mutations = usePipelineMutations(trialId ?? '');

  const isViewingCurrentStage = viewingStage === pipelineStage;
  const isReadOnly = viewingStage < pipelineStage || pipelineStage === 6;
  const stageMeta = STAGE_META[viewingStage];

  if (!trial) {
    return (
      <SecretaryLayout>
        <DelightfulLoading message="Loading trial..." />
      </SecretaryLayout>
    );
  }

  const handleToggle = (key: string, completed: boolean) => {
    if (!user) return;
    mutations.toggleItem.mutate({ itemKey: key, completed, userId: user.id });
  };

  const handleAddCustom = (label: string) => {
    if (!user) return;
    mutations.addCustomItem.mutate({
      label,
      stage: viewingStage,
      userId: user.id,
      userName: user.name ?? 'Unknown',
    });
  };

  const handleDeleteCustom = (key: string) => {
    if (!user) return;
    mutations.deleteCustomItem.mutate({
      itemKey: key,
      userId: user.id,
      userName: user.name ?? 'Unknown',
    });
  };

  const handleAdvance = () => {
    if (!user || !canAdvance) return;
    mutations.advanceStage.mutate({
      currentStage: pipelineStage,
      userId: user.id,
      userName: user.name ?? 'Unknown',
    });
  };

  return (
    <SecretaryLayout>
      <div className="space-y-6 pt-6 max-w-4xl mx-auto">
        {/* Back link */}
        <Button
          variant="ghost"
          size="sm"
          className="gap-1 -ml-2"
          onClick={() => navigate('/secretary/pipeline')}
        >
          <ChevronLeft className="h-4 w-4" />
          Pipeline
        </Button>

        {/* Trial header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {trial.name ?? `Trial ${trial.trialNumber}`}
          </h1>
          <p className="text-muted-foreground">
            {new Date(trial.trialDate).toLocaleDateString()} — {stageMeta.label}
          </p>
        </div>

        {/* Stage navigation tabs */}
        <StageNavigation
          currentStage={pipelineStage}
          viewingStage={viewingStage}
          onSelectStage={setViewingStage}
        />

        {/* Return to current stage prompt */}
        {!isViewingCurrentStage && (
          <button
            onClick={() => setViewingStage(pipelineStage)}
            className="text-xs text-primary hover:underline"
          >
            <ArrowLeft className="h-3 w-3 inline mr-1" />
            Return to current stage ({STAGE_META[pipelineStage].label})
          </button>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Checklist */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">{stageMeta.label} Checklist</CardTitle>
                <p className="text-sm text-muted-foreground">{stageMeta.description}</p>
              </CardHeader>
              <CardContent>
                <ChecklistSection
                  items={checklistItems ?? []}
                  onToggle={handleToggle}
                  onDeleteCustom={handleDeleteCustom}
                  onAddCustom={handleAddCustom}
                  disabled={isReadOnly}
                />

                {/* Advance stage button */}
                {isViewingCurrentStage && pipelineStage < 6 && (
                  <div className="mt-6 pt-4 border-t border-border/40">
                    <Button
                      onClick={handleAdvance}
                      disabled={!canAdvance || mutations.advanceStage.isPending}
                      className="gap-1.5"
                    >
                      Advance to {STAGE_META[(pipelineStage + 1) as PipelineStage]?.label ?? 'Next'}
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                    {!canAdvance && (
                      <p className="text-xs text-muted-foreground mt-2">
                        Complete all required items to advance.
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Activity log sidebar */}
          <div>
            <ActivityLogFeed trialId={trialId!} />
          </div>
        </div>
      </div>
    </SecretaryLayout>
  );
};

export default TrialPipelineDetail;
```

**Step 6: Commit**

```bash
git add apps/myk9show/src/features/pipeline/components/
git commit -m "feat(pipeline): add trial pipeline detail view with checklist and stage nav

ChecklistSection renders canned + custom items with auto-complete badges.
StageNavigation shows completed/current/future stages. AddCustomItemForm
for secretary-defined tasks."
```

---

## Task 7: Activity Log Feed Component

Filterable, paginated activity log displayed in the trial detail sidebar.

**Files:**
- Create: `apps/myk9show/src/features/pipeline/components/ActivityLogFeed.tsx`

**Step 1: Create ActivityLogFeed**

Create `apps/myk9show/src/features/pipeline/components/ActivityLogFeed.tsx`:

```typescript
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ArrowRightLeft,
  CheckCircle2,
  Plus,
  Minus,
  UserPlus,
  FileText,
  Settings,
  MessageSquare,
  Loader2,
} from 'lucide-react';
import { useActivityLog } from '../hooks/useActivityLog';
import type { ActivityLogFilters } from '../types';

const ACTION_ICONS: Record<string, React.ReactNode> = {
  stage_transition: <ArrowRightLeft className="h-3.5 w-3.5 text-blue-500" />,
  checklist_completed: <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />,
  checklist_uncompleted: <Minus className="h-3.5 w-3.5 text-orange-500" />,
  custom_item_added: <Plus className="h-3.5 w-3.5 text-purple-500" />,
  custom_item_removed: <Minus className="h-3.5 w-3.5 text-red-500" />,
  entry_added: <UserPlus className="h-3.5 w-3.5 text-teal-500" />,
  entry_removed: <Minus className="h-3.5 w-3.5 text-red-500" />,
  score_submitted: <FileText className="h-3.5 w-3.5 text-amber-500" />,
  config_changed: <Settings className="h-3.5 w-3.5 text-gray-500" />,
  note: <MessageSquare className="h-3.5 w-3.5 text-blue-400" />,
};

interface ActivityLogFeedProps {
  trialId: string;
}

export const ActivityLogFeed: React.FC<ActivityLogFeedProps> = ({ trialId }) => {
  const [filters, setFilters] = useState<ActivityLogFilters>({});
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useActivityLog(trialId, filters);

  const entries = data?.pages.flatMap((p) => p.entries) ?? [];

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return d.toLocaleDateString();
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Activity</CardTitle>
        </div>
        {/* Filter */}
        <Select
          value={filters.actionType ?? 'all'}
          onValueChange={(v) =>
            setFilters((f) => ({ ...f, actionType: v === 'all' ? undefined : v }))
          }
        >
          <SelectTrigger className="h-7 text-xs w-full">
            <SelectValue placeholder="All activity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All activity</SelectItem>
            <SelectItem value="stage_transition">Stage changes</SelectItem>
            <SelectItem value="checklist_completed">Checklist updates</SelectItem>
            <SelectItem value="entry_added">Entry events</SelectItem>
            <SelectItem value="score_submitted">Score events</SelectItem>
            <SelectItem value="config_changed">Config changes</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : entries.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">
            No activity yet
          </p>
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => (
              <div key={entry.id} className="flex items-start gap-2.5">
                <div className="mt-0.5 flex-shrink-0">
                  {ACTION_ICONS[entry.action_type] ?? (
                    <div className="h-3.5 w-3.5 rounded-full bg-muted" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs leading-relaxed">{entry.description}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {entry.actor_name && (
                      <span className="text-[10px] text-muted-foreground font-medium">
                        {entry.actor_name}
                      </span>
                    )}
                    <span className="text-[10px] text-muted-foreground">
                      {formatTime(entry.created_at)}
                    </span>
                  </div>
                </div>
              </div>
            ))}

            {hasNextPage && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
              >
                {isFetchingNextPage ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                ) : null}
                Load more
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
```

**Step 2: Commit**

```bash
git add apps/myk9show/src/features/pipeline/components/ActivityLogFeed.tsx
git commit -m "feat(pipeline): add activity log feed with filtering and infinite scroll

Displays timestamped entries with action-specific icons, actor names,
relative timestamps, and filter by action type."
```

---

## Task 8: Route Integration (Replace Existing Dashboard)

Replace the existing secretary dashboard with the pipeline mission control, and add the trial detail route.

**Files:**
- Modify: `apps/myk9show/src/routes/secretaryRoutes.tsx`

**Step 1: Replace the dashboard lazy import and add pipeline detail route**

In `apps/myk9show/src/routes/secretaryRoutes.tsx`:

1. Replace the existing `SecretaryDashboard` lazy import with:

```typescript
// Mission Control (replaces old SecretaryDashboard)
const SecretaryDashboard = lazy(() => import('@/features/pipeline/components/PipelineDashboard'));
const TrialPipelineDetail = lazy(() => import('@/features/pipeline/components/TrialPipelineDetail'));
```

2. The existing `/secretary/dashboard` route now points to PipelineDashboard automatically.

3. Add a new route for the trial detail view after the dashboard route:

```tsx
    {/* Pipeline Trial Detail */}
    <Route path="/secretary/pipeline/:trialId" element={
      <ProtectedRoute requiredRole={[UserRole.SECRETARY, UserRole.SITE_ADMIN]}>
        <SuspenseWrapper>
          <PageTransition><TrialPipelineDetail /></PageTransition>
        </SuspenseWrapper>
      </ProtectedRoute>
    } />
```

**Step 2: Verify build compiles**

```bash
cd apps/myk9show && pnpm typecheck
```

Expected: Zero errors (or only pre-existing errors).

**Step 3: Commit**

```bash
git add apps/myk9show/src/routes/secretaryRoutes.tsx
git commit -m "feat(pipeline): replace secretary dashboard with mission control

/secretary/dashboard now serves PipelineDashboard (mission control).
Added /secretary/pipeline/:trialId for trial checklist detail."
```

---

## Task 9: Wire Up — Supabase Import & Trial Type Extension

Ensure the Supabase client import resolves and the Trial type includes `pipeline_stage`.

**Files:**
- Modify: `apps/myk9show/src/components/trials/types/trial.types.ts`
- Create: `apps/myk9show/src/features/pipeline/services/supabaseClient.ts` (re-export for local import resolution)

**Step 1: Extend Trial interface with pipeline_stage**

In `apps/myk9show/src/components/trials/types/trial.types.ts`, add to the `Trial` interface:

```typescript
  pipelineStage?: number | undefined;
```

This allows the trial store to carry pipeline state from the DB.

**Step 2: Verify Supabase import path**

Check that `@myk9/supabase` exports a `supabase` client. If the package exports a factory or differently-named client, create a local re-export in `apps/myk9show/src/features/pipeline/services/supabaseClient.ts`:

```typescript
// Re-export the Supabase client from the workspace package
// Adjust the import if @myk9/supabase exports differently
export { supabase } from '@myk9/supabase';
```

Then update all service files to import from `./supabaseClient` instead of `@myk9/supabase` directly. This decouples the pipeline feature from the exact package export shape.

**Step 3: Run typecheck**

```bash
cd d:/AI-Projects/myk9-platform && pnpm typecheck
```

**Step 4: Commit**

```bash
git add apps/myk9show/src/components/trials/types/trial.types.ts apps/myk9show/src/features/pipeline/
git commit -m "feat(pipeline): extend Trial type with pipelineStage and wire supabase client"
```

---

## Task 10: End-to-End Smoke Test & Polish

Verify the feature works by running the dev server and testing the flow.

**Step 1: Run the dev server**

```bash
cd d:/AI-Projects/myk9-platform && pnpm dev:show
```

**Step 2: Manual verification checklist**

1. Navigate to `/secretary/pipeline` — see Kanban board with 6 columns
2. Verify trial cards appear in the correct stage column
3. Click a trial card → see `/secretary/pipeline/:trialId` detail view
4. See checklist items with auto-complete badges (green "Auto" badge)
5. Toggle a manual checklist item → it persists
6. Add a custom item ("Order ribbons") → appears under "Your items"
7. Delete a custom item → removed
8. Try advancing stage with incomplete blocking items → button disabled
9. Complete all blocking items → advance button enabled
10. Check Activity Log sidebar shows entries

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat(pipeline): Phase 3 Pipeline Dashboard — complete implementation

Kanban-style pipeline with 6 stages, auto-completing checklists,
custom items, stage advancement with blocking rules, and activity log."
```

---

## Task 11: Checklist Item Slide-Over Panels [ADDED]

Each canned checklist item opens a SlideOverPanel for editing the relevant config. The pipeline view stays visible behind the panel.

**Files:**
- Create: `apps/myk9show/src/features/pipeline/components/panels/ChecklistPanelRouter.tsx`
- Modify: `apps/myk9show/src/features/pipeline/components/TrialPipelineDetail.tsx`

**Step 1: Create ChecklistPanelRouter**

Create `apps/myk9show/src/features/pipeline/components/panels/ChecklistPanelRouter.tsx`:

```typescript
import React from 'react';
import { SlideOverPanel } from '@/components/panels/SlideOverPanel';

interface ChecklistPanelRouterProps {
  panelKey: string | null;
  trialId: string;
  showId: string;
  onClose: () => void;
}

/**
 * Routes a checklist item's navigateTo key to the correct slide-over panel content.
 * Each panel contains the editing form for that config area.
 * New panels are added here as we build out each config screen.
 */
export const ChecklistPanelRouter: React.FC<ChecklistPanelRouterProps> = ({
  panelKey,
  trialId,
  showId,
  onClose,
}) => {
  if (!panelKey) return null;

  // Panel titles and content mapped by key
  const panelConfig: Record<string, { title: string; subtitle?: string }> = {
    venue: { title: 'Venue Assignment', subtitle: 'Set the trial venue' },
    dates: { title: 'Trial Dates', subtitle: 'Confirm dates and start times' },
    judges: { title: 'Judge Assignment', subtitle: 'Assign judges to this trial' },
    fees: { title: 'Entry Fees', subtitle: 'Configure fee schedule' },
    classes: { title: 'Class Configuration', subtitle: 'Create and configure classes' },
    'entry-dates': { title: 'Entry Period', subtitle: 'Set open and close dates' },
    entries: { title: 'Entry Management', subtitle: 'View and manage entries' },
    'run-order': { title: 'Running Order', subtitle: 'Generate and review run order' },
    waitlist: { title: 'Waitlist', subtitle: 'Process waitlist entries' },
    'scoring-day': { title: 'Scoring Day', subtitle: 'Monitor scoring progress' },
    results: { title: 'Results', subtitle: 'Publish and review results' },
  };

  const config = panelConfig[panelKey];
  if (!config) return null;

  return (
    <SlideOverPanel
      open={!!panelKey}
      onClose={onClose}
      title={config.title}
      subtitle={config.subtitle}
      size="lg"
    >
      <div className="p-6">
        {/* Placeholder: each panel key will be wired to its config form.
            For now, show a message directing to the existing page. */}
        <p className="text-sm text-muted-foreground">
          Configuration panel for "{panelKey}" — will be wired to existing
          edit forms. Trial: {trialId}, Show: {showId}.
        </p>
      </div>
    </SlideOverPanel>
  );
};
```

**Step 2: Wire into TrialPipelineDetail**

In `TrialPipelineDetail.tsx`, add state and render:

```typescript
// Add at top of component:
const [activePanel, setActivePanel] = useState<string | null>(null);

// Pass onNavigate to ChecklistSection:
<ChecklistSection
  items={checklistItems ?? []}
  onToggle={handleToggle}
  onDeleteCustom={handleDeleteCustom}
  onAddCustom={handleAddCustom}
  onNavigate={setActivePanel}  // [ADDED]
  disabled={isReadOnly}
/>

// Render panel at end of component (before closing SecretaryLayout):
<ChecklistPanelRouter
  panelKey={activePanel}
  trialId={trialId!}
  showId={trial.showId}
  onClose={() => setActivePanel(null)}
/>
```

Also update ChecklistSection to pass `onNavigate` through to each ChecklistItem.

**Step 3: Commit**

```bash
git add apps/myk9show/src/features/pipeline/components/panels/
git commit -m "feat(pipeline): add slide-over panel router for checklist item editing

ChecklistPanelRouter maps navigateTo keys to SlideOverPanel content.
Clicking a canned checklist item opens the relevant config panel."
```

---

## Task 12: Scoring Day Summary Card [ADDED]

The design doc specifies a per-class progress summary when viewing Stage 4.

**Files:**
- Create: `apps/myk9show/src/features/pipeline/components/ScoringDaySummary.tsx`
- Modify: `apps/myk9show/src/features/pipeline/components/TrialPipelineDetail.tsx`

**Step 1: Create ScoringDaySummary component**

Create `apps/myk9show/src/features/pipeline/components/ScoringDaySummary.tsx`:

```typescript
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Loader2, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ClassPipelineData } from '../types';

interface ScoringDaySummaryProps {
  trialId: string;
  showId: string;
  classes: ClassPipelineData[];
}

export const ScoringDaySummary: React.FC<ScoringDaySummaryProps> = ({
  trialId,
  showId,
  classes,
}) => {
  const navigate = useNavigate();
  const completedCount = classes.filter((c) => c.status === 'completed').length;

  return (
    <Card className="border-amber-200 dark:border-amber-800">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">
            Scoring Day: {completedCount} of {classes.length} classes complete
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            className="gap-1"
            onClick={() => navigate(`/secretary/day-of`)}
          >
            Open Scoring View
            <ExternalLink className="h-3 w-3" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-1.5">
          {classes.map((cls) => {
            const isComplete = cls.status === 'completed';
            const isInProgress = cls.status === 'in-progress';
            return (
              <div key={cls.id} className="flex items-center gap-2 text-sm">
                {isComplete ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                ) : isInProgress ? (
                  <Loader2 className="h-4 w-4 text-amber-500 animate-spin flex-shrink-0" />
                ) : (
                  <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30 flex-shrink-0" />
                )}
                <span className={cn(isComplete && 'text-muted-foreground')}>
                  Class {cls.id.slice(0, 6)}
                </span>
                <span className="text-xs text-muted-foreground ml-auto">
                  {cls.scored_entries}/{cls.total_entries} scored
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};
```

**Step 2: Render in TrialPipelineDetail when viewing Stage 4**

In `TrialPipelineDetail.tsx`, inside the checklist card area, add before the ChecklistSection:

```typescript
{viewingStage === 4 && evalCtx && evalCtx.classes.length > 0 && (
  <ScoringDaySummary
    trialId={trialId!}
    showId={trial.showId}
    classes={evalCtx.classes}
  />
)}
```

**Step 3: Commit**

```bash
git add apps/myk9show/src/features/pipeline/components/ScoringDaySummary.tsx
git commit -m "feat(pipeline): add Scoring Day per-class progress summary card

Shows class-by-class scoring progress with completed/in-progress/pending
indicators. Links to the full Scoring Day view."
```

---

## Task 13: Wizard Handoff & Unlock Stage [ADDED]

Wire the Create Show Wizard to navigate into the pipeline after completion, and add an unlock button for previous stages.

**Files:**
- Modify: `apps/myk9show/src/pages/secretary/ShowCreationWizardPage.tsx` (navigate to pipeline after completion)
- Modify: `apps/myk9show/src/features/pipeline/components/TrialPipelineDetail.tsx` (unlock button)

**Step 1: Find the wizard completion handler**

In `ShowCreationWizardPage.tsx`, locate the success/completion handler that runs after a show is created. It likely navigates to the show detail page.

**Step 2: Add pipeline navigation option**

After the show and its first trial are created, navigate to the pipeline detail view:

```typescript
// In the wizard's completion handler, after creating the show:
// Replace or augment the existing navigation:
navigate(`/secretary/pipeline/${firstTrialId}`);
```

If the wizard creates a show (not a trial directly), navigate to the pipeline overview:

```typescript
navigate('/secretary/pipeline');
```

**Step 3: Add unlock button for read-only previous stages**

In `TrialPipelineDetail.tsx`, when `isReadOnly && viewingStage < pipelineStage`, render:

```typescript
{isReadOnly && viewingStage < pipelineStage && (
  <Button
    variant="outline"
    size="sm"
    className="text-xs gap-1"
    onClick={() => {
      if (!user) return;
      mutations.revertStage.mutate({
        targetStage: viewingStage,
        userId: user.id,
        userName: user.name ?? 'Unknown',
      });
    }}
    disabled={mutations.revertStage.isPending}
  >
    <Lock className="h-3 w-3" />
    Unlock for editing
  </Button>
)}
```

**Step 4: Commit**

```bash
git add apps/myk9show/src/pages/secretary/ShowCreationWizardPage.tsx apps/myk9show/src/features/pipeline/components/TrialPipelineDetail.tsx
git commit -m "feat(pipeline): wizard handoff to pipeline + unlock previous stages

Show creation wizard navigates to pipeline on completion.
Previous stages show an unlock button to revert for editing."
```

---

## Summary

| Task | Description | Key Files |
|------|-------------|-----------|
| 1 | Database migration | `supabase/migrations/046_pipeline_dashboard.sql` |
| 2 | Types & constants | `features/pipeline/types.ts`, `constants.ts` |
| 3 | Service layer | `features/pipeline/services/` (3 services) |
| 4 | React Query hooks | `features/pipeline/hooks/` (3 hooks) |
| 5 | Mission control dashboard | `features/pipeline/components/PipelineDashboard.tsx`, `MissionControlSidebar.tsx` |
| 6 | Trial detail view | `features/pipeline/components/TrialPipelineDetail.tsx` |
| 7 | Activity log feed | `features/pipeline/components/ActivityLogFeed.tsx` |
| 8 | Route integration (replace dashboard) | `routes/secretaryRoutes.tsx` |
| 9 | Type wiring | `trial.types.ts`, supabase client import |
| 10 | Smoke test | Manual verification |
| 11 | Slide-over panels [ADDED] | `features/pipeline/components/panels/ChecklistPanelRouter.tsx` |
| 12 | Scoring Day summary [ADDED] | `features/pipeline/components/ScoringDaySummary.tsx` |
| 13 | Wizard handoff + unlock [ADDED] | `ShowCreationWizardPage.tsx`, `TrialPipelineDetail.tsx` |

**Design doc validation criteria met:**
1. Kanban pipeline view (Task 5)
2. Checklist with auto-complete + manual items (Tasks 2, 4, 6)
3. Custom checklist items (Task 6)
4. Blocking rules prevent stage advancement (Tasks 2, 4, 6)
5. Activity log timeline (Tasks 3, 4, 7)

**Additional design doc requirements covered by patches:**
6. Slide-over panel editing UX (Task 11)
7. Canned items as navigation links (Task 2 navigateTo + Task 6 onNavigate)
8. Scoring Day parallel gate summary card (Task 12)
9. Wizard handoff to pipeline (Task 13)
10. Unlock previous stages for editing (Task 13)
11. Waitlist conditional item (Task 2)
12. Stage 2 "fully configured" blocking rule (Task 2)

**Deferred to future sprints (low-impact, design doc marks as future-facing):**
- Stage variants (single-day vs multi-day) — auto-detection from trial dates
- Exception paths — inline side-lane tasks
- Premium results synced conditional item — depends on premium subscription data
