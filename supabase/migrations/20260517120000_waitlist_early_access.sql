-- Early-access columns for the pre-launch waitlist.
--
-- When a waitlist signup picks role = 'secretary', the WaitlistFormLanding
-- form invokes the send-waitlist-invite edge function, which stamps these
-- columns and sends a Resend magic-link email. The app's route gate
-- (VITE_PUBLIC_SURFACE=wizard) lets granted users into the show-creation
-- wizard surface; everyone else stays parked.
--
-- See: supabase/migrations/197_create_platform_waitlist.sql for the base table.

alter table public.platform_waitlist
  add column if not exists access_granted_at      timestamptz,
  add column if not exists access_invite_sent_at  timestamptz;

-- Partial index — only granted rows are interesting for the invite worker
-- and the route-gate lookup.
create index if not exists platform_waitlist_granted_idx
  on public.platform_waitlist (access_granted_at)
  where access_granted_at is not null;

comment on column public.platform_waitlist.access_granted_at is
  'When a site admin (or the auto-grant path for role=secretary) approved this signup for early access.';

comment on column public.platform_waitlist.access_invite_sent_at is
  'When the magic-link invite email was sent. NULL = pending; non-NULL acts as an idempotency guard for send-waitlist-invite.';

-- ─── Auto-grant secretary role on first sign-in ──────────────────────────────
--
-- The existing on_auth_user_created trigger (handle_new_user, migration 131)
-- creates the people row and grants the exhibitor role. We fire AFTER it with
-- an alphabetically-later trigger name so we can resolve the new person.id and
-- additionally grant the secretary role when the signup matches an
-- access-granted waitlist row.
--
-- INTENT: keep this conservative. Only fire when an explicit waitlist row
-- exists with role = 'club_official' AND access_granted_at IS NOT NULL.
-- Anything else is a no-op so a regular signup is never elevated by accident.

create or replace function public.grant_early_access_secretary_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_person_id        uuid;
  v_secretary_role_id uuid;
  v_match_count      int;
begin
  -- Bail unless the email is on the granted waitlist as a secretary signup.
  select count(*) into v_match_count
    from public.platform_waitlist w
    where lower(w.email) = lower(NEW.email)
      and w.role = 'club_official'
      and w.access_granted_at is not null;

  if v_match_count = 0 then
    return NEW;
  end if;

  -- handle_new_user already created (or linked) the people row.
  select id into v_person_id
    from public.people
    where auth_user_id = NEW.id
    limit 1;

  if v_person_id is null then
    -- Should not happen — handle_new_user runs first — but bail safely.
    return NEW;
  end if;

  select id into v_secretary_role_id
    from public.roles
    where name = 'secretary'
    limit 1;

  if v_secretary_role_id is null then
    return NEW;
  end if;

  -- Mirrors the upsert pattern in handle_new_user: try to re-activate an
  -- existing global (no club/show) secretary row, otherwise insert one.
  update public.user_roles
    set is_active = true
    where user_id  = v_person_id
      and role_id  = v_secretary_role_id
      and club_id  is null
      and show_id  is null;

  if not found then
    insert into public.user_roles (user_id, role_id, is_active)
    values (v_person_id, v_secretary_role_id, true);
  end if;

  return NEW;
end;
$$;

grant execute on function public.grant_early_access_secretary_role() to supabase_auth_admin;

-- Name starts with 'zz_' so it sorts after on_auth_user_created and runs
-- after the people row has been created/linked.
drop trigger if exists zz_grant_early_access_secretary on auth.users;
create trigger zz_grant_early_access_secretary
  after insert on auth.users
  for each row execute function public.grant_early_access_secretary_role();
