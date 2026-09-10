-- Show staff can read the roles of the people they can already read.
--
-- `user_roles_select` (20260703180000) allowed only your OWN rows plus a full
-- read for site admins. Every other viewer got an EMPTY embed from
-- `people -> user_roles(role:roles(name))`, which is the join the People
-- directory and the person record page use. An empty array is indistinguishable
-- from "this person holds no roles", so the person page rendered:
--
--   * Account -> Roles: "Not set", for everyone a secretary opened
--   * the hero's fallback "Member" badge instead of Judge / Steward / Secretary
--   * no Judge Qualifications card, since that card is gated on
--     `person.roles.includes(JUDGE)`
--
-- A secretary assigning judges needs to know who IS a judge, so the fix is to
-- let them read it rather than to hide the fields.
--
-- The new predicate mirrors `people_select` exactly:
--
--   people_select:     deleted_at IS NULL
--                      AND (auth_user_id = auth.uid() OR is_show_manager())
--   user_roles_select: auth_user_id = auth.uid() OR is_show_manager()
--
-- so a role row is readable exactly where the person it belongs to is readable,
-- and the two policies cannot drift into disagreeing about who is visible.
-- Nobody gains sight of a person they could not already read: an exhibitor's
-- `people_select` still matches only their own row.
--
-- This is a strict widening — `is_show_manager()` is
-- `is_site_admin() OR is_trial_secretary() OR is_club_admin()`, so it already
-- contains the site-admin arm this replaces. No caller loses access.
--
-- Table grants are unchanged: `user_roles` is already `authenticated=arwd` with
-- no anon grant, verified against the live ACL before writing this.

DROP POLICY IF EXISTS "user_roles_select" ON public.user_roles;

-- Each helper is wrapped in (SELECT ...) so the planner evaluates it once per
-- query as an initplan rather than once per row — the same shape 20260703180000
-- used, and the reason it is not simply `public.is_show_manager()`.
CREATE POLICY "user_roles_select" ON public.user_roles
  FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid()) = auth_user_id
    OR (SELECT public.is_show_manager())
  );
