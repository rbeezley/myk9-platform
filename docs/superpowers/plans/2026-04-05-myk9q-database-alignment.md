# myK9Q Database Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make myK9Q run against the unified platform Supabase database by reconciling column names, creating compatibility views, and adding missing schema elements.

**Architecture:** Platform migration adds missing columns + views. myK9Q code refactored layer-by-layer: types first, then replication tables, then services, then UI consumers. The `view_myk9q_entries` view handles entry column aliasing at the DB level so the myK9Q `Entry` interface stays stable.

**Tech Stack:** PostgreSQL (Supabase), TypeScript, Vitest

**Spec:** `docs/superpowers/specs/2026-04-05-myk9q-database-alignment-design.md`

---

## File Map

### New files

- `supabase/migrations/115_myk9q_compatibility.sql` — Schema additions + views

### Modified files (by task)

**Task 1 — Migration:** New file only

**Task 2 — Replication type interfaces + sync methods:**

- `apps/myk9q/src/services/replication/tables/ReplicatedShowsTable.ts`
- `apps/myk9q/src/services/replication/tables/ReplicatedTrialsTable.ts`
- `apps/myk9q/src/services/replication/tables/ReplicatedClassesTable.ts`
- `apps/myk9q/src/services/replication/tables/ReplicatedEntriesTable.ts`
- `apps/myk9q/src/services/replication/tables/ReplicatedClassRequirementsTable.ts`
- `apps/myk9q/src/services/replication/tables/ReplicatedStatsViewTable.ts`
- `apps/myk9q/src/services/replication/tables/ReplicatedAuditLogViewTable.ts`
- `apps/myk9q/src/services/replication/tables/ReplicatedEventStatisticsTable.ts`

**Task 3 — Supabase client types:**

- `apps/myk9q/src/lib/supabase.ts`

**Task 4 — Services (direct Supabase queries):**

- `apps/myk9q/src/services/authService.ts`
- `apps/myk9q/src/services/entryService.ts`
- `apps/myk9q/src/services/entryDataFetching.ts`
- `apps/myk9q/src/services/preloadServiceHelpers.ts`
- `apps/myk9q/src/services/chatbotService.ts`
- `apps/myk9q/src/services/auditLogService.ts`
- `apps/myk9q/src/services/autoDownloadService.ts`
- `apps/myk9q/src/services/databaseDetectionService.ts`
- `apps/myk9q/src/services/entryReplication.ts`
- `apps/myk9q/src/services/entry/classCompletionService.ts`
- `apps/myk9q/src/services/entry/entryBatchOperations.ts`
- `apps/myk9q/src/services/placementService.ts`
- `apps/myk9q/src/services/runOrderService.ts`
- `apps/myk9q/src/services/nationalsScoring.ts`

**Task 5 — Stores, utils, workers:**

- `apps/myk9q/src/stores/announcementStore.ts`
- `apps/myk9q/src/utils/statusUtils.ts`
- `apps/myk9q/src/utils/entryMappers.ts`
- `apps/myk9q/src/utils/staleDataUtils.ts`
- `apps/myk9q/src/utils/pushNotificationService.ts`
- `apps/myk9q/src/utils/admin-data-utils.ts`
- `apps/myk9q/src/workers/dataTransformer.worker.ts`

**Task 6 — Pages and components:**

- `apps/myk9q/src/pages/ShowDetails/ShowDetails.tsx`
- `apps/myk9q/src/pages/ShowDetails/ShowDetailsComponents.tsx`
- `apps/myk9q/src/pages/ShowDetails/showDetailsUtils.ts`
- `apps/myk9q/src/pages/ShowDetails/hooks/useDashboardData.ts`
- `apps/myk9q/src/pages/Home/Home.tsx`
- `apps/myk9q/src/pages/Home/hooks/useHomeDashboardData.ts`
- `apps/myk9q/src/pages/ClassList/ClassList.tsx`
- `apps/myk9q/src/pages/ClassList/ClassCard.tsx`
- `apps/myk9q/src/pages/ClassList/ClassFilters.tsx`
- `apps/myk9q/src/pages/ClassList/ClassListHeader.tsx`
- `apps/myk9q/src/pages/ClassList/ClassListDialogs.tsx`
- `apps/myk9q/src/pages/ClassList/hooks/useClassListFetch.ts`
- `apps/myk9q/src/pages/ClassList/hooks/useClassStatus.ts`
- `apps/myk9q/src/pages/ClassList/hooks/useClassRealtime.ts`
- `apps/myk9q/src/pages/ClassList/hooks/usePrintReports.ts`
- `apps/myk9q/src/pages/ClassList/utils/statusFormatting.ts`
- `apps/myk9q/src/pages/EntryList/hooks/useEntryListDataHelpers.ts`
- `apps/myk9q/src/pages/EntryList/hooks/useDragAndDropEntries.ts`
- `apps/myk9q/src/pages/EntryList/components/EntryListDialogs.tsx`
- `apps/myk9q/src/pages/DogDetails/DogDetails.tsx`
- `apps/myk9q/src/pages/DogDetails/hooks/useDogDetailsData.ts`
- `apps/myk9q/src/pages/DogDetails/hooks/dogDetailsDataHelpers.ts`
- `apps/myk9q/src/pages/DogDetails/components/DogStatistics.tsx`
- `apps/myk9q/src/pages/DogDetails/components/DogDetailsClassCard.tsx`
- `apps/myk9q/src/pages/Results/hooks/useResultsData.ts`
- `apps/myk9q/src/pages/Stats/types/stats.types.ts`
- `apps/myk9q/src/pages/Stats/hooks/eventStats.ts`
- `apps/myk9q/src/pages/Stats/hooks/dogStats.ts`
- `apps/myk9q/src/pages/Stats/hooks/useStatsFilterOptions.ts`
- `apps/myk9q/src/pages/Stats/hooks/useCompletedClassIds.ts`
- `apps/myk9q/src/pages/Stats/components/ShowProgressStats.tsx`
- `apps/myk9q/src/pages/Stats/components/CleanSweepDiagnostic.tsx`
- `apps/myk9q/src/pages/TVRunOrder/TVRunOrder.tsx`
- `apps/myk9q/src/pages/TVRunOrder/hooks/useTVData.ts`
- `apps/myk9q/src/pages/TVRunOrder/hooks/useTVResultsData.ts`
- `apps/myk9q/src/pages/TVRunOrder/components/ClassRunOrder.tsx`
- `apps/myk9q/src/pages/scoresheets/hooks/useEntryNavigationHelpers.ts`
- `apps/myk9q/src/pages/TrialSecretary/TrialSecretary.tsx`
- `apps/myk9q/src/pages/TrialSecretary/types.ts`
- `apps/myk9q/src/pages/TrialSecretary/hooks/useScheduleBoard.helpers.ts`
- `apps/myk9q/src/pages/TrialSecretary/hooks/useCheckInReportData.ts`
- `apps/myk9q/src/pages/TrialSecretary/components/ResultsControlTab.tsx`
- `apps/myk9q/src/pages/TrialSecretary/components/ScheduleBoard.tsx`
- `apps/myk9q/src/pages/Admin/hooks/useCompetitionAdminData.ts`
- `apps/myk9q/src/pages/Admin/hooks/useBulkOperations.test.ts`
- `apps/myk9q/src/pages/Admin/components/ResultVisibilitySection.tsx`
- `apps/myk9q/src/pages/Admin/components/ClassesList.tsx`
- `apps/myk9q/src/pages/Admin/components/SelfCheckinSection.tsx`
- `apps/myk9q/src/pages/Login/Login.tsx`
- `apps/myk9q/src/contexts/NotificationContext.tsx`
- `apps/myk9q/src/components/dialogs/ClassStatusDialog.tsx`
- `apps/myk9q/src/components/dialogs/ClassOptionsDialog.tsx`
- `apps/myk9q/src/components/chatbot/SourcesSection.tsx`
- `apps/myk9q/src/components/DatabaseTest.tsx`
- `apps/myk9q/src/demo/StatusPopupDemo.tsx`

