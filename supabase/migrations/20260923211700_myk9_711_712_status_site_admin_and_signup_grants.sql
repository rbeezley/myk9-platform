-- =============================================================================
-- Migration 20260923211700: site-admin-only account status, freeze the email
-- of anyone with entries, and close the signup helper's leftover EXECUTE grant
-- (MYK9-712, MYK9-710 option C, MYK9-711)
--
-- -----------------------------------------------------------------------------
-- MYK9-712 — only a site admin may change people.status
-- -----------------------------------------------------------------------------
-- `people.status` is account suspension: 063's auth hook refuses sign-in for a
-- 'suspended' person. `people_protect_status()` (trigger from 157, latest body
-- 20260524121000) allowed the change when `can_manage_show_person(OLD.id)` OR
-- `is_site_admin()`. A secretary makes ANY person manageable by pointing an
-- entry's `handler_id` at them in their own show (the MYK9-710 vector), so any
-- secretary could suspend any account, site admins included. Product decision
-- (Richard, MYK9-712): only site admins change status.
--
-- The app agrees already: the only suspend/reinstate controls (`UserTable`,
-- `UserDetailsView`) are gated on `admin:manage`, which only `site_admin`
-- holds (verified live), and no edge function or RPC writes people.status.
--
-- Server paths (migrations, seed scripts, service_role) stay allowed through
-- the same `role` GUC allowlist as the MYK9-710 guard
-- (`people_guard_identity_columns`, 20260923154300), which explains why the GUC
-- and not current_user is the discriminator: a SECURITY DEFINER function
-- changes current_user to its owner but leaves the `role` GUC as PostgREST set
-- it. The old body had no server-path exemption at all, so a plain postgres
-- session (no JWT) was refused; that is widened deliberately to match 710.
--
-- Copied from the LATEST definition, 20260524121000; the trigger itself
-- (people_protect_status_trigger, BEFORE UPDATE OF status) is unchanged. The
-- old `GRANT EXECUTE ... TO authenticated` is not restated: a trigger function
-- needs no EXECUTE at fire time, and the live ACL is already owner +
-- service_role only.
--
-- -----------------------------------------------------------------------------
-- MYK9-710 residual, option C — a person with entries keeps their email
-- -----------------------------------------------------------------------------
-- 20260923154300 stopped a secretary re-pointing the email of a person with a
-- sign-in identity or roles. What remained: an UNLINKED, role-less mail-in
-- person. A secretary could point their email at an address the secretary
-- controls, sign up there, and `handle_new_user()` would adopt the row, with
-- its dogs and entries. Product decision (Richard, option C): once a person has
-- any live entry, only a site admin or a server path may change their email.
--
-- "Has entries" is: a live (deleted_at IS NULL) entry that names the person as
-- handler, OR is for a dog the person owns or co-owns. That is exactly the set
-- `can_manage_show_person()` uses, i.e. exactly the relationships through which
-- a secretary gains UPDATE on a person row in the first place, and exactly what
-- an adoption would hand over. Withdrawn/pulled entries still count: they are
-- live rows carrying history and refunds. It deliberately does not require the
-- entry to be in a show the caller manages.
--
-- Consequence worth stating: `people_update` only admits a secretary to a row
-- through `can_manage_show_person()`, which itself requires such an entry. So
-- today a secretary can no longer change ANY person's email through a direct
-- client update; the "before entries" branch applies to callers that reach the
-- row some other way (a future SECURITY DEFINER RPC keeps the `authenticated`
-- role GUC and is still checked). Typos after entry go to a site admin.
--
-- Found while testing: an unprivileged caller could still store a padded or
-- recased copy of an unlinked person's address (treated as "unchanged"), and
-- handle_new_user() matches LOWER(email) without trim, so a padded copy blocked
-- that person's adoption. The guard now keeps the stored bytes for such a
-- rewrite instead of refusing it (ordinary saves that re-send the address keep
-- working). Privileged callers are unaffected, so the MYK9-136 normalisation of
-- linked rows still applies to them.
--
-- The entries check runs only when the email actually changes, for an unprivileged
-- caller, and uses entries_handler_id_idx, dogs_owner_id_idx and
-- dogs_co_owner_id_idx. Copied from the LATEST definition, 20260923154300;
-- the MYK9-710 conditions are unchanged.
--
-- -----------------------------------------------------------------------------
-- MYK9-711 — insert_club_access_request_from_signup is signup-trigger-only
-- -----------------------------------------------------------------------------
-- The function is SECURITY DEFINER and takes the requester's person id and
-- auth uid as ARGUMENTS. It exists only to be called from
-- `materialize_club_access_request_from_auth_user()` (the
-- zz_materialize_club_access_request trigger on auth.users), which runs as
-- supabase_auth_admin. The live ACL also carries `authenticated=X`, granted
-- nowhere in migrations (drift), so any signed-in user could file a club
-- access request as any person. Revoke it; keep supabase_auth_admin (the
-- trigger path) and service_role.
--
-- Swept the other signup / auth.users trigger helpers on the live DB
-- (SECURITY DEFINER, name matching signup|new_user|from_auth|auth_user|
-- materializ, or bound to an auth.* trigger) for EXECUTE held by anon or
-- authenticated. Live proacl at the time of writing:
--   handle_new_user()                                 {postgres, service_role}
--   sync_person_email_from_auth()                     {postgres, service_role}
--   materialize_club_access_request_from_auth_user()  {postgres, service_role, supabase_auth_admin}
--   insert_signup_role_requests(uuid,uuid,jsonb)      {postgres, service_role}
--   insert_club_access_request_from_signup(...)       {postgres, service_role, supabase_auth_admin, authenticated}  <- fixed here
--   submit_signup_role_requests(jsonb)                {postgres, service_role, authenticated}  <- intended: the
--       OAuth signup RPC (20260919131500) the client calls for itself; it
--       derives the caller from auth.uid() and takes no identity argument.
-- No trigger-returning definer function in public is executable by anon or
-- authenticated. Only the one grant needs revoking.
-- =============================================================================

