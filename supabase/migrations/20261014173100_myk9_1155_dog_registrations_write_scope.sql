-- MYK9-1155 (security audit 2026-10-14, SA-2026-10-14-01): a secretary may no
-- longer change or delete the registrations of a dog that is not hers to edit.
--
-- The three dog_registrations write policies (restated from ledger-only live
-- migration 154 by 20261003002747, MYK9-941) each ended in
-- `OR (SELECT has_role('secretary'))`. has_role() with no club argument is true
-- for a secretary of ANY club, so any secretary could rewrite or delete the AKC /
-- UKC / ASCA numbers of every dog on the platform, including dogs owned by
-- exhibitors with accounts and never entered at her club's shows.
--
-- 20261012224900 (MYK9-1127) set the rule for the dog itself: "An exhibitor-owned
-- dog with no tie to the secretary's shows stays read-only to her: it is the
-- owner's record." The dog's registrations are the identity printed on entries
-- and sent to the registry, so they follow the same rule:
--
--   * UPDATE and DELETE: public.can_edit_dog(dog_id), i.e. dog_edit_allowed():
--     owner, co-owner, site admin, a manager of a show the dog is entered in, a
--     manager of the show it was created from, or the staff member who created
--     it. The owner / co-owner / site-admin arms are part of that function, so
--     nobody who could write before through those arms loses access. UPDATE
--     gains a WITH CHECK so a row cannot be moved onto a dog the caller may not
--     edit.
--
--   * INSERT keeps the any-secretary arm, deliberately. A mail-in secretary
--     taking an existing exhibitor's FIRST entry must be able to add the
--     registration for the show's registry (trg_entries_require_dog_registration
--     refuses the entry without it; the wizard's inline add is
--     useInlineDogRegistration). The unique index
--     dog_registrations_dog_id_organization_key (dog_id, organization) means an
--     INSERT can only fill a registry the dog does not have yet; it can never
--     replace a number somebody entered. Same reasoning as
--     fill_entry_owner_address (20261008213900, owner-approved): "fill blanks
--     only" is what makes the wider reach acceptable.
--
-- can_edit_dog() reads public.dogs as the caller, so a dog the caller cannot see
-- yields NULL (refused). It never reads dog_registrations, so there is no policy
-- recursion under FORCE RLS.
--
-- Behavioral test: supabase/tests/myk9_941_dog_registrations_co_owner_writes_test.sql
--
-- ROLLBACK: restore the three policies exactly as 20261003002747 created them.

BEGIN;

DROP POLICY IF EXISTS "dog_registrations_insert" ON public.dog_registrations;
DROP POLICY IF EXISTS "dog_registrations_update" ON public.dog_registrations;
DROP POLICY IF EXISTS "dog_registrations_delete" ON public.dog_registrations;

CREATE POLICY "dog_registrations_insert" ON public.dog_registrations
  FOR INSERT TO authenticated
  WITH CHECK (
    public.can_edit_dog(dog_id)
    OR (SELECT public.has_role('secretary'))
  );

CREATE POLICY "dog_registrations_update" ON public.dog_registrations
  FOR UPDATE TO authenticated
  USING (public.can_edit_dog(dog_id))
  WITH CHECK (public.can_edit_dog(dog_id));

CREATE POLICY "dog_registrations_delete" ON public.dog_registrations
  FOR DELETE TO authenticated
  USING (public.can_edit_dog(dog_id));

COMMIT;
