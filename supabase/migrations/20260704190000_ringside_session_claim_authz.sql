-- =============================================================================
-- Migration 20260704190000: close the SA-011 un-throttled passcode brute-force
-- path in upsert_ringside_session (the ringside presence heartbeat RPC).
--
-- Plan / change: openspec/changes/security-passcode-throttle/
-- Audit: docs/security-audit-2026-07-03.md SA-011 (LOW) — bounded blast radius
--        (read/score only, never financial/PII), but a real auth-throttle gap.
--
-- PROBLEM (SA-011):
--   upsert_ringside_session (mig 20260531175637) is GRANTed to anon + authenticated
--   and, in its raw-passcode arm, called public.validate_passcode(<raw passcode>)
--   INLINE with no throttle. The RingsideSessionHeartbeat client re-sent the raw
--   passcode on every 30s heartbeat, so this HMAC lookup ran unthrottled on a
--   timer for every ringside device — a passcode brute-force surface that bypassed
--   the IP rate limiter in the validate-passcode edge function.
--
-- FIX (recommended path — close the direct arm, do not merely throttle it):
--   Passcode entry is validated + IP-rate-limited EXCLUSIVELY by the
--   validate-passcode edge function, which mints an anonymous Supabase session
--   stamped with forge-proof app_metadata { kind:'ringside_passcode', show_id,
--   ringside_role } (Phase C, mig 20260624163000 authorizes on it). This RPC now
--   reads that claim instead of re-validating a raw passcode — the exact pattern
--   view_authenticated_entry_results + ringside_update_entry already use. The raw
--   passcode is no longer a credential here; validate_passcode is no longer called.
--
--   * The function is REVOKEd from anon. A passcode caller post-login is a signed-in
--     ANONYMOUS session (the `authenticated` Postgres role, with a real auth.uid()),
--     so anon (the pre-login publishable-key caller) never needs this RPC.
--   * p_passcode_or_null is retained ONLY for signature / PostgREST / generated-type
--     compatibility and is IGNORED for authorization. No overload is created.
--
-- SECURITY — why app_metadata, not user_metadata: app_metadata is settable only by
--   the service role / GoTrue admin API (forge-proof); user_metadata is user-editable.
--   We read app_metadata EXCLUSIVELY.
--
-- KNOWN, DOCUMENTED behavior change (soft, non-blocking): a signed-in ACCOUNT that
--   officiates via a passcode is NOT claim-stamped (validate-passcode stamps only
--   anonymous callers) and the account arm is entrant-only, so such an account
--   official no longer produces a presence row. Their actual ringside READ + SCORE
--   is unaffected (it flows through is_assigned_judge / is_show_steward in the view
--   + write RPC, never through this function). The heartbeat already swallows this
--   error client-side, so the effect is only "does not appear in the presence list".
--   Verified in the live cold-session walk; a role-based account-official presence
--   branch is a clean follow-up if presence for that path proves necessary.
-- =============================================================================

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

  if v_claim_kind = 'ringside_passcode'
     and v_claim_show_id is not null
     and v_claim_role in ('judge', 'steward', 'admin', 'exhibitor') then
    -- Passcode-claim arm (the primary ringside sign-in). The caller is a signed-in
    -- anonymous session; anonymous users carry an auth.uid(), and the push
    -- subscription must belong to that session.
    if auth.uid() is null then
      raise exception 'credential not recognized' using errcode = '28000';
    end if;

    if v_subscription_user_id is distinct from auth.uid() then
      raise exception 'subscription does not belong to caller' using errcode = '42501';
    end if;

    v_show_id := v_claim_show_id::uuid;
    v_role := v_claim_role;

    -- Preserve the show_passcode linkage without needing the raw passcode:
    -- show_passcodes is UNIQUE(show_id, role), so this resolves at most one row.
    select sp.id
      into v_show_passcode_id
      from public.show_passcodes sp
     where sp.show_id = v_show_id
       and sp.role = v_role
     limit 1;
  else
    -- Account arm (unchanged): a signed-in ACCOUNT with no ringside passcode claim
    -- derives its single active ringside show from its OWN entries (entrant-only).
    if auth.uid() is null then
      raise exception 'credential not recognized' using errcode = '28000';
    end if;

    if v_subscription_user_id is distinct from auth.uid() then
      raise exception 'subscription does not belong to caller' using errcode = '42501';
    end if;

    v_show_id := public._account_ringside_show_id(p_route);
    if v_show_id is null then
      raise exception 'account is not entered in exactly one active ringside show' using errcode = '42501';
    end if;

    v_role := 'exhibitor';
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

-- SA-011: the un-throttled raw-passcode re-validation arm is removed. anon (the
-- pre-login publishable-key caller) no longer needs this RPC — a passcode caller
-- is a signed-in anonymous session (the `authenticated` role).
--
-- The prior migration (20260531175637) granted EXECUTE to `anon, authenticated`
-- EXPLICITLY. `REVOKE ... FROM public` strips only privileges held via the PUBLIC
-- pseudo-role — it does NOT remove a role-specific grant — so anon would otherwise
-- RETAIN EXECUTE. Revoke from anon EXPLICITLY to actually close the pre-login path.
revoke all on function public.upsert_ringside_session(text, text, text[], text) from public;
revoke all on function public.upsert_ringside_session(text, text, text[], text) from anon;
grant execute on function public.upsert_ringside_session(text, text, text[], text) to authenticated;

notify pgrst, 'reload schema';