**Task 7 — Tests:**

- All `*.test.ts` files that reference renamed fields

**Task 8 — Cleanup:**

- `apps/myk9q/CLAUDE.md`
- `apps/myk9q/.env.example`
- `apps/myk9q/.env.local.example`

---

## Task 1: Platform Migration

**Files:**

- Create: `supabase/migrations/115_myk9q_compatibility.sql`

This migration adds missing columns to `classes` and `sport_class_rules`, creates `view_myk9q_entries`, and creates the stats views adapted to platform column names.

- [ ] **Step 1: Create the migration file**

```sql
-- =============================================================================
-- Migration 115: myK9Q Compatibility
-- =============================================================================
-- Adds columns and views needed for myK9Q to operate against the platform DB.
-- See: docs/superpowers/specs/2026-04-05-myk9q-database-alignment-design.md
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Add missing columns to classes (needed by myK9Q offline-first model)
-- ---------------------------------------------------------------------------
ALTER TABLE classes ADD COLUMN IF NOT EXISTS section TEXT;
ALTER TABLE classes ADD COLUMN IF NOT EXISTS judge_name TEXT;

-- ---------------------------------------------------------------------------
-- 2. Add missing columns to sport_class_rules (scent work scoring rules)
-- ---------------------------------------------------------------------------
ALTER TABLE sport_class_rules ADD COLUMN IF NOT EXISTS has_30_second_warning BOOLEAN DEFAULT TRUE;
ALTER TABLE sport_class_rules ADD COLUMN IF NOT EXISTS time_type TEXT DEFAULT 'fixed'
  CHECK (time_type IN ('fixed', 'range', 'dictated'));
ALTER TABLE sport_class_rules ADD COLUMN IF NOT EXISTS warning_notes TEXT;
ALTER TABLE sport_class_rules ADD COLUMN IF NOT EXISTS max_time_seconds_area2 INTEGER;
ALTER TABLE sport_class_rules ADD COLUMN IF NOT EXISTS max_time_seconds_area3 INTEGER;

-- ---------------------------------------------------------------------------
-- 2b. Expand entry_status CHECK constraint for myK9Q values [ADDED]
-- ---------------------------------------------------------------------------
-- myK9Q uses 'at-gate' and 'in-ring' which the platform constraint doesn't include.
ALTER TABLE entries DROP CONSTRAINT IF EXISTS entries_entry_status_check;
ALTER TABLE entries ADD CONSTRAINT entries_entry_status_check CHECK (entry_status IN (
  'no-status', 'draft', 'submitted', 'paid', 'confirmed',
  'checked-in', 'at-gate', 'in-ring', 'competing', 'completed',
  'withdrawn', 'scratched', 'absent'
));

-- ---------------------------------------------------------------------------
-- 3. view_myk9q_entries: pre-joined view for myK9Q entry data loading
-- ---------------------------------------------------------------------------
-- Replaces legacy view_entry_class_join_normalized.
-- Aliases platform column names to myK9Q interface expectations.
-- Entries fetched via this view for initial sync; realtime events re-fetch
-- individual rows from this view by ID.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW view_myk9q_entries AS
SELECT
  e.id,
  e.armband::INTEGER as armband_number,
  e.handler as handler_name,
  d.call_name as dog_call_name,
  d.breed as dog_breed,
  e.entry_status,
  e.run_order as exhibitor_order,
  e.created_at,
  e.updated_at,
  -- Scoring
  e.is_scored,
  e.is_in_ring,
  e.result_status,
  e.search_time_seconds,
  e.total_faults,
  e.final_placement,
  e.total_correct_finds,
  e.total_incorrect_finds,
  e.no_finish_count,
  e.points_earned,
  e.scoring_completed_at,
  -- Class
  c.id AS class_id,
  c.element,
  c.level,
  c.judge_name,
  c.section,
  c.status AS class_status,
  c.time_limit_seconds,
  c.num_areas AS area_count,
  c.is_scoring_finalized,
  c.results_released_at,
  -- Trial
  t.id AS trial_id,
  t.trial_number,
  t.date AS trial_date,
  -- Show
  s.id AS show_id,
  s.license_key,
  s.name AS show_name
FROM entries e
LEFT JOIN dogs d ON e.dog_id = d.id
LEFT JOIN classes c ON e.class_id = c.id
LEFT JOIN trials t ON e.trial_id = t.id
LEFT JOIN shows s ON e.show_id = s.id;

GRANT SELECT ON view_myk9q_entries TO anon, authenticated;

COMMENT ON VIEW view_myk9q_entries IS
  'Pre-joined entry view for myK9Q. Aliases platform columns to myK9Q interface names.';

-- ---------------------------------------------------------------------------
-- 4. Stats views (adapted from legacy myK9Q migration 044)
-- ---------------------------------------------------------------------------

-- 4a. view_stats_summary: base stats view
CREATE OR REPLACE VIEW view_stats_summary AS
SELECT
  s.id as show_id,
  s.name as show_name,
  s.license_key,
  t.id as trial_id,
  t.date as trial_date,
  t.name as trial_name,
  c.id as class_id,
  c.element,
  c.level,
  c.judge_name,
  e.id as entry_id,
  e.armband::INTEGER as armband_number,
  d.call_name as dog_call_name,
  d.breed as dog_breed,
  e.handler as handler_name,
  e.result_status,
  e.is_scored,
  e.search_time_seconds,
  e.total_faults,
  e.final_placement,
  e.total_score as score,
  e.points_earned as qualifying_score,
  CASE WHEN e.result_status = 'qualified' THEN 1 ELSE 0 END as is_qualified,
  CASE WHEN e.search_time_seconds > 0 THEN e.search_time_seconds ELSE NULL END as valid_time
FROM shows s
JOIN trials t ON t.show_id = s.id
JOIN classes c ON c.trial_id = t.id
JOIN entries e ON e.class_id = c.id
LEFT JOIN dogs d ON e.dog_id = d.id
WHERE e.is_scored = true;

GRANT SELECT ON view_stats_summary TO authenticated;

-- 4b. view_breed_stats
CREATE OR REPLACE VIEW view_breed_stats AS
SELECT
  license_key, show_id, trial_id, class_id, dog_breed,
  COUNT(*) as total_entries,
  SUM(CASE WHEN result_status = 'qualified' THEN 1 ELSE 0 END) as qualified_count,
  SUM(CASE WHEN result_status = 'nq' THEN 1 ELSE 0 END) as nq_count,
  SUM(CASE WHEN result_status = 'excused' THEN 1 ELSE 0 END) as excused_count,
  SUM(CASE WHEN result_status = 'absent' THEN 1 ELSE 0 END) as absent_count,
  SUM(CASE WHEN result_status = 'withdrawn' THEN 1 ELSE 0 END) as withdrawn_count,
  CASE
    WHEN COUNT(*) > 0
    THEN ROUND(100.0 * SUM(CASE WHEN result_status = 'qualified' THEN 1 ELSE 0 END) / COUNT(*), 2)
    ELSE 0
  END as qualification_rate,
  MIN(CASE WHEN result_status = 'qualified' AND search_time_seconds > 0 THEN search_time_seconds END) as fastest_time,
  AVG(CASE WHEN result_status = 'qualified' AND search_time_seconds > 0 THEN search_time_seconds END) as avg_time,
  array_agg(
    CASE WHEN result_status = 'qualified' AND search_time_seconds > 0 THEN search_time_seconds END
    ORDER BY search_time_seconds
  ) FILTER (WHERE result_status = 'qualified' AND search_time_seconds > 0) as qualified_times_array
FROM view_stats_summary
GROUP BY license_key, show_id, trial_id, class_id, dog_breed;

GRANT SELECT ON view_breed_stats TO authenticated;

-- 4c. view_judge_stats
CREATE OR REPLACE VIEW view_judge_stats AS
SELECT
  license_key, show_id, trial_id, judge_name,
  COUNT(DISTINCT class_id) as classes_judged,
  COUNT(*) as total_entries,
  SUM(CASE WHEN result_status = 'qualified' THEN 1 ELSE 0 END) as qualified_count,
  CASE
    WHEN COUNT(*) > 0
    THEN ROUND(100.0 * SUM(CASE WHEN result_status = 'qualified' THEN 1 ELSE 0 END) / COUNT(*), 2)
    ELSE 0
  END as qualification_rate,
  AVG(CASE WHEN result_status = 'qualified' AND search_time_seconds > 0 THEN search_time_seconds END) as avg_qualified_time
FROM view_stats_summary
GROUP BY license_key, show_id, trial_id, judge_name;

GRANT SELECT ON view_judge_stats TO authenticated;

-- 4d. view_clean_sweep_dogs
CREATE OR REPLACE VIEW view_clean_sweep_dogs AS
WITH dog_stats AS (
  SELECT
    license_key, show_id, trial_id,
    armband_number, dog_call_name, handler_name, dog_breed,
    COUNT(DISTINCT element) as elements_entered,
    COUNT(DISTINCT CASE WHEN result_status = 'qualified' THEN element END) as elements_qualified,
    array_agg(DISTINCT element ORDER BY element) as elements_list
  FROM view_stats_summary
  GROUP BY license_key, show_id, trial_id, armband_number, dog_call_name, handler_name, dog_breed
)
SELECT *,
  CASE WHEN elements_entered = elements_qualified AND elements_entered > 0 THEN true ELSE false END as is_clean_sweep
FROM dog_stats
WHERE elements_entered = elements_qualified AND elements_entered > 0;

GRANT SELECT ON view_clean_sweep_dogs TO authenticated;

-- 4e. view_fastest_times
CREATE OR REPLACE VIEW view_fastest_times AS
WITH ranked_times AS (
  SELECT
    license_key, show_id, trial_id, class_id, entry_id,
    armband_number, dog_call_name, dog_breed, handler_name,
    search_time_seconds, element, level,
    RANK() OVER (
      PARTITION BY license_key, show_id, trial_id, class_id
      ORDER BY search_time_seconds ASC
    ) as time_rank
  FROM view_stats_summary
  WHERE result_status = 'qualified' AND search_time_seconds > 0
)
SELECT * FROM ranked_times
ORDER BY license_key, show_id, trial_id, class_id, time_rank, search_time_seconds;

GRANT SELECT ON view_fastest_times TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Performance indexes for stats views
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_entries_breed_scored
  ON entries(dog_id, is_scored) WHERE is_scored = true;
CREATE INDEX IF NOT EXISTS idx_entries_time_qualified
  ON entries(search_time_seconds)
  WHERE result_status = 'qualified' AND search_time_seconds > 0;

-- ---------------------------------------------------------------------------
-- Done
-- ---------------------------------------------------------------------------
COMMENT ON VIEW view_breed_stats IS 'Aggregated stats by breed for myK9Q Stats feature';
COMMENT ON VIEW view_judge_stats IS 'Aggregated stats by judge for myK9Q Stats feature';
COMMENT ON VIEW view_clean_sweep_dogs IS 'Dogs with 100% qualification rate across all entered elements';
COMMENT ON VIEW view_fastest_times IS 'Fastest qualifying times with proper tie ranking';

SELECT 'Migration 115: myK9Q compatibility complete' as status;
```

