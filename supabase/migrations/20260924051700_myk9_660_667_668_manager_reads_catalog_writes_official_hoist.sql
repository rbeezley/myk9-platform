-- MYK9-660, MYK9-667, MYK9-668: three RLS corrections in one migration.
--
-- Every policy below was copied from the LATEST migration that defines it
-- (LESSON replace-function-latest) and checked against live pg_policies on
-- 2026-09-24 before editing:
--   waitlist_entries_select                      20260619140000_fix_waitlist_entries_rls_role_name.sql
--   secretary_admin_select_result_submissions    20260912171500_scope_unscoped_role_predicates.sql
--   volunteer_roles_manage_{insert,update,delete} 20260728132000_split_catalog_volunteer_manage_read_rls.sql
--   enrollments_select                           20260919135700_enrollment_select_show_scope.sql
--
-- ---------------------------------------------------------------------------
-- MYK9-660: club admins are show managers (Richard, 2026-09-18)
-- ---------------------------------------------------------------------------
-- Four SELECT policies admitted secretaries but not club admins, so a club
-- admin on their own club's show read silent false zeros. Decision per table:
--
--   waitlist_entries    WIDEN. Reached from Entries -> Waitlist sub-tab.
--   result_submissions  WIDEN. Reached from Show Day's registry-submission panel.
--   judge_availability  KEEP.  Not reached from the six show tabs: the only
--                       callers are the judge's own upsert/getByPersonId.
--   vaccinations        KEEP.  Not reached from the six show tabs; MYK9-470
--                       deliberately scoped its staff arm to trial secretaries.
--
-- The widening uses the existing uncorrelated manager helper
-- entry_enrollment_select_show_ids() (20260919135700), never a fresh role list.
-- It is manageable_show_ids()'s role set (site admin, club-scoped club admin,
-- club-scoped secretary) with one difference that matters here: a SHOW-PINNED
-- club_admin row stays on its one show instead of widening to every show of
-- the club (MYK9-663 follow-up; enrollments_select_club_scope_test.sql
-- assertion 8). Waitlist rows are class entries in all but name, so they take
-- the scope entries and enrollments already use.
--
-- Every existing arm is kept. On waitlist_entries the inlined role join also
-- admits show-pinned secretary rows, which the helper does not, so removing it
-- would narrow. On result_submissions trial_secretary_show_ids() is a strict
-- subset of the helper, so the helper replaces it.
--
-- ---------------------------------------------------------------------------
-- MYK9-667: volunteer_roles is a site-wide catalog (Richard, 2026-09-24)
-- ---------------------------------------------------------------------------
-- The table has no club_id or show_id, so a club officer's write was a write to
-- every club's catalog. Only site admins may INSERT/UPDATE/DELETE it; SELECT
-- (volunteer_roles_select, is_real_account()) is untouched. No app surface
-- writes volunteer_roles, and the seed creates no rows, so nothing loses a path.
-- Table grants are unchanged: the site admin writes as `authenticated`.
--
-- ---------------------------------------------------------------------------
-- MYK9-668: hoist enrollments_select's correlated is_show_official(show_id)
-- ---------------------------------------------------------------------------
-- is_show_official(show_id) referenced a column of the scanned row, so the
-- planner ran it once per candidate row -- the shape MYK9-126 removed from
-- entries_select. official_show_ids() returns the same set once. It keeps all
-- three arms of is_show_official:
--   1. site_admin (any show);
--   2. a CLUB-scoped secretary, chairman or steward (ur.show_id IS NULL) on a
--      show of that club;
--   3. a SHOW-scoped steward on exactly that show (MYK9-114 pins show- and
--      club-scoped stewards as equals).
-- enrollments.show_id is NOT NULL with a FK to shows, so "any show" and "any
-- existing show" coincide on this table.
--
-- EXECUTE: authenticated and service_role only, like manageable_show_ids() and
-- entry_enrollment_select_show_ids(). enrollments_select is TO public, which is
-- safe only while anon holds no privilege on public.enrollments -- pinned by
-- supabase/tests/pre_rule_table_grants_test.sql. The same holds for
-- waitlist_entries_select (TO public, no anon table grant). Any other TO public
-- policy that adopts official_show_ids() must re-check that (MYK9-469's 42501).

begin;

-- ===========================================================================
-- MYK9-668: official_show_ids()
-- ===========================================================================
create or replace function public.official_show_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  -- Arm 1: a site admin is an official of every show.
  select s.id
  from public.shows s
  where exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.auth_user_id = (select auth.uid())
      and ur.is_active
      and (ur.expires_at is null or ur.expires_at > now())
      and r.name = 'site_admin'
  )

  union

  -- Arm 2: a club-scoped secretary, chairman or steward, on their club's shows.
  select s.id
  from public.shows s
  join public.user_roles ur on ur.club_id = s.club_id
  join public.roles r on r.id = ur.role_id
  where ur.auth_user_id = (select auth.uid())
    and ur.is_active
    and (ur.expires_at is null or ur.expires_at > now())
    and r.name in ('secretary', 'chairman', 'steward')
    and ur.show_id is null

  union

  -- Arm 3: a show-scoped steward, on exactly that show.
  select ur.show_id
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  where ur.auth_user_id = (select auth.uid())
    and ur.is_active
    and (ur.expires_at is null or ur.expires_at > now())
    and r.name = 'steward'
    and ur.show_id is not null;
