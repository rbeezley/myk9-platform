-- MYK9-939: NULL handler metadata must not admit an unrelated authenticated actor.
-- Executes installed SECURITY DEFINER RPCs as authenticated; synthetic fixtures roll back.
begin;

insert into public.clubs (id, name)
values ('00000000-0000-0000-0000-000000939001', 'MYK9-939 Club');
insert into public.shows (id, name, organization, start_date, end_date, club_id, status)
values ('00000000-0000-0000-0000-000000939002', 'MYK9-939 Show', 'AKC',
  current_date + 10, current_date + 11, '00000000-0000-0000-0000-000000939001', 'published');
insert into public.trials (id, show_id, name, date, registry_id)
values ('00000000-0000-0000-0000-000000939003', '00000000-0000-0000-0000-000000939002',
  'MYK9-939 Trial', current_date + 10, 'AKC');
insert into public.people (id, first_name, last_name, auth_user_id)
select ('00000000-0000-0000-0000-00000093901' || n)::uuid, 'Synthetic', 'Person ' || n,
  ('00000000-0000-0000-0000-00000093910' || n)::uuid
from generate_series(1, 5) n;
-- Actors: owner 1, co-owner 2, handler 3, unrelated 4, club secretary 5.
insert into public.dogs (id, name, call_name, breed, owner_id, co_owner_id)
values ('00000000-0000-0000-0000-000000939021', 'Synthetic Dog', 'Dog', 'Beagle',
  '00000000-0000-0000-0000-000000939011', '00000000-0000-0000-0000-000000939012');
insert into public.dog_registrations (dog_id, organization, registration_number, is_primary)
values ('00000000-0000-0000-0000-000000939021', 'AKC (American Kennel Club)', 'SR939021', true);
insert into public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
select '00000000-0000-0000-0000-000000939015', id,
  '00000000-0000-0000-0000-000000939001', true, '00000000-0000-0000-0000-000000939105'
from public.roles where name = 'secretary';

do $$ begin
  if not exists (select 1 from public.user_roles where user_id = '00000000-0000-0000-0000-000000939015') then
    raise exception 'FAIL fixture: secretary role was not found';
  end if;
end $$;

-- One independent class per case; successful controls never consume a refusal target.
insert into public.classes (id, trial_id, name, status)
select ('00000000-0000-0000-0000-' || lpad((939200+n)::text,12,'0'))::uuid,
  '00000000-0000-0000-0000-000000939003', 'Synthetic Class ' || n, 'upcoming'
from generate_series(1, 8) n;
insert into public.entries (id, dog_id, class_id, show_id, trial_id, handler_id,
  entry_status, payment_status, entry_fee, check_in_status, jump_height)
select ('00000000-0000-0000-0000-' || lpad((939300+n)::text,12,'0'))::uuid,
  '00000000-0000-0000-0000-000000939021',
  ('00000000-0000-0000-0000-' || lpad((939200+n)::text,12,'0'))::uuid,
  '00000000-0000-0000-0000-000000939002', '00000000-0000-0000-0000-000000939003',
  '00000000-0000-0000-0000-000000939013', 'confirmed', 'paid', 25, 'no-status', '12'
from generate_series(1, 8) n;
-- Establish NULL explicitly after INSERT defaults/triggers, and verify the precondition.
update public.entries set handler_id = null where id = '00000000-0000-0000-0000-000000939301';
do $$ begin
  if not exists (select 1 from public.entries
    where id = '00000000-0000-0000-0000-000000939301' and handler_id is null) then
    raise exception 'FAIL fixture: handler is not NULL';
  end if;
end $$;

create function pg_temp.assert_entry_actor(
  label text, caller text, target uuid, act text, expected_state text default null
) returns void language plpgsql as $$
declare
  before_entry jsonb;
  before_history jsonb;
  after_entry jsonb;
  after_history jsonb;
  actual_state text;
  actual_error text;
  result_version integer;
