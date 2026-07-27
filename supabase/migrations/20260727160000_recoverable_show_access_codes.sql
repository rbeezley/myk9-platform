-- Persist show access codes in recoverable encrypted form and expose only the
-- role projection authorized for the current account.
--
-- Existing rows remain valid but have NULL ciphertext because their plaintext
-- was intentionally discarded. A manager must regenerate those shows once;
-- every new/regenerated set can then be revisited without another reset.

begin;

alter table public.show_passcodes
  add column if not exists passcode_ciphertext bytea;

comment on column public.show_passcodes.passcode_ciphertext is
  'PGP-symmetrically encrypted role passcode. Decrypted only by the '
  'audience-scoped get_show_access_codes SECURITY DEFINER RPC.';

-- Derive a dedicated encryption key from the existing Vault pepper rather than
-- reusing the raw HMAC key for two cryptographic purposes.
create or replace function public._show_passcode_encryption_key()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_pepper text;
begin
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
    extensions.hmac(
      'show-access-code-encryption:v1'::bytea,
      v_pepper::bytea,
      'sha256'
    ),
    'hex'
  );
end
$$;

revoke all on function public._show_passcode_encryption_key()
  from public, anon, authenticated;

create or replace function public._encrypt_show_passcode(p_code text)
returns bytea
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_normalized text;
begin
  v_normalized := lower(trim(p_code));
  if nullif(v_normalized, '') is null then
    return null;
  end if;

  return extensions.pgp_sym_encrypt(
    v_normalized,
    public._show_passcode_encryption_key(),
    'cipher-algo=aes256,compress-algo=0'
  );
end
$$;

revoke all on function public._encrypt_show_passcode(text)
  from public, anon, authenticated;

create or replace function public._decrypt_show_passcode(p_ciphertext bytea)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_ciphertext is null then
    return null;
  end if;

  return extensions.pgp_sym_decrypt(
    p_ciphertext,
    public._show_passcode_encryption_key()
  );
end
$$;

revoke all on function public._decrypt_show_passcode(bytea)
  from public, anon, authenticated;

-- New-show path: keep hash validation unchanged while retaining an encrypted
-- copy for later authorized display.
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

  insert into public.show_passcodes (
    show_id,
    role,
    passcode_hash,
    passcode_ciphertext
  ) values
    (
      p_show_id,
      'admin',
      v_admin.hash,
      public._encrypt_show_passcode(v_admin.plaintext)
    ),
    (
      p_show_id,
      'judge',
      v_judge.hash,
      public._encrypt_show_passcode(v_judge.plaintext)
    ),
    (
      p_show_id,
      'steward',
      v_steward.hash,
      public._encrypt_show_passcode(v_steward.plaintext)
    ),
    (
      p_show_id,
      'exhibitor',
      v_exhibitor.hash,
      public._encrypt_show_passcode(v_exhibitor.plaintext)
    );

  return query
    select v_admin.plaintext, v_judge.plaintext, v_steward.plaintext, v_exhibitor.plaintext;
end
$$;

revoke all on function public.insert_show_passcodes(uuid) from public;
grant execute on function public.insert_show_passcodes(uuid) to authenticated;

-- Reset path: the single upsert statement replaces every hash/ciphertext pair
-- atomically and bumps created_at in place so stale ringside claims are revoked.
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

  insert into public.show_passcodes (
    show_id,
    role,
    passcode_hash,
    passcode_ciphertext
  ) values
    (
      p_show_id,
      'admin',
      v_admin.hash,
      public._encrypt_show_passcode(v_admin.plaintext)
    ),
    (
      p_show_id,
      'judge',
      v_judge.hash,
      public._encrypt_show_passcode(v_judge.plaintext)
    ),
    (
      p_show_id,
      'steward',
      v_steward.hash,
      public._encrypt_show_passcode(v_steward.plaintext)
    ),
    (
      p_show_id,
      'exhibitor',
      v_exhibitor.hash,
      public._encrypt_show_passcode(v_exhibitor.plaintext)
    )
  on conflict (show_id, role) do update
    set passcode_hash = excluded.passcode_hash,
        passcode_ciphertext = excluded.passcode_ciphertext,
        created_at = now();

  return query
    select v_admin.plaintext, v_judge.plaintext, v_steward.plaintext, v_exhibitor.plaintext;
