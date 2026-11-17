-- MYK9-2120: classes.time_limit_set_at.
--
-- Sections:
--   A. an insert with no limit leaves it NULL; an insert with a limit stamps it
--   B. an unrelated edit, and a write of the same limit, do not move it
--   C. a client write to the column itself is pinned to the old value
--   D. changing any one of the three limit columns stamps now()
--   E. authenticated can read the column; anon cannot
--
-- The trigger stamps now(), which is constant inside one transaction, so the stamp is first
-- backdated with the trigger disabled to tell "moved" from "kept". Fixtures roll back.

begin;

insert into public.clubs (id, name) values
  ('00000000-0000-0000-0000-000002120020', 'MYK9-2120 Club');
insert into public.shows (id, name, organization, start_date, end_date, club_id, status) values
  ('00000000-0000-0000-0000-000002120021', 'MYK9-2120 Show', 'AKC', current_date, current_date,
   '00000000-0000-0000-0000-000002120020', 'published');
insert into public.trials (id, show_id, name, date, registry_id) values
  ('00000000-0000-0000-0000-000002120022', '00000000-0000-0000-0000-000002120021',
   'MYK9-2120 Trial', current_date, 'AKC');

-- A
insert into public.classes (id, trial_id, name, status, element, level, section) values
  ('00000000-0000-0000-0000-000002120023', '00000000-0000-0000-0000-000002120022',
   'Interior Novice A', 'upcoming', 'Interior', 'Novice', 'A');
insert into public.classes (id, trial_id, name, status, element, level, section, time_limit_seconds) values
  ('00000000-0000-0000-0000-000002120024', '00000000-0000-0000-0000-000002120022',
   'Interior Novice B', 'upcoming', 'Interior', 'Novice', 'B', 120);

do $$
begin
  if (select time_limit_set_at from public.classes where id = '00000000-0000-0000-0000-000002120023') is not null then
    raise exception 'FAIL A an insert with no limit was stamped';
  end if;
  raise notice 'PASS A an insert with no limit leaves it NULL';
  if (select time_limit_set_at from public.classes where id = '00000000-0000-0000-0000-000002120024') is distinct from now() then
    raise exception 'FAIL A an insert with a limit was not stamped now()';
  end if;
  raise notice 'PASS A an insert with a limit is stamped';
end $$;

-- Backdate class 24 (trigger off so the backdate itself is not pinned).
alter table public.classes disable trigger trg_classes_stamp_time_limit_set_at;
update public.classes set time_limit_set_at = '2026-01-01T12:00:00Z'
 where id = '00000000-0000-0000-0000-000002120024';
alter table public.classes enable trigger trg_classes_stamp_time_limit_set_at;

-- B
update public.classes set name = 'Interior Novice B renamed', description = 'x'
 where id = '00000000-0000-0000-0000-000002120024';
update public.classes set time_limit_seconds = 120
 where id = '00000000-0000-0000-0000-000002120024';
do $$
begin
  if (select time_limit_set_at from public.classes where id = '00000000-0000-0000-0000-000002120024')
     is distinct from '2026-01-01T12:00:00Z'::timestamptz then
    raise exception 'FAIL B an unrelated edit or an unchanged limit moved the stamp';
  end if;
  raise notice 'PASS B an unrelated edit and a same-value limit write keep the stamp';
end $$;

-- C
update public.classes set time_limit_set_at = '2030-01-01T00:00:00Z'
 where id = '00000000-0000-0000-0000-000002120024';
update public.classes set time_limit_set_at = now(), time_limit_seconds = 120
 where id = '00000000-0000-0000-0000-000002120024';
do $$
begin
  if (select time_limit_set_at from public.classes where id = '00000000-0000-0000-0000-000002120024')
     is distinct from '2026-01-01T12:00:00Z'::timestamptz then
    raise exception 'FAIL C a client write to time_limit_set_at was not pinned';
  end if;
  raise notice 'PASS C a client write to the column is pinned';
end $$;

-- D: each of the three columns, one at a time (backdate between)
do $$
declare
  col text;
  v timestamptz;
begin
  foreach col in array array['time_limit_seconds', 'time_limit_area2_seconds', 'time_limit_area3_seconds'] loop
    execute 'alter table public.classes disable trigger trg_classes_stamp_time_limit_set_at';
    update public.classes set time_limit_set_at = '2026-01-01T12:00:00Z'
     where id = '00000000-0000-0000-0000-000002120024';
    execute 'alter table public.classes enable trigger trg_classes_stamp_time_limit_set_at';
    execute format('update public.classes set %I = 190 where id = %L', col,
                   '00000000-0000-0000-0000-000002120024');
    select time_limit_set_at into v from public.classes
     where id = '00000000-0000-0000-0000-000002120024';
    if v is distinct from now() then
      raise exception 'FAIL D changing % did not stamp (got %)', col, v;
    end if;
    raise notice 'PASS D changing % stamps now()', col;
  end loop;
  -- clearing a limit is a change too
  execute 'alter table public.classes disable trigger trg_classes_stamp_time_limit_set_at';
  update public.classes set time_limit_set_at = '2026-01-01T12:00:00Z'
   where id = '00000000-0000-0000-0000-000002120024';
  execute 'alter table public.classes enable trigger trg_classes_stamp_time_limit_set_at';
  update public.classes set time_limit_area3_seconds = null
   where id = '00000000-0000-0000-0000-000002120024';
  if (select time_limit_set_at from public.classes where id = '00000000-0000-0000-0000-000002120024') is distinct from now() then
    raise exception 'FAIL D clearing a limit did not stamp';
  end if;
  raise notice 'PASS D clearing a limit stamps now()';
end $$;

-- E: column ACLs, read from pg_attribute.attacl
do $$
declare
  acl text;
begin
  select attacl::text into acl from pg_attribute
   where attrelid = 'public.classes'::regclass and attname = 'time_limit_set_at';
  if acl is null or acl not like '%authenticated=r/%' then
    raise exception 'FAIL E authenticated lacks SELECT on time_limit_set_at (acl %)', acl;
  end if;
  if acl like '%anon=%' then
    raise exception 'FAIL E anon was granted time_limit_set_at (acl %)', acl;
  end if;
  raise notice 'PASS E authenticated reads the column, anon does not';
end $$;

rollback;
