-- MYK9-126 behavioral parity for the hashable entries_select manager arm.
-- 20260730170000_hashable_entries_manager_policy.sql replaced the per-row
-- can_manage_show(entries.show_id) call with membership in
-- public.manageable_show_ids(). Row visibility must be unchanged, including
-- the definer-only edges: entries of DRAFT shows and SOFT-DELETED shows stay
-- visible to club-scoped managers even though shows_select RLS hides those
-- shows. Fixtures and claims are transaction-local and roll back.

begin;

insert into public.roles (id, name, description, is_system)
values
  ('00000000-0000-0000-0000-000000126801', 'club_admin', 'MYK9-126 fixture', true),
  ('00000000-0000-0000-0000-000000126802', 'secretary', 'MYK9-126 fixture', true)
on conflict (name) do nothing;

insert into public.clubs (id, name)
values ('00000000-0000-0000-0000-000000126001', 'MYK9-126 Test Club');

insert into public.people (id, first_name, last_name, auth_user_id)
values
  ('00000000-0000-0000-0000-000000126011', 'Club', 'Admin', '00000000-0000-0000-0000-000000126101'),
  ('00000000-0000-0000-0000-000000126012', 'Club', 'Secretary', '00000000-0000-0000-0000-000000126102'),
  ('00000000-0000-0000-0000-000000126013', 'Entry', 'Handler', '00000000-0000-0000-0000-000000126103'),
  ('00000000-0000-0000-0000-000000126014', 'Unrelated', 'User', '00000000-0000-0000-0000-000000126104');

insert into public.user_roles (
  user_id, role_id, club_id, show_id, is_active, expires_at, auth_user_id
)
select person_id, roles.id, club_id, show_id, is_active, expires_at, auth_id
from (
  values
    (
      '00000000-0000-0000-0000-000000126011'::uuid,
      '00000000-0000-0000-0000-000000126101'::uuid,
      'club_admin'::text,
      '00000000-0000-0000-0000-000000126001'::uuid,
      null::uuid,
      true,
      null::timestamptz
    ),
    (
      '00000000-0000-0000-0000-000000126012'::uuid,
      '00000000-0000-0000-0000-000000126102'::uuid,
      'secretary'::text,
      '00000000-0000-0000-0000-000000126001'::uuid,
      null::uuid,
      true,
      null::timestamptz
    )
) as fixture(person_id, auth_id, role_name, club_id, show_id, is_active, expires_at)
join public.roles on roles.name = fixture.role_name;

-- One show per definer-only visibility edge, all owned by the club.
insert into public.shows (id, name, organization, start_date, end_date, club_id, status)
values
  ('00000000-0000-0000-0000-000000126002', 'MYK9-126 Published', 'AKC',
   current_date, current_date, '00000000-0000-0000-0000-000000126001', 'published'),
  ('00000000-0000-0000-0000-000000126003', 'MYK9-126 Draft', 'AKC',
   current_date, current_date, '00000000-0000-0000-0000-000000126001', 'draft'),
  ('00000000-0000-0000-0000-000000126004', 'MYK9-126 Deleted', 'AKC',
   current_date, current_date, '00000000-0000-0000-0000-000000126001', 'published');
update public.shows
set deleted_at = now()
where id = '00000000-0000-0000-0000-000000126004';

insert into public.trials (id, show_id, name, date)
values
  ('00000000-0000-0000-0000-000000126005', '00000000-0000-0000-0000-000000126002',
   'MYK9-126 Published Trial', current_date),
  ('00000000-0000-0000-0000-000000126006', '00000000-0000-0000-0000-000000126003',
   'MYK9-126 Draft Trial', current_date),
  ('00000000-0000-0000-0000-000000126007', '00000000-0000-0000-0000-000000126004',
   'MYK9-126 Deleted Trial', current_date);

insert into public.classes (id, trial_id, name, status)
values
  ('00000000-0000-0000-0000-000000126008', '00000000-0000-0000-0000-000000126005',
   'Container Novice', 'upcoming'),
  ('00000000-0000-0000-0000-000000126009', '00000000-0000-0000-0000-000000126006',
   'Container Novice', 'upcoming'),
  ('00000000-0000-0000-0000-000000126010', '00000000-0000-0000-0000-000000126007',
   'Container Novice', 'upcoming');

insert into public.dogs (id, name, call_name, breed, owner_id)
values
  ('00000000-0000-0000-0000-000000126021', 'Handler Dog', 'Handler Dog', 'Beagle',
   '00000000-0000-0000-0000-000000126013');