- [ ] **Step 2: Push migration to Supabase** [ADDED]

Run: `source supabase/.env && supabase db push --db-url "postgresql://postgres:${SUPABASE_DB_PASSWORD}@db.sojmvhhwsjxmfistvzbe.supabase.co:5432/postgres"`
Expected: Migration 115 applied successfully.

- [ ] **Step 3: Verify migration syntax**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform" && pnpm typecheck`
Expected: PASS (migration is SQL, typecheck just confirms no TS breakage)

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/115_myk9q_compatibility.sql
git commit -m "feat(db): add myK9Q compatibility migration

Add section + judge_name to classes, scent work columns to sport_class_rules,
view_myk9q_entries, and stats views adapted to platform column names."
```

---

## Task 2: Replication Table Interfaces and Sync Methods

Update the type interfaces and `sync()` / `fetchFromSupabase()` methods in all replication tables to match platform column names. This is the foundation — every downstream consumer imports types from these files.

**Files:**

- Modify: `apps/myk9q/src/services/replication/tables/ReplicatedShowsTable.ts`
- Modify: `apps/myk9q/src/services/replication/tables/ReplicatedTrialsTable.ts`
- Modify: `apps/myk9q/src/services/replication/tables/ReplicatedClassesTable.ts`
- Modify: `apps/myk9q/src/services/replication/tables/ReplicatedEntriesTable.ts`
- Modify: `apps/myk9q/src/services/replication/tables/ReplicatedClassRequirementsTable.ts`
- Modify: `apps/myk9q/src/services/replication/tables/ReplicatedStatsViewTable.ts`
- Modify: `apps/myk9q/src/services/replication/tables/ReplicatedAuditLogViewTable.ts`
- Modify: `apps/myk9q/src/services/replication/tables/ReplicatedEventStatisticsTable.ts`

- [ ] **Step 1: Update `Show` interface in ReplicatedShowsTable.ts**

Rename fields per spec:

- `show_name` → `name`
- `club_name` → remove (resolve from `club_id` if needed)
- `show_type` → `type`
- `show_status` → `status`
- `site_name` → `venue_name`
- `site_address` → `address`
- `site_city` → `city`
- `site_state` → `state`
- `site_zip` → `zip_code`
- `secretary_name` / `show_secretary_name` → `secretary`
- Remove `app_version`
- Add `club_id?: string`
- Add platform fields: `description`, `entry_open_date`, `entry_close_date`, `max_entries_per_dog`, `max_total_entries`, `pre_entry_fee`, `day_of_show_fee`

Update `getByStatus()` to filter on `status` instead of `show_status`.
Update `updateShowStatus()` to set `status` instead of `show_status`.

- [ ] **Step 2: Update `Trial` interface in ReplicatedTrialsTable.ts**

Rename fields:

- `trial_name` → `name`
- `trial_date` → `date`
- `trial_number` from `number` to `string` type
- `trial_status` → `status`
- Remove `element` (lives on classes)
- Remove `organization` (lives on sport_templates)
- `license_key` → remove from interface (trials don't have license_key in platform)

Update `sync()`: the existing join through `shows.license_key` stays, but don't add `license_key` to the flattened result.
Update `getByShowId()`, `getByDateRange()`: use `date` instead of `trial_date`.
Update `getByStatus()`: filter on `status` instead of `trial_status`.
Update `updateTrialStatus()`: set `status` instead of `trial_status`.
Remove `getByElement()` and `getByOrganization()` methods.

- [ ] **Step 3: Update `Class` interface in ReplicatedClassesTable.ts**

Rename fields:

- `class_status` → `status`
- Remove `license_key` (not on platform classes table)
- Remove `hide_count`, `timer_mode`, `hides_known`, `distraction_count`
- Remove `time_limit_area2_seconds`, `time_limit_area3_seconds`
- Keep `judge_name`, `section` (added to platform by migration 115)
- Add platform fields: `name`, `description`, `num_areas` (was `area_count`)

Update `sync()`: remove license_key flattening from the join result.
Update `updateClassStatus()`: set `status` instead of `class_status`.

- [ ] **Step 4: Update `Entry` interface in ReplicatedEntriesTable.ts**

The `Entry` interface stays mostly unchanged since `view_myk9q_entries` aliases columns. Update `fetchFromSupabase` / `sync()` to query from `view_myk9q_entries` instead of `entries`. For realtime subscriptions, re-fetch from view by ID on change events.

- [ ] **Step 5: Update `ClassRequirement` interface in ReplicatedClassRequirementsTable.ts**

Change `super('class_requirements', ...)` to `super('sport_class_rules', ...)`.
Update `ClassRequirement` interface to match `sport_class_rules` schema:

- `time_limit_seconds` → `max_time_seconds_fixed`
- `time_limit_area2_seconds` → `max_time_seconds_area2`
- `time_limit_area3_seconds` → `max_time_seconds_area3`
- Add `sport_template_id`, `class_name`, `display_order`, `max_time_seconds_min`, `max_time_seconds_max`, `hide_count_fixed`, `hide_count_min`, `hide_count_max`, `hides_known`, `has_blank`, `distraction_count_min`, `distraction_count_max`, `timer_mode`, `odors`, `default_entry_fee`, `mrv_minutes`, `field_overrides`
- Keep `has_30_second_warning`, `time_type`, `warning_notes` (added by migration 115)

Update `fetchFromSupabase()` to query `sport_class_rules`.
Update helper methods (`getRequirementsForClass`, etc.) to match new field names.

[ADDED] **Step 5b: Update initReplication.ts store registration**

In `apps/myk9q/src/services/replication/initReplication.ts`, change:
`manager.registerTable('class_requirements', replicatedClassRequirementsTable)` →
`manager.registerTable('sport_class_rules', replicatedClassRequirementsTable)`

This ensures the IndexedDB store name matches the new Supabase table name. Note: this will cause existing IndexedDB caches to be recreated (acceptable — myK9Q clears and redownloads on login).

- [ ] **Step 6: Update `StatsView` interface in ReplicatedStatsViewTable.ts**

The `view_stats_summary` view now aliases columns from the platform schema. The interface field names (`show_name`, `trial_date`, `armband_number`, `dog_call_name`, etc.) stay the same since the view provides those aliases. Verify the `fetchFromSupabase()` query references `view_stats_summary` (it already does).

No field renames needed — the view handles aliasing.

- [ ] **Step 7: Update ReplicatedAuditLogViewTable.ts**

[EXPANDED] `view_audit_log` does NOT exist in the platform schema (confirmed). This is a known gap — the audit log is a myK9Q operational feature. Leave the replication table code as-is for now; it will fail silently on sync (no data returned). Add to the Known Breakages section.

- [ ] **Step 8: Run typecheck**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform" && pnpm typecheck`
Expected: MANY ERRORS — this is expected. The type changes cascade to all consumers. The errors map exactly to the files in Tasks 3-7.

