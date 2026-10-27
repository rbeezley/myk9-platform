-- MYK9-1396: trg_entries_check_in_before_pull is the single owner of
-- entries.check_in_status_before_pull. Every case writes through a plain UPDATE
-- of check_in_status (the check-in desk / Show Map / secretary path), which is
-- the writer a per-RPC stamp missed. Run with psql -X -v ON_ERROR_STOP=1 after
-- migrations. All fixtures roll back.
begin;

insert into public.clubs (id, name)
values ('00000000-0000-0000-0000-000000139601', 'MYK9-1396 Club');
insert into public.shows (id, name, organization, start_date, end_date, club_id, status)
values ('00000000-0000-0000-0000-000000139602', 'MYK9-1396 Show', 'AKC',
  current_date, current_date, '00000000-0000-0000-0000-000000139601', 'published');
insert into public.trials (id, show_id, name, date, registry_id)
values ('00000000-0000-0000-0000-000000139603', '00000000-0000-0000-0000-000000139602',
  'MYK9-1396 Trial', current_date, 'AKC');
insert into public.classes (id, trial_id, name, status)
values ('00000000-0000-0000-0000-000000139604', '00000000-0000-0000-0000-000000139603',
  'Container Novice', 'upcoming');
insert into public.people (id, first_name, last_name)
values ('00000000-0000-0000-0000-000000139611', 'MYK9-1396', 'Owner');
insert into public.dogs (id, name, call_name, breed, owner_id)
values ('00000000-0000-0000-0000-000000139621', 'MYK9-1396 Dog', 'Dog', 'Beagle',
  '00000000-0000-0000-0000-000000139611');
insert into public.dog_registrations (dog_id, organization, registration_number, is_primary)
values ('00000000-0000-0000-0000-000000139621', 'AKC (American Kennel Club)', 'SR139621', true);

create function pg_temp.fail_if(cond boolean, msg text) returns void
language plpgsql as $$
begin
  if cond then raise exception 'FAIL %', msg; end if;
end;
$$;

create function pg_temp.prior(p_id uuid) returns text
language sql as $$
  select check_in_status_before_pull from public.entries where id = p_id;
$$;

-- INSERT with a caller-supplied value is cleared.
insert into public.entries (id, dog_id, class_id, show_id, trial_id, handler_id,
  entry_status, payment_status, entry_fee, check_in_status, check_in_status_before_pull)
values ('00000000-0000-0000-0000-000000139631', '00000000-0000-0000-0000-000000139621',
  '00000000-0000-0000-0000-000000139604', '00000000-0000-0000-0000-000000139602',
  '00000000-0000-0000-0000-000000139603', '00000000-0000-0000-0000-000000139611',
  'confirmed', 'pending', 25, 'checked-in', 'at-gate');
select pg_temp.fail_if(pg_temp.prior('00000000-0000-0000-0000-000000139631') is not null,
  'an INSERT kept a caller-supplied check_in_status_before_pull');

do $$
declare
  v_id constant uuid := '00000000-0000-0000-0000-000000139631';
begin
  -- checked-in -> pulled stores checked-in (desk-style direct UPDATE).
  update public.entries set check_in_status = 'pulled' where id = v_id;
  perform pg_temp.fail_if(pg_temp.prior(v_id) is distinct from 'checked-in',
    'checked-in -> pulled stored ' || coalesce(pg_temp.prior(v_id), 'NULL'));

  -- pulled -> pulled keeps the stored prior.
  update public.entries set check_in_status = 'pulled' where id = v_id;
  perform pg_temp.fail_if(pg_temp.prior(v_id) is distinct from 'checked-in',
    'pulled -> pulled overwrote the prior with ' || coalesce(pg_temp.prior(v_id), 'NULL'));

  -- A planted value is discarded, on either column combination.
  update public.entries
     set check_in_status = 'pulled', check_in_status_before_pull = 'conflict'
   where id = v_id;
  perform pg_temp.fail_if(pg_temp.prior(v_id) is distinct from 'checked-in',
    'a planted value alongside check_in_status survived');
  update public.entries set check_in_status_before_pull = 'conflict' where id = v_id;
  perform pg_temp.fail_if(pg_temp.prior(v_id) is distinct from 'checked-in',
    'a planted value on its own survived');

  -- An UPDATE touching neither column leaves it alone.
  update public.entries set special_requests = 'unrelated' where id = v_id;
  perform pg_temp.fail_if(pg_temp.prior(v_id) is distinct from 'checked-in',
    'an unrelated UPDATE changed the prior');

  -- pulled -> at-gate clears.
  update public.entries set check_in_status = 'at-gate' where id = v_id;
  perform pg_temp.fail_if(pg_temp.prior(v_id) is not null,
    'pulled -> at-gate left a stale prior ' || coalesce(pg_temp.prior(v_id), 'NULL'));

  -- A plant on a non-pulled row is discarded too.
  update public.entries
     set check_in_status = 'conflict', check_in_status_before_pull = 'checked-in'
   where id = v_id;
  perform pg_temp.fail_if(pg_temp.prior(v_id) is not null,
    'a non-pull move kept a planted value');

  -- no-status -> pulled stores no-status (a real value, distinct from NULL).
  update public.entries set check_in_status = 'no-status' where id = v_id;
  update public.entries set check_in_status = 'pulled' where id = v_id;
  perform pg_temp.fail_if(pg_temp.prior(v_id) is distinct from 'no-status',
    'no-status -> pulled stored ' || coalesce(pg_temp.prior(v_id), 'NULL'));

  raise notice 'PASS check_in_status_before_pull trigger stamps, keeps, clears and discards plants';
end;
$$;

rollback;