insert into public.entries (
  id, dog_id, class_id, show_id, trial_id, handler_id, entry_status,
  payment_status, entry_fee
) values
  ('00000000-0000-0000-0000-000000126031', '00000000-0000-0000-0000-000000126021',
   '00000000-0000-0000-0000-000000126008', '00000000-0000-0000-0000-000000126002',
   '00000000-0000-0000-0000-000000126005', '00000000-0000-0000-0000-000000126013',
   'confirmed', 'paid', 25),
  ('00000000-0000-0000-0000-000000126032', '00000000-0000-0000-0000-000000126021',
   '00000000-0000-0000-0000-000000126009', '00000000-0000-0000-0000-000000126003',
   '00000000-0000-0000-0000-000000126006', '00000000-0000-0000-0000-000000126013',
   'confirmed', 'paid', 25),
  ('00000000-0000-0000-0000-000000126033', '00000000-0000-0000-0000-000000126021',
   '00000000-0000-0000-0000-000000126010', '00000000-0000-0000-0000-000000126004',
   '00000000-0000-0000-0000-000000126007', '00000000-0000-0000-0000-000000126013',
   'confirmed', 'paid', 25);

-- Function surface: authenticated may execute, anon must not.
do $$
begin
  if not has_function_privilege(
    'authenticated', 'public.manageable_show_ids()', 'execute'
  ) then
    raise exception 'FAIL authenticated lost execute on manageable_show_ids';
  end if;
  if has_function_privilege('anon', 'public.manageable_show_ids()', 'execute') then
    raise exception 'FAIL anon can execute manageable_show_ids';
  end if;
end;
$$;

set local role authenticated;

-- Lockstep guard: manageable_show_ids() must agree with can_manage_show(id)
-- for every fixture show and every fixture caller. If someone edits one
-- predicate without the other (e.g. a new manager role), this fails first.
do $$
declare
  auth_id uuid;
  mismatch_count integer;
begin
  foreach auth_id in array array[
    '00000000-0000-0000-0000-000000126101'::uuid,
    '00000000-0000-0000-0000-000000126102'::uuid,
    '00000000-0000-0000-0000-000000126103'::uuid,
    '00000000-0000-0000-0000-000000126104'::uuid
  ]
  loop
    perform set_config('request.jwt.claim.sub', auth_id::text, true);
    perform set_config(
      'request.jwt.claims',
      json_build_object('sub', auth_id, 'role', 'authenticated')::text,
      true
    );

    select count(*) into mismatch_count
    from (values
      ('00000000-0000-0000-0000-000000126002'::uuid),
      ('00000000-0000-0000-0000-000000126003'::uuid),
      ('00000000-0000-0000-0000-000000126004'::uuid)
    ) as fixture_show(id)
    where public.can_manage_show(fixture_show.id)
      <> (fixture_show.id in (select public.manageable_show_ids()));

    if mismatch_count <> 0 then
      raise exception
        'FAIL manageable_show_ids diverges from can_manage_show for % on % shows',
        auth_id, mismatch_count;
    end if;
  end loop;
end;
$$;

-- Club-scoped managers (club_admin and secretary) must see all three entries:
-- published, draft, and soft-deleted shows alike, exactly as the per-row
-- can_manage_show arm allowed before the rewrite.
do $$
declare
  auth_id uuid;
  row_count integer;
begin
  foreach auth_id in array array[
    '00000000-0000-0000-0000-000000126101'::uuid,
    '00000000-0000-0000-0000-000000126102'::uuid
  ]
  loop
    perform set_config('request.jwt.claim.sub', auth_id::text, true);
    perform set_config(
      'request.jwt.claims',
      json_build_object('sub', auth_id, 'role', 'authenticated')::text,
      true
    );

    select count(e.id) into row_count
    from public.entries e
    where e.id in (
      '00000000-0000-0000-0000-000000126031',
      '00000000-0000-0000-0000-000000126032',
      '00000000-0000-0000-0000-000000126033'
    );

    if row_count <> 3 then
      raise exception 'FAIL manager % sees %/3 fixture entries', auth_id, row_count;
    end if;
  end loop;
end;
$$;

-- The handler still sees all three through the own-entry arm (unchanged).
do $$
declare
  row_count integer;
begin
  perform set_config(
    'request.jwt.claim.sub', '00000000-0000-0000-0000-000000126103', true
  );
  perform set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', '00000000-0000-0000-0000-000000126103', 'role', 'authenticated'
    )::text,
    true
  );

  select count(e.id) into row_count
  from public.entries e
  where e.id in (
    '00000000-0000-0000-0000-000000126031',
    '00000000-0000-0000-0000-000000126032',
    '00000000-0000-0000-0000-000000126033'
  );

  if row_count <> 3 then
    raise exception 'FAIL handler sees %/3 own entries', row_count;
  end if;
end;
$$;

-- An unrelated authenticated user must see none of the fixture entries.
do $$
declare
  row_count integer;
begin
  perform set_config(
    'request.jwt.claim.sub', '00000000-0000-0000-0000-000000126104', true
  );
  perform set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', '00000000-0000-0000-0000-000000126104', 'role', 'authenticated'
    )::text,
    true
  );

  select count(e.id) into row_count
  from public.entries e
  where e.id in (
    '00000000-0000-0000-0000-000000126031',
    '00000000-0000-0000-0000-000000126032',
    '00000000-0000-0000-0000-000000126033'
  );

  if row_count <> 0 then
    raise exception 'FAIL unrelated user sees % fixture entries', row_count;
  end if;
end;
$$;

rollback;