- [ ] **Step 9: Commit**

```bash
git add apps/myk9q/src/services/replication/tables/
git commit -m "refactor(myk9q): update replication table interfaces to platform schema

Rename Show, Trial, Class fields to match platform column names.
Entry interface stays stable (view_myk9q_entries handles aliasing).
ClassRequirements now points to sport_class_rules."
```

---

## Task 3: Supabase Client Types

Update the inline type definitions in `apps/myk9q/src/lib/supabase.ts` to match platform column names.

**Files:**

- Modify: `apps/myk9q/src/lib/supabase.ts`

- [ ] **Step 1: Update `ShowQueue` type**

Rename fields to match platform `shows` table:

- `show_name` → `name`
- `club_name` → `club_id` (UUID)
- Add `type`, `status`, `description`, `venue_name`, `address`, `city`, `state`, `zip_code`
- Remove legacy field names

- [ ] **Step 2: Update `TrialQueue` type**

- `trial_name` → `name`
- `trial_date` → `date`
- `trial_number` → `string` type
- `trial_type` → `status`
- Remove `access_trial_id`

- [ ] **Step 3: Update `ClassQueue` type**

- `class_status` → `status` (TEXT not number)
- `class_status_comment` → remove
- `class_order` → remove (not on platform)
- `area_count` → `num_areas`
- Add `name`, `description`, `section`, `judge_name`
- Remove `self_checkin_enabled`, `realtime_results_enabled` if not on platform

