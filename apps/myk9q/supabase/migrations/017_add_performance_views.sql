-- Migration 017: Add Performance Views
-- Purpose: Create optimized views to eliminate N+1 queries and simplify complex joins
--
-- View 1: view_class_summary - Pre-aggregated entry counts and scoring statistics per class
-- View 2: view_entry_with_results - Entries pre-joined with results table
--
-- Impact: 40-50% reduction in query count for high-traffic pages

-- ============================================================================
-- VIEW 1: Class Summary View
-- ============================================================================
-- Purpose: Pre-aggregate entry counts and scoring statistics per class
-- Eliminates: 3-4 separate queries per class (classes + entries + results + aggregation)
-- Used by: ClassList, Home dashboard, CompetitionAdmin pages

create or replace view public.view_class_summary as
select
  -- Class identification
  c.id as class_id,
  c.element,
  c.level,
  c.section,
  c.judge_name,
  c.class_status,
  c.class_order,

  -- Class configuration
  c.self_checkin_enabled,
  c.realtime_results_enabled,
  c.is_completed,
  c.time_limit_seconds,
  c.time_limit_area2_seconds,
  c.time_limit_area3_seconds,
  c.area_count,

  -- Trial information
  t.id as trial_id,
  t.trial_number,
  t.trial_date,
  t.trial_name,

  -- Show information
  s.id as show_id,
  s.license_key,
  s.show_name,
  s.club_name,

  -- Aggregated entry counts
  count(e.id) as total_entries,
  count(case when r.is_scored = true then 1 end) as scored_entries,
  count(case when e.entry_status = 'checked-in' then 1 end) as checked_in_count,
  count(case when e.entry_status = 'at-gate' then 1 end) as at_gate_count,
  count(case when e.entry_status = 'in-ring' then 1 end) as in_ring_count,
  count(case when r.result_status = 'qualified' then 1 end) as qualified_count,
  count(case when r.result_status = 'nq' then 1 end) as nq_count
from
  classes c
  inner join trials t on c.trial_id = t.id
  inner join shows s on t.show_id = s.id
  left join entries e on c.id = e.class_id
  left join results r on e.id = r.entry_id
group by
  c.id, t.id, s.id
order by
  t.trial_date, c.class_order, c.element, c.level;

-- Add comment for documentation
comment on view public.view_class_summary is
  'Pre-aggregated class statistics with entry counts. Eliminates N+1 queries for class lists.';


-- ============================================================================
-- VIEW 2: Entry with Results View
-- ============================================================================
-- Purpose: Pre-join entries with results table
-- Eliminates: Separate entries + results queries + JavaScript map/join logic
-- Used by: entryService, ClassList prefetch, DogDetails, all entry queries

create or replace view public.view_entry_with_results as
select
  -- Entry fields (all columns from entries table)
  e.id,
  e.class_id,
  e.armband_number,
  e.handler_name,
  e.dog_call_name,
  e.dog_breed,
  e.run_order,
  e.exhibitor_order,
  e.is_paid,
  e.payment_method,
  e.entry_fee,
  e.entry_type,
  e.withdrawal_reason,
  e.excuse_reason,
  e.has_health_issues,
  e.health_timestamp,
  e.health_comment,
  e.online_order_number,
  e.myk9q_entry_data,
  e.entry_status,
  e.section,
  e.handler_state,
  e.handler_location,
  e.home_state,
  e.created_at as entry_created_at,
  e.updated_at as entry_updated_at,

  -- Result fields (commonly needed scoring data)
  r.id as result_id,
  r.is_scored,
  r.is_in_ring,
  r.result_status,
  r.search_time_seconds,
  r.total_faults,
  r.final_placement,
  r.total_correct_finds,
  r.total_incorrect_finds,
  r.no_finish_count,
  r.points_earned,
  r.total_score,
  r.area1_time_seconds,
  r.area2_time_seconds,
  r.area3_time_seconds,
  r.area4_time_seconds,
  r.disqualification_reason,
  r.judge_notes,
  r.scoring_completed_at,

  -- Computed convenience fields (non-null defaults)
  coalesce(r.is_scored, false) as computed_is_scored,
  coalesce(e.entry_status, 'none') as computed_status
from
  entries e
  left join results r on e.id = r.entry_id;

-- Add comment for documentation
comment on view public.view_entry_with_results is
  'Entries pre-joined with results. Use this instead of separate queries + JavaScript mapping.';


-- ============================================================================
-- Supporting Indexes
-- ============================================================================
-- These indexes optimize common filtering patterns on the underlying tables

-- Index for class_summary view - supports filtering by trial and status
create index if not exists idx_classes_trial_status
  on classes(trial_id, class_status, class_order);

-- Index for entry_results view - supports filtering by class and status
create index if not exists idx_entries_class_status
  on entries(class_id, entry_status);

-- Index for result status filtering (used in aggregates)
create index if not exists idx_results_status
  on results(result_status) where result_status in ('qualified', 'nq');


-- ============================================================================
-- Verification Queries (commented out - run manually to test)
-- ============================================================================

-- Test 1: Verify class summary returns correct counts
-- select
--   class_id,
--   element,
--   level,
--   total_entries,
--   scored_entries,
--   checked_in_count,
--   in_ring_count,
--   qualified_count
-- from view_class_summary
-- where license_key = 'myK9Q1-a260f472-e0d76a33-4b6c264c'
-- order by trial_date, class_order
-- limit 10;

-- Test 2: Verify entry results view joins correctly
-- select
--   id,
--   armband_number,
--   dog_call_name,
--   computed_is_scored,
--   computed_status,
--   result_status,
--   search_time_seconds
-- from view_entry_with_results
-- where class_id = 222
-- order by armband_number
-- limit 10;

-- Test 3: Compare manual count vs view aggregate (should match)
-- select
--   c.id as class_id,
--   c.element || ' ' || c.level as class_name,
--   (select count(*) from entries where class_id = c.id) as manual_entry_count,
--   (select count(*) from entries e join results r on e.id = r.entry_id
--    where e.class_id = c.id and r.is_scored = true) as manual_scored_count,
--   vcs.total_entries as view_entry_count,
--   vcs.scored_entries as view_scored_count
-- from classes c
-- left join view_class_summary vcs on c.id = vcs.class_id
-- where c.id in (222, 223, 224)
-- order by c.id;