$$;

comment on function public.official_show_ids() is
  'MYK9-668: the set form of is_show_official(show_id): site admin (every show), a '
  'club-scoped secretary/chairman/steward (their club''s shows), and a show-scoped steward '
  '(that show). Uncorrelated, so an RLS policy evaluates it once per statement.';

revoke all on function public.official_show_ids() from public, anon;
grant execute on function public.official_show_ids() to authenticated, service_role;

drop policy if exists "enrollments_select" on public.enrollments;

create policy "enrollments_select"
  on public.enrollments
  for select
  to public
  using (
    public.is_site_admin()
    or show_id in (select public.official_show_ids())
    or public.is_platform_admin()
    or handler_id in (
      select p.id
      from public.people p
      where p.auth_user_id = (select auth.uid())
    )
    or show_id in (select public.entry_enrollment_select_show_ids())
  );

comment on policy "enrollments_select" on public.enrollments is
  'Role arm is scoped by entry_enrollment_select_show_ids(): club-scoped managers see their own '
  'club, while show-pinned club_admin rows remain exact-show. Show officials read through the '
  'uncorrelated official_show_ids() (MYK9-668), which keeps is_show_official''s three arms. The '
  'handler_id arm preserves the exhibitor''s own reads.';

-- ===========================================================================
-- MYK9-660: waitlist_entries_select
-- ===========================================================================
drop policy if exists "waitlist_entries_select" on public.waitlist_entries;

create policy "waitlist_entries_select"
  on public.waitlist_entries
  for select
  to public
  using (
    exists (
      select 1
      from public.classes c
      join public.trials t on t.id = c.trial_id
      join public.shows s on s.id = t.show_id
      join public.user_roles ur
        on ur.show_id = s.id or (ur.show_id is null and ur.club_id = s.club_id)
      join public.roles r on r.id = ur.role_id
      where c.id = waitlist_entries.class_id
        and ur.auth_user_id = (select auth.uid())
        and ur.is_active
        and (ur.expires_at is null or ur.expires_at > now())
        and r.name = any (array['site_admin', 'secretary'])
    )
    or exhibitor_id in (
      select ep.id
      from public.exhibitor_profiles ep
      where ep.auth_user_id = (select auth.uid())
    )
    or class_id in (
      select c.id
      from public.classes c
      join public.trials t on t.id = c.trial_id
      where t.show_id in (select public.entry_enrollment_select_show_ids())
    )
  );

comment on policy "waitlist_entries_select" on public.waitlist_entries is
  'MYK9-660: show managers (site admin, club admin, secretary) read their shows'' waitlists '
  'through the uncorrelated entry_enrollment_select_show_ids(), the scope entries and '
  'enrollments use. The inlined site_admin/secretary role join and the exhibitor''s own-row arm '
  'are carried over unchanged.';

-- ===========================================================================
-- MYK9-660: result_submissions SELECT
-- ===========================================================================
drop policy if exists "secretary_admin_select_result_submissions" on public.result_submissions;

create policy "secretary_admin_select_result_submissions"
  on public.result_submissions
  for select
  to authenticated
  using (show_id in (select public.entry_enrollment_select_show_ids()));

comment on policy "secretary_admin_select_result_submissions" on public.result_submissions is
  'MYK9-660: show managers (site admin, club admin, secretary) read their shows'' registry '
  'submissions through the uncorrelated entry_enrollment_select_show_ids(). It is a superset of '
  'the previous trial_secretary_show_ids() arm (MYK9-470). INSERT is unchanged.';

-- ===========================================================================
-- MYK9-660: the two tables deliberately KEPT, recorded so the decision is not
-- an omission.
-- ===========================================================================
comment on policy "judge_availability_select" on public.judge_availability is
  'MYK9-660: deliberately NOT widened to club admins. No caller on the six show tabs reads '
  'another person''s availability; the judge reads and writes their own row. Revisit if a '
  'manager surface starts reading it.';

comment on policy "vaccinations_select" on public.vaccinations is
  'MYK9-475: platform admin, or a non-deleted dog the caller owns/co-owns or has actively entered '
  'in a show they are trial secretary of. The dog soft-delete filter AND-s over every dog-derived '
  'arm by construction, matching dogs_select and achievements_select. The secretary arm uses the '
  'UNCORRELATED trial_secretary_show_ids() (MYK9-470) — do not rewrite as per-row '
  'can_manage_show(), which is the 20260611120000 timeout shape. MYK9-660: deliberately NOT '
  'widened to club admins; no caller on the six show tabs reads vaccination records.';

-- ===========================================================================
-- MYK9-667: volunteer_roles writes are site-admin only
-- ===========================================================================
alter policy "volunteer_roles_manage_insert" on public.volunteer_roles
  with check ((select public.is_site_admin()));

alter policy "volunteer_roles_manage_update" on public.volunteer_roles
  using ((select public.is_site_admin()))
  with check ((select public.is_site_admin()));

alter policy "volunteer_roles_manage_delete" on public.volunteer_roles
  using ((select public.is_site_admin()));

comment on table public.volunteer_roles is
  'Global catalogue of volunteer role types, shared by every club. MYK9-667 (Richard, '
  '2026-09-24): only site admins may insert, update or delete it; every real account may read '
  'it. The table has no club_id or show_id, so a club officer''s write would reach every club.';

notify pgrst, 'reload schema';

commit;
