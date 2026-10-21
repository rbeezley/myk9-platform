-- MYK9-1300: armbands carry an updated_at that every UPDATE refreshes, so replication can
-- read a delta instead of re-downloading every assigned armband on every pass.
--
-- Run with psql -X -v ON_ERROR_STOP=1 after migrations. All fixtures roll back.
--
-- NOW() is the transaction timestamp, so every row written in this test carries the same
-- value. The contrast therefore comes from a backdating UPDATE: without the trigger the
-- backdated value would persist; with it the row reads NOW().
begin;

do $$
declare
  col record;
  n int;
begin
  select is_nullable, column_default into col
  from information_schema.columns
  where table_schema = 'public' and table_name = 'armbands' and column_name = 'updated_at';
  if not found then
    raise exception 'FAIL column: public.armbands.updated_at does not exist';
  end if;
  if col.is_nullable <> 'NO' or col.column_default is distinct from 'now()' then
    raise exception 'FAIL column: expected updated_at NOT NULL DEFAULT now(), found nullable=% default=%',
      col.is_nullable, col.column_default;
  end if;

  select count(*) into n
  from pg_trigger t
  join pg_proc p on p.oid = t.tgfoid
  where t.tgrelid = 'public.armbands'::regclass and not t.tgisinternal
    and p.proname in ('update_updated_at_column', 'increment_replication_version');
  if n <> 2 then
    raise exception 'FAIL wiring: expected armbands to carry the updated_at and version BEFORE UPDATE triggers, found %', n;
  end if;
  raise notice 'PASS column and wiring: updated_at NOT NULL DEFAULT now(), both BEFORE UPDATE triggers present';
end;
$$;

insert into public.clubs (id, name)
values ('00000000-0000-0000-0000-000001300001', 'MYK9-1300 Club');
insert into public.shows (id, name, organization, start_date, end_date, club_id, status)
values ('00000000-0000-0000-0000-000001300002', 'MYK9-1300 Show', 'AKC',
  current_date, current_date, '00000000-0000-0000-0000-000001300001', 'published');
insert into public.armbands (id, show_id, armband_number, is_available, assigned_at)
values ('00000000-0000-0000-0000-000001300003', '00000000-0000-0000-0000-000001300002',
  '1300', false, now());

do $$
declare
  stamped timestamptz;
begin
  select updated_at into stamped from public.armbands
  where id = '00000000-0000-0000-0000-000001300003';
  if stamped is distinct from now() then
    raise exception 'FAIL insert: expected a new armband to carry updated_at = now(), found %', stamped;
  end if;
  raise notice 'PASS insert: a new armband is stamped with now()';
end;
$$;

-- A backdating UPDATE is itself an UPDATE, so the trigger must overwrite it.
update public.armbands
set updated_at = '2000-01-01T00:00:00Z', armband_number = '1301'
where id = '00000000-0000-0000-0000-000001300003';

do $$
declare
  stamped timestamptz;
begin
  select updated_at into stamped from public.armbands
  where id = '00000000-0000-0000-0000-000001300003';
  if stamped is distinct from now() then
    raise exception 'FAIL update: expected the trigger to refresh updated_at to now(), found % (the backdated value survived)', stamped;
  end if;
  raise notice 'PASS update: every UPDATE refreshes updated_at, so the replication delta sees it';
end;
$$;

rollback;
