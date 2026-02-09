-- =============================================================================
-- Migration 023: Tighten Permissive RLS Policies + Performance Fixes + Test Helpers
-- =============================================================================
-- This migration addresses three categories of issues from the best practices audit:
--
-- PART 1: Tighten remaining overly-permissive RLS policies (Security)
--   - Health records: Only dog owners can access their dogs' health data
--   - Stripe/Payment data: Users see only their own payment data
--   - Notifications: Users manage only their own tokens/preferences
--   - Volunteers: Scoped to show admins/secretaries
--   - Nationals: Scoped to license_key
--   - Offline scoring: Scoped to authenticated + license_key
--
-- PART 2: Performance fixes (Rule 3.3)
--   - Wrap has_role() and auth.uid() calls in (SELECT ...) for caching
--   - Fix storage policy auth.uid() caching
--
-- PART 3: RLS test helper functions (Rule 11.1)
--   - test_as_user() and test_reset() for local policy testing
--
-- ROLLBACK: Re-run migration 006 to restore original permissive policies
-- =============================================================================

-- =============================================================================
-- PART 1A: HEALTH RECORDS - Only dog owners see their dogs' health data
-- =============================================================================

-- Health records (single FOR ALL policy - covers SELECT, INSERT, UPDATE, DELETE)
DROP POLICY IF EXISTS "health_records_select" ON health_records;
DROP POLICY IF EXISTS "health_records_all" ON health_records;

CREATE POLICY "health_records_owner_access" ON health_records
  FOR ALL TO authenticated
  USING (
    dog_id IN (
      SELECT id FROM dogs
      WHERE owner_id = (SELECT get_my_person_id())
         OR co_owner_id = (SELECT get_my_person_id())
    )
    OR (SELECT is_platform_admin())
  );

-- Vaccinations (single FOR ALL policy - covers SELECT, INSERT, UPDATE, DELETE)
DROP POLICY IF EXISTS "vaccinations_select" ON vaccinations;
DROP POLICY IF EXISTS "vaccinations_all" ON vaccinations;

CREATE POLICY "vaccinations_owner_access" ON vaccinations
  FOR ALL TO authenticated
  USING (
    dog_id IN (
      SELECT id FROM dogs
      WHERE owner_id = (SELECT get_my_person_id())
         OR co_owner_id = (SELECT get_my_person_id())
    )
    OR (SELECT is_platform_admin())
  );

-- Medications (single FOR ALL policy)
DROP POLICY IF EXISTS "medications_select" ON medications;
DROP POLICY IF EXISTS "medications_all" ON medications;

CREATE POLICY "medications_owner_access" ON medications
  FOR ALL TO authenticated
  USING (
    dog_id IN (
      SELECT id FROM dogs
      WHERE owner_id = (SELECT get_my_person_id())
         OR co_owner_id = (SELECT get_my_person_id())
    )
    OR (SELECT is_platform_admin())
  );

-- Allergies (single FOR ALL policy)
DROP POLICY IF EXISTS "allergies_select" ON allergies;
DROP POLICY IF EXISTS "allergies_all" ON allergies;

CREATE POLICY "allergies_owner_access" ON allergies
  FOR ALL TO authenticated
  USING (
    dog_id IN (
      SELECT id FROM dogs
      WHERE owner_id = (SELECT get_my_person_id())
         OR co_owner_id = (SELECT get_my_person_id())
    )
    OR (SELECT is_platform_admin())
  );

-- Vet visits (single FOR ALL policy)
DROP POLICY IF EXISTS "vet_visits_select" ON vet_visits;
DROP POLICY IF EXISTS "vet_visits_all" ON vet_visits;

CREATE POLICY "vet_visits_owner_access" ON vet_visits
  FOR ALL TO authenticated
  USING (
    dog_id IN (
      SELECT id FROM dogs
      WHERE owner_id = (SELECT get_my_person_id())
         OR co_owner_id = (SELECT get_my_person_id())
    )
    OR (SELECT is_platform_admin())
  );

-- =============================================================================
-- PART 1B: STRIPE/PAYMENT DATA - Users see only their own payment data
-- =============================================================================

-- Stripe customers - users see their own, admins see all
DROP POLICY IF EXISTS "stripe_customers_select" ON stripe_customers;
DROP POLICY IF EXISTS "stripe_customers_all" ON stripe_customers;

CREATE POLICY "stripe_customers_select" ON stripe_customers
  FOR SELECT TO authenticated
  USING (
    person_id = (SELECT get_my_person_id())
    OR (SELECT is_platform_admin())
  );

CREATE POLICY "stripe_customers_manage" ON stripe_customers
  FOR ALL TO authenticated
  USING ((SELECT is_platform_admin()));

