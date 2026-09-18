-- MYK9-663: enrollments_select's role disjunct had no club scoping.
--
-- Source of truth for the policy body below:
-- 20260728130000_consolidate_identity_registration_rls.sql, the LATEST
-- migration that defines enrollments_select (20260727130000 only ALTERed the
-- predecessor policy enrollments_select_show_secretary, which 20260728130000
-- dropped). The four arms other than the role disjunct are carried over
-- unchanged in meaning; keyword case and the handler_id subquery's indentation
-- follow this file's style, so a reviewer diffing the two will see cosmetic
-- differences and no semantic one. 20260801160000_remove_steward_office_writes
-- .sql redefined enrollments_insert and enrollments_update but NOT
-- enrollments_select, so 20260728130000 is genuinely the latest source
-- (LESSON replace-function-latest).
--
-- The bug: the role arm matched
--
--   r.name = ANY (ARRAY['secretary','club_admin','site_admin','platform_admin'])
--   AND (ur.show_id = enrollments.show_id OR ur.show_id IS NULL)
--
-- and never once referenced ur.club_id. Club-scoped staff appointments are
-- exactly the rows with show_id IS NULL (20260830210000_appointment_grants_
-- show_access.sql), so the second disjunct was true for EVERY enrollment row
-- in the table. Any user holding an active, unexpired secretary or club_admin
-- appointment to any club read every club's enrollments -- the entry-and-money
-- join for shows they have nothing to do with.
--
-- Verified reachable on the live database before this migration was written,
-- in a rolled-back transaction impersonating Green Country Scent Work Club's
-- secretary: 4 of Heartland Scent Work Club's enrollments were visible; after
-- applying this policy in the same transaction, 0. See the PR body.
--
-- Fix: replace ONLY the role disjunct with membership in
-- public.manageable_show_ids(), the exact shape the sibling SELECT policy
-- entries_select carries today -- `show_id IN (SELECT manageable_show_ids())`
-- (20260730170000_hashable_entries_manager_policy.sql / MYK9-126 replaced a
-- per-row can_manage_show(entries.show_id) there because the correlated call
-- reintroduced the 20260611120000 statement-timeout shape). enrollments and
-- entries now agree on who may read a given show's rows, through one
-- uncorrelated set that the planner hashes once per statement. No fourth
-- hand-written role list.
--
-- manageable_show_ids() and can_manage_show() have identical bodies modulo the
-- is_site_admin()/is_platform_admin() alias (is_platform_admin() is defined as
-- `SELECT public.is_site_admin()`), so the AC's `can_manage_show(show_id)`
-- option and this one admit exactly the same rows; only the plan differs.
-- LESSON definer-deliberate-edge: manageable_show_ids() deliberately keeps
-- DRAFT and SOFT-DELETED shows visible to club-scoped managers even though
-- shows_select hides them -- pinned by supabase/tests/
-- entries_manager_policy_hashable_test.sql. That edge is preserved here and
-- must not be "fixed" by restating a shows predicate inside this policy.
--
-- Equivalence-or-tighter, per role-holder shape (role names verified against
-- public.roles on the live database: chairman, club_admin, exhibitor, judge,
-- secretary, site_admin, steward -- there is no 'platform_admin' or
-- 'trial_secretary' role row, so those two list entries were already inert):
--
--   site_admin                      -> unchanged. The policy's own
--                                      is_site_admin() / is_platform_admin()
--                                      arms already admit it, and
--                                      manageable_show_ids() returns every show
--                                      for a site admin as well.
--   club-scoped secretary, own club -> ADMITTED, via is_trial_secretary(club),
--                                      which requires ur.show_id IS NULL and
--                                      ur.club_id = shows.club_id.
--   club-scoped secretary, other    -> DENIED. This is the fix.
--     club
--   club-scoped club_admin, own     -> ADMITTED, via is_club_admin(club).
--     club
--   club-scoped club_admin, other   -> DENIED. This is the fix.
--     club
--   show-scoped secretary /         -> tighter. is_trial_secretary() requires
--     club_admin (ur.show_id set)      show_id IS NULL, so a show-scoped
--                                      secretary row loses the role arm. That
--                                      matches the schema's existing
--                                      convention: is_show_official() already
--                                      admits secretary and chairman ONLY on
--                                      club-scoped rows and reserves the
--                                      show-scoped arm for stewards
--                                      (show_officials_label_not_permission_
--                                      test.sql, MYK9-114). Zero such rows
--                                      exist on the live database.
--   show with club_id IS NULL       -> tighter, deliberately:
--                                      manageable_show_ids() reaches nobody
--                                      but a site admin on a club-less show
--                                      (the MYK9-258 `s.club_id IS NOT NULL`
--                                      guards). No live show with enrollments
--                                      has a null club_id.
--   official (is_show_official)     -> UNCHANGED arm.
--   exhibitor (handler_id)          -> UNCHANGED arm. A
--                                      tightening that dropped an exhibitor's
--                                      read of their own enrollment would be a
--                                      worse bug than the one being fixed.
--
-- TO public is preserved from 20260728130000, deliberately, and the anon
-- EXECUTE trap that split judge_assignments_select in two
-- (20260910163500 / MYK9-469) does NOT apply here. anon has no EXECUTE on
-- manageable_show_ids(), so a TO public policy that calls it would raise 42501
-- for the whole request if anon could ever reach it -- but anon holds NO
-- privilege of any kind on public.enrollments (verified live:
-- pg_class.relacl is postgres / authenticated=arw / service_role only), so the
-- table-grant check rejects anon before RLS is consulted. service_role and
-- postgres carry rolbypassrls, so `authenticated` is the only role that ever
-- evaluates this policy. Narrowing the policy to `TO authenticated` would
-- therefore change nothing observable, and leaving TO public keeps the diff to
-- the one disjunct this issue is about. If public.enrollments is ever granted
-- to anon, this policy must be split the way entries was
-- (entries_anon_select_for_tv TO anon + entries_select TO authenticated)
-- BEFORE that grant lands.
--
-- Sibling sweep (MYK9-663 AC6): every public policy whose predicate contains
-- `.show_id IS NULL` was read from pg_policies. The only other table is
-- waitlist_entries (select/insert/update/delete), and all four already carry
-- the correct companion term -- `ur.show_id = s.id OR (ur.show_id IS NULL AND
-- ur.club_id = s.club_id)`. enrollments_select was the only policy in the
-- broken shape, so there is nothing else to fix or file here.
--
-- GRANTs: public.enrollments already exists, so no new-table grant contract
-- applies and the authenticated/service_role ACL is left exactly as it is. The
-- one ACL statement below is a REVOKE, not a grant: the TO public reasoning
-- above depends on anon holding no privilege on this table, and CLAUDE.md
-- (Database Migrations) is explicit that omitting a GRANT does not keep anon
-- out -- this project carries ALTER DEFAULT PRIVILEGES granting anon full CRUD
-- in schema public. anon is already absent from pg_class.relacl here, so the
-- REVOKE is a no-op today; it exists so the precondition is enforced by the
-- schema rather than asserted by a comment (LESSON comment-satisfies-grep).
-- Nothing else in the repo pins it: aclRegistryCoverage only asserts the table
-- EXISTS, and anonEntriesGrantContract does not mention enrollments.

begin;

drop policy if exists "enrollments_select" on public.enrollments;

create policy "enrollments_select"
  on public.enrollments
  for select
  to public
  using (
    public.is_site_admin()
    OR public.is_show_official(show_id)
    OR public.is_platform_admin()
    OR handler_id IN (
      SELECT p.id
      FROM public.people p
      WHERE p.auth_user_id = (SELECT auth.uid())
    )
    OR show_id IN (SELECT public.manageable_show_ids())
  );

comment on policy "enrollments_select" on public.enrollments is
  'Role arm row-scoped to the enrollment''s own show via membership in '
  'manageable_show_ids() (club admin or club-scoped secretary of THAT show''s '
  'club, or a site admin) -- the same uncorrelated shape entries_select uses. '
  'Replaces an '
  'unscoped "holds secretary/club_admin ANYWHERE" disjunct that let any club''s '
  'staff read every club''s enrollments (MYK9-663). The is_show_official and '
  'handler_id arms are unchanged, so show officials and the exhibitor who owns '
  'the enrollment keep their reads.';

-- See the GRANTs note above: enforcing, not changing, today's ACL.
revoke all on public.enrollments from anon;

notify pgrst, 'reload schema';

commit;
