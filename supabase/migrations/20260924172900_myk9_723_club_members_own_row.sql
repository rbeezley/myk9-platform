-- MYK9-723: members could never read their own club roster (or officer) row.
--
-- club_members_select and club_officers_select both carried an own-row arm
-- `person_id = (SELECT auth.uid())`. person_id is a people.id (FK to
-- people(id)); auth.uid() is an auth.users.id. They are different id spaces
-- and never match (0 of 11 live people rows share the value), so the arm was
-- dead: a member saw their own row only if they also happened to be a club
-- or platform admin.
--
-- Fix: compare person_id with the caller's own people.id through the
-- existing SECURITY DEFINER helper get_my_person_id() (people.auth_user_id =
-- auth.uid()), wrapped in a scalar subquery so it is evaluated once per
-- statement (InitPlan), the same shape dogs_insert_secretary already uses.
-- The admin arms are copied verbatim from the LATEST definition,
-- 20260727130000_rls_initplan_wrap_auth_calls.sql; ALTER POLICY keeps the
-- policies' roles (PUBLIC) and command (SELECT) unchanged.
--
-- Audit of every live policy comparing a column to auth.uid() (pg_policies,
-- 2026-09-24): only these two compare a people-FK column; every other match
-- is an auth.users FK, a people.auth_user_id join, or a column the app writes
-- with auth.uid() by contract (paperwork_prints.printed_by / voided_by).
--
-- Grants are unchanged (anon has none on either table); no new objects.

BEGIN;

ALTER POLICY club_members_select ON public.club_members
  USING (
    is_club_admin(club_id)
    OR is_platform_admin()
    OR (person_id = (SELECT public.get_my_person_id()))
  );

ALTER POLICY club_officers_select ON public.club_officers
  USING (
    is_club_admin(club_id)
    OR is_platform_admin()
    OR (person_id = (SELECT public.get_my_person_id()))
  );

COMMIT;
