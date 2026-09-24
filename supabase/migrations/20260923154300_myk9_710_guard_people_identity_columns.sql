-- =============================================================================
-- Migration 20260923154300: guard people.auth_user_id and email (MYK9-710)
--
-- THE TAKEOVER THIS CLOSES. A secretary could take over any account, site
-- admins included:
--
--   1. `can_manage_show_person(p)` is true once a live entry in a show the
--      caller manages names `p` as handler (or a dog of theirs). A secretary
--      can set `entries.handler_id` on an entry in their own show to anyone.
--   2. The `people_update` policy then admits the victim's row, and
--      `authenticated` holds table-level UPDATE on `people`. The secretary sets
--      `auth_user_id = NULL` and rewrites `email` to an address they control.
--      `enforce_sign_in_email_match()` (20260805120000) returns early once
--      `auth_user_id` is NULL, and `propagate_people_auth_user_id_to_user_roles`
--      (159) clears the victim's `user_roles.auth_user_id`.
--   3. The secretary signs up with that address. `handle_new_user()` adopts the
--      unlinked row on a bare email match and the propagate trigger hands every
--      one of the victim's roles, site_admin included, to the new identity.
--
-- WHAT THIS MIGRATION DOES. One BEFORE UPDATE trigger on `people`, firing only
-- when `auth_user_id` or `email` is in the SET list, refuses an unprivileged
-- caller who:
--
--   (a) changes `auth_user_id` at all (link, unlink or relink);
--   (b) changes `email` on a row that has a sign-in identity, or that holds any
--       `user_roles` row (an identity existed, or roles are waiting for one).
--
-- `status` (account suspension) is NOT touched here. It is already guarded by
-- `people_protect_status_trigger` (157, latest body 20260524121000), which
-- allows `can_manage_show_person(OLD.id) OR is_site_admin()` and so already
-- refuses a person reinstating their own row. Narrowing it to site admins is a
-- product decision, raised separately rather than folded into this fix.
--
-- Step 2 dies at (a) and at (b). Ordinary directory maintenance is untouched:
-- a secretary can still edit a mail-in person's name, phone and email, because
-- that person never had a login and holds no roles.
--
-- WHO IS PRIVILEGED. A site admin, or any connection that is not a PostgREST
-- client request. The discriminator is the `role` GUC, NOT current_user:
--
--   * PostgREST runs every request under `SET LOCAL ROLE anon|authenticated|
--     service_role`. A SECURITY DEFINER function changes current_user to its
--     owner but leaves the `role` GUC alone, so a definer RPC called by an
--     authenticated client still reads 'authenticated' here. current_user would
--     read 'postgres' inside every definer RPC and inside this definer trigger
--     itself, and so could not tell anyone apart.
--   * GoTrue connects as supabase_auth_admin and never sets a role, so the GUC
--     reads 'none'. That is how handle_new_user()'s link step (NULL -> the new
--     identity) and sync_person_email_from_auth() keep working: both fire from
--     GoTrue's own INSERT/UPDATE on auth.users. auth.uid() being NULL was
--     rejected as the discriminator: it is also NULL for an `anon` request.
--   * Migrations, the SQL editor and seed scripts run as postgres with no role
--     set ('none'); edge functions with the service key run as 'service_role'.
--
-- The check is an ALLOWLIST (fail closed): an unexpected role is unprivileged.
-- Verified on PostgreSQL 18 that `current_setting('role')` inside a SECURITY
-- DEFINER function called under `SET LOCAL ROLE authenticated` is
-- 'authenticated', and 'none' for a plain postgres session.
--
-- WHY NOT A COLUMN REVOKE. `authenticated` holds TABLE-level UPDATE on people
-- (20260918154700). A column-level `REVOKE UPDATE (auth_user_id)` does not
-- narrow a table-level grant (LESSONS `grant-never-narrows`), and replacing the
-- table grant with a column list would silently freeze every column added
-- later. The trigger is the boundary.
--
-- NOT CHANGED HERE: handle_new_user()'s adoption rule (MYK9-710 part c). The
-- admin invite flow (admin-invite-user, migration 159's header) deliberately
-- pre-assigns non-exhibitor roles to an unlinked person and relies on adoption
-- by email to hand them over. With (b), the email on such a row can only be
-- set by a site admin or a server path, so the email match is back to being a
-- trusted channel. Tightening adoption itself needs a product decision and is
-- proposed on the issue instead.
-- =============================================================================

begin;

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

  -- Nothing guarded moved: the overwhelmingly common save (the app assigns
  -- email on nearly every write whether or not it changed).
  if new.auth_user_id is not distinct from old.auth_user_id
     and not v_email_changed then
    return new;
  end if;

  -- Not a PostgREST client request (see header), or a site admin.
  if coalesce(nullif(current_setting('role', true), ''), 'none')
       in ('none', 'service_role', 'postgres', 'supabase_admin', 'supabase_auth_admin')
     or public.is_site_admin() then
    return new;
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

  return new;
end;
$$;

comment on function public.people_guard_identity_columns() is
  'MYK9-710: refuses non-site-admin client changes to people.auth_user_id, and to people.email on a row with an identity or roles. Server paths (GoTrue signup/sync, service_role, postgres) are exempt via the role GUC.';

-- A trigger function needs no EXECUTE from anyone at fire time. Revoke PUBLIC
-- as well as the two roles: a revoke from anon alone is inert while the default
-- PUBLIC grant stands.
revoke all on function public.people_guard_identity_columns() from public;
revoke all on function public.people_guard_identity_columns() from anon;
revoke all on function public.people_guard_identity_columns() from authenticated;

-- Named to sort BEFORE `people_enforce_sign_in_email`: same-timing triggers fire
-- in name order, and the authorization refusal should win over the MK002
-- validation error (a secretary linking their own identity onto someone else's
-- row should read "not allowed", not "email mismatch").
drop trigger if exists people_authz_guard_identity_columns on public.people;

create trigger people_authz_guard_identity_columns
  before update of auth_user_id, email on public.people
  for each row
  execute function public.people_guard_identity_columns();

commit;