- [ ] **Step 4: Update `EntryQueue` type**

- `armband_number` → `armband` (TEXT)
- `handler_name` → `handler`
- Remove `dog_call_name`, `dog_breed` (resolved via FK)
- `exhibitor_order` → `run_order`
- `check_in_status` → `entry_status`
- `entry_type` → remove

- [ ] **Step 5: Remove `ResultQueue` type**

Platform merged results into entries table. Delete the `ResultQueue` interface entirely.

- [ ] **Step 6: Update `ViewEntryClassJoinDistinct` type**

Update to match `view_myk9q_entries` column names or remove if unused.

- [ ] **Step 7: Run typecheck**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform" && pnpm typecheck`
Expected: Errors reduced but still present in consumer files.

- [ ] **Step 8: Commit**

```bash
git add apps/myk9q/src/lib/supabase.ts
git commit -m "refactor(myk9q): update Supabase client types to platform schema

Remove ResultQueue (merged into entries). Rename fields in ShowQueue,
TrialQueue, ClassQueue, EntryQueue to match platform column names."
```

---

## Task 4: Service Layer Refactor

Update all service files that make direct `.from()` Supabase calls to use platform column names.

**Files:** See file map above (14 service files)

- [ ] **Step 1: Update authService.ts**

This is the largest service. Key changes:

