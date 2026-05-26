-- Phase 0 (Unify myK9Show + myK9Q) — show_passcodes table + HMAC-pepper RPCs.
--
-- Replaces the legacy `mobile_app_lic_key` derivation model with per-(show, role)
-- hashed random codes. Each show gets 4 independently random 5-char codes
-- (one per role: admin/judge/steward/exhibitor) generated at show creation,
-- shown to the secretary exactly once, then only HMAC-SHA256 hashes stored.
--
-- Hashing strategy: HMAC-SHA256 with a server-side pepper held in Supabase
-- Vault (secret name: passcode_pepper). HMAC is deterministic so validation
-- is an O(log N) indexed equality lookup. The pepper held outside the DB
-- means a DB-only compromise cannot crack codes via rainbow tables.
--
-- Rotation note: rotating passcode_pepper invalidates every existing hash —
-- all live codes must be regenerated via regenerate_show_passcodes() and
-- redistributed to volunteers. This is a documented operational event, not
-- a runtime concern.
--
-- See docs/plans/2026-05-17-unify-myk9show-myk9q.md "Passcode format
-- (canonical)" and "Phase 0 — Extract & share (foundation)".

begin;

-- 1. Extensions required for HMAC + CSPRNG bytes.
create extension if not exists pgcrypto with schema extensions;
create extension if not exists supabase_vault with schema vault;

-- 2. Bootstrap the passcode_pepper Vault secret if absent.
-- A 32-byte (256-bit) hex-encoded value is well beyond what HMAC-SHA256 needs.
-- The IF NOT EXISTS guard is critical: re-running the migration on a DB that
-- already has live show_passcodes rows MUST NOT generate a new pepper, since
-- that would invalidate every stored hash. Production rotation is explicit
-- via vault.update_secret(...) + regenerate_show_passcodes for every show.
do $$
begin
  if not exists (
    select 1 from vault.decrypted_secrets where name = 'passcode_pepper'
  ) then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'passcode_pepper',
      'HMAC-SHA256 pepper for show_passcodes hashing. Rotating invalidates '
        || 'all live passcodes — every show must call regenerate_show_passcodes '
        || 'after rotation and the secretary must redistribute new codes.'
    );
  end if;
end
$$;

-- 3. The table.
-- UNIQUE(passcode_hash) is critical for validate_passcode correctness: with
-- ~1.7M codes per role and thousands of shows, birthday-bound collisions
-- become likely without the constraint, and a valid code could resolve to
-- the wrong show. The generation RPCs retry on conflict via
-- _generate_unique_role_code (see helper below).
create table if not exists public.show_passcodes (
  id            uuid primary key default extensions.uuid_generate_v4(),
  show_id       uuid not null references public.shows(id) on delete cascade,
  role          text not null check (role in ('admin', 'judge', 'steward', 'exhibitor')),
  passcode_hash text not null unique,
  created_at    timestamptz not null default now(),
  unique (show_id, role)
);

-- UNIQUE constraint already creates a btree index on passcode_hash; no
-- separate index needed for lookup.
create index if not exists show_passcodes_show_id_idx
  on public.show_passcodes (show_id);

comment on table public.show_passcodes is
  '4 hashed role-based access codes per show (admin/judge/steward/exhibitor). '
  'Plaintexts only exist transiently in RPC responses to the show secretary; '
  'storage is HMAC-SHA256 with the passcode_pepper Vault secret.';

-- 4. RLS — deny all client access. Only SECURITY DEFINER RPCs read/write.
alter table public.show_passcodes enable row level security;
alter table public.show_passcodes force row level security;

-- No policies = deny-all for non-bypassing roles. Service role and the
-- table owner bypass RLS, which is the only intended write path outside
-- of the SECURITY DEFINER RPCs defined below (which run with definer
-- privileges and so also bypass).

-- Explicit REVOKE for clarity even though RLS already denies.
revoke all on public.show_passcodes from anon, authenticated;

