# Club Role Approval Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a secure V1 approval workflow where site admins approve new clubs and first club admins, then approved club admins manage secretary access for their own club only.

**Architecture:** Add a `club_access_requests` approval table plus security-definer RPCs for reviewing club requests and managing club-scoped secretary grants. Keep signup low-friction by storing request intent in auth metadata and materializing a pending request from a separate `zz_` auth trigger that runs after the existing account bootstrap trigger. Harden `user_roles` so elevated role writes happen through authorized RPCs instead of direct client table mutations.

**Tech Stack:** Supabase Postgres/RLS/RPCs, TypeScript, React, React Router, shadcn/ui, React Query/Vitest, existing myK9Show admin and club detail surfaces.

## Validation Profile

- Risk: high
- Validation: full
- Rationale: This changes auth/RBAC, Supabase RLS, security-definer RPCs, signup behavior, and role-scoped show-management access, so implementation requires database checks, focused app tests, typecheck, lint, and a targeted browser/admin flow smoke before PR.

---

## File Structure

- Create: `supabase/migrations/20260524120000_club_access_requests.sql`
  - Owns the approval table, enum/check constraints, RLS, separate auth trigger, and three RPCs. Uses the current timestamp migration convention already present in recent migrations.
- Modify: `apps/myk9show/src/pages/SignUpPage.tsx`
  - Updates role copy, supports `/sign-up?request=club`, and collects club request fields when club access is requested.
- Modify: `apps/myk9show/src/hooks/useAuth.ts`
  - Extends signup metadata with club request fields.
- Modify: `apps/myk9show/src/components/landing/v2/HeroPhotoLed.tsx`
  - Adds a public "Start a club on myK9Show" entry point to signup with club request intent preselected.
- Modify: `apps/myk9show/src/components/landing/v2/ClubFeatures.tsx`
  - Adds a secondary club onboarding CTA in the clubs/secretaries section.
- Test: `apps/myk9show/src/test/pages/SignUpPage.test.tsx`
  - Proves signup wording, query-param preselection, and metadata payload.
- Test: `apps/myk9show/src/components/landing/v2/__tests__/ClubOnboardingCta.test.tsx`
  - Proves landing CTAs route to `/sign-up?request=club`.
- Test: `apps/myk9show/src/test/auth/useAuth.test.ts`
  - Proves `signUp()` sends the metadata keys expected by the DB trigger.
- Create: `apps/myk9show/src/features/access-requests/accessRequestTypes.ts`
  - TypeScript types for request rows and review actions.
- Create: `apps/myk9show/src/features/access-requests/accessRequestService.ts`
  - Small Supabase service wrapper for listing and reviewing club access requests.
- Create: `apps/myk9show/src/features/access-requests/useAccessRequests.ts`
  - React Query hooks for the admin queue and the requester's own status.
- Create: `apps/myk9show/src/features/access-requests/AccessRequestStatusCard.tsx`
  - Shows signed-in requesters whether their club request is pending, approved, or denied.
- Test: `apps/myk9show/src/features/access-requests/AccessRequestStatusCard.test.tsx`
  - Proves requesters can see pending/approved/denied status without email notifications.
- Create: `apps/myk9show/src/pages/admin/AccessRequestsPage.tsx`
  - Site-admin queue UI.
- Modify: `apps/myk9show/src/pages/AccountPage.sections.tsx`
  - Renders the access request status card in the profile section.
- Modify: `apps/myk9show/src/routes/adminRoutes.tsx`
  - Registers `/admin/access-requests`.
- Modify: `apps/myk9show/src/pages/admin/AdminDashboard/PlatformAdministrationSection.tsx`
  - Adds an entry point to the access request queue.
- Create: `apps/myk9show/src/features/club-secretaries/clubSecretaryService.ts`
  - Calls secretary list/grant/revoke RPCs and fetches club-scoped secretary rows.
- Modify: `apps/myk9show/src/components/clubs/ClubDetails/MembersTab.tsx`
  - Adds the secretary management section for club admins.
- Test: `apps/myk9show/src/components/clubs/ClubDetails/__tests__/MembersTab.secretaries.test.tsx`
  - Proves club admins choose secretaries by person name/email instead of pasting ids.
- Test: `apps/myk9show/src/features/access-requests/accessRequestService.test.ts`
  - Proves RPC payloads and error handling.
- Test: `apps/myk9show/src/features/club-secretaries/clubSecretaryService.test.ts`
  - Proves club-scoped grant/revoke calls.
- Create: `apps/myk9show/src/features/role-scope/roleScopeAudit.test.ts`
  - [ADDED] Captures known broad people/dog permission policies and fails if new unscoped secretary paths are introduced.
- Modify: `apps/myk9show/src/services/database/day-of-operations/types.ts`
  - Adds `showId` to day-of entry dog creation input so scoped creation RPCs can authorize against the managed show.
- Modify: `apps/myk9show/src/services/database/day-of-operations/late-entry-dog.ts`
  - Converts day-of owner/dog creation to show-scoped RPC calls.
- Test: `apps/myk9show/src/services/database/day-of-operations/__tests__/late-entry-dog.test.ts`
  - Proves late-entry owner/dog RPC payloads include the managed `showId`.
- Create: `supabase/tests/club_access_requests.sql`
  - SQL-level regression test covering RLS/RPC role boundaries if the repo's Supabase test harness is available.
- Modify: `OPEN-TODOS.md`
  - Mark this todo complete only after implementation and tests pass.

## Task 1: Database Approval Model And RPC Boundary

**Files:**
- Create: `supabase/migrations/20260524120000_club_access_requests.sql`
- Create: `supabase/tests/club_access_requests.sql`

- [ ] **Step 0: [ADDED] Inventory scoped-role compatibility before writing the migration**

Run this read-only SQL against the linked local database before editing the migration:

```sql
select r.name as role_name, count(*) as null_club_rows
from public.user_roles ur
join public.roles r on r.id = ur.role_id
where r.name in ('secretary', 'trial_secretary', 'club_admin')
  and ur.club_id is null
group by r.name
order by r.name;

select tgname
from pg_trigger
where tgname in ('zz_grant_early_access_secretary', 'trg_enforce_club_id_for_scoped_roles');

select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.user_roles'::regclass
  and contype in ('u', 'p')
order by conname;
```

Expected: no null-club `secretary` / `club_admin` rows remain, the scoped-role constraint trigger exists, and `user_roles` has a usable unique constraint on `(user_id, role_id, club_id, show_id)`. If that exact conflict target does not exist, update the migration upsert statements to match the actual constraint before implementing. If `zz_grant_early_access_secretary` exists, include the compatibility fix in Step 3 so legacy early-access signup no longer attempts to insert a global secretary row.

**Lifecycle rule:** pending club details must stay in `club_access_requests`; do not insert into `clubs` until `review_club_access_request(..., 'approved', ...)` runs. This prevents unapproved, duplicate, or spam clubs from becoming real platform clubs.

- [ ] **Step 1: Write SQL regression coverage first**

Create `supabase/tests/club_access_requests.sql` with these assertions:

```sql
begin;

select plan(9);

select has_table('public', 'club_access_requests', 'club_access_requests table exists');
select has_function('public', 'review_club_access_request', ARRAY['uuid', 'text', 'uuid', 'text', 'text'], 'review RPC exists');
select has_function('public', 'grant_club_secretary', ARRAY['uuid', 'uuid'], 'grant secretary RPC exists');
select has_function('public', 'revoke_club_secretary', ARRAY['uuid', 'uuid'], 'revoke secretary RPC exists');

select col_is_fk('public', 'club_access_requests', 'requester_person_id', 'request links to people');
select col_is_fk('public', 'club_access_requests', 'approved_club_id', 'approved request links to clubs');
select policies_are('public', 'club_access_requests', ARRAY[
  'club_access_requests_insert_own',
  'club_access_requests_select_own_or_site_admin',
  'club_access_requests_review_site_admin'
]);
select has_table('public', 'permission_audit_log', 'permission audit table exists');
select pass('RPC behavioral checks run in the app integration suite with seeded auth context');

select * from finish();

rollback;
```

- [ ] **Step 2: Run the SQL test red**

Run: `supabase test db supabase/tests/club_access_requests.sql`

Expected: FAIL because `club_access_requests` and RPCs do not exist yet. If the local Supabase test harness is not configured, record the exact CLI error in the PR notes and continue with migration lint plus app-level tests.

- [ ] **Step 3: Add the migration**

Create `supabase/migrations/20260524120000_club_access_requests.sql`:

```sql
begin;

create table if not exists public.club_access_requests (
  id uuid primary key default extensions.uuid_generate_v4(),
  requester_person_id uuid not null references public.people(id) on delete cascade,
  requester_auth_user_id uuid not null,
  requested_club_name text not null check (length(trim(requested_club_name)) > 1),
  requested_club_website text,
  request_note text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  approved_club_id uuid references public.clubs(id) on delete set null,
  reviewed_by uuid references public.people(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists club_access_requests_status_created_idx
  on public.club_access_requests(status, created_at desc);

create unique index if not exists club_access_requests_pending_person_club_unique
  on public.club_access_requests(requester_person_id, lower(requested_club_name))
  where status = 'pending';

alter table public.club_access_requests enable row level security;

create or replace function public.can_insert_club_access_request(p_auth_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select count(*) < 3
  from public.club_access_requests
  where requester_auth_user_id = p_auth_user_id
    and status = 'pending'
$$;

drop policy if exists club_access_requests_insert_own on public.club_access_requests;
create policy club_access_requests_insert_own
  on public.club_access_requests
  for insert
  to authenticated
  with check (
    requester_auth_user_id = auth.uid()
    and status = 'pending'
    and reviewed_by is null
    and reviewed_at is null
    and approved_club_id is null
    and public.can_insert_club_access_request(auth.uid())
  );

drop policy if exists club_access_requests_select_own_or_site_admin on public.club_access_requests;
create policy club_access_requests_select_own_or_site_admin
  on public.club_access_requests
  for select
  to authenticated
  using (
    requester_auth_user_id = auth.uid()
    or public.is_site_admin()
  );

drop policy if exists club_access_requests_review_site_admin on public.club_access_requests;
create policy club_access_requests_review_site_admin
  on public.club_access_requests
  for update
  to authenticated
  using (public.is_site_admin())
  with check (public.is_site_admin());

drop policy if exists user_roles_insert on public.user_roles;
drop policy if exists user_roles_update on public.user_roles;
drop policy if exists user_roles_delete on public.user_roles;

create policy user_roles_insert_site_admin_only
  on public.user_roles
  for insert
  to authenticated
  with check (public.is_site_admin());

create policy user_roles_update_site_admin_only
  on public.user_roles
  for update
  to authenticated
  using (public.is_site_admin())
  with check (public.is_site_admin());

create policy user_roles_delete_site_admin_only
  on public.user_roles
  for delete
  to authenticated
  using (public.is_site_admin());

create or replace function public.get_my_person_id()
returns uuid
language sql
security definer
stable
set search_path = ''
as $$
  select id
  from public.people
  where auth_user_id = auth.uid()
  limit 1
$$;

create or replace function public.insert_club_access_request_from_signup(
  p_person_id uuid,
  p_auth_user_id uuid,
  p_metadata jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_roles text[];
  v_club_name text;
begin
  select coalesce(array_agg(value), array[]::text[])
  into v_roles
  from jsonb_array_elements_text(coalesce(p_metadata->'intended_roles', '[]'::jsonb)) as roles(value);

  v_club_name := nullif(trim(coalesce(p_metadata->>'requested_club_name', '')), '');

  if 'club_officer' = any(v_roles) and v_club_name is not null then
    insert into public.club_access_requests (
      requester_person_id,
      requester_auth_user_id,
      requested_club_name,
      requested_club_website,
      request_note
    )
    values (
      p_person_id,
      p_auth_user_id,
      v_club_name,
      nullif(trim(coalesce(p_metadata->>'requested_club_website', '')), ''),
      nullif(trim(coalesce(p_metadata->>'club_request_note', '')), '')
    )
    on conflict (requester_person_id, lower(requested_club_name)) where status = 'pending'
    do nothing;
  end if;
end;
$$;

create or replace function public.materialize_club_access_request_from_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_person_id uuid;
begin
  select id into v_person_id
  from public.people
  where auth_user_id = new.id
  limit 1;

  if v_person_id is null then
    return new;
  end if;

  perform public.insert_club_access_request_from_signup(
    v_person_id,
    new.id,
    new.raw_user_meta_data
  );

  return new;
end;
$$;

create or replace function public.review_club_access_request(
  p_request_id uuid,
  p_decision text,
  p_existing_club_id uuid default null,
  p_club_name text default null,
  p_review_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.club_access_requests%rowtype;
  v_reviewer_person_id uuid;
  v_club_id uuid;
  v_club_admin_role_id uuid;
begin
  if not public.is_site_admin() then
    raise exception 'Only site admins can review club access requests' using errcode = '42501';
  end if;

  if p_decision not in ('approved', 'denied') then
    raise exception 'Decision must be approved or denied' using errcode = '22023';
  end if;

  select * into v_request
  from public.club_access_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Club access request not found' using errcode = 'P0002';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'Club access request has already been reviewed' using errcode = '23514';
  end if;

  select id into v_reviewer_person_id
  from public.people
  where auth_user_id = auth.uid()
  limit 1;

  if p_decision = 'denied' then
    update public.club_access_requests
    set status = 'denied',
        reviewed_by = v_reviewer_person_id,
        reviewed_at = now(),
        review_note = p_review_note,
        updated_at = now()
    where id = p_request_id;

    insert into public.permission_audit_log (
      user_id,
      action,
      target_type,
      target_id,
      new_value
    )
    values (
      v_reviewer_person_id,
      'club_access_request_denied',
      'club_access_request',
      p_request_id,
      jsonb_build_object('requester_person_id', v_request.requester_person_id)
    );

    return null;
  end if;

  v_club_id := p_existing_club_id;

  if v_club_id is null then
    insert into public.clubs (name, website, created_by)
    values (
      coalesce(nullif(trim(p_club_name), ''), v_request.requested_club_name),
      v_request.requested_club_website,
      v_request.requester_person_id
    )
    returning id into v_club_id;
  end if;

  select id into v_club_admin_role_id
  from public.roles
  where name = 'club_admin';

  if v_club_admin_role_id is null then
    raise exception 'club_admin role is missing' using errcode = 'P0002';
  end if;

  insert into public.user_roles (user_id, role_id, club_id, granted_by, is_active)
  values (v_request.requester_person_id, v_club_admin_role_id, v_club_id, v_reviewer_person_id, true)
  on conflict (user_id, role_id, club_id, show_id)
  do update set is_active = true,
                granted_by = excluded.granted_by,
                granted_at = now();

  update public.club_access_requests
  set status = 'approved',
      approved_club_id = v_club_id,
      reviewed_by = v_reviewer_person_id,
      reviewed_at = now(),
      review_note = p_review_note,
      updated_at = now()
  where id = p_request_id;

  insert into public.permission_audit_log (
    user_id,
    action,
    target_type,
    target_id,
    new_value
  )
  values (
    v_reviewer_person_id,
    'club_access_request_approved',
    'club_access_request',
    p_request_id,
    jsonb_build_object(
      'requester_person_id', v_request.requester_person_id,
      'club_id', v_club_id,
      'role', 'club_admin'
    )
  );

  return v_club_id;
end;
$$;

create or replace function public.grant_club_secretary(
  p_person_id uuid,
  p_club_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_person_id uuid;
  v_secretary_role_id uuid;
  v_assignment_id uuid;
begin
  if not (public.is_site_admin() or public.is_club_admin(p_club_id)) then
    raise exception 'Only site admins or this club''s admins can grant secretary access' using errcode = '42501';
  end if;

  select id into v_actor_person_id
  from public.people
  where auth_user_id = auth.uid()
  limit 1;

  select id into v_secretary_role_id
  from public.roles
  where name = 'secretary';

  if v_secretary_role_id is null then
    raise exception 'secretary role is missing' using errcode = 'P0002';
  end if;

  insert into public.user_roles (user_id, role_id, club_id, granted_by, is_active)
  values (p_person_id, v_secretary_role_id, p_club_id, v_actor_person_id, true)
  on conflict (user_id, role_id, club_id, show_id)
  do update set is_active = true,
                granted_by = excluded.granted_by,
                granted_at = now()
  returning id into v_assignment_id;

  insert into public.permission_audit_log (
    user_id,
    action,
    target_type,
    target_id,
    new_value
  )
  values (
    v_actor_person_id,
    'club_secretary_granted',
    'user_role',
    v_assignment_id,
    jsonb_build_object('person_id', p_person_id, 'club_id', p_club_id, 'role', 'secretary')
  );

  return v_assignment_id;
end;
$$;

create or replace function public.revoke_club_secretary(
  p_person_id uuid,
  p_club_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secretary_role_id uuid;
  v_actor_person_id uuid;
begin
  if not (public.is_site_admin() or public.is_club_admin(p_club_id)) then
    raise exception 'Only site admins or this club''s admins can revoke secretary access' using errcode = '42501';
  end if;

  select id into v_secretary_role_id
  from public.roles
  where name = 'secretary';

  select id into v_actor_person_id
  from public.people
  where auth_user_id = auth.uid()
  limit 1;

  update public.user_roles
  set is_active = false
  where user_id = p_person_id
    and role_id = v_secretary_role_id
    and club_id = p_club_id
    -- Club-level revocation does not deactivate show-scoped official rows.
    -- Those assignments remain managed from the show official surface.
    and show_id is null;

  insert into public.permission_audit_log (
    user_id,
    action,
    target_type,
    target_id,
    new_value
  )
  values (
    v_actor_person_id,
    'club_secretary_revoked',
    'user_role',
    p_person_id,
    jsonb_build_object('person_id', p_person_id, 'club_id', p_club_id, 'role', 'secretary')
  );
end;
$$;

grant execute on function public.review_club_access_request(uuid, text, uuid, text, text) to authenticated;
grant execute on function public.grant_club_secretary(uuid, uuid) to authenticated;
grant execute on function public.revoke_club_secretary(uuid, uuid) to authenticated;
grant execute on function public.insert_club_access_request_from_signup(uuid, uuid, jsonb) to supabase_auth_admin;
grant execute on function public.materialize_club_access_request_from_auth_user() to supabase_auth_admin;

-- [ADDED] Compatibility: older early-access signup logic attempted to insert
-- a global secretary role. Club-scoped secretary is now the only valid model.
drop trigger if exists zz_grant_early_access_secretary on auth.users;
drop function if exists public.grant_early_access_secretary_role();

drop trigger if exists zz_materialize_club_access_request on auth.users;
create trigger zz_materialize_club_access_request
  after insert on auth.users
  for each row execute function public.materialize_club_access_request_from_auth_user();

notify pgrst, 'reload schema';

commit;
```

- [ ] **Step 4: Verify the auth trigger is isolated from `handle_new_user()`**

Do not replace `public.handle_new_user()`. The migration must leave the existing `on_auth_user_created` trigger and `handle_new_user()` function untouched, then add only the separate `zz_materialize_club_access_request` trigger.

Run:

```bash
rg -n "CREATE OR REPLACE FUNCTION public.handle_new_user|zz_materialize_club_access_request|on_auth_user_created" supabase/migrations/20260524120000_club_access_requests.sql
```

Expected: no `CREATE OR REPLACE FUNCTION public.handle_new_user` match in the new migration, and a match for `zz_materialize_club_access_request`. This avoids stomping newer account-bootstrap trigger definitions.

- [ ] **Step 5: Run database checks**

Run: `supabase db lint`

Expected: PASS.

Run: `supabase test db supabase/tests/club_access_requests.sql`

Expected: PASS, or the same documented local harness error from Step 2 if the harness is unavailable.