- `enrichShowData()`: rename `showName`/`clubName`/`showDate` params, update `.order('trial_date')` → `.order('date')`, update `.order('class_order')` field references
- `authenticatePasscodeClientSide()`: update show field references (`show_name` → `name`, etc.)
- `validatePasscodeAgainstLicenseKey()`: unchanged (license_key stays)
- All `.select()` and `.eq()` calls referencing renamed columns

- [ ] **Step 2: Update entryService.ts**

Update column references in `.select()`, `.eq()`, `.order()` calls. Entry queries through the view should use `view_myk9q_entries`.

- [ ] **Step 3: Update entryDataFetching.ts**

Key changes:

- References to `row.classes.section`, `row.classes.element`, `row.classes.level` stay (class fields unchanged)
- `row.section` / `row.trial_date` / `row.handler_name` / `row.dog_call_name` / `row.armband_number` — check if these come from view or raw queries and update accordingly
- Update `buildClassName` calls if input field names changed

- [ ] **Step 4: Update preloadServiceHelpers.ts**

Change `.from('view_entry_class_join_normalized')` to `.from('view_myk9q_entries')` at line 169.
Update `.from('shows').select('name')` at line 82 (already uses `name` — verify).

- [ ] **Step 5: Update remaining services**

For each service, search-and-replace legacy column names:

- `autoDownloadService.ts`: show/class field references
- `chatbotService.ts`: show name references
- `auditLogService.ts`: trial_date, show_name references
- `databaseDetectionService.ts`: show field references
- `entryReplication.ts`: entry field names from view
- `classCompletionService.ts`: class_status → status
- `entryBatchOperations.ts`: entry field names
- `placementService.ts`: entry field names
- `runOrderService.ts`: exhibitor_order → run_order
- `nationalsScoring.ts`: already uses correct table names, check field refs

- [ ] **Step 6: Run typecheck**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform" && pnpm typecheck`
Expected: Errors reduced further. Remaining errors in stores/utils/pages.

- [ ] **Step 7: Commit**

```bash
git add apps/myk9q/src/services/
git commit -m "refactor(myk9q): update service layer to platform column names

Update .from() queries, .select() columns, .order() fields across all
services. preloadServiceHelpers now uses view_myk9q_entries."
```

---

## Task 5: Stores, Utils, and Workers

Update field references in Zustand stores, utility functions, and web workers.

**Files:** See file map above (7 files)

- [ ] **Step 1: Update each file**

For each file, update references to renamed fields:

- `announcementStore.ts`: `show_name` → `name`, `license_key` usage
- `statusUtils.ts`: `class_status` → `status`
- `entryMappers.ts`: `armband_number` → from view (stays), `handler_name`, `dog_call_name`, `dog_breed`, `exhibitor_order`
- `staleDataUtils.ts`: `class_status` / `license_key` references
- `pushNotificationService.ts`: `show_name` / `license_key` references
- `admin-data-utils.ts`: `trial_date`, `class_status`, show/trial field names
- `dataTransformer.worker.ts`: `trial_date`, `armband_number`, `handler_name`, `dog_call_name`, `dog_breed`

- [ ] **Step 2: Run typecheck**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform" && pnpm typecheck`
Expected: Errors reduced further. Remaining errors in pages/components.

- [ ] **Step 3: Commit**

```bash
git add apps/myk9q/src/stores/ apps/myk9q/src/utils/ apps/myk9q/src/workers/
git commit -m "refactor(myk9q): update stores, utils, workers to platform field names"
```

---

## Task 6: Pages and Components

Update all page components, hooks, and UI files. This is the largest task by file count but each change is mechanical — renaming field accesses.

**Files:** See file map above (~52 files)

- [ ] **Step 1: Update ShowDetails page files**

`ShowDetails.tsx`, `ShowDetailsComponents.tsx`, `showDetailsUtils.ts`, `hooks/useDashboardData.ts`:

- `show.show_name` → `show.name`
- `show.club_name` → remove or resolve from club_id
- `show.show_status` → `show.status`
- `show.site_name` → `show.venue_name`
- `show.site_address` → `show.address`
- `show.site_city` → `show.city` (etc.)

- [ ] **Step 2: Update Home page**

`Home.tsx`, `hooks/useHomeDashboardData.ts`:

- Show field renames, trial field renames

- [ ] **Step 3: Update ClassList page files**

`ClassList.tsx`, `ClassCard.tsx`, `ClassFilters.tsx`, `ClassListHeader.tsx`, `ClassListDialogs.tsx`, `hooks/useClassListFetch.ts`, `hooks/useClassStatus.ts`, `hooks/useClassRealtime.ts`, `hooks/usePrintReports.ts`, `utils/statusFormatting.ts`:

- `class_status` → `status` everywhere
- `trial_date` → `date`
- `trial_name` → `name`
- Entry field names via view (should already be aliased)

- [ ] **Step 4: Update EntryList page files**

`hooks/useEntryListDataHelpers.ts`, `hooks/useDragAndDropEntries.ts`, `components/EntryListDialogs.tsx`:

- Entry field names from view (already aliased by view_myk9q_entries)
- `class_status` → `status`

