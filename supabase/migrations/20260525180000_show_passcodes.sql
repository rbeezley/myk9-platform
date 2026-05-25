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
create table if not exists public.show_passcodes (
  id            uuid primary key default extensions.uuid_generate_v4(),
  show_id       uuid not null references public.shows(id) on delete cascade,
  role          text not null check (role in ('admin', 'judge', 'steward', 'exhibitor')),
  passcode_hash text not null,
  created_at    timestamptz not null default now(),
  unique (show_id, role)
);

create index if not exists show_passcodes_hash_idx
  on public.show_passcodes (passcode_hash);

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

-- 7. validate_passcode(p_code text) — public RPC for the smart input.
-- Returns the matching {show_id, role} or NULL. Anonymous-callable; the
-- application layer enforces rate limiting (see plan "Security (smart
-- input)" section).
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
grant execute on function public.validate_passcode(text) to anon, authenticated;

comment on function public.validate_passcode(text) is
  'Looks up a 5-char show passcode via HMAC-SHA256 hash and returns the '
  '(show_id, role) pair or no rows. Anonymous-callable; rate-limit at the '
  'application layer.';

-- 8. Internal authorization check shared by insert + regenerate.
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

-- 9. insert_show_passcodes — called from the show-creation flow.
-- Client generates plaintexts client-side (with crypto.getRandomValues),
-- passes them as a jsonb object {admin, judge, steward, exhibitor}; this
-- RPC hashes them server-side (so the Vault pepper never leaves the DB)
-- and inserts the 4 rows atomically.
create or replace function public.insert_show_passcodes(
  p_show_id uuid,
  p_codes   jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_code text;
begin
  if p_show_id is null then
    raise exception 'p_show_id is required' using errcode = '22023';
  end if;

  if not public._can_manage_show_passcodes(p_show_id) then
    raise exception 'not authorized to manage passcodes for show %', p_show_id
      using errcode = '42501';
  end if;

  -- Validate all 4 roles are present before any insert; surface a clear
  -- error rather than letting NOT NULL violations leak.
  foreach v_role in array array['admin','judge','steward','exhibitor'] loop
    v_code := p_codes ->> v_role;
    if nullif(v_code, '') is null then
      raise exception 'p_codes is missing role %', v_role
        using errcode = '22023';
    end if;
    if length(v_code) <> 5 then
      raise exception 'p_codes.% must be exactly 5 characters', v_role
        using errcode = '22023';
    end if;
  end loop;

  foreach v_role in array array['admin','judge','steward','exhibitor'] loop
    v_code := p_codes ->> v_role;
    insert into public.show_passcodes (show_id, role, passcode_hash)
    values (p_show_id, v_role, public._hash_passcode(v_code))
    on conflict (show_id, role) do update
      set passcode_hash = excluded.passcode_hash,
          created_at    = now();
  end loop;
end
$$;

revoke all on function public.insert_show_passcodes(uuid, jsonb) from public;
grant execute on function public.insert_show_passcodes(uuid, jsonb) to authenticated;

comment on function public.insert_show_passcodes(uuid, jsonb) is
  'Hashes plaintext passcodes via HMAC-SHA256 + Vault pepper and inserts/'
  'updates the 4 rows for a show. Caller must be site_admin, club_admin, '
  'or trial_secretary for the show''s club.';

-- 10. regenerate_show_passcodes — admin/secretary "lost the codes, give
-- me new ones" path. Generates plaintexts server-side, replaces all 4
-- rows, returns the new plaintexts exactly once to the caller.
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
  v_admin     text;
  v_judge     text;
  v_steward   text;
  v_exhibitor text;
begin
  if p_show_id is null then
    raise exception 'p_show_id is required' using errcode = '22023';
  end if;

  if not public._can_manage_show_passcodes(p_show_id) then
    raise exception 'not authorized to manage passcodes for show %', p_show_id
      using errcode = '42501';
  end if;

  v_admin     := public._random_role_code('admin');
  v_judge     := public._random_role_code('judge');
  v_steward   := public._random_role_code('steward');
  v_exhibitor := public._random_role_code('exhibitor');

  insert into public.show_passcodes (show_id, role, passcode_hash) values
    (p_show_id, 'admin',     public._hash_passcode(v_admin)),
    (p_show_id, 'judge',     public._hash_passcode(v_judge)),
    (p_show_id, 'steward',   public._hash_passcode(v_steward)),
    (p_show_id, 'exhibitor', public._hash_passcode(v_exhibitor))
  on conflict (show_id, role) do update
    set passcode_hash = excluded.passcode_hash,
        created_at    = now();

  return query select v_admin, v_judge, v_steward, v_exhibitor;
end
$$;

revoke all on function public.regenerate_show_passcodes(uuid) from public;
grant execute on function public.regenerate_show_passcodes(uuid) to authenticated;

comment on function public.regenerate_show_passcodes(uuid) is
  'Generates 4 fresh random 5-char passcodes for a show server-side, '
  'replaces existing rows, and returns the plaintexts exactly once. Caller '
  'must be site_admin, club_admin, or trial_secretary for the show''s club. '
  'After this call the plaintexts cannot be recovered — only the hashes.';

commit;