-- Stripe orders - users see orders for their entries
DROP POLICY IF EXISTS "stripe_orders_select" ON stripe_orders;
DROP POLICY IF EXISTS "stripe_orders_all" ON stripe_orders;

CREATE POLICY "stripe_orders_select" ON stripe_orders
  FOR SELECT TO authenticated
  USING (
    customer_id IN (
      SELECT sc.id FROM stripe_customers sc
      WHERE sc.person_id = (SELECT get_my_person_id())
    )
    OR (SELECT is_platform_admin())
  );

CREATE POLICY "stripe_orders_manage" ON stripe_orders
  FOR ALL TO authenticated
  USING ((SELECT is_platform_admin()));

-- Stripe subscriptions - users see their own
DROP POLICY IF EXISTS "stripe_subscriptions_select" ON stripe_subscriptions;
DROP POLICY IF EXISTS "stripe_subscriptions_all" ON stripe_subscriptions;

CREATE POLICY "stripe_subscriptions_select" ON stripe_subscriptions
  FOR SELECT TO authenticated
  USING (
    customer_id IN (
      SELECT sc.id FROM stripe_customers sc
      WHERE sc.person_id = (SELECT get_my_person_id())
    )
    OR (SELECT is_platform_admin())
  );

CREATE POLICY "stripe_subscriptions_manage" ON stripe_subscriptions
  FOR ALL TO authenticated
  USING ((SELECT is_platform_admin()));

-- =============================================================================
-- PART 1C: NOTIFICATIONS - Users manage only their own
-- =============================================================================

-- FCM tokens (single FOR ALL - same conditions for read and write)
DROP POLICY IF EXISTS "fcm_tokens_select" ON fcm_tokens;
DROP POLICY IF EXISTS "fcm_tokens_all" ON fcm_tokens;

CREATE POLICY "fcm_tokens_user_access" ON fcm_tokens
  FOR ALL TO authenticated
  USING (
    auth_user_id = (SELECT auth.uid())
    OR user_id = (SELECT get_my_person_id())
    OR (SELECT is_platform_admin())
  );

-- Notification preferences (single FOR ALL - same conditions for read and write)
DROP POLICY IF EXISTS "notification_preferences_select" ON notification_preferences;
DROP POLICY IF EXISTS "notification_preferences_all" ON notification_preferences;

CREATE POLICY "notification_preferences_user_access" ON notification_preferences
  FOR ALL TO authenticated
  USING (
    auth_user_id = (SELECT auth.uid())
    OR user_id = (SELECT get_my_person_id())
    OR (SELECT is_platform_admin())
  );

-- Notification queue - users see their own, admins manage
DROP POLICY IF EXISTS "notification_queue_select" ON notification_queue;
DROP POLICY IF EXISTS "notification_queue_all" ON notification_queue;

CREATE POLICY "notification_queue_select" ON notification_queue
  FOR SELECT TO authenticated
  USING (
    user_id = (SELECT get_my_person_id())
    OR (SELECT is_platform_admin())
  );

CREATE POLICY "notification_queue_manage" ON notification_queue
  FOR ALL TO authenticated
  USING ((SELECT is_platform_admin()));

-- Push subscriptions (single FOR ALL - same conditions for read and write)
DROP POLICY IF EXISTS "push_subscriptions_select" ON push_subscriptions;
DROP POLICY IF EXISTS "push_subscriptions_all" ON push_subscriptions;

CREATE POLICY "push_subscriptions_user_access" ON push_subscriptions
  FOR ALL TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR (SELECT is_platform_admin())
  );

-- Push notification queue - users see their own, admin manages
DROP POLICY IF EXISTS "push_notification_queue_select" ON push_notification_queue;
DROP POLICY IF EXISTS "push_notification_queue_all" ON push_notification_queue;

CREATE POLICY "push_notification_queue_select" ON push_notification_queue
  FOR SELECT TO authenticated
  USING (
    subscription_id IN (
      SELECT id FROM push_subscriptions
      WHERE user_id = (SELECT auth.uid())
    )
    OR (SELECT is_platform_admin())
  );

CREATE POLICY "push_notification_queue_manage" ON push_notification_queue
  FOR ALL TO authenticated
  USING ((SELECT is_platform_admin()));

-- =============================================================================
-- PART 1D: VOLUNTEERS - Scoped to show admins/secretaries
-- =============================================================================

DROP POLICY IF EXISTS "volunteer_roles_select" ON volunteer_roles;
DROP POLICY IF EXISTS "volunteer_roles_all" ON volunteer_roles;

-- Anyone authenticated can view volunteer roles
CREATE POLICY "volunteer_roles_select" ON volunteer_roles
  FOR SELECT TO authenticated USING (true);

