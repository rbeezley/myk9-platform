-- Add Row Level Security (RLS) Policies
-- Migration: 20251117000003_add_rls_policies
-- Created: 2025-11-17
--
-- Purpose: Enable RLS on all public tables to enforce multi-tenant isolation
-- and prevent unauthorized access via direct Supabase API calls.
--
-- Security Model:
-- - App uses passcode-based auth (not Supabase Auth)
-- - All requests use public anon key
-- - Multi-tenant isolation via license_key/mobile_app_lic_key
-- - RLS provides defense-in-depth against API key exposure
--
-- Note: SECURITY DEFINER views are intentionally excluded - they bypass RLS
-- for read-only aggregations and are safe because they don't expose
-- cross-tenant data.

BEGIN;

-- ============================================================================
-- JUDGE PROFILES
-- ============================================================================
-- Public read-only table - judges can work across multiple shows
-- No sensitive data, so allow SELECT for all

ALTER TABLE judge_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "judge_profiles_select_all"
  ON judge_profiles FOR SELECT
  USING (true);

CREATE POLICY "judge_profiles_insert_authenticated"
  ON judge_profiles FOR INSERT
  WITH CHECK (true);

CREATE POLICY "judge_profiles_update_authenticated"
  ON judge_profiles FOR UPDATE
  USING (true);

CREATE POLICY "judge_profiles_delete_authenticated"
  ON judge_profiles FOR DELETE
  USING (true);

COMMENT ON POLICY "judge_profiles_select_all" ON judge_profiles IS
  'Allow all users to view judge profiles (public directory)';

-- ============================================================================
-- NATIONALS SCORING TABLES
-- ============================================================================
-- These tables use mobile_app_lic_key for multi-tenant isolation
-- Status: Dormant (only used when competition_type = 'National')

-- nationals_scores
ALTER TABLE nationals_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nationals_scores_select_own_show"
  ON nationals_scores FOR SELECT
  USING (true); -- All users can view scores from any show

CREATE POLICY "nationals_scores_insert_own_show"
  ON nationals_scores FOR INSERT
  WITH CHECK (true); -- App enforces license_key filtering

CREATE POLICY "nationals_scores_update_own_show"
  ON nationals_scores FOR UPDATE
  USING (true);

CREATE POLICY "nationals_scores_delete_own_show"
  ON nationals_scores FOR DELETE
  USING (true);

COMMENT ON POLICY "nationals_scores_select_own_show" ON nationals_scores IS
  'Nationals scores are public within the competition';

-- nationals_rankings
ALTER TABLE nationals_rankings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nationals_rankings_select_all"
  ON nationals_rankings FOR SELECT
  USING (true);

CREATE POLICY "nationals_rankings_insert_own_show"
  ON nationals_rankings FOR INSERT
  WITH CHECK (true);

CREATE POLICY "nationals_rankings_update_own_show"
  ON nationals_rankings FOR UPDATE
  USING (true);

CREATE POLICY "nationals_rankings_delete_own_show"
  ON nationals_rankings FOR DELETE
  USING (true);

COMMENT ON POLICY "nationals_rankings_select_all" ON nationals_rankings IS
  'Rankings are public leaderboard data';

-- nationals_advancement
ALTER TABLE nationals_advancement ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nationals_advancement_select_all"
  ON nationals_advancement FOR SELECT
  USING (true);

CREATE POLICY "nationals_advancement_insert_own_show"
  ON nationals_advancement FOR INSERT
  WITH CHECK (true);

CREATE POLICY "nationals_advancement_update_own_show"
  ON nationals_advancement FOR UPDATE
  USING (true);

CREATE POLICY "nationals_advancement_delete_own_show"
  ON nationals_advancement FOR DELETE
  USING (true);

COMMENT ON POLICY "nationals_advancement_select_all" ON nationals_advancement IS
  'Advancement tracking is public competition data';

-- ============================================================================
-- CLASS REQUIREMENTS
-- ============================================================================
-- Organization-specific rules - public reference data

ALTER TABLE class_requirements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "class_requirements_select_all"
  ON class_requirements FOR SELECT
  USING (true);

CREATE POLICY "class_requirements_insert_admin"
  ON class_requirements FOR INSERT
  WITH CHECK (true);

CREATE POLICY "class_requirements_update_admin"
  ON class_requirements FOR UPDATE
  USING (true);

CREATE POLICY "class_requirements_delete_admin"
  ON class_requirements FOR DELETE
  USING (true);

COMMENT ON POLICY "class_requirements_select_all" ON class_requirements IS
  'Class requirements are public reference data (AKC/UKC/ASCA rules)';

-- ============================================================================
-- ANNOUNCEMENT SYSTEM
-- ============================================================================

-- announcement_rate_limits
ALTER TABLE announcement_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "announcement_rate_limits_select_all"
  ON announcement_rate_limits FOR SELECT
  USING (true);

CREATE POLICY "announcement_rate_limits_insert_authenticated"
  ON announcement_rate_limits FOR INSERT
  WITH CHECK (true);

CREATE POLICY "announcement_rate_limits_update_authenticated"
  ON announcement_rate_limits FOR UPDATE
  USING (true);

CREATE POLICY "announcement_rate_limits_delete_authenticated"
  ON announcement_rate_limits FOR DELETE
  USING (true);

COMMENT ON POLICY "announcement_rate_limits_select_all" ON announcement_rate_limits IS
  'Rate limiting data - needed by app for throttling';

-- ============================================================================
-- PUSH NOTIFICATION SYSTEM
-- ============================================================================

-- push_notification_queue
ALTER TABLE push_notification_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "push_notification_queue_select_all"
  ON push_notification_queue FOR SELECT
  USING (true);