-- 5. Internal helper: HMAC-SHA256(lower(code), pepper) → hex string.
-- Marked STABLE because the pepper does not change within a transaction;
-- this lets the optimizer cache the hash within a single statement.
create or replace function public._hash_passcode(p_code text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_pepper text;
  v_normalized text;
begin
  if p_code is null then
    return null;
  end if;

  v_normalized := lower(trim(p_code));
  if v_normalized = '' then
    return null;
  end if;

  select decrypted_secret
    into v_pepper
    from vault.decrypted_secrets
   where name = 'passcode_pepper'
   limit 1;

  if nullif(v_pepper, '') is null then
    raise exception 'passcode_pepper Vault secret is missing or empty'
      using errcode = '55000';
  end if;

  return encode(
    extensions.hmac(v_normalized::bytea, v_pepper::bytea, 'sha256'),
    'hex'
  );
end
$$;

revoke all on function public._hash_passcode(text) from public;
-- Not granted to anon/authenticated; only callable from other SECURITY
-- DEFINER functions in this migration.

-- 6. Internal helper: generate one 5-char role-prefixed code via rejection
-- sampling so the 36-char alphabet ([a-z0-9]) is uniformly distributed.
create or replace function public._random_role_code(p_role text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_alphabet constant text := 'abcdefghijklmnopqrstuvwxyz0123456789';
  v_role_letter text;
  v_code text;
  v_byte int;
  v_i int := 0;
begin
  v_role_letter := case p_role
    when 'admin'     then 'a'
    when 'judge'     then 'j'
    when 'steward'   then 's'
    when 'exhibitor' then 'e'
    else null
  end;

  if v_role_letter is null then
    raise exception 'invalid role: %', p_role using errcode = '22023';
  end if;

  v_code := v_role_letter;

  -- Rejection sampling: draw a byte, reject if ≥ 252 (the highest multiple
  -- of 36 ≤ 255), otherwise take byte % 36. Probability of acceptance per
  -- draw is 252/256 ≈ 98.4%, so 4 chars need ~4.06 draws on average.
  while v_i < 4 loop
    v_byte := get_byte(extensions.gen_random_bytes(1), 0);
    if v_byte < 252 then
      v_code := v_code || substr(v_alphabet, (v_byte % 36) + 1, 1);
      v_i := v_i + 1;
    end if;
  end loop;

  return v_code;
end
$$;

revoke all on function public._random_role_code(text) from public;

-- 7. Internal helper: generate a per-role code that does not collide with
-- any existing hashed code. Used by both insert_show_passcodes and
-- regenerate_show_passcodes. Retries up to MAX_ATTEMPTS times if a candidate
-- code's HMAC collides with an already-stored hash. With 36^4 = 1,679,616
-- codes per role, conflicts are rare until the codebase hits hundreds of
-- thousands of shows.
create or replace function public._generate_unique_role_code(p_role text)
returns table (plaintext text, hash text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_attempt int := 0;
  v_max_attempts constant int := 12;
  v_plain text;
  v_hash text;
begin
  loop
    v_attempt := v_attempt + 1;
    v_plain := public._random_role_code(p_role);
    v_hash := public._hash_passcode(v_plain);

    if not exists (
      select 1 from public.show_passcodes sp where sp.passcode_hash = v_hash
    ) then
      plaintext := v_plain;
      hash := v_hash;
      return next;
      return;
    end if;

    if v_attempt >= v_max_attempts then
      raise exception 'failed to generate a unique % passcode after % attempts '
        'over a ~1.7M-value namespace; the passcode space may be saturated',
        p_role, v_max_attempts
        using errcode = '55000';
    end if;
  end loop;
end
$$;

revoke all on function public._generate_unique_role_code(text) from public;

-- 8. validate_passcode(p_code text) — service-role-only RPC for the smart
-- input's edge function. NOT granted to anon/authenticated: a public grant
-- would let any client brute-force the ~6.7M-code namespace through
-- Supabase PostgREST, bypassing the rate-limited edge function path. The
-- Phase 1 smart-input lands on an edge function that calls this RPC with
-- the service role.
create or replace function public.validate_passcode(p_code text)
returns table (show_id uuid, role text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hash text;
begin
  v_hash := public._hash_passcode(p_code);
  if v_hash is null then
    return;
  end if;

  return query
    select sp.show_id, sp.role
      from public.show_passcodes sp
     where sp.passcode_hash = v_hash
     limit 1;
end
$$;

revoke all on function public.validate_passcode(text) from public;
-- Intentionally no grant to anon or authenticated. The only caller is the
-- rate-limited validate-passcode edge function, which authenticates with
-- the service_role JWT. BYPASSRLS on service_role does NOT bypass function
-- ACLs, so the GRANT below is mandatory — without it the edge function
-- gets "permission denied for function validate_passcode".
grant execute on function public.validate_passcode(text) to service_role;

comment on function public.validate_passcode(text) is
  'Looks up a 5-char show passcode via HMAC-SHA256 hash and returns the '
  '(show_id, role) pair or no rows. Service-role-only — must be invoked '
  'from a rate-limited edge function, never directly from a browser, or '
  'brute-force enumeration of the ~6.7M-code namespace becomes trivial.';

-- 9. Internal authorization check shared by insert + regenerate.
-- Mirrors create_show_with_children: site_admin, club_admin (for the show's
-- club), or trial_secretary (for the show's club) may generate codes.
create or replace function public._can_manage_show_passcodes(p_show_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_club_id uuid;
begin
  if auth.uid() is null then
    return false;
  end if;

  select club_id into v_club_id
    from public.shows
   where id = p_show_id;

  if v_club_id is null then
    return false;
  end if;

  return public.is_site_admin()
      or public.is_club_admin(v_club_id)
      or public.is_trial_secretary(v_club_id);
end
$$;

revoke all on function public._can_manage_show_passcodes(uuid) from public;

-- 10. insert_show_passcodes — called from the show-creation flow.
-- Generates 4 fresh random codes server-side (with retry-on-collision via
-- _generate_unique_role_code), inserts the hashed rows, and returns the
-- plaintexts to the caller. Server-side generation rather than accepting
-- client input avoids a race where the client cannot detect a UNIQUE
-- collision before submitting; the function retries internally instead.
--
-- Fails if the show already has any passcode rows — use
-- regenerate_show_passcodes to overwrite.
create or replace function public.insert_show_passcodes(p_show_id uuid)
returns table (
  admin     text,
  judge     text,
  steward   text,
  exhibitor text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin     record;
  v_judge     record;
  v_steward   record;
  v_exhibitor record;
begin
  if p_show_id is null then
    raise exception 'p_show_id is required' using errcode = '22023';
  end if;

  if not public._can_manage_show_passcodes(p_show_id) then
    raise exception 'not authorized to manage passcodes for show %', p_show_id
      using errcode = '42501';
  end if;

  if exists (
    select 1 from public.show_passcodes sp where sp.show_id = p_show_id
  ) then
    raise exception 'show % already has passcodes; use regenerate_show_passcodes', p_show_id
      using errcode = '23505';
  end if;

  v_admin     := public._generate_unique_role_code('admin');
  v_judge     := public._generate_unique_role_code('judge');
  v_steward   := public._generate_unique_role_code('steward');
  v_exhibitor := public._generate_unique_role_code('exhibitor');

  insert into public.show_passcodes (show_id, role, passcode_hash) values
    (p_show_id, 'admin',     v_admin.hash),
    (p_show_id, 'judge',     v_judge.hash),
    (p_show_id, 'steward',   v_steward.hash),
    (p_show_id, 'exhibitor', v_exhibitor.hash);

  return query
    select v_admin.plaintext, v_judge.plaintext, v_steward.plaintext, v_exhibitor.plaintext;
end
$$;

revoke all on function public.insert_show_passcodes(uuid) from public;
grant execute on function public.insert_show_passcodes(uuid) to authenticated;

comment on function public.insert_show_passcodes(uuid) is
  'Generates 4 fresh random 5-char passcodes for a show server-side, inserts '
  'their hashes, and returns the plaintexts exactly once. Fails if the show '
  'already has passcodes. Caller must be site_admin, club_admin, or '
  'trial_secretary for the show''s club.';

-- 11. regenerate_show_passcodes — admin/secretary "lost the codes, give
-- me new ones" path. Server-side generation (same _generate_unique_role_code
-- helper as insert_show_passcodes), upserts on (show_id, role), returns the
-- plaintexts exactly once.
create or replace function public.regenerate_show_passcodes(p_show_id uuid)
returns table (
  admin     text,
  judge     text,
  steward   text,
  exhibitor text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin     record;
  v_judge     record;
  v_steward   record;
  v_exhibitor record;
begin
  if p_show_id is null then
    raise exception 'p_show_id is required' using errcode = '22023';
  end if;

  if not public._can_manage_show_passcodes(p_show_id) then
    raise exception 'not authorized to manage passcodes for show %', p_show_id
      using errcode = '42501';
  end if;

  v_admin     := public._generate_unique_role_code('admin');
  v_judge     := public._generate_unique_role_code('judge');
  v_steward   := public._generate_unique_role_code('steward');
  v_exhibitor := public._generate_unique_role_code('exhibitor');

  insert into public.show_passcodes (show_id, role, passcode_hash) values
    (p_show_id, 'admin',     v_admin.hash),
    (p_show_id, 'judge',     v_judge.hash),
    (p_show_id, 'steward',   v_steward.hash),
    (p_show_id, 'exhibitor', v_exhibitor.hash)
  on conflict (show_id, role) do update
    set passcode_hash = excluded.passcode_hash,
        created_at    = now();

  return query
    select v_admin.plaintext, v_judge.plaintext, v_steward.plaintext, v_exhibitor.plaintext;
end
$$;

revoke all on function public.regenerate_show_passcodes(uuid) from public;
grant execute on function public.regenerate_show_passcodes(uuid) to authenticated;

comment on function public.regenerate_show_passcodes(uuid) is
  'Generates 4 fresh random 5-char passcodes for a show server-side, '
  'overwrites any existing rows, and returns the plaintexts exactly once. '
  'Caller must be site_admin, club_admin, or trial_secretary for the show''s '
  'club. After this call the plaintexts cannot be recovered — only the hashes.';

commit;