- [ ] **Step 5a: [ADDED] Verify rollback/recovery shape**

Before committing, confirm the migration is transaction-wrapped and no shared-system write has been run:

```bash
rg -n "^begin;|^commit;|zz_materialize_club_access_request|drop trigger if exists zz_grant_early_access_secretary|permission_audit_log" supabase/migrations/20260524120000_club_access_requests.sql
```

Expected: the migration starts with `begin;`, ends with `commit;`, adds the separate `zz_materialize_club_access_request` trigger, removes the legacy global-secretary trigger, and writes permission audit entries for approvals, denials, grants, and revokes. Do not run `supabase db push` without explicit user confirmation because it mutates the shared Supabase project.

- [x] **Step 6: Commit**

```bash
git add supabase/migrations/20260524120000_club_access_requests.sql supabase/tests/club_access_requests.sql
git commit -m "feat(auth): add club access approval database model"
```

## Task 2: Signup Request Copy And Metadata

**Files:**
- Modify: `apps/myk9show/src/hooks/useAuth.ts`
- Modify: `apps/myk9show/src/pages/SignUpPage.tsx`
- Modify: `apps/myk9show/src/components/landing/v2/HeroPhotoLed.tsx`
- Modify: `apps/myk9show/src/components/landing/v2/ClubFeatures.tsx`
- Test: `apps/myk9show/src/test/auth/useAuth.test.ts`
- Test: `apps/myk9show/src/test/pages/SignUpPage.test.tsx`
- Test: `apps/myk9show/src/components/landing/v2/__tests__/ClubOnboardingCta.test.tsx`

- [ ] **Step 1: Write failing hook metadata test**

Add this test to `apps/myk9show/src/test/auth/useAuth.test.ts`:

```typescript
it('passes club access request metadata during signup', async () => {
  const { result } = renderHook(() => useAuth());

  await act(async () => {
    await result.current.signUp('club@example.com', 'password123', {
      firstName: 'Jane',
      lastName: 'Doe',
      roles: ['exhibitor', 'club_officer'],
      requestedClubName: 'River City Scent Work Club',
      requestedClubWebsite: 'https://rivercity.example',
      clubRequestNote: 'I am the trial chair for our upcoming shows.',
    });
  });

  expect(mockSupabase.auth.signUp).toHaveBeenCalledWith({
    email: 'club@example.com',
    password: 'password123',
    options: {
      data: {
        first_name: 'Jane',
        last_name: 'Doe',
        intended_roles: ['exhibitor', 'club_officer'],
        requested_club_name: 'River City Scent Work Club',
        requested_club_website: 'https://rivercity.example',
        club_request_note: 'I am the trial chair for our upcoming shows.',
      },
    },
  });
});
```

- [ ] **Step 2: Run the hook test red**

Run: `cd apps/myk9show && npx vitest run src/test/auth/useAuth.test.ts -t "passes club access request metadata"`

Expected: FAIL because the metadata type and payload do not include club request fields.

- [ ] **Step 3: Extend `signUp()` metadata**

In `apps/myk9show/src/hooks/useAuth.ts`, change the metadata type:

```typescript
metadata?: {
  firstName?: string;
  lastName?: string;
  roles?: string[];
  requestedClubName?: string;
  requestedClubWebsite?: string;
  clubRequestNote?: string;
}
```

Then build the `options.data` object with conditional club request fields:

```typescript
const requestedClubName = metadata?.requestedClubName?.trim();
const requestedClubWebsite = metadata?.requestedClubWebsite?.trim();
const clubRequestNote = metadata?.clubRequestNote?.trim();

const signupData: Record<string, string | string[]> = {
  first_name: metadata?.firstName || 'First',
  last_name: metadata?.lastName || 'Name',
  ...(metadata?.roles?.length ? { intended_roles: metadata.roles } : {}),
  ...(requestedClubName ? { requested_club_name: requestedClubName } : {}),
  ...(requestedClubWebsite ? { requested_club_website: requestedClubWebsite } : {}),
  ...(clubRequestNote ? { club_request_note: clubRequestNote } : {}),
};
```

Use `signupData` in `supabase.auth.signUp()`.

- [ ] **Step 4: Write failing signup page tests**

Add tests to `apps/myk9show/src/test/pages/SignUpPage.test.tsx`:

```typescript
it('frames elevated signup roles as access requests', () => {
  render(<SignUpPage />);

  expect(screen.getByText('I am interested in...')).toBeInTheDocument();
  expect(screen.getByLabelText('I show dogs')).toBeChecked();
  expect(screen.getByLabelText('I help run a club or host shows')).toBeInTheDocument();
  expect(screen.getByLabelText('I work as a show secretary')).toBeInTheDocument();
  expect(
    screen.getByText(
      'Club access requires approval. Secretaries are added by an approved club admin after their club is approved.'
    )
  ).toBeInTheDocument();
});

it('requires a club name when requesting club admin access', async () => {
  const user = userEvent.setup();
  render(<SignUpPage />);

  await user.click(screen.getByLabelText('I help run a club or host shows'));
  await user.type(screen.getByLabelText('First name'), 'Jane');
  await user.type(screen.getByLabelText('Last name'), 'Doe');
  await user.type(screen.getByLabelText('Email address'), 'jane@example.com');
  await user.type(screen.getByLabelText('Password'), 'password123');
  await user.type(screen.getByLabelText('Confirm password'), 'password123');
  await user.click(screen.getByLabelText(/I agree to the/i));
  await user.click(screen.getByRole('button', { name: /sign up/i }));

  expect(await screen.findByText('Enter the club name you want to manage.')).toBeInTheDocument();
  expect(mockSignUp).not.toHaveBeenCalled();
});

it('submits club access request metadata', async () => {
  const user = userEvent.setup();
  render(<SignUpPage />);

  await user.click(screen.getByLabelText('I help run a club or host shows'));
  await user.type(screen.getByLabelText('First name'), 'Jane');
  await user.type(screen.getByLabelText('Last name'), 'Doe');
  await user.type(screen.getByLabelText('Email address'), 'jane@example.com');
  await user.type(screen.getByLabelText('Password'), 'password123');
  await user.type(screen.getByLabelText('Confirm password'), 'password123');
  await user.type(screen.getByLabelText('Club name'), 'River City Scent Work Club');
  await user.type(screen.getByLabelText('Club website'), 'https://rivercity.example');
  await user.type(screen.getByLabelText('Note for myK9'), 'I am the trial chair.');
  await user.click(screen.getByLabelText(/I agree to the/i));
  await user.click(screen.getByRole('button', { name: /sign up/i }));

  expect(mockSignUp).toHaveBeenCalledWith('jane@example.com', 'password123', {
    firstName: 'Jane',
    lastName: 'Doe',
    roles: ['exhibitor', 'club_officer'],
    requestedClubName: 'River City Scent Work Club',
    requestedClubWebsite: 'https://rivercity.example',
    clubRequestNote: 'I am the trial chair.',
  });
});

it('preselects club request mode from the request query parameter', () => {
  render(<SignUpPage />, { route: '/sign-up?request=club' });

  expect(screen.getByLabelText('I help run a club or host shows')).toBeChecked();
  expect(screen.getByLabelText('Club name')).toBeInTheDocument();
});
```

- [ ] **Step 5: Run signup page tests red**

Run: `cd apps/myk9show && npx vitest run src/test/pages/SignUpPage.test.tsx`

Expected: FAIL because the page still uses identity copy, has no club request fields, and does not read `request=club`.

- [ ] **Step 6: Implement signup UI changes**

In `apps/myk9show/src/pages/SignUpPage.tsx`, import `useSearchParams`:

```typescript
import { Link, useSearchParams } from 'react-router-dom';
```

Initialize club request mode from the query string:

```typescript
const [searchParams] = useSearchParams();
const startsAsClubRequest = searchParams.get('request') === 'club';
```

Set the initial role state so `/sign-up?request=club` preselects the club request:

```typescript
const [selectedRoles, setSelectedRoles] = useState<string[]>(
  startsAsClubRequest ? ['exhibitor', 'club_officer'] : ['exhibitor']
);
```

Add state:

```typescript
const [requestedClubName, setRequestedClubName] = useState('');
const [requestedClubWebsite, setRequestedClubWebsite] = useState('');
const [clubRequestNote, setClubRequestNote] = useState('');
```

Before `setLoading(true)`, add:

```typescript
const requestsClubAccess = selectedRoles.includes('club_officer');

if (requestsClubAccess && requestedClubName.trim().length < 2) {
  setError('Enter the club name you want to manage.');
  return;
}
```

Update the `signUp()` call:

```typescript
await signUp(email, password, {
  firstName: firstName.trim(),
  lastName: lastName.trim(),
  roles: selectedRoles,
  requestedClubName: requestsClubAccess ? requestedClubName.trim() : undefined,
  requestedClubWebsite: requestsClubAccess ? requestedClubWebsite.trim() : undefined,
  clubRequestNote: requestsClubAccess ? clubRequestNote.trim() : undefined,
});
```

Replace the role section with request language:

```tsx
<div className="mb-4">
  <p className="mb-2 font-medium text-sm">I am interested in...</p>
  <p className="text-sm text-muted-foreground mb-3">
    Club access requires approval. Secretaries are added by an approved club admin after their club is approved.
  </p>
  <div className="space-y-1.5">
    {[
      { value: 'exhibitor', label: 'I show dogs' },
      { value: 'club_officer', label: 'I help run a club or host shows' },
      { value: 'secretary', label: 'I work as a show secretary' },
    ].map(({ value, label }) => (
      <label key={value} className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={selectedRoles.includes(value)}
          onChange={e =>
            setSelectedRoles(prev =>
              e.target.checked ? [...prev, value] : prev.filter(r => r !== value)
            )
          }
          className="h-4 w-4 rounded border-input accent-primary"
        />
        <span className="text-sm">{label}</span>
      </label>
    ))}
  </div>
  {selectedRoles.includes('club_officer') && (
    <div className="mt-4 space-y-3 rounded-md border border-input p-3">
      <div>
        <label className="block mb-1 font-medium text-sm" htmlFor="requestedClubName">
          Club name
        </label>
        <input
          id="requestedClubName"
          value={requestedClubName}
          onChange={e => setRequestedClubName(e.target.value)}
          className="w-full p-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring bg-background text-foreground"
          autoComplete="organization"
        />
      </div>
      <div>
        <label className="block mb-1 font-medium text-sm" htmlFor="requestedClubWebsite">
          Club website
        </label>
        <input
          id="requestedClubWebsite"
          value={requestedClubWebsite}
          onChange={e => setRequestedClubWebsite(e.target.value)}
          className="w-full p-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring bg-background text-foreground"
          inputMode="url"
        />
      </div>
      <div>
        <label className="block mb-1 font-medium text-sm" htmlFor="clubRequestNote">
          Note for myK9
        </label>
        <textarea
          id="clubRequestNote"
          value={clubRequestNote}
          onChange={e => setClubRequestNote(e.target.value)}
          className="w-full min-h-20 p-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring bg-background text-foreground"
        />
      </div>
    </div>
  )}
</div>
```

- [ ] **Step 7: Add landing-page club request entry points**

Create `apps/myk9show/src/components/landing/v2/__tests__/ClubOnboardingCta.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { HeroPhotoLed } from '../HeroPhotoLed';
import { ClubFeatures } from '../ClubFeatures';

describe('club onboarding CTAs', () => {
  it('links the hero club CTA to signup in club request mode', () => {
    render(
      <MemoryRouter>
        <HeroPhotoLed />
      </MemoryRouter>
    );

    expect(screen.getByRole('link', { name: /start a club on myk9show/i })).toHaveAttribute(
      'href',
      '/sign-up?request=club'
    );
  });

  it('links the club section CTA to signup in club request mode', () => {
    render(
      <MemoryRouter>
        <ClubFeatures />
      </MemoryRouter>
    );

    expect(screen.getByRole('link', { name: /request club access/i })).toHaveAttribute(
      'href',
      '/sign-up?request=club'
    );
  });
});
```

Update `apps/myk9show/src/components/landing/v2/HeroPhotoLed.tsx`:

```tsx
import { Link } from 'react-router-dom';
```

Place this link near the existing hero waitlist surface without replacing the waitlist form:

```tsx
<Link className="l-secondary-link" to="/sign-up?request=club">
  Start a club on myK9Show
</Link>
```

Update `apps/myk9show/src/components/landing/v2/ClubFeatures.tsx`:

```tsx
import { Link } from 'react-router-dom';
```

Add a concise CTA after the feature grid:

```tsx
<div className="l-section-cta">
  <Link className="l-secondary-link" to="/sign-up?request=club">
    Request club access
  </Link>
</div>
```

The request lifecycle remains: the form creates an exhibitor account and writes pending club details to `club_access_requests`; it does not create a `clubs` row until admin approval.

- [ ] **Step 8: Run focused tests green**

Run: `cd apps/myk9show && npx vitest run src/test/auth/useAuth.test.ts src/test/pages/SignUpPage.test.tsx src/components/landing/v2/__tests__/ClubOnboardingCta.test.tsx`

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/myk9show/src/hooks/useAuth.ts apps/myk9show/src/pages/SignUpPage.tsx apps/myk9show/src/components/landing/v2/HeroPhotoLed.tsx apps/myk9show/src/components/landing/v2/ClubFeatures.tsx apps/myk9show/src/test/auth/useAuth.test.ts apps/myk9show/src/test/pages/SignUpPage.test.tsx apps/myk9show/src/components/landing/v2/__tests__/ClubOnboardingCta.test.tsx
git commit -m "feat(auth): collect club access requests at signup"
```

## Task 3: Site Admin Access Request Queue

**Files:**
- Create: `apps/myk9show/src/features/access-requests/accessRequestTypes.ts`
- Create: `apps/myk9show/src/features/access-requests/accessRequestService.ts`
- Create: `apps/myk9show/src/features/access-requests/useAccessRequests.ts`
- Create: `apps/myk9show/src/features/access-requests/AccessRequestStatusCard.tsx`
- Create: `apps/myk9show/src/features/access-requests/AccessRequestStatusCard.test.tsx`
- Create: `apps/myk9show/src/features/access-requests/accessRequestService.test.ts`
- Create: `apps/myk9show/src/pages/admin/AccessRequestsPage.tsx`
- Modify: `apps/myk9show/src/pages/AccountPage.sections.tsx`
- Modify: `apps/myk9show/src/routes/adminRoutes.tsx`
- Modify: `apps/myk9show/src/pages/admin/AdminDashboard/PlatformAdministrationSection.tsx`

- [ ] **Step 1: Write service tests first**

Create `apps/myk9show/src/features/access-requests/accessRequestService.test.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { accessRequestService } from './accessRequestService';
import { supabase } from '@/lib/supabase';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

describe('accessRequestService', () => {
  beforeEach(() => {
    vi.mocked(supabase.from).mockReset();
    vi.mocked(supabase.rpc).mockReset();
  });

  it('loads pending club access requests newest first', async () => {
    const order = vi.fn().mockResolvedValue({ data: [], error: null });
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    vi.mocked(supabase.from).mockReturnValue({ select } as never);

    await accessRequestService.listPending();

    expect(supabase.from).toHaveBeenCalledWith('club_access_requests');
    expect(select).toHaveBeenCalledWith(
      'id, requester_person_id, requester_auth_user_id, requested_club_name, requested_club_website, request_note, status, approved_club_id, reviewed_by, reviewed_at, review_note, created_at, updated_at, requester:people!club_access_requests_requester_person_id_fkey(id, first_name, last_name, email)'
    );
    expect(eq).toHaveBeenCalledWith('status', 'pending');
    expect(order).toHaveBeenCalledWith('created_at', { ascending: false });
  });

  it('loads the signed-in requesters own access requests through RLS', async () => {
    const order = vi.fn().mockResolvedValue({ data: [], error: null });
    const select = vi.fn(() => ({ order }));
    vi.mocked(supabase.from).mockReturnValue({ select } as never);

    await accessRequestService.listMine();

    expect(supabase.from).toHaveBeenCalledWith('club_access_requests');
    expect(select).toHaveBeenCalledWith(
      'id, requester_person_id, requester_auth_user_id, requested_club_name, requested_club_website, request_note, status, approved_club_id, reviewed_by, reviewed_at, review_note, created_at, updated_at, requester:people!club_access_requests_requester_person_id_fkey(id, first_name, last_name, email)'
    );
    expect(order).toHaveBeenCalledWith('created_at', { ascending: false });
  });

  it('approves a request through the review RPC', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: 'club-1', error: null } as never);

    const clubId = await accessRequestService.approve({
      requestId: 'request-1',
      clubName: 'River City Scent Work Club',
      reviewNote: 'Verified by email.',
    });

    expect(clubId).toBe('club-1');
    expect(supabase.rpc).toHaveBeenCalledWith('review_club_access_request', {
      p_request_id: 'request-1',
      p_decision: 'approved',
      p_existing_club_id: null,
      p_club_name: 'River City Scent Work Club',
      p_review_note: 'Verified by email.',
    });
  });

  it('denies a request through the review RPC', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as never);

    await accessRequestService.deny({
      requestId: 'request-1',
      reviewNote: 'Could not verify club authority.',
    });

    expect(supabase.rpc).toHaveBeenCalledWith('review_club_access_request', {
      p_request_id: 'request-1',
      p_decision: 'denied',
      p_existing_club_id: null,
      p_club_name: null,
      p_review_note: 'Could not verify club authority.',
    });
  });

  it('approves a request against an existing club without creating a duplicate club intent', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: 'club-existing', error: null } as never);

    await accessRequestService.approve({
      requestId: 'request-1',
      existingClubId: 'club-existing',
      reviewNote: 'Existing club verified.',
    });

    expect(supabase.rpc).toHaveBeenCalledWith('review_club_access_request', {
      p_request_id: 'request-1',
      p_decision: 'approved',
      p_existing_club_id: 'club-existing',
      p_club_name: null,
      p_review_note: 'Existing club verified.',
    });
  });
});
```

- [ ] **Step 2: Run service tests red**

Run: `cd apps/myk9show && npx vitest run src/features/access-requests/accessRequestService.test.ts src/features/access-requests/AccessRequestStatusCard.test.tsx`

Expected: FAIL because the service does not exist.

- [ ] **Step 3: Add service types**

Create `apps/myk9show/src/features/access-requests/accessRequestTypes.ts`:

```typescript
export interface ClubAccessRequest {
  id: string;
  requester_person_id: string;
  requester_auth_user_id: string;
  requested_club_name: string;
  requested_club_website: string | null;
  request_note: string | null;
  status: 'pending' | 'approved' | 'denied';
  approved_club_id: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  updated_at: string;
  requester?: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  } | null;
}

export interface ApproveClubAccessRequestInput {
  requestId: string;
  existingClubId?: string | null;
  clubName?: string | null;
  reviewNote?: string | null;
}

export interface DenyClubAccessRequestInput {
  requestId: string;
  reviewNote?: string | null;
}
```

- [ ] **Step 4: Add service**

Create `apps/myk9show/src/features/access-requests/accessRequestService.ts`:

```typescript
import { supabase } from '@/lib/supabase';
import type {
  ApproveClubAccessRequestInput,
  ClubAccessRequest,
  DenyClubAccessRequestInput,
} from './accessRequestTypes';

const REQUEST_SELECT =
  'id, requester_person_id, requester_auth_user_id, requested_club_name, requested_club_website, request_note, status, approved_club_id, reviewed_by, reviewed_at, review_note, created_at, updated_at, requester:people!club_access_requests_requester_person_id_fkey(id, first_name, last_name, email)';

function throwIfError(error: unknown): asserts error is null {
  if (error) {
    const message = error instanceof Error ? error.message : 'Access request operation failed';
    throw new Error(message);
  }
}