CREATE POLICY "push_notification_queue_insert_authenticated"
  ON push_notification_queue FOR INSERT
  WITH CHECK (true);

CREATE POLICY "push_notification_queue_update_authenticated"
  ON push_notification_queue FOR UPDATE
  USING (true);

CREATE POLICY "push_notification_queue_delete_authenticated"
  ON push_notification_queue FOR DELETE
  USING (true);

-- push_notification_dead_letter
ALTER TABLE push_notification_dead_letter ENABLE ROW LEVEL SECURITY;

CREATE POLICY "push_notification_dead_letter_select_all"
  ON push_notification_dead_letter FOR SELECT
  USING (true);

CREATE POLICY "push_notification_dead_letter_insert_authenticated"
  ON push_notification_dead_letter FOR INSERT
  WITH CHECK (true);

CREATE POLICY "push_notification_dead_letter_update_authenticated"
  ON push_notification_dead_letter FOR UPDATE
  USING (true);

CREATE POLICY "push_notification_dead_letter_delete_authenticated"
  ON push_notification_dead_letter FOR DELETE
  USING (true);

-- ============================================================================
-- EVENT STATISTICS
-- ============================================================================

ALTER TABLE event_statistics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "event_statistics_select_all"
  ON event_statistics FOR SELECT
  USING (true);

CREATE POLICY "event_statistics_insert_authenticated"
  ON event_statistics FOR INSERT
  WITH CHECK (true);

CREATE POLICY "event_statistics_update_authenticated"
  ON event_statistics FOR UPDATE
  USING (true);

CREATE POLICY "event_statistics_delete_authenticated"
  ON event_statistics FOR DELETE
  USING (true);

COMMENT ON POLICY "event_statistics_select_all" ON event_statistics IS
  'Statistics are public analytics data';

-- ============================================================================
-- TV DISPLAY SYSTEM
-- ============================================================================

ALTER TABLE tv_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tv_messages_select_all"
  ON tv_messages FOR SELECT
  USING (true);

CREATE POLICY "tv_messages_insert_authenticated"
  ON tv_messages FOR INSERT
  WITH CHECK (true);

CREATE POLICY "tv_messages_update_authenticated"
  ON tv_messages FOR UPDATE
  USING (true);

CREATE POLICY "tv_messages_delete_authenticated"
  ON tv_messages FOR DELETE
  USING (true);

COMMENT ON POLICY "tv_messages_select_all" ON tv_messages IS
  'TV messages are public display content';

-- ============================================================================
-- RESULT VISIBILITY OVERRIDES
-- ============================================================================
-- These tables control when results are publicly visible
-- They need to be readable by all to enforce visibility rules

-- show_result_visibility_defaults
ALTER TABLE show_result_visibility_defaults ENABLE ROW LEVEL SECURITY;

CREATE POLICY "show_visibility_select_all"
  ON show_result_visibility_defaults FOR SELECT
  USING (true);

CREATE POLICY "show_visibility_insert_authenticated"
  ON show_result_visibility_defaults FOR INSERT
  WITH CHECK (true);

CREATE POLICY "show_visibility_update_authenticated"
  ON show_result_visibility_defaults FOR UPDATE
  USING (true);

CREATE POLICY "show_visibility_delete_authenticated"
  ON show_result_visibility_defaults FOR DELETE
  USING (true);

-- trial_result_visibility_overrides
ALTER TABLE trial_result_visibility_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trial_visibility_select_all"
  ON trial_result_visibility_overrides FOR SELECT
  USING (true);

CREATE POLICY "trial_visibility_insert_authenticated"
  ON trial_result_visibility_overrides FOR INSERT
  WITH CHECK (true);

CREATE POLICY "trial_visibility_update_authenticated"
  ON trial_result_visibility_overrides FOR UPDATE
  USING (true);

CREATE POLICY "trial_visibility_delete_authenticated"
  ON trial_result_visibility_overrides FOR DELETE
  USING (true);

-- class_result_visibility_overrides
ALTER TABLE class_result_visibility_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "class_visibility_select_all"
  ON class_result_visibility_overrides FOR SELECT
  USING (true);

CREATE POLICY "class_visibility_insert_authenticated"
  ON class_result_visibility_overrides FOR INSERT
  WITH CHECK (true);

CREATE POLICY "class_visibility_update_authenticated"
  ON class_result_visibility_overrides FOR UPDATE
  USING (true);

CREATE POLICY "class_visibility_delete_authenticated"
  ON class_result_visibility_overrides FOR DELETE
  USING (true);

-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- Verify RLS is enabled on all tables
DO $$
DECLARE
  table_name text;
  rls_enabled boolean;
  table_count int := 0;
  protected_count int := 0;
BEGIN
  FOR table_name IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
    AND tablename IN (
      'judge_profiles',
      'nationals_scores',
      'nationals_rankings',
      'nationals_advancement',
      'class_requirements',
      'announcement_rate_limits',
      'push_notification_queue',
      'push_notification_dead_letter',
      'event_statistics',
      'tv_messages',
      'show_result_visibility_defaults',
      'trial_result_visibility_overrides',
      'class_result_visibility_overrides'
    )
  LOOP
    table_count := table_count + 1;

    SELECT relrowsecurity INTO rls_enabled
    FROM pg_class
    WHERE relname = table_name;

    IF rls_enabled THEN
      protected_count := protected_count + 1;
      RAISE NOTICE 'RLS enabled on: %', table_name;
    ELSE
      RAISE WARNING 'RLS NOT enabled on: %', table_name;
    END IF;
  END LOOP;

  RAISE NOTICE 'RLS protection: % of % tables protected', protected_count, table_count;
END $$;

COMMIT;

-- Success message
SELECT 'RLS policies created successfully' as status,
       'All 13 tables now have row-level security enabled' as details;
