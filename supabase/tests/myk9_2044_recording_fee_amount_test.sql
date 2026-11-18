-- MYK9-2044: a registry recording fee rate is a positive whole-cent amount.
--
-- Behavioral test for 20261119031700_myk9_2044_registry_recording_fee_rates.sql, run only in
-- CI (scripts/qa/run-behavioral-sql-tests.sh).
--
--   A. $0.00 and a negative amount are refused with 23514 (the amount CHECK)
--   B. $0.01 and $1,000.00 are accepted; $1,000.01 is refused
--   C. the three seeded AKC rows are present
--
-- Fixtures roll back.

begin;

create function pg_temp.expect(label text, got text, want text)
returns void language plpgsql as $$
begin
  if got is distinct from want then
    raise exception 'FAIL %: expected %, got %', label, want, got;
  end if;
  raise notice 'PASS %', label;
end;
$$;

-- Runs p_sql and returns 'ok', or the SQLSTATE when it raised.
create function pg_temp.attempt(p_sql text)
returns text language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlstate;
end;
$$;

select pg_temp.expect(
  'A1 zero amount refused',
  pg_temp.attempt($q$insert into public.registry_recording_fee_rates (registry, effective_from, amount_cents)
                     values ('UKC', date '2030-01-01', 0)$q$),
  '23514'
);
select pg_temp.expect(
  'A2 negative amount refused',
  pg_temp.attempt($q$insert into public.registry_recording_fee_rates (registry, effective_from, amount_cents)
                     values ('UKC', date '2030-01-02', -1)$q$),
  '23514'
);
select pg_temp.expect(
  'B1 one cent accepted',
  pg_temp.attempt($q$insert into public.registry_recording_fee_rates (registry, effective_from, amount_cents)
                     values ('UKC', date '2030-01-03', 1)$q$),
  'ok'
);
select pg_temp.expect(
  'B2 the ceiling accepted',
  pg_temp.attempt($q$insert into public.registry_recording_fee_rates (registry, effective_from, amount_cents)
                     values ('UKC', date '2030-01-04', 100000)$q$),
  'ok'
);
select pg_temp.expect(
  'B3 above the ceiling refused',
  pg_temp.attempt($q$insert into public.registry_recording_fee_rates (registry, effective_from, amount_cents)
                     values ('UKC', date '2030-01-05', 100001)$q$),
  '23514'
);

select pg_temp.expect(
  'C seeded AKC rows',
  (select string_agg(effective_from::text || '=' || amount_cents::text, ',' order by effective_from)
     from public.registry_recording_fee_rates
    where registry = 'AKC'),
  '2025-01-01=350,2026-01-01=450,2027-01-01=550'
);

rollback;
