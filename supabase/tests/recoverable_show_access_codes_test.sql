-- Behavioral authorization and crypto round-trip test for recoverable show
-- access codes. Run after 20260727160000_recoverable_show_access_codes.sql.
-- All fixtures and regenerated values roll back.

begin;

insert into public.clubs (id, name)
values ('00000000-0000-0000-0000-000000000901', 'Access Code Test Club');

insert into public.people (id, first_name, last_name, auth_user_id)
values
  ('00000000-0000-0000-0000-000000000911', 'Test', 'Manager', '00000000-0000-0000-0000-000000000921'),
  ('00000000-0000-0000-0000-000000000912', 'Test', 'Judge', '00000000-0000-0000-0000-000000000922'),
  ('00000000-0000-0000-0000-000000000913', 'Test', 'Steward', '00000000-0000-0000-0000-000000000923'),
  ('00000000-0000-0000-0000-000000000914', 'Test', 'Handler', '00000000-0000-0000-0000-000000000924'),
  ('00000000-0000-0000-0000-000000000915', 'Test', 'Owner', '00000000-0000-0000-0000-000000000925'),
  ('00000000-0000-0000-0000-000000000916', 'Test', 'Coowner', '00000000-0000-0000-0000-000000000926'),
  ('00000000-0000-0000-0000-000000000917', 'Test', 'MultiRole', '00000000-0000-0000-0000-000000000927'),
  ('00000000-0000-0000-0000-000000000918', 'Test', 'Unrelated', '00000000-0000-0000-0000-000000000928');

insert into public.club_members (club_id, person_id, membership_status)
values (
  '00000000-0000-0000-0000-000000000901',
  '00000000-0000-0000-0000-000000000911',
  'active'
);

insert into public.shows (
  id, name, organization, start_date, end_date, club_id, status
) values (
  '00000000-0000-0000-0000-000000000902',
  'Recoverable Access Code Test',
  'AKC',
  current_date,
  current_date + 1,
  '00000000-0000-0000-0000-000000000901',
  'published'
);

insert into public.trials (id, show_id, name, date)
values (
  '00000000-0000-0000-0000-000000000903',
  '00000000-0000-0000-0000-000000000902',
  'Access Trial',
  current_date
);

insert into public.classes (id, trial_id, name, status)
values (
  '00000000-0000-0000-0000-000000000904',
  '00000000-0000-0000-0000-000000000903',
  'Container Novice',
  'upcoming'
);

insert into public.dogs (id, name, call_name, breed, owner_id, co_owner_id)
values
  (
    '00000000-0000-0000-0000-000000000931',
    'Handler Dog',
    'Handler Dog',
    'Beagle',
    '00000000-0000-0000-0000-000000000911',
    null
  ),
  (
    '00000000-0000-0000-0000-000000000932',
    'Owner Dog',
    'Owner Dog',
    'Beagle',
    '00000000-0000-0000-0000-000000000915',
    null
  ),
  (
    '00000000-0000-0000-0000-000000000933',
    'Coowner Dog',
    'Coowner Dog',
    'Beagle',
    '00000000-0000-0000-0000-000000000911',
    '00000000-0000-0000-0000-000000000916'
  );

insert into public.entries (
  id, dog_id, class_id, show_id, trial_id, handler_id, entry_status
) values
  (
    '00000000-0000-0000-0000-000000000941',
    '00000000-0000-0000-0000-000000000931',
    '00000000-0000-0000-0000-000000000904',
    '00000000-0000-0000-0000-000000000902',
    '00000000-0000-0000-0000-000000000903',
    '00000000-0000-0000-0000-000000000914',
    'confirmed'
  ),
  (
    '00000000-0000-0000-0000-000000000942',
    '00000000-0000-0000-0000-000000000932',
    '00000000-0000-0000-0000-000000000904',
    '00000000-0000-0000-0000-000000000902',
    '00000000-0000-0000-0000-000000000903',
    '00000000-0000-0000-0000-000000000911',
    'confirmed'
  ),
  (
    '00000000-0000-0000-0000-000000000943',
    '00000000-0000-0000-0000-000000000933',
    '00000000-0000-0000-0000-000000000904',
    '00000000-0000-0000-0000-000000000902',
    '00000000-0000-0000-0000-000000000903',
    '00000000-0000-0000-0000-000000000911',
    'confirmed'
  );

insert into public.judge_assignments (
  id, person_id, show_id, trial_id, class_id, status
) values
  (
    '00000000-0000-0000-0000-000000000951',
    '00000000-0000-0000-0000-000000000912',
    '00000000-0000-0000-0000-000000000902',
    '00000000-0000-0000-0000-000000000903',
    '00000000-0000-0000-0000-000000000904',
    'confirmed'
  ),
  (
    '00000000-0000-0000-0000-000000000952',
    '00000000-0000-0000-0000-000000000917',
    '00000000-0000-0000-0000-000000000902',
    '00000000-0000-0000-0000-000000000903',
    '00000000-0000-0000-0000-000000000904',
    'invited'
  );

