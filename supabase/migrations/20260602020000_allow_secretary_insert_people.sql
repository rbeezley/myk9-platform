-- Migration: Allow secretaries to insert person records
--
-- Problem: people_insert policy requires auth_user_id = auth.uid() (own record)
-- or is_site_admin(). Secretaries creating exhibitor/person records for mail-in
-- entries or on-site registration set auth_user_id = NULL (new person without
-- an account), which fails the RLS check.
--
-- Fix: Add a permissive policy that allows any authenticated user with a
-- show-management role (secretary, club_admin) or any authenticated user
-- creating a record with auth_user_id IS NULL (a new unlinked person).
-- This matches the existing RBAC grant registration:create_exhibitor.

CREATE POLICY people_insert_secretary ON public.people
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      auth_user_id IS NULL   -- new person not yet linked to an auth account
      OR auth_user_id = auth.uid()  -- own record (covered by existing policy, belt+suspenders)
    )
  );
