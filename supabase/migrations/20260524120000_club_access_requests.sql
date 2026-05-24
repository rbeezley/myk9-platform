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

create index if not exists club_access_requests_requester_auth_status_idx
  on public.club_access_requests(requester_auth_user_id, status);

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

drop policy if exists secretary_grant_show_officials on public.user_roles;
drop policy if exists secretary_update_show_officials on public.user_roles;
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
    on conflict (requester_person_id, (lower(requested_club_name))) where status = 'pending'
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
  v_assignment_id uuid;
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
    insert into public.clubs (name, website)
    values (
      coalesce(nullif(trim(p_club_name), ''), v_request.requested_club_name),
      v_request.requested_club_website
    )
    returning id into v_club_id;
  elsif not exists (select 1 from public.clubs where id = v_club_id) then
    raise exception 'Club % not found', v_club_id using errcode = 'P0002';
  end if;

  select id into v_club_admin_role_id
  from public.roles
  where name = 'club_admin';

  if v_club_admin_role_id is null then
    raise exception 'club_admin role is missing' using errcode = 'P0002';
  end if;

  select id into v_assignment_id
  from public.user_roles
  where user_id = v_request.requester_person_id
    and role_id = v_club_admin_role_id
    and club_id = v_club_id
    and show_id is null
  limit 1;

  if v_assignment_id is null then
    insert into public.user_roles (user_id, role_id, club_id, granted_by, is_active)
    values (
      v_request.requester_person_id,
      v_club_admin_role_id,
      v_club_id,
      v_reviewer_person_id,
      true
    )
    returning id into v_assignment_id;
  else
    update public.user_roles
    set is_active = true,
        granted_by = v_reviewer_person_id,
        granted_at = now()
    where id = v_assignment_id;
  end if;

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
      'role', 'club_admin',
      'assignment_id', v_assignment_id
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
    raise exception 'Only site admins or this club''s admins can grant secretary access'
      using errcode = '42501';
  end if;

  if not exists (select 1 from public.people where id = p_person_id) then
    raise exception 'Person % not found', p_person_id using errcode = 'P0002';
  end if;

  if not exists (select 1 from public.clubs where id = p_club_id) then
    raise exception 'Club % not found', p_club_id using errcode = 'P0002';
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

  select id into v_assignment_id
  from public.user_roles
  where user_id = p_person_id
    and role_id = v_secretary_role_id
    and club_id = p_club_id
    and show_id is null
  limit 1;

  if v_assignment_id is null then
    insert into public.user_roles (user_id, role_id, club_id, granted_by, is_active)
    values (p_person_id, v_secretary_role_id, p_club_id, v_actor_person_id, true)
    returning id into v_assignment_id;
  else
    update public.user_roles
    set is_active = true,
        granted_by = v_actor_person_id,
        granted_at = now()
    where id = v_assignment_id;
  end if;

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
  v_assignment_id uuid;
begin
  if not (public.is_site_admin() or public.is_club_admin(p_club_id)) then
    raise exception 'Only site admins or this club''s admins can revoke secretary access'
      using errcode = '42501';
  end if;

  select id into v_secretary_role_id
  from public.roles
  where name = 'secretary';

  if v_secretary_role_id is null then
    raise exception 'secretary role is missing' using errcode = 'P0002';
  end if;

  select id into v_actor_person_id
  from public.people
  where auth_user_id = auth.uid()
  limit 1;

  with updated as (
    update public.user_roles
    set is_active = false
    where user_id = p_person_id
      and role_id = v_secretary_role_id
      and club_id = p_club_id
      and show_id is null
      and is_active = true
    returning id
  )
  select id into v_assignment_id
  from updated
  limit 1;

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
    v_assignment_id,
    jsonb_build_object('person_id', p_person_id, 'club_id', p_club_id, 'role', 'secretary')
  );
end;
$$;

grant execute on function public.review_club_access_request(uuid, text, uuid, text, text) to authenticated;
grant execute on function public.grant_club_secretary(uuid, uuid) to authenticated;
grant execute on function public.revoke_club_secretary(uuid, uuid) to authenticated;
grant execute on function public.insert_club_access_request_from_signup(uuid, uuid, jsonb) to supabase_auth_admin;
grant execute on function public.materialize_club_access_request_from_auth_user() to supabase_auth_admin;

-- Compatibility: older early-access signup logic attempted to insert a global
-- secretary role. Club-scoped secretary is now the only valid model.
drop trigger if exists zz_grant_early_access_secretary on auth.users;
drop function if exists public.grant_early_access_secretary_role();

drop trigger if exists zz_materialize_club_access_request on auth.users;
create trigger zz_materialize_club_access_request
  after insert on auth.users
  for each row execute function public.materialize_club_access_request_from_auth_user();

notify pgrst, 'reload schema';

commit;
