-- MYK9-2033: the Ringside presence heartbeat (upsert_ringside_session) refused a judge on a
-- per-judge access code with 403 (SQLSTATE 42501) every 30 s, while the same session's score and
-- class writes (ringside_update_entry, 20261113224300_myk9_1950_per_judge_passcodes.sql) succeeded.
--
-- ROOT CAUSE: upsert_ringside_session (latest: 20261113224300) has two 42501 refusals that
-- ringside_update_entry does not have, one on each arm:
--
--   1. Passcode-claim arm: 'subscription does not belong to caller'. The heartbeat sends the
--      browser's push endpoint, and the RPC required push_subscriptions.user_id = auth.uid().
--      A passcode session is ANONYMOUS, and since MYK9-1701 an anonymous session can never own a
--      push subscription (claim_my_push_subscription refuses anonymous callers). So a browser
--      endpoint on a passcode device is either unsaved (400 'push subscription is required') or
--      owned by the account that turned push on in that browser earlier, such as a club tablet a
--      secretary used and then handed to the judge: 403 on every beat. ringside_update_entry
--      admits that same session on the claim alone (kind, show, role, live generation, and for a
--      judge code the live class scope).
--   2. Account arm: 'account is not entered in exactly one active ringside show'. A signed-in
--      account that enters a judge code is not claim-stamped (validate-passcode stamps only
--      anonymous callers), so it reaches the account arm, which admits ENTRANTS only. A judge has
--      no entries, so 403. ringside_update_entry admits the same account through its account tiers
--      (manager, assigned judge, steward). 20260704190000 documented this gap and left a
--      role-based account-official branch as a follow-up; this is that branch.
--
-- FIX (no widening beyond what ringside_update_entry admits):
--   1. Claim arm: the claim alone authorizes, exactly as before (kind, show, role, live generation
--      via ringside_claim_generation_current). The subscription must belong to the caller OR the
--      caller is an anonymous session, which can hold no subscription of its own. The push
--      endpoint is the capability (MYK9-1701): an unguessable URL only the browser holding the
--      subscription can read, so the caller presenting it is that browser. Ownership of the
--      subscription is not changed; the row only records that this device is at this show.
--   2. Account arm: unchanged for entrants (tried first, so nothing that works today changes).
--      When the account is not an entrant, the show named by the /at-show route admits the
--      account through ringside_update_entry's account tiers, in its order: manager
--      (site admin, trial secretary or club admin of the show's club) as 'admin', a judge with a
--      confirmed/invited class-level assignment in the show as 'judge' (the rows that mint a
--      per-judge code, 1950), and an active steward role for the show or its club as 'steward'.
--      Anyone else is still refused with the same 42501.
--   clear_ringside_session_presence gets the same claim-arm admission, so a device whose presence
--   upsert now succeeds can also clear it on hide (otherwise its presence would linger and
--   suppress pushes it should get). It only nulls last_seen_* for one (subscription, show).
--
-- Bodies copied from: upsert_ringside_session 20261113224300; clear_ringside_session_presence
-- 20260530210555. SECURITY DEFINER and SET search_path = '' kept. CREATE OR REPLACE keeps the
-- existing ACLs; the grants are re-declared idempotently. Expected proacl after push:
--   upsert_ringside_session:          {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
--   clear_ringside_session_presence:  {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
-- Behavioral test: supabase/tests/myk9_2033_ringside_heartbeat_admission_test.sql (CI only).

BEGIN;

-- -----------------------------------------------------------------------------
-- The account tiers of ringside_update_entry, for one show: the presence role, or NULL.
-- -----------------------------------------------------------------------------
create or replace function public._account_ringside_staff_role(p_show_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_club_id uuid;
begin
  if p_show_id is null or auth.uid() is null then
    return null;
  end if;

  select s.club_id
    into v_club_id
    from public.shows s
   where s.id = p_show_id
     and s.deleted_at is null;

  if v_club_id is null then
    return null;
  end if;

  if public.is_site_admin()
     or public.is_trial_secretary(v_club_id)
     or public.is_club_admin(v_club_id) then
    return 'admin';
  end if;

  if exists (
    select 1
      from public.judge_assignments ja
      join public.people pe on pe.id = ja.person_id
     where pe.auth_user_id = auth.uid()
       and pe.deleted_at is null
       and ja.show_id = p_show_id
       and ja.class_id is not null
       and ja.status in ('confirmed', 'invited')
  ) then
    return 'judge';
  end if;

  if exists (
    select 1
      from public.user_roles ur
      join public.roles r on r.id = ur.role_id
     where ur.auth_user_id = auth.uid()
       and r.name = 'steward'
       and ur.is_active
       and (ur.expires_at is null or ur.expires_at > now())
       and (ur.show_id = p_show_id
            or (ur.show_id is null and ur.club_id = v_club_id))
  ) then
    return 'steward';
  end if;

  return null;
end
$$;

revoke all on function public._account_ringside_staff_role(uuid) from public, anon, authenticated;

comment on function public._account_ringside_staff_role(uuid) is
  'MYK9-2033: the ringside presence role (admin/judge/steward) a signed-in account holds for a show '
  'through ringside_update_entry''s account tiers, or NULL. Internal to upsert_ringside_session.';

-- -----------------------------------------------------------------------------
-- upsert_ringside_session (from 20261113224300).
-- -----------------------------------------------------------------------------
create or replace function public.upsert_ringside_session(
  p_passcode_or_null text,
  p_subscription_endpoint text,
  p_favorited_armbands text[] default '{}'::text[],
  p_route text default null
)
returns table (show_id uuid, role text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_subscription_id uuid;
  v_subscription_user_id uuid;
  v_show_id uuid;
  v_role text;
  v_show_passcode_id uuid;
  -- Ringside passcode claim (forge-proof app_metadata; service-role set only).
  v_claim_kind text;
  v_claim_show_id text;
  v_claim_role text;
  v_claim_person_id uuid;
  v_is_anonymous boolean;
begin
  if nullif(trim(coalesce(p_subscription_endpoint, '')), '') is null then
    raise exception 'push subscription is required' using errcode = '22023';
  end if;

  select ps.id, ps.user_id
    into v_subscription_id, v_subscription_user_id
    from public.push_subscriptions ps
   where ps.endpoint = p_subscription_endpoint
   limit 1;

  if v_subscription_id is null then
    raise exception 'push subscription is required' using errcode = '22023';
  end if;

  -- Read the ringside passcode claim from the (forge-proof) app_metadata, NEVER
  -- user_metadata. Gated on the explicit kind='ringside_passcode' marker
  -- (show_id/ringside_role are generic key names; the marker is what makes the
  -- claim unambiguously "from a ringside passcode"). Mirrors mig 20260624163000.
  v_claim_kind := (auth.jwt() -> 'app_metadata' ->> 'kind');
  v_claim_show_id := nullif((auth.jwt() -> 'app_metadata' ->> 'show_id'), '');
  v_claim_role := (auth.jwt() -> 'app_metadata' ->> 'ringside_role');
  -- MYK9-1950: a judge claim names the judge whose code minted it.
  v_claim_person_id := nullif((auth.jwt() -> 'app_metadata' ->> 'ringside_person_id'), '')::uuid;
  v_is_anonymous := coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);

  if v_claim_kind = 'ringside_passcode'
     and v_claim_show_id is not null
     and v_claim_role in ('judge', 'steward', 'admin', 'exhibitor') then
    -- Passcode-claim arm (the primary ringside sign-in). The caller is a signed-in
    -- anonymous session; anonymous users carry an auth.uid().
    if auth.uid() is null then
      raise exception 'credential not recognized' using errcode = '28000';
    end if;

    -- MYK9-2033: an anonymous session can own no push subscription (MYK9-1701), so the
    -- browser's endpoint belongs to whichever account turned push on there, or to nobody.
    -- The endpoint is the capability: only the browser holding the subscription can read it.
    -- A non-anonymous caller still needs its own subscription.
    if v_subscription_user_id is distinct from auth.uid() and not v_is_anonymous then
      raise exception 'subscription does not belong to caller' using errcode = '42501';
    end if;

    -- Generation revocation (J1.3): the claim authorizes ONLY while its stamped
    -- passcode_generation still matches the current show_passcodes.created_at of ITS code.
    -- Same check, same message as ringside_update_entry.
    if public.ringside_claim_generation_current() is distinct from true then
      raise exception 'Passcode has been regenerated; re-enter a new code'
        using errcode = '42501';
    end if;

    v_show_id := v_claim_show_id::uuid;
    v_role := v_claim_role;

    -- Preserve the show_passcode linkage without needing the raw passcode:
    -- (show_id, role, person_id) names at most one row (MYK9-1950).
    select sp.id
      into v_show_passcode_id
      from public.show_passcodes sp
     where sp.show_id = v_show_id
       and sp.role = v_role
       and sp.person_id is not distinct from v_claim_person_id
     limit 1;
  else
    -- Account arm: a signed-in ACCOUNT with no ringside passcode claim.
    if auth.uid() is null then
      raise exception 'credential not recognized' using errcode = '28000';
    end if;

    if v_subscription_user_id is distinct from auth.uid() then
      raise exception 'subscription does not belong to caller' using errcode = '42501';
    end if;

    -- Entrants first, unchanged: the single active ringside show from the account's OWN entries.
    v_show_id := public._account_ringside_show_id(p_route);
    v_role := 'exhibitor';

    -- MYK9-2033: otherwise the /at-show route's show, through ringside_update_entry's account
    -- tiers (manager, assigned judge, steward). Nobody else is admitted.
    if v_show_id is null then
      v_show_id := public._extract_at_show_route_show_id(p_route);
      v_role := public._account_ringside_staff_role(v_show_id);
      if v_role is null then
        v_show_id := null;
      end if;
    end if;

    if v_show_id is null then
      raise exception 'account is not entered in exactly one active ringside show' using errcode = '42501';
    end if;
  end if;

  insert into public.ringside_sessions (
    subscription_id,
    show_id,
    show_passcode_id,
    role,
    favorited_armbands,
    last_seen_at,
    last_seen_route,
    updated_at
  )
  values (
    v_subscription_id,
    v_show_id,
    v_show_passcode_id,
    v_role,
    coalesce(p_favorited_armbands, '{}'::text[]),
    now(),
    p_route,
    now()
  )
  on conflict on constraint ringside_sessions_pkey do update
    set show_passcode_id = excluded.show_passcode_id,
        role = excluded.role,
        favorited_armbands = excluded.favorited_armbands,
        last_seen_at = excluded.last_seen_at,
        last_seen_route = excluded.last_seen_route,
        updated_at = excluded.updated_at;

  show_id := v_show_id;
  role := v_role;
  return next;
end
$$;

revoke all on function public.upsert_ringside_session(text, text, text[], text) from public;
revoke all on function public.upsert_ringside_session(text, text, text[], text) from anon;
grant execute on function public.upsert_ringside_session(text, text, text[], text) to authenticated;

-- -----------------------------------------------------------------------------
-- clear_ringside_session_presence (from 20260530210555): the claim arm's admission, so a device
-- whose presence upsert succeeds can clear it too.
-- -----------------------------------------------------------------------------
create or replace function public.clear_ringside_session_presence(
  p_subscription_endpoint text,
  p_show_id uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_subscription_id uuid;
  v_subscription_user_id uuid;
  v_claim_admits boolean;
begin
  select ps.id, ps.user_id
    into v_subscription_id, v_subscription_user_id
    from public.push_subscriptions ps
   where ps.endpoint = p_subscription_endpoint
   limit 1;

  if v_subscription_id is null then
    return;
  end if;

  -- MYK9-2033: an anonymous passcode session holding a live claim for THIS show is admitted on
  -- the endpoint alone, exactly as upsert_ringside_session admits it.
  -- coalesce: a NULL here (no claim keys) must mean "not admitted", never skip the checks below.
  v_claim_admits := coalesce(
    auth.uid() is not null
    and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
    and (auth.jwt() -> 'app_metadata' ->> 'kind') = 'ringside_passcode'
    and nullif((auth.jwt() -> 'app_metadata' ->> 'show_id'), '') = p_show_id::text
    and public.ringside_claim_generation_current() is true,
    false);

  if not v_claim_admits then
    if auth.uid() is not null and v_subscription_user_id is distinct from auth.uid() then
      raise exception 'subscription does not belong to caller' using errcode = '42501';
    end if;

    if auth.uid() is null and v_subscription_user_id is not null then
      raise exception 'subscription does not belong to anonymous session' using errcode = '42501';
    end if;
  end if;

  update public.ringside_sessions
     set last_seen_at = null,
         last_seen_route = null,
         updated_at = now()
   where subscription_id = v_subscription_id
     and show_id = p_show_id;
end
$$;

revoke all on function public.clear_ringside_session_presence(text, uuid) from public;
grant execute on function public.clear_ringside_session_presence(text, uuid) to anon, authenticated;

COMMIT;