end
$$;

revoke all on function public.regenerate_show_passcodes(uuid) from public;
grant execute on function public.regenerate_show_passcodes(uuid) to authenticated;

-- Return the union of codes implied by the caller's account relationships.
-- The browser never supplies a role and cannot choose a more privileged view.
create or replace function public.get_show_access_codes(p_show_id uuid)
returns table (
  role        text,
  passcode    text,
  recoverable boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_club_id uuid;
  v_allowed_roles text[] := array[]::text[];
begin
  if p_show_id is null or auth.uid() is null then
    return;
  end if;

  select s.club_id
    into v_club_id
    from public.shows s
   where s.id = p_show_id
     and s.deleted_at is null;

  if v_club_id is null then
    return;
  end if;

  if public._can_manage_show_passcodes(p_show_id) then
    v_allowed_roles := array['admin', 'judge', 'steward', 'exhibitor'];
  else
    if exists (
      select 1
        from public.judge_assignments ja
        join public.people p on p.id = ja.person_id
       where ja.show_id = p_show_id
         and p.auth_user_id = auth.uid()
         and p.deleted_at is null
         and ja.status in ('confirmed', 'invited')
    ) then
      v_allowed_roles := array_append(v_allowed_roles, 'judge');
      v_allowed_roles := array_append(v_allowed_roles, 'exhibitor');
    end if;

    if exists (
      select 1
        from public.user_roles ur
        join public.roles r on r.id = ur.role_id
       where ur.auth_user_id = auth.uid()
         and r.name = 'steward'
         and ur.is_active = true
         and (ur.expires_at is null or ur.expires_at > now())
         and (
           ur.show_id = p_show_id
           or (ur.show_id is null and ur.club_id = v_club_id)
         )
    ) then
      v_allowed_roles := array_append(v_allowed_roles, 'steward');
      v_allowed_roles := array_append(v_allowed_roles, 'exhibitor');
    end if;

    if exists (
      select 1
        from public.entries e
        left join public.dogs d on d.id = e.dog_id
        join public.people p on p.auth_user_id = auth.uid()
       where e.show_id = p_show_id
         and e.deleted_at is null
         and p.deleted_at is null
         and coalesce(e.check_in_status, '') <> 'pulled'
         and e.entry_status in (
           'no-status',
           'draft',
           'submitted',
           'pending',
           'paid',
           'confirmed',
           'accepted',
           'scheduled',
           'pending-payment',
           'waitlisted',
           'checked-in',
           'at-gate',
           'in-ring',
           'competing',
           'scratch-requested',
           'scratch_requested',
           'move-up-requested',
           'move_up_requested'
         )
         and (
           e.handler_id = p.id
           or d.owner_id = p.id
           or d.co_owner_id = p.id
         )
    ) then
      v_allowed_roles := array_append(v_allowed_roles, 'exhibitor');
    end if;
  end if;

  if coalesce(array_length(v_allowed_roles, 1), 0) = 0 then
    return;
  end if;

  return query
    select
      sp.role,
      case
        when sp.passcode_ciphertext is null then null
        else public._decrypt_show_passcode(sp.passcode_ciphertext)
      end as passcode,
      sp.passcode_ciphertext is not null as recoverable
    from public.show_passcodes sp
    where sp.show_id = p_show_id
      and sp.role = any(v_allowed_roles)
    order by case sp.role
      when 'admin' then 1
      when 'judge' then 2
      when 'steward' then 3
      when 'exhibitor' then 4
      else 5
    end;
end
$$;

revoke all on function public.get_show_access_codes(uuid) from public, anon;
grant execute on function public.get_show_access_codes(uuid) to authenticated;

comment on function public.get_show_access_codes(uuid) is
  'Returns only the encrypted show access codes authorized by the current '
  'account: managers get all four; assigned judges get judge+exhibitor; active '
  'stewards get steward+exhibitor; active exhibitors get exhibitor.';

notify pgrst, 'reload schema';

commit;