export const accessRequestService = {
  async listPending(): Promise<ClubAccessRequest[]> {
    const { data, error } = await supabase
      .from('club_access_requests')
      .select(REQUEST_SELECT)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    throwIfError(error);
    return (data ?? []) as ClubAccessRequest[];
  },

  async listMine(): Promise<ClubAccessRequest[]> {
    const { data, error } = await supabase
      .from('club_access_requests')
      .select(REQUEST_SELECT)
      .order('created_at', { ascending: false });

    throwIfError(error);
    return (data ?? []) as ClubAccessRequest[];
  },

  async approve(input: ApproveClubAccessRequestInput): Promise<string | null> {
    const { data, error } = await supabase.rpc('review_club_access_request', {
      p_request_id: input.requestId,
      p_decision: 'approved',
      p_existing_club_id: input.existingClubId ?? null,
      p_club_name: input.clubName ?? null,
      p_review_note: input.reviewNote ?? null,
    });

    throwIfError(error);
    return data as string | null;
  },

  async deny(input: DenyClubAccessRequestInput): Promise<void> {
    const { error } = await supabase.rpc('review_club_access_request', {
      p_request_id: input.requestId,
      p_decision: 'denied',
      p_existing_club_id: null,
      p_club_name: null,
      p_review_note: input.reviewNote ?? null,
    });

    throwIfError(error);
  },
};
```

- [ ] **Step 5: Add React Query hooks**

Create `apps/myk9show/src/features/access-requests/useAccessRequests.ts`:

```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { accessRequestService } from './accessRequestService';
import type { ApproveClubAccessRequestInput, DenyClubAccessRequestInput } from './accessRequestTypes';

export const accessRequestKeys = {
  all: ['access-requests'] as const,
  pending: () => [...accessRequestKeys.all, 'pending'] as const,
  mine: () => [...accessRequestKeys.all, 'mine'] as const,
};

export function usePendingAccessRequests() {
  return useQuery({
    queryKey: accessRequestKeys.pending(),
    queryFn: () => accessRequestService.listPending(),
  });
}

export function useMyAccessRequests() {
  return useQuery({
    queryKey: accessRequestKeys.mine(),
    queryFn: () => accessRequestService.listMine(),
  });
}

export function useApproveAccessRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ApproveClubAccessRequestInput) => accessRequestService.approve(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: accessRequestKeys.all }),
  });
}

