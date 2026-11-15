-- MYK9-2033: the Ringside presence heartbeat (upsert_ringside_session) admits a judge on a
-- per-judge access code, and still refuses a session with no access to the show.
--
--   A. anonymous per-judge passcode session on a browser whose push endpoint belongs to an
--      account (a club tablet a secretary turned push on): accepted, presence row names the
--      judge's code; the same claim with a stale generation is still refused
--   B. signed-in judge account that entered its code (no claim): accepted as 'judge' at the show
--      it judges; refused at a show it does not judge
--   C. no access: an unrelated account, an anonymous session with no claim, an account
--      presenting another account's endpoint: all refused 42501
--   D. clear_ringside_session_presence: the admitted passcode session clears its presence; an
--      unrelated account cannot
--
-- Executes the INSTALLED functions as each caller; every fixture rolls back. Runs only in CI.

begin;

-- The judge's person row exists first; handle_new_user links it to the judge's account by email
-- (it would otherwise create a second person for that account).
insert into public.people (id, first_name, last_name, email, auth_user_id) values
  ('00000000-0000-0000-0000-000000203321', 'Jill', 'Judge', 'myk9-2033-judge@example.test', NULL);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
select
  fixture.auth_id, '00000000-0000-0000-0000-000000000000', 'authenticated',
  'authenticated', fixture.email, '', now(), now(), now(), '{}', '{}',
  false, false, fixture.anon
from (values
  ('00000000-0000-0000-0000-000000203301'::uuid, 'myk9-2033-secretary@example.test'::text, false),
  ('00000000-0000-0000-0000-000000203302'::uuid, 'myk9-2033-judge@example.test'::text, false),
  ('00000000-0000-0000-0000-000000203303'::uuid, 'myk9-2033-outsider@example.test'::text, false),
  ('00000000-0000-0000-0000-000000203399'::uuid, null::text, true)
) as fixture(auth_id, email, anon);

insert into public.clubs (id, name)
values ('00000000-0000-0000-0000-000000203330', 'MYK9-2033 Club');
insert into public.shows (id, name, organization, start_date, end_date, club_id, status) values
  ('00000000-0000-0000-0000-000000203331', 'MYK9-2033 Show', 'AKC',
   current_date, current_date, '00000000-0000-0000-0000-000000203330', 'published'),
  ('00000000-0000-0000-0000-000000203332', 'MYK9-2033 Other Show', 'AKC',
   current_date, current_date, '00000000-0000-0000-0000-000000203330', 'published');
insert into public.trials (id, show_id, name, date)
values ('00000000-0000-0000-0000-000000203333', '00000000-0000-0000-0000-000000203331',
        'MYK9-2033 Trial', current_date);
insert into public.classes (id, trial_id, name, status)
values ('00000000-0000-0000-0000-000000203341', '00000000-0000-0000-0000-000000203333',
        'Ring 1 Container', 'upcoming');

-- The judge is assigned a class, which mints their per-judge code (MYK9-1950 trigger).
insert into public.judge_assignments (person_id, show_id, class_id, status, confirmed_at)
values ('00000000-0000-0000-0000-000000203321', '00000000-0000-0000-0000-000000203331',
        '00000000-0000-0000-0000-000000203341', 'confirmed', now());

do $$
begin
  if (select auth_user_id from public.people where id = '00000000-0000-0000-0000-000000203321')
     is distinct from '00000000-0000-0000-0000-000000203302'::uuid then
    raise exception 'FAIL setup: the judge''s person row is not linked to the judge''s account';
  end if;
  if not exists (
    select 1 from public.show_passcodes
     where show_id = '00000000-0000-0000-0000-000000203331'
       and person_id = '00000000-0000-0000-0000-000000203321'
  ) then
    raise exception 'FAIL setup: the judge assignment did not mint a per-judge code';
  end if;
end;
$$;

-- E1: the club tablet, push turned on earlier by the secretary's account.
-- E2: the judge's own phone. E3: an unrelated account's phone.
insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values
  ('00000000-0000-0000-0000-000000203301', 'https://push.example.test/myk9-2033-tablet', 'k1', 'a1'),
  ('00000000-0000-0000-0000-000000203302', 'https://push.example.test/myk9-2033-judge', 'k2', 'a2'),
  ('00000000-0000-0000-0000-000000203303', 'https://push.example.test/myk9-2033-outsider', 'k3', 'a3');

create temporary table myk9_2033 (step text primary key, value text) on commit drop;
grant select, insert, update on myk9_2033 to authenticated;

insert into myk9_2033
select 'judge_gen', created_at::text from public.show_passcodes
 where show_id = '00000000-0000-0000-0000-000000203331'
   and person_id = '00000000-0000-0000-0000-000000203321';