insert into public.user_roles (
  user_id, role_id, club_id, show_id, is_active, auth_user_id
)
select person_id, roles.id, club_id, show_id, true, auth_id
from (
  values
    (
      '00000000-0000-0000-0000-000000000911'::uuid,
      '00000000-0000-0000-0000-000000000921'::uuid,
      'secretary'::text,
      '00000000-0000-0000-0000-000000000901'::uuid,
      null::uuid
    ),
    (
      '00000000-0000-0000-0000-000000000913'::uuid,
      '00000000-0000-0000-0000-000000000923'::uuid,
      'steward'::text,
      null::uuid,
      '00000000-0000-0000-0000-000000000902'::uuid
    ),
    (
      '00000000-0000-0000-0000-000000000917'::uuid,
      '00000000-0000-0000-0000-000000000927'::uuid,
      'steward'::text,
      '00000000-0000-0000-0000-000000000901'::uuid,
      null::uuid
    )
) as grants(person_id, auth_id, role_name, club_id, show_id)
join public.roles on roles.name = grants.role_name;

insert into public.show_passcodes (
  id, show_id, role, passcode_hash, passcode_ciphertext, created_at
) values
  (
    '00000000-0000-0000-0000-000000000961',
    '00000000-0000-0000-0000-000000000902',
    'admin',
    public._hash_passcode('a1b2c'),
    public._encrypt_show_passcode('a1b2c'),
    clock_timestamp() - interval '1 minute'
  ),
  (
    '00000000-0000-0000-0000-000000000962',
    '00000000-0000-0000-0000-000000000902',
    'judge',
    public._hash_passcode('j2c3d'),
    public._encrypt_show_passcode('j2c3d'),
    clock_timestamp() - interval '1 minute'
  ),
  (
    '00000000-0000-0000-0000-000000000963',
    '00000000-0000-0000-0000-000000000902',
    'steward',
    public._hash_passcode('s3d4e'),
    public._encrypt_show_passcode('s3d4e'),
    clock_timestamp() - interval '1 minute'
  ),
  (
    '00000000-0000-0000-0000-000000000964',
    '00000000-0000-0000-0000-000000000902',
    'exhibitor',
    public._hash_passcode('e4f5g'),
    public._encrypt_show_passcode('e4f5g'),
    clock_timestamp() - interval '1 minute'
  );

set local role authenticated;

-- Direct table and helper access stay denied.
do $$
begin
  begin
    perform 1 from public.show_passcodes;
    raise exception 'FAIL authenticated could read show_passcodes directly';
  exception when insufficient_privilege then
    raise notice 'PASS direct show_passcodes read denied';
  end;

  begin
    perform public._decrypt_show_passcode(null);
    raise exception 'FAIL authenticated could execute decrypt helper';
  exception when insufficient_privilege then
    raise notice 'PASS decrypt helper execution denied';
  end;
end
$$;

-- Managers receive all four roles.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000921', true);
do $$
declare
  visible_roles text[];
begin
  select array_agg(role order by role)
    into visible_roles
    from public.get_show_access_codes('00000000-0000-0000-0000-000000000902');
  if visible_roles is distinct from array['admin', 'exhibitor', 'judge', 'steward'] then
    raise exception 'FAIL manager roles: %', visible_roles;
  end if;
  raise notice 'PASS manager receives all four roles';
end
$$;

-- Assigned judge receives judge + exhibitor.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000922', true);
do $$
declare
  visible_roles text[];
begin
  select array_agg(role order by role)
    into visible_roles
    from public.get_show_access_codes('00000000-0000-0000-0000-000000000902');
  if visible_roles is distinct from array['exhibitor', 'judge'] then
    raise exception 'FAIL judge roles: %', visible_roles;
  end if;
  raise notice 'PASS judge receives judge and exhibitor roles';
end
$$;

-- Steward receives steward + exhibitor.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000923', true);
do $$
declare
  visible_roles text[];
begin
  select array_agg(role order by role)
    into visible_roles
    from public.get_show_access_codes('00000000-0000-0000-0000-000000000902');
  if visible_roles is distinct from array['exhibitor', 'steward'] then
    raise exception 'FAIL steward roles: %', visible_roles;
  end if;
  raise notice 'PASS steward receives steward and exhibitor roles';
end
$$;

-- Inactive and expired steward grants receive nothing.
reset role;
update public.user_roles
set is_active = false
where auth_user_id = '00000000-0000-0000-0000-000000000923';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000923', true);
do $$
declare
  visible_count integer;
begin
  select count(*)
    into visible_count
    from public.get_show_access_codes('00000000-0000-0000-0000-000000000902');
  if visible_count <> 0 then
    raise exception 'FAIL inactive steward received % rows', visible_count;
  end if;
  raise notice 'PASS inactive steward receives no codes';
end
$$;

reset role;
update public.user_roles
set is_active = true,
    expires_at = clock_timestamp() - interval '1 minute'
where auth_user_id = '00000000-0000-0000-0000-000000000923';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000923', true);
do $$
declare
  visible_count integer;
