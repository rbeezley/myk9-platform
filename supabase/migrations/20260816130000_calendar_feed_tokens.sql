-- =============================================================================
-- Migration 20260816130000: calendar feed subscription tokens (plan L5).
--
-- A webcal:// feed is fetched by Google's and Apple's servers, not by the
-- exhibitor's browser: no cookie, no Authorization header, no session. The URL
-- IS the credential. That shapes every decision here:
--
--   * 32 random bytes, hex — same generator as show passcodes
--     (20260525180000). Guessing one is not a practical attack.
--   * Revocable: revoked_at set means the feed 404s from that moment. An
--     exhibitor who shared a link by accident has a way out.
--   * Scoped to (user, show). A leaked token exposes ONE show's run times
--     for ONE exhibitor, never an account.
--   * The feed itself exposes schedule only — class, ring, times. Never
--     payment, entry status, or scores. That is enforced in the edge
--     function's query, and the plan's L5 section states it as a rule.
--
-- The token is NOT readable by anon: only the owning authenticated user may
-- select their own row (to display/copy the URL). The edge function reads it
-- with the service-role key.
-- =============================================================================

begin;

create table if not exists public.calendar_feed_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  show_id uuid not null references public.shows(id) on delete cascade,
  -- 64 hex chars = 32 bytes of entropy.
  token text not null unique,
  created_at timestamptz not null default now(),
  last_fetched_at timestamptz,
  revoked_at timestamptz,
  -- One live token per (user, show); rotating revokes and re-issues.
  constraint calendar_feed_tokens_user_show_key unique (user_id, show_id)
);

comment on table public.calendar_feed_tokens is
  'Per-exhibitor, per-show webcal subscription tokens. The URL is the credential — see migration header before widening any grant.';
comment on column public.calendar_feed_tokens.revoked_at is
  'Set to disable a leaked or rotated feed URL; the edge function treats a revoked token as not found.';
comment on column public.calendar_feed_tokens.last_fetched_at is
  'Updated by the feed function. Also the signal for whether anyone actually subscribed, which decides if this feature earns its keep.';

-- No separate (user_id) index: the UNIQUE (user_id, show_id) constraint's
-- backing btree already serves user_id lookups as its leftmost prefix, so a
-- second index would only cost write maintenance.

-- ---------------------------------------------------------------------------
-- Grants. authenticated gets SELECT ONLY — enough to display its own subscribe
-- URL, and nothing more. All writes go through the SECURITY DEFINER RPCs below
-- (the show_passcodes model, 20260525180000).
--
-- Granting authenticated INSERT/UPDATE here would reopen four holes, even with
-- an owner-scoped policy, because a WITH CHECK on user_id constrains WHO the
-- row belongs to and not WHAT is in it:
--   1. The exhibitor could choose their own low-entropy token, defeating the
--      32-byte guarantee this whole design rests on.
--   2. `token` is UNIQUE table-wide, so writing candidate values and reading
--      the 23505 violation turns the table into an existence oracle for OTHER
--      users' tokens. (SELECT cannot do this: RLS returns no row rather than
--      an error.)
--   3. `revoked_at` could be set back to null, undoing a revocation the
--      exhibitor performed after leaking a URL.
--   4. `show_id` could be repointed, aiming an already-shared URL at a
--      different show.
--
-- anon gets NOTHING. Per CLAUDE.md, omitting a grant is not enough — ALTER
-- DEFAULT PRIVILEGES in this schema hands anon full CRUD on new tables unless
-- revoked explicitly.
-- ---------------------------------------------------------------------------
grant select on public.calendar_feed_tokens to authenticated;
grant select, insert, update, delete on public.calendar_feed_tokens to service_role;
revoke all on public.calendar_feed_tokens from anon;

alter table public.calendar_feed_tokens enable row level security;
alter table public.calendar_feed_tokens force row level security;

-- Read-only, owner-scoped. This governs the CLIENT path (showing an exhibitor
-- their own subscribe URL). The edge function and the RPCs bypass RLS via
-- service_role / definer privileges, which is the only write path.
drop policy if exists calendar_feed_tokens_owner_access on public.calendar_feed_tokens;
create policy calendar_feed_tokens_owner_read
  on public.calendar_feed_tokens
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Issue-or-rotate. SECURITY DEFINER so the token value is generated server
-- side and never chosen by the caller; scoped to the caller's own uid.
-- ---------------------------------------------------------------------------
create or replace function public.issue_calendar_feed_token(p_show_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_token text;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if not exists (select 1 from public.shows s where s.id = p_show_id and s.deleted_at is null) then
    raise exception 'show not found' using errcode = 'P0002';
  end if;

  -- Deliberately NOT gated on "caller has an entry in this show". The feed
  -- itself is scoped to the caller's own entries, so a token for a show they
  -- are not in returns an empty calendar rather than anyone else's schedule.
  -- An entry check here would instead break legitimate cases — subscribing
  -- before the draw assigns classes, or a handler whose link lands later —
  -- which is a real failure in exchange for no security gain.

  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.calendar_feed_tokens (user_id, show_id, token)
  values (v_user_id, p_show_id, v_token)
  on conflict (user_id, show_id) do update
    -- Rotating replaces the secret AND clears any prior revocation.
    set token = excluded.token,
        created_at = now(),
        revoked_at = null;

  return v_token;
end;
$$;

comment on function public.issue_calendar_feed_token(uuid) is
  'Issues or rotates the caller''s webcal token for one show. Rotation invalidates the previous URL.';

create or replace function public.revoke_calendar_feed_token(p_show_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  update public.calendar_feed_tokens
  set revoked_at = now()
  where user_id = v_user_id
    and show_id = p_show_id
    and revoked_at is null;

  return found;
end;
$$;

comment on function public.revoke_calendar_feed_token(uuid) is
  'Disables the caller''s webcal URL for one show. Idempotent: returns false when nothing was live.';

-- Explicit EXECUTE decisions (20260728120000 grant-regrowth guard). Both are
-- caller-scoped via auth.uid(), so authenticated may run them; anon may not.
revoke execute on function public.issue_calendar_feed_token(uuid) from public, anon;
grant execute on function public.issue_calendar_feed_token(uuid) to authenticated;
revoke execute on function public.revoke_calendar_feed_token(uuid) from public, anon;
grant execute on function public.revoke_calendar_feed_token(uuid) to authenticated;

commit;