create or replace function pg_temp.as_judge_passcode(p_generation text)
returns void language sql as $$
  select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000203399', true),
         set_config('request.jwt.claims', jsonb_build_object(
           'sub', '00000000-0000-0000-0000-000000203399',
           'role', 'authenticated',
           'is_anonymous', true,
           'app_metadata', jsonb_build_object(
             'kind', 'ringside_passcode',
             'show_id', '00000000-0000-0000-0000-000000203331',
             'ringside_role', 'judge',
             'ringside_person_id', '00000000-0000-0000-0000-000000203321',
             'passcode_generation', p_generation))::text, true);
$$;
create or replace function pg_temp.as_bare_anonymous()
returns void language sql as $$
  select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000203399', true),
         set_config('request.jwt.claims', jsonb_build_object(
           'sub', '00000000-0000-0000-0000-000000203399',
           'role', 'authenticated',
           'is_anonymous', true)::text, true);
$$;
create or replace function pg_temp.as_account(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p_uid::text, true),
         set_config('request.jwt.claims',
           jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;
-- One heartbeat. Records 'ok|<show>|<role>' or 'SQLSTATE|message'.
create or replace function pg_temp.beat(p_label text, p_endpoint text, p_route text)
returns void language plpgsql as $$
declare
  v_outcome text;
  v_row record;
begin
  begin
    select * into v_row
      from public.upsert_ringside_session('', p_endpoint, array['7']::text[], p_route);
    v_outcome := 'ok|' || v_row.show_id::text || '|' || v_row.role;
  exception when others then
    v_outcome := sqlstate || '|' || sqlerrm;
  end;
  insert into myk9_2033 values (p_label, v_outcome)
  on conflict (step) do update set value = excluded.value;
end;
$$;
create or replace function pg_temp.clear(p_label text, p_endpoint text)
returns void language plpgsql as $$
declare
  v_outcome text;
begin
  begin
    perform public.clear_ringside_session_presence(
      p_endpoint, '00000000-0000-0000-0000-000000203331');
    v_outcome := 'ok';
  exception when others then
    v_outcome := sqlstate || '|' || sqlerrm;
  end;
  insert into myk9_2033 values (p_label, v_outcome)
  on conflict (step) do update set value = excluded.value;
end;
$$;
grant execute on function pg_temp.as_judge_passcode(text) to authenticated;
grant execute on function pg_temp.as_bare_anonymous() to authenticated;
grant execute on function pg_temp.as_account(uuid) to authenticated;
grant execute on function pg_temp.beat(text, text, text) to authenticated;
grant execute on function pg_temp.clear(text, text) to authenticated;

set local role authenticated;

-- A. The per-judge passcode session on the secretary's tablet.
select pg_temp.as_judge_passcode((select value from myk9_2033 where step = 'judge_gen'));
select pg_temp.beat('a_passcode_judge', 'https://push.example.test/myk9-2033-tablet',
  '/at-show/00000000-0000-0000-0000-000000203331');
select pg_temp.as_judge_passcode('2001-01-01 00:00:00+00');
select pg_temp.beat('a_stale_generation', 'https://push.example.test/myk9-2033-tablet',
  '/at-show/00000000-0000-0000-0000-000000203331');

-- B. The judge's account (entered its code while signed in: no claim).
select pg_temp.as_account('00000000-0000-0000-0000-000000203302');
select pg_temp.beat('b_account_judge', 'https://push.example.test/myk9-2033-judge',
  '/at-show/00000000-0000-0000-0000-000000203331');
select pg_temp.beat('b_account_judge_other_show', 'https://push.example.test/myk9-2033-judge',
  '/at-show/00000000-0000-0000-0000-000000203332');

-- C. No access to the show.
select pg_temp.as_account('00000000-0000-0000-0000-000000203303');
select pg_temp.beat('c_unrelated_account', 'https://push.example.test/myk9-2033-outsider',
  '/at-show/00000000-0000-0000-0000-000000203331');
select pg_temp.beat('c_account_foreign_endpoint', 'https://push.example.test/myk9-2033-tablet',
  '/at-show/00000000-0000-0000-0000-000000203331');
select pg_temp.as_bare_anonymous();
select pg_temp.beat('c_anonymous_no_claim', 'https://push.example.test/myk9-2033-tablet',
  '/at-show/00000000-0000-0000-0000-000000203331');

-- D. Clearing presence.
select pg_temp.as_account('00000000-0000-0000-0000-000000203303');
select pg_temp.clear('d_unrelated_clear', 'https://push.example.test/myk9-2033-tablet');
select pg_temp.as_judge_passcode((select value from myk9_2033 where step = 'judge_gen'));
select pg_temp.clear('d_passcode_clear', 'https://push.example.test/myk9-2033-tablet');

reset role;

do $$
declare
  v_show constant text := '00000000-0000-0000-0000-000000203331';
  v_value text;
  v_row record;
begin
  -- A
  select value into v_value from myk9_2033 where step = 'a_passcode_judge';
  if v_value is distinct from 'ok|' || v_show || '|judge' then
    raise exception 'FAIL A.1 per-judge passcode heartbeat refused: %', v_value;
  end if;
  select rs.role, rs.show_passcode_id, rs.favorited_armbands
    into v_row
    from public.ringside_sessions rs
    join public.push_subscriptions ps on ps.id = rs.subscription_id
   where ps.endpoint = 'https://push.example.test/myk9-2033-tablet'
     and rs.show_id = v_show::uuid;
  if v_row.role is distinct from 'judge'
     or v_row.show_passcode_id is distinct from (
       select sp.id from public.show_passcodes sp
        where sp.show_id = v_show::uuid
          and sp.person_id = '00000000-0000-0000-0000-000000203321') then
    raise exception 'FAIL A.2 presence row must be role judge linked to the judge''s code: % %',
      v_row.role, v_row.show_passcode_id;
  end if;
  if (select ps.user_id from public.push_subscriptions ps
       where ps.endpoint = 'https://push.example.test/myk9-2033-tablet')
     is distinct from '00000000-0000-0000-0000-000000203301'::uuid then
    raise exception 'FAIL A.3 the heartbeat must not change who owns the push subscription';
  end if;
  select value into v_value from myk9_2033 where step = 'a_stale_generation';
  if v_value is distinct from '42501|Passcode has been regenerated; re-enter a new code' then
    raise exception 'FAIL A.4 a stale per-judge claim must still be refused as regenerated: %', v_value;
  end if;
  raise notice 'PASS A.1-A.4 per-judge passcode heartbeat accepted; stale claim still refused';

  -- B
  select value into v_value from myk9_2033 where step = 'b_account_judge';
  if v_value is distinct from 'ok|' || v_show || '|judge' then
    raise exception 'FAIL B.1 assigned judge account heartbeat refused: %', v_value;
  end if;
  select value into v_value from myk9_2033 where step = 'b_account_judge_other_show';
  if v_value not like '42501|%' then
    raise exception 'FAIL B.2 judge account must be refused at a show it does not judge: %', v_value;
  end if;
  raise notice 'PASS B.1-B.2 judge account admitted only at the show it judges';

  -- C
  select value into v_value from myk9_2033 where step = 'c_unrelated_account';
  if v_value is distinct from '42501|account is not entered in exactly one active ringside show' then
    raise exception 'FAIL C.1 unrelated account must be refused: %', v_value;
  end if;
  select value into v_value from myk9_2033 where step = 'c_account_foreign_endpoint';
  if v_value is distinct from '42501|subscription does not belong to caller' then
    raise exception 'FAIL C.2 an account presenting another account''s endpoint must be refused: %', v_value;
  end if;
  select value into v_value from myk9_2033 where step = 'c_anonymous_no_claim';
  if v_value not like '42501|%' then
    raise exception 'FAIL C.3 an anonymous session with no claim must be refused: %', v_value;
  end if;
  if exists (
    select 1 from public.ringside_sessions rs
      join public.push_subscriptions ps on ps.id = rs.subscription_id
     where ps.endpoint in ('https://push.example.test/myk9-2033-outsider')
        or (rs.show_id = '00000000-0000-0000-0000-000000203332'::uuid)
  ) then
    raise exception 'FAIL C.4 a refused heartbeat must write no presence row';
  end if;
  raise notice 'PASS C.1-C.4 sessions with no access to the show are refused';

  -- D
  select value into v_value from myk9_2033 where step = 'd_unrelated_clear';
  if v_value is distinct from '42501|subscription does not belong to caller' then
    raise exception 'FAIL D.1 an unrelated account must not clear the tablet''s presence: %', v_value;
  end if;
  select value into v_value from myk9_2033 where step = 'd_passcode_clear';
  if v_value is distinct from 'ok' then
    raise exception 'FAIL D.2 the passcode session must clear its own presence: %', v_value;
  end if;
  if exists (
    select 1 from public.ringside_sessions rs
      join public.push_subscriptions ps on ps.id = rs.subscription_id
     where ps.endpoint = 'https://push.example.test/myk9-2033-tablet'
       and rs.show_id = v_show::uuid
       and rs.last_seen_at is not null
  ) then
    raise exception 'FAIL D.3 presence was not cleared';
  end if;
  raise notice 'PASS D.1-D.3 presence clearing follows the heartbeat''s admission';
end;
$$;

rollback;
