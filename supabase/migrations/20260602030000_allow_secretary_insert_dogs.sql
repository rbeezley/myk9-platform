-- Migration: Allow authenticated users to insert dog records for others
--
-- dogs_insert requires owner_id = get_my_person_id() or is_site_admin().
-- Secretaries creating dogs for exhibitors set owner_id to the exhibitor's
-- person ID, which fails the check. Allow any authenticated user to insert
-- a dog record (owner is determined by the owner_id column, not the inserter).

CREATE POLICY dogs_insert_secretary ON public.dogs
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
  );