- [ ] **Step 5: Update DogDetails page files**

`DogDetails.tsx`, `hooks/useDogDetailsData.ts`, `hooks/dogDetailsDataHelpers.ts`, `components/DogStatistics.tsx`, `components/DogDetailsClassCard.tsx`:

- `trial_date` → `date`, `trial_name` → `name`, `class_status` → `status`
- Entry field names from view

- [ ] **Step 6: Update Results page**

`hooks/useResultsData.ts`:

- `trial_date` → `date`, entry field names

- [ ] **Step 7: Update Stats page files**

`types/stats.types.ts`, `hooks/eventStats.ts`, `hooks/dogStats.ts`, `hooks/useStatsFilterOptions.ts`, `hooks/useCompletedClassIds.ts`, `components/ShowProgressStats.tsx`, `components/CleanSweepDiagnostic.tsx`:

- Stats views alias columns (should stay stable), but check TypeScript interfaces match

- [ ] **Step 8: Update TVRunOrder page files**

`TVRunOrder.tsx`, `hooks/useTVData.ts`, `hooks/useTVResultsData.ts`, `components/ClassRunOrder.tsx`:

- `class_status` → `status`, `trial_date` → `date`, entry field names

- [ ] **Step 9: Update scoresheets**

`hooks/useEntryNavigationHelpers.ts`:

- Entry field names, class field names

- [ ] **Step 10: Update TrialSecretary page files**

`TrialSecretary.tsx`, `types.ts`, `hooks/useScheduleBoard.helpers.ts`, `hooks/useCheckInReportData.ts`, `components/ResultsControlTab.tsx`, `components/ScheduleBoard.tsx`:

- `trial_date` → `date`, `trial_name` → `name`, `class_status` → `status`

- [ ] **Step 11: Update Admin page files**

`hooks/useCompetitionAdminData.ts`, `components/ResultVisibilitySection.tsx`, `components/ClassesList.tsx`, `components/SelfCheckinSection.tsx`:

- `class_status` → `status`, show/trial field names

- [ ] **Step 12: Update Login, contexts, dialogs, components**

`Login/Login.tsx`, `contexts/NotificationContext.tsx`, `components/dialogs/ClassStatusDialog.tsx`, `components/dialogs/ClassOptionsDialog.tsx`, `components/chatbot/SourcesSection.tsx`, `components/DatabaseTest.tsx`, `demo/StatusPopupDemo.tsx`:

- `show_name` → `name`, `class_status` → `status`, misc field renames

- [ ] **Step 13: Run typecheck**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform" && pnpm typecheck`
Expected: PASS or only errors in test files (Task 7).

- [ ] **Step 14: Commit**

```bash
git add apps/myk9q/src/pages/ apps/myk9q/src/contexts/ apps/myk9q/src/components/ apps/myk9q/src/demo/ apps/myk9q/src/hooks/ apps/myk9q/src/sw-custom.js
git commit -m "refactor(myk9q): update all pages and components to platform field names

Mechanical rename of show_name→name, class_status→status, trial_date→date,
and other field name changes across ~52 UI files."
```

---

## Task 7: Test Updates

Update all test files that reference renamed fields.

**Files:**

- `apps/myk9q/src/services/authService.test.ts`
- `apps/myk9q/src/services/entry/classCompletionService.test.ts`
- `apps/myk9q/src/services/placementService.test.ts`
- `apps/myk9q/src/services/entryDataFetching.test.ts`
- `apps/myk9q/src/services/entryReplication.test.ts`
- `apps/myk9q/src/services/announcementService.test.ts`
- `apps/myk9q/src/services/replication/tables/__tests__/ReplicatedEntriesTable.test.ts`
- `apps/myk9q/src/services/replication/__tests__/MutationManager.test.ts`
- `apps/myk9q/src/services/replication/__tests__/ReplicationManager.test.ts`
- `apps/myk9q/src/services/replication/__tests__/SyncOrchestrator.test.ts`
- `apps/myk9q/src/services/replication/__tests__/DatabaseManager.test.ts`
- `apps/myk9q/src/services/entry/entryBatchOperations.test.ts`
- `apps/myk9q/src/utils/entryMappers.test.ts`
- `apps/myk9q/src/utils/admin-data-utils.test.ts`
- `apps/myk9q/src/utils/classFilterUtils.test.ts`
- `apps/myk9q/src/pages/ClassList/hooks/useClassStatus.test.ts`
- `apps/myk9q/src/pages/ClassList/hooks/useClassRealtime.test.ts`
- `apps/myk9q/src/pages/ClassList/hooks/usePrintReports.test.ts`
- `apps/myk9q/src/pages/ClassList/utils/statusFormatting.test.ts`
- `apps/myk9q/src/pages/ClassList/hooks/useClassDialogs.test.ts`
- `apps/myk9q/src/pages/Admin/hooks/useBulkOperations.test.ts`
- `apps/myk9q/src/hooks/useClassFilters.test.ts`

- [ ] **Step 1: Update all test files**

Apply the same field renames to test fixtures, mock data, and assertions:

- `show_name` → `name`, `show_status` → `status`, `show_type` → `type`
- `trial_name` → `name`, `trial_date` → `date`, `trial_status` → `status`
- `class_status` → `status`
- `armband_number` → `armband` (in raw entry mocks), `handler_name` → `handler` (in raw entry mocks)
- Entry mocks that go through the view keep the aliased names

- [ ] **Step 2: Run typecheck**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform" && pnpm typecheck`
Expected: PASS (zero errors)

- [ ] **Step 3: Run tests**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform/apps/myk9q" && pnpm test`
Expected: Tests pass. Some may need fixture updates beyond field renames — fix as needed.

- [ ] **Step 4: Commit**

