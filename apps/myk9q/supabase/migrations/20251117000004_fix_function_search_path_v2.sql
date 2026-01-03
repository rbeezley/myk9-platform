-- Fix Function Search Path Warnings
-- Migration: 20251117000004_fix_function_search_path_v2
-- Created: 2025-11-17
--
-- Purpose: Add SET search_path = public to all database functions to prevent
-- schema-based SQL injection attacks.
--
-- Generated ALTER statements from database introspection to ensure exact signatures

BEGIN;

-- All ALTER statements generated from pg_proc (exact signatures)
ALTER FUNCTION public.auto_create_trial_event(p_license_key text, p_trial_date_text text, p_trial_number_text text) SET search_path = public;
ALTER FUNCTION public.auto_sync_single_entry() SET search_path = public;
ALTER FUNCTION public.bulk_sync_entries_for_show(p_license_key text) SET search_path = public;
ALTER FUNCTION public.calculate_next_retry(retry_count integer) SET search_path = public;
ALTER FUNCTION public.calculate_sync_duration() SET search_path = public;
ALTER FUNCTION public.check_announcement_rate_limit(p_license_key text) SET search_path = public;
ALTER FUNCTION public.cleanup_expired_push_subscriptions() SET search_path = public;
ALTER FUNCTION public.cleanup_old_queue_entries() SET search_path = public;
ALTER FUNCTION public.cleanup_stale_subscriptions() SET search_path = public;
ALTER FUNCTION public.compute_score_tbl_entry_queue() SET search_path = public;
ALTER FUNCTION public.disable_entry_queue_triggers() SET search_path = public;
ALTER FUNCTION public.enable_entry_queue_triggers() SET search_path = public;
ALTER FUNCTION public.exec_sql(sql text) SET search_path = public;
ALTER FUNCTION public.get_effective_self_checkin(p_class_id bigint) SET search_path = public;
ALTER FUNCTION public.get_push_subscription_count(p_license_key text) SET search_path = public;
ALTER FUNCTION public.handle_results_release() SET search_path = public;
ALTER FUNCTION public.increment_announcement_counter(p_license_key text) SET search_path = public;
ALTER FUNCTION public.initialize_show_visibility_defaults() SET search_path = public;
ALTER FUNCTION public.move_to_dead_letter(p_queue_id uuid) SET search_path = public;
ALTER FUNCTION public.notify_announcement_created() SET search_path = public;
ALTER FUNCTION public.notify_class_queue_change() SET search_path = public;
ALTER FUNCTION public.notify_class_started() SET search_path = public;
ALTER FUNCTION public.notify_entry_queue_change() SET search_path = public;
ALTER FUNCTION public.notify_up_soon() SET search_path = public;
ALTER FUNCTION public.prevent_sync_loops() SET search_path = public;
ALTER FUNCTION public.process_notification_queue() SET search_path = public;
ALTER FUNCTION public.queue_failed_notification(p_license_key text, p_payload jsonb, p_error text, p_notification_type text, p_entry_id integer, p_announcement_id bigint) SET search_path = public;
ALTER FUNCTION public.queue_failed_notification(p_license_key text, p_payload jsonb, p_error text, p_notification_type text, p_entry_id integer, p_announcement_id integer) SET search_path = public;
ALTER FUNCTION public.recalculate_class_placements(p_class_ids bigint[], p_is_nationals boolean) SET search_path = public;
ALTER FUNCTION public.recalculate_trial_counts(p_trial_id integer) SET search_path = public;
ALTER FUNCTION public.resolve_visibility_preset(preset visibility_preset_enum) SET search_path = public;
ALTER FUNCTION public.sync_all_entries_once() SET search_path = public;
ALTER FUNCTION public.sync_missing_section_b_entries() SET search_path = public;
ALTER FUNCTION public.sync_national_show_entries() SET search_path = public;
ALTER FUNCTION public.update_class_actual_end_time() SET search_path = public;
ALTER FUNCTION public.update_class_actual_start_time() SET search_path = public;
ALTER FUNCTION public.update_class_requirements_updated_at() SET search_path = public;
ALTER FUNCTION public.update_counts() SET search_path = public;
ALTER FUNCTION public.update_entry_moveto() SET search_path = public;
ALTER FUNCTION public.update_nationals_rankings() SET search_path = public;
ALTER FUNCTION public.update_push_config_timestamp() SET search_path = public;
ALTER FUNCTION public.update_push_notification_secrets(p_trigger_secret text, p_anon_key text, p_updated_by text) SET search_path = public;
ALTER FUNCTION public.update_push_subscription_updated_at() SET search_path = public;
ALTER FUNCTION public.update_queue_timestamp() SET search_path = public;
ALTER FUNCTION public.update_trial_actual_end_time() SET search_path = public;
ALTER FUNCTION public.update_trial_actual_start_time() SET search_path = public;
ALTER FUNCTION public.update_updated_at_column() SET search_path = public;

-- Verification
DO $$
DECLARE
  function_count INTEGER;
  fixed_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO function_count
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public'
  AND p.prokind = 'f';

  SELECT COUNT(*) INTO fixed_count
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public'
  AND p.prokind = 'f'
  AND p.proconfig IS NOT NULL
  AND 'search_path=public' = ANY(p.proconfig);

  RAISE NOTICE '';
  RAISE NOTICE '=== FUNCTION SEARCH_PATH FIX RESULTS ===';
  RAISE NOTICE 'Total functions in public schema: %', function_count;
  RAISE NOTICE 'Functions with search_path=public: %', fixed_count;
  RAISE NOTICE '';

  IF fixed_count >= 47 THEN
    RAISE NOTICE '✅ SUCCESS: All flagged functions now have search_path = public';
  ELSE
    RAISE WARNING '⚠️  Expected at least 47 functions fixed, got %', fixed_count;
  END IF;
END $$;

COMMIT;

SELECT 'Function search_path fixed successfully' as status;
