-- MYK9-1886: one rule for a club admin on both save paths. Owner decision
-- (2026-11-13): THE WHOLE CLUB. A club admin granted for one show may manage
-- every show of that club, and never another club's shows.
--
--   1. is_show_club_admin / can_manage_show admit a club-wide club admin at both
--      shows of the club, a show-scoped club admin at BOTH shows of the club,
--      refuse that person at another club's show, and refuse an expired grant.
--   2. submit_show_entries decides its official with is_show_club_admin and no
--      longer with the show_id-blind is_club_admin(club).
--
-- Run with psql -X -v ON_ERROR_STOP=1 against a migrated local database;
-- every fixture rolls back.

begin;

insert into public.roles (id, name, description, is_system)
values ('00000000-0000-0000-0000-000001886801', 'club_admin', 'MYK9-1886 fixture', true)
on conflict (name) do nothing;

insert into public.clubs (id, name)
values
  ('00000000-0000-0000-0000-000001886001', 'MYK9-1886 Club A'),
  ('00000000-0000-0000-0000-000001886002', 'MYK9-1886 Club B');

insert into public.shows (id, name, organization, start_date, end_date, club_id, status)
values
  ('00000000-0000-0000-0000-000001886011', 'MYK9-1886 A1', 'AKC',
   current_date + 10, current_date + 11, '00000000-0000-0000-0000-000001886001', 'published'),
  ('00000000-0000-0000-0000-000001886012', 'MYK9-1886 A2', 'AKC',
   current_date + 20, current_date + 21, '00000000-0000-0000-0000-000001886001', 'published'),
  ('00000000-0000-0000-0000-000001886013', 'MYK9-1886 B1', 'AKC',
   current_date + 10, current_date + 11, '00000000-0000-0000-0000-000001886002', 'published');

insert into public.people (id, first_name, last_name, auth_user_id)
values
  ('00000000-0000-0000-0000-000001886051', 'Club', 'Wide', '00000000-0000-0000-0000-000001886151'),
  ('00000000-0000-0000-0000-000001886052', 'Show', 'Scoped', '00000000-0000-0000-0000-000001886152'),
  ('00000000-0000-0000-0000-000001886053', 'Expired', 'Admin', '00000000-0000-0000-0000-000001886153');

insert into public.user_roles (user_id, role_id, club_id, show_id, is_active, expires_at, auth_user_id)
select p.uid, r.id, '00000000-0000-0000-0000-000001886001', p.show_id, true, p.expires_at, p.auth_id
from public.roles r,
  (values
    ('00000000-0000-0000-0000-000001886051'::uuid, null::uuid, null::timestamptz,
     '00000000-0000-0000-0000-000001886151'::uuid),
    ('00000000-0000-0000-0000-000001886052'::uuid, '00000000-0000-0000-0000-000001886011'::uuid,
     null::timestamptz, '00000000-0000-0000-0000-000001886152'::uuid),
    ('00000000-0000-0000-0000-000001886053'::uuid, null::uuid, now() - interval '1 day',
     '00000000-0000-0000-0000-000001886153'::uuid)
  ) as p(uid, show_id, expires_at, auth_id)
where r.name = 'club_admin';

create temp table results (label text, got boolean, want boolean) on commit drop;
grant all on results to public;

SET LOCAL ROLE authenticated;

-- club-wide admin (show_id NULL)
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000001886151', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000001886151","role":"authenticated"}', true);
insert into results values
  ('club-wide: helper A1', public.is_show_club_admin('00000000-0000-0000-0000-000001886011'), true),
  ('club-wide: helper A2', public.is_show_club_admin('00000000-0000-0000-0000-000001886012'), true),
  ('club-wide: can_manage A2', public.can_manage_show('00000000-0000-0000-0000-000001886012'), true),
  ('club-wide: helper B1', public.is_show_club_admin('00000000-0000-0000-0000-000001886013'), false),
  ('club-wide: can_manage B1', public.can_manage_show('00000000-0000-0000-0000-000001886013'), false);

-- show-scoped admin (granted for A1 only) reaches the whole club on BOTH paths
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000001886152', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000001886152","role":"authenticated"}', true);
insert into results values
  ('show-scoped: helper own show A1', public.is_show_club_admin('00000000-0000-0000-0000-000001886011'), true),
  ('show-scoped: helper other show A2', public.is_show_club_admin('00000000-0000-0000-0000-000001886012'), true),
  ('show-scoped: can_manage own show A1', public.can_manage_show('00000000-0000-0000-0000-000001886011'), true),
  ('show-scoped: can_manage other show A2', public.can_manage_show('00000000-0000-0000-0000-000001886012'), true),
  ('show-scoped: helper other club B1', public.is_show_club_admin('00000000-0000-0000-0000-000001886013'), false),
  ('show-scoped: can_manage other club B1', public.can_manage_show('00000000-0000-0000-0000-000001886013'), false);

-- expired grant admits nobody
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000001886153', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000001886153","role":"authenticated"}', true);
insert into results values
  ('expired: helper A1', public.is_show_club_admin('00000000-0000-0000-0000-000001886011'), false),
  ('expired: can_manage A1', public.can_manage_show('00000000-0000-0000-0000-000001886011'), false);

RESET ROLE;

do $$
declare
  r record;
  v_src text;
begin
  for r in select * from results where got is distinct from want loop
    raise exception 'MYK9-1886 FAIL %: got %, want %', r.label, r.got, r.want;
  end loop;

  select pg_get_functiondef('public.submit_show_entries(uuid, uuid, jsonb, uuid, text, jsonb)'::regprocedure)
    into v_src;
  if v_src not like '%is_show_club_admin(p_show_id)%' then
    raise exception 'MYK9-1886 FAIL: submit_show_entries does not use is_show_club_admin(p_show_id)';
  end if;
  if v_src like '%is_club_admin(v_show_club_id)%' then
    raise exception 'MYK9-1886 FAIL: submit_show_entries still uses the show_id-blind is_club_admin(club)';
  end if;
end
$$;

rollback;
