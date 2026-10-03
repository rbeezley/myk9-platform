-- MYK9-941: a dog's co-owner may add, change and remove its registrations.
--
-- The live dog_registrations INSERT/UPDATE/DELETE policies come from migration
-- 154 `fix_dog_registration_rls_for_secretaries`, which was applied to the live
-- database but never committed to this repo (the repo's 154 file is a different
-- migration; the ledger row is the only copy). That migration rebuilt the three
-- policies from 016, swapping is_platform_admin() for is_site_admin() and adding
-- has_role('secretary'), and in doing so dropped 016's
-- `OR co_owner_id = (SELECT get_my_person_id())` arm. A co-owner can edit and
-- soft-delete the dog (soft_delete_dog allows co-owners) but could not change
-- its registration numbers.
--
-- Each policy is recreated from the live definition with ONLY the co-owner arm
-- added inside the dog subquery. Command, TO roles and every other arm are
-- unchanged; UPDATE keeps no WITH CHECK (USING applies to the new row too).
-- Club admins without the secretary role stay excluded by design.
--
-- Behavioral test: supabase/tests/myk9_941_dog_registrations_co_owner_writes_test.sql
--
-- ROLLBACK (restores the live definitions this replaces):
-- DROP POLICY IF EXISTS "dog_registrations_insert" ON dog_registrations;
-- DROP POLICY IF EXISTS "dog_registrations_update" ON dog_registrations;
-- DROP POLICY IF EXISTS "dog_registrations_delete" ON dog_registrations;
-- CREATE POLICY "dog_registrations_insert" ON dog_registrations FOR INSERT TO authenticated WITH CHECK (dog_id IN (SELECT id FROM dogs WHERE owner_id = (SELECT get_my_person_id())) OR (SELECT is_site_admin()) OR (SELECT has_role('secretary')));
-- CREATE POLICY "dog_registrations_update" ON dog_registrations FOR UPDATE TO authenticated USING (dog_id IN (SELECT id FROM dogs WHERE owner_id = (SELECT get_my_person_id())) OR (SELECT is_site_admin()) OR (SELECT has_role('secretary')));
-- CREATE POLICY "dog_registrations_delete" ON dog_registrations FOR DELETE TO authenticated USING (dog_id IN (SELECT id FROM dogs WHERE owner_id = (SELECT get_my_person_id())) OR (SELECT is_site_admin()) OR (SELECT has_role('secretary')));

DROP POLICY IF EXISTS "dog_registrations_insert" ON dog_registrations;
DROP POLICY IF EXISTS "dog_registrations_update" ON dog_registrations;
DROP POLICY IF EXISTS "dog_registrations_delete" ON dog_registrations;

CREATE POLICY "dog_registrations_insert" ON dog_registrations
  FOR INSERT TO authenticated
  WITH CHECK (
    dog_id IN (
      SELECT id FROM dogs
      WHERE owner_id = (SELECT get_my_person_id())
         OR co_owner_id = (SELECT get_my_person_id())
    )
    OR (SELECT is_site_admin())
    OR (SELECT has_role('secretary'))
  );

CREATE POLICY "dog_registrations_update" ON dog_registrations
  FOR UPDATE TO authenticated
  USING (
    dog_id IN (
      SELECT id FROM dogs
      WHERE owner_id = (SELECT get_my_person_id())
         OR co_owner_id = (SELECT get_my_person_id())
    )
    OR (SELECT is_site_admin())
    OR (SELECT has_role('secretary'))
  );

CREATE POLICY "dog_registrations_delete" ON dog_registrations
  FOR DELETE TO authenticated
  USING (
    dog_id IN (
      SELECT id FROM dogs
      WHERE owner_id = (SELECT get_my_person_id())
         OR co_owner_id = (SELECT get_my_person_id())
    )
    OR (SELECT is_site_admin())
    OR (SELECT has_role('secretary'))
  );