begin
  select count(*)
    into visible_count
    from public.get_show_access_codes('00000000-0000-0000-0000-000000000902');
  if visible_count <> 0 then
    raise exception 'FAIL expired steward received % rows', visible_count;
  end if;
  raise notice 'PASS expired steward receives no codes';
end
$$;

-- Multi-role callers receive the union.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000927', true);
do $$
declare
  visible_roles text[];
begin
  select array_agg(role order by role)
    into visible_roles
    from public.get_show_access_codes('00000000-0000-0000-0000-000000000902');
  if visible_roles is distinct from array['exhibitor', 'judge', 'steward'] then
    raise exception 'FAIL multi-role union: %', visible_roles;
  end if;
  raise notice 'PASS multi-role caller receives role union';
end
$$;

-- Handler, owner, and co-owner each receive exhibitor only.
do $$
declare
  auth_id uuid;
  visible_roles text[];
begin
  foreach auth_id in array array[
    '00000000-0000-0000-0000-000000000924'::uuid,
    '00000000-0000-0000-0000-000000000925'::uuid,
    '00000000-0000-0000-0000-000000000926'::uuid
  ] loop
    perform set_config('request.jwt.claim.sub', auth_id::text, true);
    select array_agg(role order by role)
      into visible_roles
      from public.get_show_access_codes('00000000-0000-0000-0000-000000000902');
    if visible_roles is distinct from array['exhibitor'] then
      raise exception 'FAIL exhibitor projection for %: %', auth_id, visible_roles;
    end if;
  end loop;
  raise notice 'PASS handler, owner, and co-owner receive exhibitor only';
end
$$;

-- A withdrawn handler with no other relationship loses exhibitor access.
reset role;
update public.entries
set entry_status = 'withdrawn'
where id = '00000000-0000-0000-0000-000000000941';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000924', true);
do $$
declare
  visible_count integer;
begin
  select count(*)
    into visible_count
    from public.get_show_access_codes('00000000-0000-0000-0000-000000000902');
  if visible_count <> 0 then
    raise exception 'FAIL withdrawn handler received % rows', visible_count;
  end if;
  raise notice 'PASS withdrawn handler receives no codes';
end
$$;

-- Unrelated account receives nothing.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000928', true);
do $$
declare
  visible_count integer;
begin
  select count(*)
    into visible_count
    from public.get_show_access_codes('00000000-0000-0000-0000-000000000902');
  if visible_count <> 0 then
    raise exception 'FAIL unrelated account received % rows', visible_count;
  end if;
  raise notice 'PASS unrelated account receives no codes';
end
$$;

-- Legacy ciphertext is reported honestly, not decrypted or invented.
reset role;
update public.show_passcodes
set passcode_ciphertext = null
where show_id = '00000000-0000-0000-0000-000000000902'
  and role = 'admin';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000921', true);
do $$
declare
  legacy_row record;
begin
  select *
    into legacy_row
    from public.get_show_access_codes('00000000-0000-0000-0000-000000000902')
   where role = 'admin';
  if legacy_row.passcode is not null or legacy_row.recoverable is distinct from false then
    raise exception 'FAIL legacy row was presented as recoverable';
  end if;
  raise notice 'PASS legacy row is reported without plaintext';
end
$$;

-- Regeneration atomically restores four decryptable rows with one generation
-- timestamp, and the getter returns exactly the regenerated values.
reset role;
create temporary table regenerated_codes (
  admin text,
  judge text,
  steward text,
  exhibitor text
) on commit drop;
grant insert, select on regenerated_codes to authenticated;
set local role authenticated;
insert into regenerated_codes
select *
from public.regenerate_show_passcodes(
  '00000000-0000-0000-0000-000000000902'
);
reset role;
do $$
declare
  regenerated record;
  visible jsonb;
  generation_count integer;
  recoverable_count integer;
begin
  select *
    into regenerated
    from regenerated_codes;

  select
    jsonb_object_agg(codes.role, codes.passcode),
    count(distinct created_at),
    count(*) filter (where passcode_ciphertext is not null)
  into visible, generation_count, recoverable_count
  from public.show_passcodes sp
  join public.get_show_access_codes('00000000-0000-0000-0000-000000000902') codes
    using (role)
  where sp.show_id = '00000000-0000-0000-0000-000000000902';

  if generation_count <> 1 or recoverable_count <> 4 then
    raise exception 'FAIL regeneration was not one complete recoverable generation';
  end if;
  if visible->>'admin' is distinct from regenerated.admin
     or visible->>'judge' is distinct from regenerated.judge
     or visible->>'steward' is distinct from regenerated.steward
     or visible->>'exhibitor' is distinct from regenerated.exhibitor then
    raise exception 'FAIL getter values did not match regenerated values';
  end if;
  raise notice 'PASS regeneration is atomic and decrypts to returned values';
end
$$;

-- Anonymous callers cannot execute the getter.
reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
do $$
begin
  begin
    perform * from public.get_show_access_codes(
      '00000000-0000-0000-0000-000000000902'
    );
    raise exception 'FAIL anon executed get_show_access_codes';
  exception when insufficient_privilege then
    raise notice 'PASS anon getter execution denied';
  end;
end
$$;

rollback;