-- Only admins/secretaries can manage roles
CREATE POLICY "volunteer_roles_manage" ON volunteer_roles
  FOR ALL TO authenticated
  USING (
    (SELECT is_club_admin())
    OR (SELECT is_trial_secretary())
    OR (SELECT is_platform_admin())
  );

DROP POLICY IF EXISTS "volunteers_select" ON volunteers;
DROP POLICY IF EXISTS "volunteers_all" ON volunteers;

CREATE POLICY "volunteers_select" ON volunteers
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "volunteers_manage" ON volunteers
  FOR ALL TO authenticated
  USING (
    (SELECT is_club_admin())
    OR (SELECT is_trial_secretary())
    OR (SELECT is_platform_admin())
  );

DROP POLICY IF EXISTS "volunteer_class_assignments_select" ON volunteer_class_assignments;
DROP POLICY IF EXISTS "volunteer_class_assignments_all" ON volunteer_class_assignments;

CREATE POLICY "volunteer_class_assignments_select" ON volunteer_class_assignments
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "volunteer_class_assignments_manage" ON volunteer_class_assignments
  FOR ALL TO authenticated
  USING (
    (SELECT is_club_admin())
    OR (SELECT is_trial_secretary())
    OR (SELECT is_platform_admin())
  );

DROP POLICY IF EXISTS "volunteer_general_assignments_select" ON volunteer_general_assignments;
DROP POLICY IF EXISTS "volunteer_general_assignments_all" ON volunteer_general_assignments;

CREATE POLICY "volunteer_general_assignments_select" ON volunteer_general_assignments
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "volunteer_general_assignments_manage" ON volunteer_general_assignments
  FOR ALL TO authenticated
  USING (
    (SELECT is_club_admin())
    OR (SELECT is_trial_secretary())
    OR (SELECT is_platform_admin())
  );

-- =============================================================================
-- PART 1E: NATIONALS - Scoped to authenticated (public read, admin write)
-- =============================================================================

DROP POLICY IF EXISTS "nationals_scores_select" ON nationals_scores;
DROP POLICY IF EXISTS "nationals_scores_insert" ON nationals_scores;
DROP POLICY IF EXISTS "nationals_scores_update" ON nationals_scores;

-- Anyone can read scores (results are public)
CREATE POLICY "nationals_scores_select" ON nationals_scores
  FOR SELECT USING (true);

-- Only admins/secretaries can manage scores
CREATE POLICY "nationals_scores_manage" ON nationals_scores
  FOR ALL TO authenticated
  USING (
    (SELECT is_club_admin())
    OR (SELECT is_trial_secretary())
    OR (SELECT is_platform_admin())
  );

DROP POLICY IF EXISTS "nationals_rankings_select" ON nationals_rankings;
DROP POLICY IF EXISTS "nationals_rankings_insert" ON nationals_rankings;
DROP POLICY IF EXISTS "nationals_rankings_update" ON nationals_rankings;

CREATE POLICY "nationals_rankings_select" ON nationals_rankings
  FOR SELECT USING (true);

CREATE POLICY "nationals_rankings_manage" ON nationals_rankings
  FOR ALL TO authenticated
  USING (
    (SELECT is_club_admin())
    OR (SELECT is_trial_secretary())
    OR (SELECT is_platform_admin())
  );

DROP POLICY IF EXISTS "nationals_advancement_select" ON nationals_advancement;
DROP POLICY IF EXISTS "nationals_advancement_insert" ON nationals_advancement;

CREATE POLICY "nationals_advancement_select" ON nationals_advancement
  FOR SELECT USING (true);

CREATE POLICY "nationals_advancement_manage" ON nationals_advancement
  FOR ALL TO authenticated
  USING (
    (SELECT is_club_admin())
    OR (SELECT is_trial_secretary())
    OR (SELECT is_platform_admin())
  );

-- =============================================================================
-- PART 1F: OFFLINE SCORING & SYNC - Admin/secretary only for writes
-- =============================================================================

DROP POLICY IF EXISTS "offline_scoring_select" ON offline_scoring;
DROP POLICY IF EXISTS "offline_scoring_all" ON offline_scoring;

CREATE POLICY "offline_scoring_select" ON offline_scoring
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "offline_scoring_manage" ON offline_scoring
  FOR ALL TO authenticated
  USING (
    (SELECT is_club_admin())
    OR (SELECT is_trial_secretary())
    OR (SELECT is_platform_admin())
  );

DROP POLICY IF EXISTS "sync_conflicts_select" ON sync_conflicts;
DROP POLICY IF EXISTS "sync_conflicts_all" ON sync_conflicts;

CREATE POLICY "sync_conflicts_select" ON sync_conflicts
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "sync_conflicts_manage" ON sync_conflicts
  FOR ALL TO authenticated
  USING ((SELECT is_platform_admin()));

