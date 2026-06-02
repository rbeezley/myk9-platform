-- Migration: Simplify people SELECT RLS to eliminate can_manage_show_person() cascade
--
-- Root cause: people_select calls can_manage_show_person(people.id) per row. That
-- function queries entries → dogs → can_manage_show() for every person, making any
-- query on people O(N × entries). This causes statement timeouts and a retry storm
-- (PeopleStore retries on failure → hundreds of timed-out requests per session).
--
-- Fix: Allow any authenticated user to read all non-deleted people records.
--
-- Security rationale:
--  • Platform is pre-launch with no real users yet.
--  • People records (names, contact info, AKC numbers) are semi-public in the dog
--    show world — the same data appears on published premium lists and AKC directories.
--  • The old policy was accidentally very permissive anyway: a secretary sees every
--    person who has an entry in any show they manage, which is most of the table.
--  • Soft-delete (deleted_at IS NOT NULL) still hides removed records.
--  • The partial index idx_people_deleted_name makes this instant.
--
-- What to do post-launch if stricter isolation is needed:
--  • Add an org/club FK to people and restrict by org.
--  • Or add an explicit allow-list via a junction table.
--  • The can_manage_show_person() approach was too expensive regardless of policy.

DROP POLICY IF EXISTS people_select ON public.people;

CREATE POLICY people_select ON public.people
  FOR SELECT USING (
    deleted_at IS NULL
    AND auth.uid() IS NOT NULL
  );
