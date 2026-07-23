-- Isolate admin-only `onboarding_requests.notes` from the requester.
--
-- Problem: the owner SELECT policy ("Users can view their own requests")
-- returns the WHOLE row — including `notes`, which is documented as
-- "internal notes from admin". A club that submitted a request could read
-- the admin's private notes with a direct `select=notes` query. Hiding the
-- column in the UI does not protect it from the PostgREST response.
--
-- Fix: remove the owner's direct table SELECT entirely and give owners a
-- SECURITY DEFINER RPC that returns their own rows WITHOUT `notes`. Admins
-- keep direct table access (their SELECT/UPDATE policies gate on
-- is_platform_admin()), so the admin inbox is unaffected.

-- 1. Drop the broad owner SELECT policy — owners no longer read the table
--    directly (which is what leaked `notes`). Insert-own + admin policies stay.
drop policy if exists "Users can view their own requests" on onboarding_requests;

-- 2. Owner-facing read: own rows, notes excluded. SECURITY DEFINER so it can
--    read past the now-removed owner policy, but the WHERE clause restricts
--    results to the caller's own rows.
create or replace function public.get_my_onboarding_requests()
returns table (
  id uuid,
  auth_user_id uuid,
  club_name text,
  organization text,
  contact_name text,
  contact_email text,
  contact_phone text,
  first_show_date date,
  message text,
  status text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select
    r.id,
    r.auth_user_id,
    r.club_name,
    r.organization,
    r.contact_name,
    r.contact_email,
    r.contact_phone,
    r.first_show_date,
    r.message,
    r.status,
    r.created_at
  from onboarding_requests r
  where r.auth_user_id = auth.uid()
  order by r.created_at desc;
$$;

-- Only signed-in users may call it; it self-scopes to auth.uid().
revoke all on function public.get_my_onboarding_requests() from public;
grant execute on function public.get_my_onboarding_requests() to authenticated;