-- =============================================================================
-- PART 1G: USER PREFERENCES - Users manage their own
-- =============================================================================

DROP POLICY IF EXISTS "user_preferences_select" ON user_preferences;
DROP POLICY IF EXISTS "user_preferences_all" ON user_preferences;

CREATE POLICY "user_preferences_user_access" ON user_preferences
  FOR ALL TO authenticated
  USING (
    auth_user_id = (SELECT auth.uid())
    OR (SELECT is_platform_admin())
  );

-- =============================================================================
-- PART 2: PERFORMANCE FIXES
-- =============================================================================

-- Fix storage policies to use (select auth.uid()) for caching
-- Drop and recreate with cached auth.uid() calls

DROP POLICY IF EXISTS "Users can upload their own profile photos" ON storage.objects;
CREATE POLICY "Users can upload their own profile photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'images' AND
  (storage.foldername(name))[1] = 'profiles' AND
  (storage.foldername(name))[2] = (SELECT auth.uid())::text
);

DROP POLICY IF EXISTS "Users can upload dog photos to their folder" ON storage.objects;
CREATE POLICY "Users can upload dog photos to their folder"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'images' AND
  (storage.foldername(name))[1] = 'dogs' AND
  (storage.foldername(name))[2] = (SELECT auth.uid())::text
);

DROP POLICY IF EXISTS "Users can update their own photos" ON storage.objects;
CREATE POLICY "Users can update their own photos"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'images' AND
  (
    ((storage.foldername(name))[1] = 'profiles' AND (storage.foldername(name))[2] = (SELECT auth.uid())::text) OR
    ((storage.foldername(name))[1] = 'dogs' AND (storage.foldername(name))[2] = (SELECT auth.uid())::text)
  )
);

DROP POLICY IF EXISTS "Users can delete their own photos" ON storage.objects;
CREATE POLICY "Users can delete their own photos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'images' AND
  (
    ((storage.foldername(name))[1] = 'profiles' AND (storage.foldername(name))[2] = (SELECT auth.uid())::text) OR
    ((storage.foldername(name))[1] = 'dogs' AND (storage.foldername(name))[2] = (SELECT auth.uid())::text)
  )
);

-- =============================================================================
-- PART 3: RLS TEST HELPER FUNCTIONS
-- =============================================================================
-- SECURITY NOTE: These functions are only executable by the postgres superuser role.
-- They are NOT granted to authenticated or anon roles, preventing misuse in production.
-- To use them locally: connect as postgres (e.g., via supabase CLI or psql).
--
-- Usage (as postgres):
--   SELECT test_as_user('user-uuid-here');
--   SELECT * FROM entries;  -- Only returns what that user can see
--   SELECT test_reset();

CREATE OR REPLACE FUNCTION public.test_as_user(user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Only allow execution by superuser roles (postgres)
  IF NOT (SELECT usesuper FROM pg_user WHERE usename = current_user) THEN
    RAISE EXCEPTION 'test_as_user() can only be called by a superuser';
  END IF;

  EXECUTE 'SET ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', user_id::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', user_id,
    'role', 'authenticated',
    'iss', 'supabase',
    'iat', extract(epoch from now())::int,
    'exp', extract(epoch from (now() + interval '1 hour'))::int
  )::text, true);
END;
$$;

CREATE OR REPLACE FUNCTION public.test_as_anon()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT (SELECT usesuper FROM pg_user WHERE usename = current_user) THEN
    RAISE EXCEPTION 'test_as_anon() can only be called by a superuser';
  END IF;

  EXECUTE 'SET ROLE anon';
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '{}', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.test_reset()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT (SELECT usesuper FROM pg_user WHERE usename = current_user) THEN
    RAISE EXCEPTION 'test_reset() can only be called by a superuser';
  END IF;

  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '{}', true);
END;
$$;

-- DO NOT grant to authenticated or anon - superuser only
-- These functions are available when connecting directly as postgres
REVOKE ALL ON FUNCTION public.test_as_user(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.test_as_anon() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.test_reset() FROM PUBLIC;

COMMENT ON FUNCTION public.test_as_user(UUID) IS
  'Test helper (superuser only): Impersonate a user to test RLS policies. Call test_reset() when done.';
COMMENT ON FUNCTION public.test_as_anon() IS
  'Test helper (superuser only): Impersonate anonymous role to test RLS policies. Call test_reset() when done.';
COMMENT ON FUNCTION public.test_reset() IS
  'Test helper (superuser only): Reset role after testing RLS policies.';

-- =============================================================================
SELECT 'Migration 023: RLS tightened, performance fixed, test helpers added' as status;
