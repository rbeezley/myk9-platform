-- MYK9-1514: behavioral test for trials.auto_complete_stale_classes, added by
-- 20261031051700_myk9_1514_trials_auto_complete_stale_classes.sql.
--
-- Run with psql -X -v ON_ERROR_STOP=1 against a migrated local database; the
-- fixture rolls back. A clean run prints PASS notices.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/myk9_1514_trials_auto_complete_stale_classes_test.sql

begin;

insert into public.clubs (id, name)
values ('00000000-0000-0000-0000-000001514001', 'MYK9-1514 Club');

insert into public.shows (id, name, organization, start_date, end_date, club_id, status)
values ('00000000-0000-0000-0000-000001514002', 'MYK9-1514 Show', 'AKC',
  current_date, current_date, '00000000-0000-0000-0000-000001514001', 'published');

insert into public.trials (id, show_id, name, date, trial_number)
values ('00000000-0000-0000-0000-000001514003', '00000000-0000-0000-0000-000001514002',
  'MYK9-1514 Trial', current_date, '1');

do $$
declare
  v_type text;
  v_nullable text;
  v_default text;
  v_value boolean;
  v_acl aclitem[];
begin
  select data_type, is_nullable, column_default
    into v_type, v_nullable, v_default
  from information_schema.columns
  where table_schema = 'public' and table_name = 'trials'
    and column_name = 'auto_complete_stale_classes';

  if v_type is distinct from 'boolean' then
    raise exception 'FAIL: auto_complete_stale_classes is %, expected boolean', v_type;
  end if;
  if v_nullable is distinct from 'YES' or v_default is not null then
    raise exception 'FAIL: column must be nullable with no default (NULL = enabled), got nullable=% default=%',
      v_nullable, v_default;
  end if;
  raise notice 'PASS: boolean, nullable, no default';

  select auto_complete_stale_classes into v_value
  from public.trials where id = '00000000-0000-0000-0000-000001514003';
  if v_value is not null then
    raise exception 'FAIL: a new trial must read NULL (enabled), got %', v_value;
  end if;
  raise notice 'PASS: new trial reads NULL';

  update public.trials set auto_complete_stale_classes = false
  where id = '00000000-0000-0000-0000-000001514003';
  select auto_complete_stale_classes into v_value
  from public.trials where id = '00000000-0000-0000-0000-000001514003';
  if v_value is distinct from false then
    raise exception 'FAIL: explicit false must round-trip, got %', v_value;
  end if;
  raise notice 'PASS: explicit false round-trips';

  select a.attacl into v_acl
  from pg_attribute a
  where a.attrelid = 'public.trials'::regclass and a.attname = 'auto_complete_stale_classes';
  if v_acl is not null then
    raise exception 'FAIL: the column must inherit the table ACL (attacl NULL), got %', v_acl;
  end if;
  raise notice 'PASS: no column-level ACL';

  if has_column_privilege('anon', 'public.trials', 'auto_complete_stale_classes', 'UPDATE') then
    raise exception 'FAIL: anon must not be able to update the switch';
  end if;
  if not has_column_privilege('authenticated', 'public.trials', 'auto_complete_stale_classes', 'UPDATE') then
    raise exception 'FAIL: authenticated must be able to update the switch (RLS decides the rows)';
  end if;
  raise notice 'PASS: anon cannot write, authenticated can (RLS-gated)';
end
$$;

rollback;