export function useDenyAccessRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: DenyClubAccessRequestInput) => accessRequestService.deny(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: accessRequestKeys.all }),
  });
}
```

- [ ] **Step 6: Add requester-visible status**

Create `apps/myk9show/src/features/access-requests/AccessRequestStatusCard.tsx` using `useMyAccessRequests()`. Render nothing when the signed-in user has no requests. When requests exist, show the latest club request with one of these statuses:

- `pending`: "Club access request pending"
- `approved`: "Club access approved"
- `denied`: "Club access request denied"

Include the requested club name and the review note when present. This is the V1 notification surface: the admin queue is the source of truth, and requesters can re-check status after sign-in without email/push notifications.

Create `apps/myk9show/src/features/access-requests/AccessRequestStatusCard.test.tsx` with focused tests for pending, approved, denied, and no-request states.

In `apps/myk9show/src/pages/AccountPage.sections.tsx`, render `<AccessRequestStatusCard />` near the top of `ProfileSection`.

- [ ] **Step 7: Create admin queue page**

Create `apps/myk9show/src/pages/admin/AccessRequestsPage.tsx` with:

```tsx
import React, { useState } from 'react';
import { Check, ShieldCheck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { PageShell } from '@/components/common/PageShell';
import { PageHeader } from '@/components/common/PageHeader';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { notifications } from '@/lib/notifications';
import {
  useApproveAccessRequest,
  useDenyAccessRequest,
  usePendingAccessRequests,
} from '@/features/access-requests/useAccessRequests';
import type { ClubAccessRequest } from '@/features/access-requests/accessRequestTypes';

function requesterName(request: ClubAccessRequest) {
  const first = request.requester?.first_name ?? '';
  const last = request.requester?.last_name ?? '';
  return `${first} ${last}`.trim() || request.requester?.email || 'Unknown requester';
}

const AccessRequestsPage: React.FC = () => {
  const { data: requests = [], isLoading, error, refetch } = usePendingAccessRequests();
  const approve = useApproveAccessRequest();
  const deny = useDenyAccessRequest();
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [clubNames, setClubNames] = useState<Record<string, string>>({});

  async function handleApprove(request: ClubAccessRequest) {
    const clubName = (clubNames[request.id] ?? request.requested_club_name).trim();
    if (clubName.length < 2) {
      notifications.error('Enter a club name before approving.');
      return;
    }

    try {
      await approve.mutateAsync({
        requestId: request.id,
        clubName,
        reviewNote: reviewNotes[request.id] ?? null,
      });
      notifications.success('Club access approved');
    } catch (err) {
      notifications.error(err instanceof Error ? err.message : 'Could not approve request');
    }
  }

  async function handleDeny(request: ClubAccessRequest) {
    try {
      await deny.mutateAsync({
        requestId: request.id,
        reviewNote: reviewNotes[request.id] ?? null,
      });
      notifications.success('Club access denied');
    } catch (err) {
      notifications.error(err instanceof Error ? err.message : 'Could not deny request');
    }
  }

  return (
    <PageShell>
      <PageHeader
        breadcrumbs={[
          { label: 'Admin', href: '/admin' },
          { label: 'Access Requests', href: '/admin/access-requests' },
        ]}
        title="Access Requests"
      />

      {error && <ErrorState message="Failed to load access requests." onRetry={() => refetch()} />}

      {!error && isLoading && (
        <div className="rounded-md border border-border p-6 text-sm text-muted-foreground">
          Loading access requests...
        </div>
      )}

      {!error && !isLoading && requests.length === 0 && (
        <EmptyState
          icon={ShieldCheck}
          title="No pending access requests"
          description="New club admin requests will appear here for approval."
        />
      )}

      <div className="space-y-4">
        {requests.map(request => (
          <Card key={request.id}>
            <CardHeader>
              <CardTitle className="text-lg">{request.requested_club_name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-sm text-muted-foreground">
                Requested by {requesterName(request)}
                {request.requester?.email ? ` (${request.requester.email})` : ''}
              </div>
              {request.requested_club_website && (
                <a
                  href={request.requested_club_website}
                  className="text-sm text-primary underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  {request.requested_club_website}
                </a>
              )}
              {request.request_note && <p className="text-sm">{request.request_note}</p>}
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="text-sm font-medium" htmlFor={`club-${request.id}`}>
                    Club name to create
                  </label>
                  <Input
                    id={`club-${request.id}`}
                    value={clubNames[request.id] ?? request.requested_club_name}
                    onChange={event =>
                      setClubNames(prev => ({ ...prev, [request.id]: event.target.value }))
                    }
                  />
                </div>
                <div>
                  <label className="text-sm font-medium" htmlFor={`note-${request.id}`}>
                    Review note
                  </label>
                  <Textarea
                    id={`note-${request.id}`}
                    value={reviewNotes[request.id] ?? ''}
                    onChange={event =>
                      setReviewNotes(prev => ({ ...prev, [request.id]: event.target.value }))
                    }
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => handleApprove(request)} disabled={approve.isPending}>
                  <Check className="h-4 w-4 mr-2" />
                  Approve
                </Button>
                <Button variant="outline" onClick={() => handleDeny(request)} disabled={deny.isPending}>
                  <X className="h-4 w-4 mr-2" />
                  Deny
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </PageShell>
  );
};

export default AccessRequestsPage;
```

- [ ] **Step 8: [ADDED] Preserve existing-club approval path**

If a request is for a club that already exists, site admins must be able to approve against the existing club instead of creating a duplicate. Add an optional existing-club id input to the admin card before the review note:

Approving against an existing club intentionally creates another active `club_admin` assignment for that club. Multiple club admins are allowed in V1, but only after site-admin review.

```tsx
const [existingClubIds, setExistingClubIds] = useState<Record<string, string>>({});
```

Pass it through approval:

```typescript
await approve.mutateAsync({
  requestId: request.id,
  existingClubId: existingClubIds[request.id]?.trim() || null,
  clubName,
  reviewNote: reviewNotes[request.id] ?? null,
});
```

Render the field with explicit helper copy:

```tsx
<div>
  <label className="text-sm font-medium" htmlFor={`existing-club-${request.id}`}>
    Existing club ID
  </label>
  <Input
    id={`existing-club-${request.id}`}
    value={existingClubIds[request.id] ?? ''}
    onChange={event =>
      setExistingClubIds(prev => ({ ...prev, [request.id]: event.target.value }))
    }
    placeholder="Leave blank to create a new club"
  />
  <p className="mt-1 text-xs text-muted-foreground">
    Use this only when the club already exists and this requester should become its club admin.
  </p>
</div>
```

- [ ] **Step 9: Wire route and dashboard link**

In `apps/myk9show/src/routes/adminRoutes.tsx`, add a lazy import and route:

```typescript
const AccessRequestsPage = createEnhancedLazy(
  () => import('@/pages/admin/AccessRequestsPage'),
  { ...RouteLazyPresets.mediumPriority, displayName: 'AccessRequestsPage' }
);
```

Add route:

```tsx
<Route
  path="/admin/access-requests"
  element={adminGuard(
    <SuspenseWrapper>
      <PageTransition>
        <AccessRequestsPage />
      </PageTransition>
    </SuspenseWrapper>
  )}
/>
```

In `PlatformAdministrationSection.tsx`, add a card/link labeled `Access Requests` pointing to `/admin/access-requests`.

- [ ] **Step 10: Run focused tests**

Run: `cd apps/myk9show && npx vitest run src/features/access-requests/accessRequestService.test.ts src/features/access-requests/AccessRequestStatusCard.test.tsx`

Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add apps/myk9show/src/features/access-requests apps/myk9show/src/pages/AccountPage.sections.tsx apps/myk9show/src/pages/admin/AccessRequestsPage.tsx apps/myk9show/src/routes/adminRoutes.tsx apps/myk9show/src/pages/admin/AdminDashboard/PlatformAdministrationSection.tsx
git commit -m "feat(admin): add club access request queue"
```

## Task 4: Club-Scoped Secretary Management

**Files:**
- Create: `apps/myk9show/src/features/club-secretaries/clubSecretaryService.ts`
- Create: `apps/myk9show/src/features/club-secretaries/clubSecretaryService.test.ts`
- Modify: `apps/myk9show/src/components/clubs/ClubDetails/MembersTab.tsx`
- Create: `apps/myk9show/src/components/clubs/ClubDetails/__tests__/MembersTab.secretaries.test.tsx`

- [ ] **Step 1: Write service tests first**

Create `apps/myk9show/src/features/club-secretaries/clubSecretaryService.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '@/lib/supabase';
import { clubSecretaryService } from './clubSecretaryService';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

describe('clubSecretaryService', () => {
  beforeEach(() => {
    vi.mocked(supabase.from).mockReset();
    vi.mocked(supabase.rpc).mockReset();
  });

  it('grants secretary access for one club through the RPC', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: 'assignment-1', error: null } as never);

    await clubSecretaryService.grantSecretary({ personId: 'person-1', clubId: 'club-1' });

    expect(supabase.rpc).toHaveBeenCalledWith('grant_club_secretary', {
      p_person_id: 'person-1',
      p_club_id: 'club-1',
    });
  });

  it('lists active secretaries for one club', async () => {
    const inFn = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'assignment-1',
          user_id: 'person-1',
          club_id: 'club-1',
          people: { id: 'person-1', first_name: 'Jane', last_name: 'Doe', email: 'jane@example.com' },
        },
      ],
      error: null,
    });
    const eqActive = vi.fn(() => ({ in: inFn }));
    const eqClub = vi.fn(() => ({ eq: eqActive }));
    const select = vi.fn(() => ({ eq: eqClub }));
    vi.mocked(supabase.from).mockReturnValue({ select } as never);

    const result = await clubSecretaryService.listSecretaries('club-1', ['secretary-role-id']);

    expect(supabase.from).toHaveBeenCalledWith('user_roles');
    expect(eqClub).toHaveBeenCalledWith('club_id', 'club-1');
    expect(eqActive).toHaveBeenCalledWith('is_active', true);
    expect(inFn).toHaveBeenCalledWith('role_id', ['secretary-role-id']);
    expect(result).toHaveLength(1);
  });

  it('revokes secretary access for one club through the RPC', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as never);

    await clubSecretaryService.revokeSecretary({ personId: 'person-1', clubId: 'club-1' });

    expect(supabase.rpc).toHaveBeenCalledWith('revoke_club_secretary', {
      p_person_id: 'person-1',
      p_club_id: 'club-1',
    });
  });
});
```

- [ ] **Step 2: Run service tests red**

Run: `cd apps/myk9show && npx vitest run src/features/club-secretaries/clubSecretaryService.test.ts`

Expected: FAIL because the service does not exist.

- [ ] **Step 3: Add service**

Create `apps/myk9show/src/features/club-secretaries/clubSecretaryService.ts`:

```typescript
import { supabase } from '@/lib/supabase';

interface SecretaryMutationInput {
  personId: string;
  clubId: string;
}

export interface ClubSecretaryAssignment {
  id: string;
  user_id: string;
  club_id: string;
  people: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  } | null;
}

function throwIfError(error: unknown): asserts error is null {
  if (error) {
    const message = error instanceof Error ? error.message : 'Secretary access operation failed';
    throw new Error(message);
  }
}

export const clubSecretaryService = {
  async listSecretaries(
    clubId: string,
    secretaryRoleIds: string[]
  ): Promise<ClubSecretaryAssignment[]> {
    const { data, error } = await supabase
      .from('user_roles')
      .select(
        'id, user_id, club_id, people!user_roles_user_id_fkey(id, first_name, last_name, email)'
      )
      .eq('club_id', clubId)
      .eq('is_active', true)
      .in('role_id', secretaryRoleIds);

    throwIfError(error);
    return (data ?? []) as ClubSecretaryAssignment[];
  },

  async grantSecretary(input: SecretaryMutationInput): Promise<string | null> {
    const { data, error } = await supabase.rpc('grant_club_secretary', {
      p_person_id: input.personId,
      p_club_id: input.clubId,
    });

    throwIfError(error);
    return data as string | null;
  },

  async revokeSecretary(input: SecretaryMutationInput): Promise<void> {
    const { error } = await supabase.rpc('revoke_club_secretary', {
      p_person_id: input.personId,
      p_club_id: input.clubId,
    });

    throwIfError(error);
  },
};
```

- [ ] **Step 4: [EXPANDED] Add a concrete club members UI slice**

In `apps/myk9show/src/components/clubs/ClubDetails/MembersTab.tsx`, keep the current member list and add a small management section below it for `canManageMembers`. This section must show current club-scoped secretaries, include a clear add action, and include revoke buttons.

Use this copy:

```tsx
<h3 className="text-lg font-semibold">Show Secretaries</h3>
<p className="text-sm text-muted-foreground">
  Secretaries added here can manage shows for this club only.
</p>
```

Grant and revoke actions must call `clubSecretaryService.grantSecretary()` and `clubSecretaryService.revokeSecretary()` with `club.id`.

Use the existing person-selection pattern from `apps/myk9show/src/components/clubs/members/AddMemberDialog.tsx`: `useUserStore(state => state.people)`, `FormField`, and the shadcn `Select` components. Do not ship a raw UUID text input. Filter out people who are already active club secretaries.

Add local state for a selected person id:

```typescript
const [secretaryPersonId, setSecretaryPersonId] = React.useState('');
```

Render a complete first slice with a selectable person picker:

```tsx
{canManageMembers && (
  <div className="rounded-md border border-border p-4 space-y-3">
    <div>
      <h3 className="text-lg font-semibold">Show Secretaries</h3>
      <p className="text-sm text-muted-foreground">
        Secretaries added here can manage shows for this club only.
      </p>
    </div>
    <FormField label="Select Secretary" fieldId="secretary-person-select">
      <Select value={secretaryPersonId} onValueChange={setSecretaryPersonId}>
        <SelectTrigger id="secretary-person-select">
          <SelectValue placeholder="Choose a person" />
        </SelectTrigger>
        <SelectContent>
          {availableSecretaryPeople.map(person => (
            <SelectItem key={person.id} value={person.id.toString()}>
              <div className="flex flex-col">
                <span className="font-medium">
                  {person.firstName} {person.lastName}
                </span>
                {person.email && (
                  <span className="text-xs text-muted-foreground">{person.email}</span>
                )}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FormField>
    <div className="flex justify-end">
      <Button
        type="button"
        disabled={secretaryPersonId === ''}
        onClick={() =>
          clubSecretaryService.grantSecretary({
            personId: secretaryPersonId,
            clubId: club.id,
          })
        }
      >
        Add Secretary
      </Button>
    </div>
  </div>
)}
```

Add success/error notifications consistent with `AddMemberDialog`, reset `secretaryPersonId` after a successful grant, and refresh the current secretary list after grant or revoke.

- [ ] **Step 5: Add a focused MembersTab UI regression**

Create `apps/myk9show/src/components/clubs/ClubDetails/__tests__/MembersTab.secretaries.test.tsx` using the custom render from `src/test/utils/testUtils.tsx`. Mock `clubSecretaryService` and `useUserStore`.

Test:

```typescript
it('lets club admins choose a secretary by person name instead of entering an id', async () => {
  // Arrange people with names/emails in the mocked user store.
  // Assert the select trigger is labeled "Select Secretary".
  // Open the select, choose "Jane Doe", click "Add Secretary".
  // Expect grantSecretary({ personId: 'person-jane', clubId: 'club-1' }).
});
```

- [ ] **Step 6: Run focused tests**

Run:

```bash
cd apps/myk9show && npx vitest run \
  src/features/club-secretaries/clubSecretaryService.test.ts \
  src/components/clubs/ClubDetails/__tests__/MembersTab.secretaries.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/myk9show/src/features/club-secretaries apps/myk9show/src/components/clubs/ClubDetails/MembersTab.tsx apps/myk9show/src/components/clubs/ClubDetails/__tests__/MembersTab.secretaries.test.tsx
git commit -m "feat(clubs): manage club-scoped secretaries"
```

## Task 5: Show Secretary Selection Scope Audit

**Files:**
- Modify: `apps/myk9show/src/components/shows/wizard/steps/ShowDetailsStep.helpers.ts`
- Modify: `apps/myk9show/src/components/shows/wizard/steps/ShowDetailsStep.tsx`
- Test: `apps/myk9show/src/test/components/wizard/ShowDetailsStep.helpers.test.tsx`
- Test: `apps/myk9show/src/test/components/wizard/OfficialPicker.test.tsx`

- [ ] **Step 1: Add the failing helper test**

Add this test to `apps/myk9show/src/test/components/wizard/ShowDetailsStep.helpers.test.tsx`:

```typescript
describe('groupPeopleForOfficial club scoping', () => {
  const clubASecretary = makeUser({
    id: 'person-a',
    firstName: 'Jane',
    lastName: 'A',
    roles: [UserRole.SECRETARY],
    roleAssignments: [
      { roleName: UserRole.SECRETARY, clubId: 'club-a', isActive: true },
    ],
  } as Partial<User> & { id: string });

  const clubBSecretary = makeUser({
    id: 'person-b',
    firstName: 'Jane',
    lastName: 'B',
    roles: [UserRole.SECRETARY],
    roleAssignments: [
      { roleName: UserRole.SECRETARY, clubId: 'club-b', isActive: true },
    ],
  } as Partial<User> & { id: string });

  it('suggests only secretaries scoped to the selected club', () => {
    const result = groupPeopleForOfficial(
      [clubASecretary, clubBSecretary],
      [UserRole.SECRETARY],
      '',
      { clubId: 'club-a', requireScopedRole: true }
    );

    expect(result.suggested).toEqual([clubASecretary]);
    expect(result.others).not.toContain(clubBSecretary);
  });
});
```

If `User` does not yet expose `roleAssignments`, add a local test-only cast as shown above and implement a narrow exported `OfficialRoleAssignment` interface in the helper file.

- [ ] **Step 2: Run the helper test red**

Run: `cd apps/myk9show && npx vitest run src/test/components/wizard/ShowDetailsStep.helpers.test.tsx -t "suggests only secretaries scoped to the selected club"`

Expected: FAIL because `groupPeopleForOfficial()` currently accepts only three arguments and only checks broad `roles`.

- [ ] **Step 3: Implement scoped official grouping**

In `apps/myk9show/src/components/shows/wizard/steps/ShowDetailsStep.helpers.ts`, add:

```typescript
export interface OfficialRoleAssignment {
  roleName: UserRole;
  clubId: string | null;
  showId?: string | null;
  isActive: boolean;
}

interface OfficialGroupingOptions {
  clubId?: string | null;
  requireScopedRole?: boolean;
}

function hasSuggestedRole(
  person: User & { roleAssignments?: OfficialRoleAssignment[] },
  suggestedRoles: UserRole[],
  options: OfficialGroupingOptions
) {
  if (!options.requireScopedRole) {
    return person.roles?.some(role => suggestedRoles.includes(role as UserRole)) ?? false;
  }

  return (
    person.roleAssignments?.some(
      assignment =>
        assignment.isActive &&
        assignment.clubId === options.clubId &&
        suggestedRoles.includes(assignment.roleName)
    ) ?? false
  );
}
```

Change the helper signature and return logic:

```typescript
export function groupPeopleForOfficial(
  people: User[],
  suggestedRoles: UserRole[],
  searchTerm: string,
  options: OfficialGroupingOptions = {}
): { suggested: User[]; others: User[] } {
  const sorted = getAllPeopleSorted(people);
  const filtered = filterPeopleByName(sorted, searchTerm);
  const suggested = filtered.filter(person =>
    hasSuggestedRole(person as User & { roleAssignments?: OfficialRoleAssignment[] }, suggestedRoles, options)
  );
  const suggestedIds = new Set(suggested.map(person => person.id));

  return {
    suggested,
    others: options.requireScopedRole
      ? []
      : filtered.filter(person => !suggestedIds.has(person.id)),
  };
}
```

- [ ] **Step 4: Pass club scope from show details**

In `apps/myk9show/src/components/shows/wizard/steps/ShowDetailsStep.tsx`, pass the selected club id to the secretary picker:

```tsx
<OfficialPicker
  label="Show Secretary"
  required
  selectedPersonId={show.officials.secretary[0]}
  people={people}
  suggestedRoles={[UserRole.SECRETARY]}
  groupingOptions={{ clubId: show.clubId, requireScopedRole: true }}
  {...(show.officials.secretary[0] === userWithRoles?.databaseUserId
    ? { autoFillBadge: 'You' }
    : {})}
  onSelect={id =>
    updateShowData({ officials: { ...show.officials, secretary: [id] } })
  }
  onCreatePerson={handleCreateOfficialPerson}
/>
```

In `apps/myk9show/src/components/shows/wizard/steps/OfficialPicker.tsx`, add the optional prop:

```typescript
import type { OfficialRoleAssignment } from './ShowDetailsStep.helpers';

interface OfficialGroupingOptions {
  clubId?: string | null;
  requireScopedRole?: boolean;
}

export interface OfficialPickerProps {
  label: string;
  required?: boolean;
  selectedPersonId: string | undefined;
  people: User[];
  suggestedRoles: UserRole[];
  groupingOptions?: OfficialGroupingOptions;
  autoFillBadge?: string;
  onSelect: (personId: string) => void;
  onCreatePerson: (data: CreatePersonData) => Promise<string>;
}
```

Then call:

```typescript
const { suggested, others } = groupPeopleForOfficial(
  people,
  suggestedRoles,
  searchTerm,
  groupingOptions
);
```

- [ ] **Step 5: Add picker-level regression**

Add this test to `apps/myk9show/src/test/components/wizard/OfficialPicker.test.tsx`:

```typescript
it('hides secretaries outside the selected club when scoped grouping is required', async () => {
  const onSelect = vi.fn();
  const clubASecretary = {
    ...makeUser('club-a-secretary', 'Ada', [UserRole.SECRETARY]),
    roleAssignments: [{ roleName: UserRole.SECRETARY, clubId: 'club-a', isActive: true }],
  } as User;
  const clubBSecretary = {
    ...makeUser('club-b-secretary', 'Bea', [UserRole.SECRETARY]),
    roleAssignments: [{ roleName: UserRole.SECRETARY, clubId: 'club-b', isActive: true }],
  } as User;

  renderWithProviders(
    <OfficialPicker
      label="Show Secretary"
      selectedPersonId={undefined}
      people={[clubASecretary, clubBSecretary]}
      suggestedRoles={[UserRole.SECRETARY]}
      groupingOptions={{ clubId: 'club-a', requireScopedRole: true }}
      onSelect={onSelect}
      onCreatePerson={vi.fn()}
    />
  );

  fireEvent.click(screen.getByRole('button', { name: /select show secretary/i }));

  await waitFor(() => expect(screen.getByText('Ada Smith')).toBeInTheDocument());
  expect(screen.queryByText('Bea Smith')).not.toBeInTheDocument();
});
```

- [ ] **Step 6: Run the picker tests green**

Run: `cd apps/myk9show && npx vitest run src/test/components/wizard/ShowDetailsStep.helpers.test.tsx src/test/components/wizard/OfficialPicker.test.tsx`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/myk9show/src/components/shows/wizard/steps/ShowDetailsStep.helpers.ts apps/myk9show/src/components/shows/wizard/steps/ShowDetailsStep.tsx apps/myk9show/src/components/shows/wizard/steps/OfficialPicker.tsx apps/myk9show/src/test/components/wizard/ShowDetailsStep.helpers.test.tsx apps/myk9show/src/test/components/wizard/OfficialPicker.test.tsx
git commit -m "fix(auth): scope show secretary selection to club"
```

## Task 6: [ADDED] People/Dog Permission Guardrails

**Files:**
- Create: `apps/myk9show/src/features/role-scope/roleScopeAudit.test.ts`
- Create: `supabase/migrations/20260524121000_scope_secretary_people_dog_access.sql`
- Modify: `apps/myk9show/src/services/database/day-of-operations/types.ts`
- Modify: `apps/myk9show/src/services/database/day-of-operations/late-entry-dog.ts`
- Modify: `apps/myk9show/src/services/database/day-of-operations/__tests__/late-entry-dog.test.ts`

- [x] **Step 1: Write the policy audit test first**

Create `apps/myk9show/src/features/role-scope/roleScopeAudit.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = join(__dirname, '../../../../..');

function readMigration(name: string) {
  return readFileSync(join(repoRoot, 'supabase/migrations', name), 'utf8');
}

describe('role scope guardrails', () => {
  it('people and dog access policies do not grant broad secretary-anywhere writes', () => {
    const migration = readMigration('20260524121000_scope_secretary_people_dog_access.sql');

    expect(migration).not.toMatch(/is_trial_secretary\(\)/);
    expect(migration).not.toMatch(/is_show_secretary\(\)/);
    expect(migration).toContain('can_manage_show(e.show_id)');
    expect(migration).toContain('create_show_managed_person');
    expect(migration).toContain('create_show_managed_dog');
  });
});
```

- [x] **Step 2: Run the policy audit red**

Run: `cd apps/myk9show && npx vitest run src/features/role-scope/roleScopeAudit.test.ts`

Expected: FAIL because `20260524121000_scope_secretary_people_dog_access.sql` does not exist yet.

- [x] **Step 3: Add scoped people/dog-access migration**

Create `supabase/migrations/20260524121000_scope_secretary_people_dog_access.sql`:

```sql
begin;

drop policy if exists "people_select" on public.people;
create policy "people_select" on public.people
  for select to authenticated
  using (
    auth_user_id = (select auth.uid())
    or (select public.is_site_admin())
    or exists (
      select 1
      from public.entries e
      where e.handler_id = people.id
        and (select public.can_manage_show(e.show_id))
    )
    or exists (
      select 1
      from public.dogs d
      join public.entries e on e.dog_id = d.id
      where d.owner_id = people.id
        and (select public.can_manage_show(e.show_id))
    )
  );

drop policy if exists "people_insert" on public.people;
create policy "people_insert" on public.people
  for insert to authenticated
  with check (
    auth_user_id = (select auth.uid())
    or (select public.is_site_admin())
  );

drop policy if exists "people_update_privileged" on public.people;
create policy "people_update_privileged" on public.people
  for update to authenticated
  using (
    (select public.is_site_admin())
    or exists (
      select 1
      from public.entries e
      where e.handler_id = people.id
        and (select public.can_manage_show(e.show_id))
    )
  )
  with check (
    (select public.is_site_admin())
    or exists (
      select 1
      from public.entries e
      where e.handler_id = people.id
        and (select public.can_manage_show(e.show_id))
    )
  );

drop policy if exists "dogs_select" on public.dogs;
create policy "dogs_select" on public.dogs
  for select to authenticated
  using (
    deleted_at is null
    and (
      owner_id = (select public.get_my_person_id())
      or co_owner_id = (select public.get_my_person_id())
      or (select public.is_site_admin())
      or exists (
        select 1
        from public.entries e
        where e.dog_id = dogs.id
          and (select public.can_manage_show(e.show_id))
      )
    )
  );

drop policy if exists "dogs_update" on public.dogs;
create policy "dogs_update" on public.dogs
  for update to authenticated
  using (
    owner_id = (select public.get_my_person_id())
    or co_owner_id = (select public.get_my_person_id())
    or (select public.is_site_admin())
    or exists (
      select 1
      from public.entries e
      where e.dog_id = dogs.id
        and (select public.can_manage_show(e.show_id))
    )
  )
  with check (
    owner_id = (select public.get_my_person_id())
    or co_owner_id = (select public.get_my_person_id())
    or (select public.is_site_admin())
    or exists (
      select 1
      from public.entries e
      where e.dog_id = dogs.id
        and (select public.can_manage_show(e.show_id))
    )
  );

drop policy if exists "dogs_insert" on public.dogs;
create policy "dogs_insert" on public.dogs
  for insert to authenticated
  with check (
    owner_id = (select public.get_my_person_id())
    or co_owner_id = (select public.get_my_person_id())
    or (select public.is_site_admin())
  );

create or replace function public.create_show_managed_person(
  p_show_id uuid,
  p_first_name text,
  p_last_name text,
  p_email text default null,
  p_phone text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_person_id uuid;
begin
  if not public.can_manage_show(p_show_id) then
    raise exception 'Only managers for this show can create people on behalf of exhibitors'
      using errcode = '42501';
  end if;

  if nullif(trim(p_first_name), '') is null then
    raise exception 'First name is required' using errcode = '23514';
  end if;

  if nullif(trim(p_last_name), '') is null then
    raise exception 'Last name is required' using errcode = '23514';
  end if;

  insert into public.people (
    first_name,
    last_name,
    email,
    phone
  )
  values (
    trim(p_first_name),
    trim(p_last_name),
    nullif(trim(coalesce(p_email, '')), ''),
    nullif(trim(coalesce(p_phone, '')), '')
  )
  returning id into v_person_id;

  return v_person_id;
end;
$$;

create or replace function public.create_show_managed_dog(
  p_show_id uuid,
  p_owner_id uuid,
  p_name text,
  p_breed text,
  p_call_name text default null,
  p_sex text default null,
  p_akc_number text default null,
  p_ukc_number text default null,
  p_microchip_number text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dog_id uuid;
begin
  if not public.can_manage_show(p_show_id) then
    raise exception 'Only managers for this show can create dogs on behalf of exhibitors'
      using errcode = '42501';
  end if;

  if nullif(trim(p_name), '') is null then
    raise exception 'Dog name is required' using errcode = '23514';
  end if;

  if nullif(trim(p_breed), '') is null then
    raise exception 'Dog breed is required' using errcode = '23514';
  end if;

  if p_sex is not null and p_sex not in ('male', 'female') then
    raise exception 'Dog sex must be male or female' using errcode = '23514';
  end if;

  insert into public.dogs (
    owner_id,
    name,
    breed,
    call_name,
    sex,
    akc_number,
    ukc_number,
    microchip_number
  )
  values (
    p_owner_id,
    trim(p_name),
    trim(p_breed),
    nullif(trim(coalesce(p_call_name, '')), ''),
    p_sex,
    nullif(trim(coalesce(p_akc_number, '')), ''),
    nullif(trim(coalesce(p_ukc_number, '')), ''),
    nullif(trim(coalesce(p_microchip_number, '')), '')
  )
  returning id into v_dog_id;

  return v_dog_id;
end;
$$;

grant execute on function public.create_show_managed_dog(uuid, uuid, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.create_show_managed_person(uuid, text, text, text, text) to authenticated;

commit;
```

- [x] **Step 4: Convert the V1 show-entry people/dog creation call site**

V1 conversion scope is the day-of late-entry path, because that path creates both an exhibitor and a dog while a managed show context is available. Do not rely on a broad grep as the implementation checklist; use grep only as an audit after converting the explicit files below.

Update `apps/myk9show/src/services/database/day-of-operations/types.ts` so `CreateDayOfEntryDogInput` includes the show context:

```typescript
export interface CreateDayOfEntryDogInput {
  showId: string;
  ownerFirstName: string;
  ownerLastName: string;
  ownerEmail?: string;
  ownerPhone?: string;
  dogName: string;
  dogCallName?: string;
  dogBreed?: string;
}
```

In `apps/myk9show/src/services/database/day-of-operations/late-entry-dog.ts`, replace the missing-owner `createUser(...)` call with:

```typescript
const { data: createdOwnerId, error: ownerError } = await supabase.rpc(
  'create_show_managed_person',
  {
    p_show_id: input.showId,
    p_first_name: ownerFirstName,
    p_last_name: ownerLastName,
    p_email: ownerEmail,
    p_phone: cleanOptional(input.ownerPhone),
  }
);
```

Then fetch the created owner by id through the existing user/person read helper used elsewhere in this service layer, or through a narrowly scoped replicated/read path already available in day-of operations. Keep the rollback behavior if dog creation fails.

Replace the `createDog(...)` call with:

```typescript
const { data: dogId, error: dogError } = await supabase.rpc('create_show_managed_dog', {
  p_show_id: input.showId,
  p_owner_id: owner.id,
  p_name: dogName,
  p_breed: dogBreed,
  p_call_name: dogCallName,
  p_sex: null,
  p_akc_number: null,
  p_ukc_number: null,
  p_microchip_number: null,
});
```

Then fetch the created dog by id through the existing dog read helper used elsewhere in this service layer, or return the known values plus the returned id if that matches the current `DayOfEntryDogResult` contract.

In `apps/myk9show/src/services/database/day-of-operations/__tests__/late-entry-dog.test.ts`, add assertion-first tests that prove the RPC payload includes the exact `showId`:

```typescript
expect(supabase.rpc).toHaveBeenCalledWith('create_show_managed_person', {
  p_show_id: 'show-1',
  p_first_name: 'Jane',
  p_last_name: 'Doe',
  p_email: 'jane@example.com',
  p_phone: null,
});

expect(supabase.rpc).toHaveBeenCalledWith('create_show_managed_dog', {
  p_show_id: 'show-1',
  p_owner_id: 'person-1',
  p_name: 'Example Dog',
  p_breed: 'Mixed Breed',
  p_call_name: null,
  p_sex: null,
  p_akc_number: null,
  p_ukc_number: null,
  p_microchip_number: null,
});
```

Keep self-service exhibitor dog creation on the normal owner-scoped insert path.

After the explicit conversion, run this audit command and document any remaining direct people/dog inserts as either owner self-service, site-admin utilities, or a separate follow-up plan:

```bash
rg -n "from\\('people'\\).*insert|from\\('dogs'\\).*insert|createUser\\(|createDog\\(" apps/myk9show/src/services apps/myk9show/src/components apps/myk9show/src/pages apps/myk9show/src/hooks
```

- [x] **Step 5: Run guardrail tests**

Run: `cd apps/myk9show && npx vitest run src/features/role-scope/roleScopeAudit.test.ts`

Expected: PASS.

Run: `supabase db lint`

Result: linked PADI lint completed, but the remote schema still reports pre-existing
issues in `submit_show_entries`, `check_class_availability`,
`get_judge_day_capacity`, and `create_show_with_children`. The new migration has
not been applied to PADI in this task.

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/features/role-scope/roleScopeAudit.test.ts supabase/migrations/20260524121000_scope_secretary_people_dog_access.sql apps/myk9show/src/services/database/day-of-operations/late-entry-dog.ts apps/myk9show/src/services/database/day-of-operations/__tests__/late-entry-dog.test.ts
git commit -m "fix(auth): scope secretary people and dog access to managed shows"
```

## Task 7: Verification And Todo Closeout

**Files:**
- Modify: `OPEN-TODOS.md`

- [x] **Step 1: Run focused test suite**

Run:

```bash
cd apps/myk9show && npx vitest run \
  src/test/auth/useAuth.test.ts \
  src/test/pages/SignUpPage.test.tsx \
  src/features/access-requests/accessRequestService.test.ts \
  src/features/access-requests/AccessRequestStatusCard.test.tsx \
  src/features/club-secretaries/clubSecretaryService.test.ts \
  src/components/clubs/ClubDetails/__tests__/MembersTab.secretaries.test.tsx \
  src/services/database/day-of-operations/__tests__/late-entry-dog.test.ts \
  src/features/role-scope/roleScopeAudit.test.ts
```

Expected: PASS.

- [x] **Step 2: Run typecheck**

Run: `pnpm typecheck`

Expected: PASS.

- [x] **Step 3: Run lint**

Run: `pnpm lint`

Expected: PASS.

- [ ] **Step 4: [ADDED] Run targeted browser smoke**

Start the myK9Show dev server:

```bash
pnpm dev:show
```

Open `/sign-up` and verify:

- The landing page exposes a `Start a club on myK9Show` or `Request club access` link to `/sign-up?request=club`.
- The role section says `I am interested in...`.
- Opening `/sign-up?request=club` preselects `I help run a club or host shows`.
- Choosing `I help run a club or host shows` reveals Club name, Club website, and Note fields.
- Submitting without a club name shows `Enter the club name you want to manage.`

Then sign in as a site admin in the dev environment and open `/admin/access-requests`. Verify the page loads, the empty state is calm when no requests exist, and errors show the retry state instead of a blank page.

Result: public signup smoke passed locally against `http://localhost:5173/`.
Site-admin browser smoke was not run because no signed-in site-admin browser
session or dev credentials were available in this workspace; admin queue behavior
is covered by focused unit/component tests.

- [x] **Step 5: Mark todo complete**

In `OPEN-TODOS.md`, change:

```markdown
- [ ] **Add an approval workflow for sign-up role requests**
```

to:

```markdown
- [x] **Add an approval workflow for sign-up role requests**
```

Append implementation notes with PR/commit references after the work is merged.

- [x] **Step 6: Commit closeout**

```bash
git add OPEN-TODOS.md
git commit -m "docs: close club role approval todo"
```

## Self-Review

- Spec coverage: The plan covers site-admin club approval, first club-admin grant, club-admin secretary grants, signup copy, scoped secretary selection, user_roles hardening, and tests.
- Placeholder scan: No task relies on unspecified behavior; where a file must be identified by search, the exact search command and required assertion are included.
- Type consistency: Metadata names use camelCase in TypeScript and snake_case in Supabase auth metadata. RPC names and argument names match between SQL and service tests.