begin
  select to_jsonb(e) into before_entry from public.entries e where id = target;
  select coalesce(jsonb_agg(to_jsonb(h) order by h.id), '[]'::jsonb) into before_history
    from public.entry_status_history h where entry_id = target;
  perform set_config('request.jwt.claim.sub', caller, true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub',caller,'role','authenticated')::text,true);
  perform set_config('role','authenticated',true);
  begin
    if act = 'height' then
      result_version := public.update_own_entry_jump_height(target,'16',null);
    else
      result_version := public.withdraw_own_entry(target,
        jsonb_build_object('entry_status',case act when 'pull' then 'scratched' else 'withdrawn' end),
        null,act,case act when 'withdraw' then 'judge_change' else null end);
    end if;
  exception when others then
    actual_state := sqlstate;
    actual_error := sqlerrm;
  end;
  reset role;
  select to_jsonb(e) into after_entry from public.entries e where id = target;
  select coalesce(jsonb_agg(to_jsonb(h) order by h.id), '[]'::jsonb) into after_history
    from public.entry_status_history h where entry_id = target;
  if expected_state is not null then
    if actual_state is distinct from expected_state then
      raise exception 'FAIL %: expected SQLSTATE %, got %: %',label,expected_state,actual_state,actual_error;
    end if;
    if after_entry is distinct from before_entry or after_history is distinct from before_history then
      raise exception 'FAIL %: refusal changed entry/version/history/money',label;
    end if;
  else
    if actual_state is not null or result_version is null then
      raise exception 'FAIL %: legitimate actor refused %: %',label,actual_state,actual_error;
    end if;
    if act = 'height' then
      if after_entry->>'jump_height' is distinct from '16' then
        raise exception 'FAIL %: height was not saved',label;
      end if;
    elsif after_entry->>'entry_status' is distinct from
      (case act when 'pull' then 'scratched' else 'withdrawn' end) then
      raise exception 'FAIL %: removal status was not saved',label;
    end if;
    if after_entry->'entry_fee' is distinct from before_entry->'entry_fee'
      or after_entry->'payment_status' is distinct from before_entry->'payment_status' then
      raise exception 'FAIL %: act changed money columns',label;
    end if;
  end if;
  raise notice 'PASS %',label;
end $$;

-- Critical red cases: NULL ownership must NEVER be treated as authorization.
select pg_temp.assert_entry_actor('unrelated NULL-handler ' || act,
  '00000000-0000-0000-0000-000000939104',
  '00000000-0000-0000-0000-000000939301',act,'42501')
from unnest(array['pull','withdraw','height']) act;
select pg_temp.assert_entry_actor('unrelated non-NULL handler ' || act,
  '00000000-0000-0000-0000-000000939104',
  '00000000-0000-0000-0000-000000939302',act,'42501')
from unnest(array['pull','withdraw','height']) act;
select pg_temp.assert_entry_actor('no person row ' || act,
  '00000000-0000-0000-0000-000000939199',
  '00000000-0000-0000-0000-000000939301',act,'42501')
from unnest(array['pull','withdraw','height']) act;

-- Height does not consume eligibility for the following removal.
select pg_temp.assert_entry_actor('owner NULL-handler height',
  '00000000-0000-0000-0000-000000939101','00000000-0000-0000-0000-000000939301','height');
select pg_temp.assert_entry_actor('owner NULL-handler pull',
  '00000000-0000-0000-0000-000000939101','00000000-0000-0000-0000-000000939301','pull');
select pg_temp.assert_entry_actor('co-owner height',
  '00000000-0000-0000-0000-000000939102','00000000-0000-0000-0000-000000939303','height');
select pg_temp.assert_entry_actor('co-owner withdraw',
  '00000000-0000-0000-0000-000000939102','00000000-0000-0000-0000-000000939303','withdraw');
select pg_temp.assert_entry_actor('handler height',
  '00000000-0000-0000-0000-000000939103','00000000-0000-0000-0000-000000939304','height');
select pg_temp.assert_entry_actor('handler pull',
  '00000000-0000-0000-0000-000000939103','00000000-0000-0000-0000-000000939304','pull');
select pg_temp.assert_entry_actor('manager height',
  '00000000-0000-0000-0000-000000939105','00000000-0000-0000-0000-000000939305','height');
select pg_temp.assert_entry_actor('manager withdraw',
  '00000000-0000-0000-0000-000000939105','00000000-0000-0000-0000-000000939305','withdraw');

rollback;