begin;

create or replace function public.people_protect_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  -- Not a PostgREST client request (migrations, seed scripts, service_role),
  -- or a site admin. Same allowlist as people_guard_identity_columns (MYK9-710).
  if coalesce(nullif(current_setting('role', true), ''), 'none')
       in ('none', 'service_role', 'postgres', 'supabase_admin', 'supabase_auth_admin')
     or public.is_site_admin() then
    return new;
  end if;

  raise exception 'Permission denied: only a site admin can suspend or reinstate an account'
    using errcode = '42501',
          hint = 'people.status is account suspension; site admins only (MYK9-712).';
end;
$$;

comment on function public.people_protect_status() is
  'MYK9-712: people.status (account suspension) changes only for a site admin or a server path (role GUC none/service_role/postgres/supabase_admin/supabase_auth_admin).';

revoke all on function public.people_protect_status() from public;
revoke all on function public.people_protect_status() from anon;
revoke all on function public.people_protect_status() from authenticated;

create or replace function public.people_guard_identity_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email_changed boolean;
begin
  v_email_changed :=
    lower(btrim(coalesce(new.email, ''))) is distinct from lower(btrim(coalesce(old.email, '')));

  -- Nothing guarded moved, byte for byte: the overwhelmingly common save.
  if new.auth_user_id is not distinct from old.auth_user_id
     and new.email is not distinct from old.email then
    return new;
  end if;

  -- Not a PostgREST client request (see 20260923154300), or a site admin.
  if coalesce(nullif(current_setting('role', true), ''), 'none')
       in ('none', 'service_role', 'postgres', 'supabase_admin', 'supabase_auth_admin')
     or public.is_site_admin() then
    return new;
  end if;

  -- A case- or whitespace-only rewrite is not a change, so it is not refused,
  -- but an unprivileged caller does not get to store it either. The adoption
  -- lookup in handle_new_user() matches LOWER(email) with no trim, so a padded
  -- copy of a mail-in person's address would silently stop them being adopted
  -- at signup (a new, empty person would be created instead). Keep the stored
  -- bytes.
  if not v_email_changed then
    new.email := old.email;
  end if;

  if new.auth_user_id is distinct from old.auth_user_id then
    raise exception 'Only a site admin can link or unlink a person''s sign-in account.'
      using errcode = '42501',
            hint = 'people.auth_user_id is set at signup and changed only by site admins (MYK9-710).';
  end if;

  if v_email_changed
     and (
       old.auth_user_id is not null
       or exists (select 1 from public.user_roles ur where ur.user_id = old.id)
     ) then
    raise exception 'This person has (or had) a sign-in account, so only a site admin can change their email address.'
      using errcode = '42501',
            hint = 'people.email is the adoption key at signup for a person with an identity or roles (MYK9-710).';
  end if;

  -- MYK9-710 option C: a person with any live entry keeps their email.
  if v_email_changed
     and (
       exists (
         select 1 from public.entries e
          where e.handler_id = old.id and e.deleted_at is null
       )
       or exists (
         select 1
           from public.dogs d
           join public.entries e on e.dog_id = d.id and e.deleted_at is null
          where d.owner_id = old.id or d.co_owner_id = old.id
       )
     ) then
    raise exception 'This person already has entries, so only a site admin can change their email address.'
      using errcode = '42501',
            hint = 'people.email is the adoption key at signup; once a person has entries it is site-admin-only (MYK9-710 option C).';
  end if;

  return new;
end;
$$;

comment on function public.people_guard_identity_columns() is
  'MYK9-710: refuses non-site-admin client changes to people.auth_user_id, and to people.email on a row with an identity, roles, or any live entry (as handler, owner or co-owner). Server paths (GoTrue signup/sync, service_role, postgres) are exempt via the role GUC.';

revoke all on function public.people_guard_identity_columns() from public;
revoke all on function public.people_guard_identity_columns() from anon;
revoke all on function public.people_guard_identity_columns() from authenticated;

-- MYK9-711
revoke all on function public.insert_club_access_request_from_signup(uuid, uuid, jsonb) from public;
revoke all on function public.insert_club_access_request_from_signup(uuid, uuid, jsonb) from anon;
revoke all on function public.insert_club_access_request_from_signup(uuid, uuid, jsonb) from authenticated;
grant execute on function public.insert_club_access_request_from_signup(uuid, uuid, jsonb) to supabase_auth_admin;
grant execute on function public.insert_club_access_request_from_signup(uuid, uuid, jsonb) to service_role;

commit;