```bash
git add apps/myk9q/src/
git commit -m "test(myk9q): update all test fixtures to platform field names

Rename fields in mock data and assertions to match refactored interfaces."
```

---

## Task 8: Cleanup

Update documentation and remove stale references.

**Files:**

- Modify: `apps/myk9q/CLAUDE.md`
- Modify: `apps/myk9q/.env.example`
- Modify: `apps/myk9q/.env.local.example`
- Create: `apps/myk9q/supabase/migrations/README.md`

- [ ] **Step 1: Update CLAUDE.md**

Replace Supabase project ID `yyzgjyiqgmjzyhzkqdfx` with `sojmvhhwsjxmfistvzbe` throughout.
Update region from `us-east-2` to match platform project.
Remove/update MCP server references that point to old project.
Add note that myK9Q now runs against the unified platform database.

- [ ] **Step 2: Update .env.example**

Remove the entire "LEGACY DATABASE" section (lines 11-25 referencing `VITE_SUPABASE_URL_LEGACY`, `VITE_SUPABASE_ANON_KEY_LEGACY`, `VITE_LEGACY_APP_URL`).
Update comment to reference "shared myk9-platform project".

- [ ] **Step 3: Update .env.local.example**

Same legacy reference removal if present.

- [ ] **Step 4: Add legacy migrations README**

Create `apps/myk9q/supabase/migrations/README.md`:

```markdown
# Legacy myK9Q Migrations

These migrations are from the standalone myK9Q production repository
(Supabase project `yyzgjyiqgmjzyhzkqdfx`). They are kept for historical
reference only.

The active platform migrations are at `supabase/migrations/` in the
monorepo root, targeting project `sojmvhhwsjxmfistvzbe`.

Do not apply these migrations to the platform database.
```

- [ ] **Step 5: Final typecheck and test run**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform" && pnpm typecheck && cd apps/myk9q && pnpm test`
Expected: All pass.

- [ ] **Step 6: Manual smoke test** [ADDED]

Start the myK9Q dev server: `cd apps/myk9q && pnpm dev`
Verify these flows work against the platform DB:

1. Login with a passcode (if test data exists) or verify the login page loads
2. Show details page renders with correct show name, dates, location
3. Class list page renders with correct class names, judge, section, status
4. Entry list page renders with armband numbers, handler names, dog names
5. If scored entries exist, verify Stats page loads data

If no test data exists in the platform DB, verify the app loads without runtime errors (empty states are fine).

- [ ] **Step 7: Commit**

```bash
git add apps/myk9q/CLAUDE.md apps/myk9q/.env.example apps/myk9q/.env.local.example apps/myk9q/supabase/migrations/README.md
git commit -m "chore(myk9q): update docs and env for platform database alignment

Update CLAUDE.md project ID, remove legacy dual-database env vars,
add README to legacy migrations folder."
```

---

## Entry Status Enum Compatibility [ADDED]

myK9Q and the platform use overlapping but different `entry_status` values:

| myK9Q uses   | Platform has | Overlap?      |
| ------------ | ------------ | ------------- |
| `no-status`  | `no-status`  | Yes           |
| `checked-in` | `checked-in` | Yes           |
| `at-gate`    | —            | myK9Q only    |
| `in-ring`    | —            | myK9Q only    |
| `completed`  | `completed`  | Yes           |
| —            | `draft`      | Platform only |
| —            | `submitted`  | Platform only |
| —            | `paid`       | Platform only |
| —            | `confirmed`  | Platform only |
| `withdrawn`  | `withdrawn`  | Yes           |
| `scratched`  | `scratched`  | Yes           |
| —            | `competing`  | Platform only |
| —            | `absent`     | Platform only |

The platform `entries.entry_status` column has a CHECK constraint limiting values. myK9Q writes `at-gate` and `in-ring` which will fail the constraint.

**Resolution:** The migration (Task 1) must expand the CHECK constraint to include myK9Q's values:

```sql
ALTER TABLE entries DROP CONSTRAINT IF EXISTS entries_entry_status_check;
ALTER TABLE entries ADD CONSTRAINT entries_entry_status_check CHECK (entry_status IN (
  'no-status', 'draft', 'submitted', 'paid', 'confirmed',
  'checked-in', 'at-gate', 'in-ring', 'competing', 'completed',
  'withdrawn', 'scratched', 'absent'
));
```

This must be added to migration 115.

---

## Rollback Strategy [ADDED]

This is a staging-only refactor (neither app is in production with real users). Rollback approach:

- **Migration:** The migration only adds columns (non-destructive) and creates views. To roll back: `DROP VIEW` the views and `ALTER TABLE DROP COLUMN` the added columns. But since no production data depends on them, this is low risk.
- **Code changes:** All on `main` branch. `git revert` the commits if needed. The migration is additive, so old code will still work against the DB even with the new columns/views present.
- **IndexedDB:** Changing the `sport_class_rules` store name will cause existing caches to be recreated. This is normal — myK9Q clears IndexedDB on login. No user data is lost.

---

## Summary of Known Post-Alignment Breakages

These are accepted and documented in the spec:

1. **Push notifications** — `push_subscriptions` schema mismatch (deferred until auth reconciliation)
2. **Performance metrics** — `metricsApiService.ts` references non-existent tables (deferred)
3. **Nationals event_statistics** — dormant feature, table doesn't exist (deferred)
4. **Audit log view** — `view_audit_log` does not exist in platform schema (confirmed). Replication table will fail silently on sync.
5. **License Key = Show UUID population** — The spec's decision to use `shows.id` as the `license_key` value requires a separate seeding step (populate `license_key = id::text` on existing shows). This is deferred to the passcode generation task, since no myK9Q users are actively connecting to the platform DB yet.
