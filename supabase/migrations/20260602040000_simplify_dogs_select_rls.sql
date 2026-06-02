-- Migration: Simplify dogs SELECT RLS
--
-- Same pattern as 20260602010000 for people:
-- dogs_select calls can_manage_show_dog(dogs.id) per row (O(N) with entries join).
-- For a newly created dog with no entries, this always returns FALSE — so a
-- secretary who just created a dog for an exhibitor can't read it back, causing
-- the supabase-js insert (which uses return=representation) to roll back with 42501.
--
-- Fix: Allow any authenticated user to read all non-deleted dogs.
-- Dog records (call name, breed, AKC numbers) are semi-public — they appear on
-- published premium lists and AKC databases.

DROP POLICY IF EXISTS dogs_select ON public.dogs;

CREATE POLICY dogs_select ON public.dogs
  FOR SELECT USING (
    deleted_at IS NULL
    AND auth.uid() IS NOT NULL
  );
