-- MYK9-490: one sanctioning registry per show.
--
-- The rule (Richard, 2026-09-14): a show may not carry trials from different sanctioning
-- organizations. Several SPORTS under one organization are fine — an AKC show running AKC
-- Scent Work alongside AKC Obedience is normal. A cross-registry cluster is two shows.
--
-- Enforced by `trg_enforce_show_registry_on_trial` (20260915163500), which compares each
-- written trial's registry_id against `public.derive_registry_id(shows.organization)` — the
-- projection `sync_trial_registry_from_show` (20260701120000) already established.
--
-- Run with psql -X -v ON_ERROR_STOP=1 after migrations. All fixtures roll back.
--
-- WHY THESE ASSERTIONS ARE ON THE RAISE AND NOT ON ROW STATE
-- Everything here lives in ONE transaction, so now() never advances and the BEFORE UPDATE
-- triggers on `trials` (updated_at, version) rewrite fixture values on every write. A
-- timestamp or version contrast would be unobservable. What IS observable is whether the
-- write raised, and with which SQLSTATE — which is exactly the contract the show-creation
-- wizard consumes.
begin;

-- ---------------------------------------------------------------------------
-- Wiring: the guard must actually be attached, and attached to the right columns.
-- ---------------------------------------------------------------------------
do $$
declare
  v_timing text;
  v_columns text;
begin
  select case when t.tgtype & 2 = 2 then 'BEFORE' else 'AFTER' end,
         coalesce((
           select string_agg(a.attname, ',' order by a.attname)
           from unnest(t.tgattr::int2[]) AS col(attnum)
           join pg_attribute a on a.attrelid = t.tgrelid and a.attnum = col.attnum
         ), '(none)')
    into v_timing, v_columns
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace ns on ns.oid = c.relnamespace
  join pg_proc p on p.oid = t.tgfoid
  where ns.nspname = 'public'
    and c.relname = 'trials'
    and not t.tgisinternal
    and p.proname = 'enforce_show_registry_on_trial';

  if v_timing is null then
    raise exception 'FAIL wiring: no trigger on public.trials runs enforce_show_registry_on_trial()';
  end if;
  if v_timing <> 'BEFORE' then
    raise exception 'FAIL wiring: guard must be BEFORE so the bad row never lands, found %', v_timing;
  end if;
  -- Column scope is the cheap half of the guard: without it every status/date write pays for
  -- a shows lookup. With the WRONG columns the guard simply never fires on an UPDATE.
  if v_columns <> 'registry_id,show_id' then
    raise exception 'FAIL wiring: expected UPDATE OF registry_id,show_id; found %', v_columns;
  end if;
  raise notice 'PASS wiring: BEFORE INSERT OR UPDATE OF registry_id,show_id on public.trials';
end;
$$;

-- ---------------------------------------------------------------------------
-- The derivation both triggers share.
-- ---------------------------------------------------------------------------
do $$
begin
  if public.derive_registry_id('AKC') <> 'AKC' then raise exception 'FAIL derive: AKC'; end if;
  if public.derive_registry_id('UKC') <> 'UKC' then raise exception 'FAIL derive: UKC'; end if;
  if public.derive_registry_id('ASCA') <> 'ASCA' then raise exception 'FAIL derive: ASCA'; end if;
  -- btrim mirrors the client deriveRegistryId()'s .trim(); without it ' UKC ' would fall to AKC
  -- and the authoritative sync trigger would overwrite what the client wrote as UKC.
  if public.derive_registry_id('  UKC  ') <> 'UKC' then raise exception 'FAIL derive: padded UKC'; end if;
  -- Case-sensitive, matching the client: 'ukc' is not a configured registry.
  if public.derive_registry_id('ukc') <> 'AKC' then raise exception 'FAIL derive: lowercase falls back'; end if;
  if public.derive_registry_id('NACSW') <> 'AKC' then raise exception 'FAIL derive: unknown org falls back'; end if;
  if public.derive_registry_id(null) <> 'AKC' then raise exception 'FAIL derive: null falls back'; end if;
  raise notice 'PASS derive_registry_id: trims, matches AKC/UKC/ASCA, else AKC';
end;
$$;

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
insert into public.clubs (id, name)
values ('00000000-0000-0000-0000-000000490001', 'MYK9-490 Club');

insert into public.shows (id, name, organization, start_date, end_date, club_id, status)
values
  ('00000000-0000-0000-0000-000000490010', 'MYK9-490 AKC Show', 'AKC',
   current_date, current_date + 1, '00000000-0000-0000-0000-000000490001', 'published'),
  ('00000000-0000-0000-0000-000000490011', 'MYK9-490 UKC Show', 'UKC',
   current_date, current_date + 1, '00000000-0000-0000-0000-000000490001', 'published');

-- ---------------------------------------------------------------------------
-- POSITIVE CONTROL: two AKC trials of DIFFERENT SPORTS on one AKC show are accepted.
--
-- This is the half of the rule that is easy to over-enforce. If the guard had been written as
-- "a show may hold only one trial_type", or keyed on anything but the sanctioning body, this
-- insert would fail and the negative case below would still pass — a guard that rejects
-- everything looks identical to a correct one when only the negative is tested.
-- ---------------------------------------------------------------------------
insert into public.trials (id, show_id, name, date, trial_type, registry_id)
values
  ('00000000-0000-0000-0000-000000490020', '00000000-0000-0000-0000-000000490010',
   'MYK9-490 AKC Scent Work', current_date, 'scent_work', 'AKC'),
  ('00000000-0000-0000-0000-000000490021', '00000000-0000-0000-0000-000000490010',
   'MYK9-490 AKC Obedience', current_date + 1, 'obedience', 'AKC');

do $$
declare
  n int;
begin
  select count(*) into n from public.trials
  where show_id = '00000000-0000-0000-0000-000000490010';
  if n <> 2 then
    raise exception 'FAIL positive control: expected 2 AKC trials on the AKC show, found %', n;
  end if;
  raise notice 'PASS positive control: two sports, one registry, one show';
end;
$$;

-- ---------------------------------------------------------------------------
-- NEGATIVE: a UKC trial on the AKC show is refused, with the typed SQLSTATE.
-- ---------------------------------------------------------------------------
do $$
declare
  v_state text;
begin
  begin
    insert into public.trials (id, show_id, name, date, trial_type, registry_id)
    values ('00000000-0000-0000-0000-000000490022', '00000000-0000-0000-0000-000000490010',
            'MYK9-490 UKC Nosework', current_date + 1, 'nosework', 'UKC');
    raise exception 'FAIL insert: a UKC trial was accepted onto an AKC show';
  exception
    when sqlstate 'MK490' then
      v_state := 'MK490';
  end;
  if v_state is distinct from 'MK490' then
    raise exception 'FAIL insert: expected SQLSTATE MK490, got %', coalesce(v_state, '(none)');
  end if;
  -- The wizard surfaces the message; an untyped 23514 or a generic P0001 would leave it with
  -- nothing to key on.
  if exists (select 1 from public.trials where id = '00000000-0000-0000-0000-000000490022') then
    raise exception 'FAIL insert: the refused trial row landed anyway';
  end if;
  raise notice 'PASS insert: cross-registry trial refused with SQLSTATE MK490';
end;
$$;

-- An ASCA trial is refused the same way — the rule is "not this show's registry", not
-- "not UKC".
do $$
begin
  begin
    insert into public.trials (id, show_id, name, date, registry_id)
    values ('00000000-0000-0000-0000-000000490023', '00000000-0000-0000-0000-000000490010',
            'MYK9-490 ASCA Scent Detection', current_date + 1, 'ASCA');
    raise exception 'FAIL insert: an ASCA trial was accepted onto an AKC show';
  exception
    when sqlstate 'MK490' then
      raise notice 'PASS insert: ASCA trial refused on the AKC show';
  end;
end;
$$;

-- The column DEFAULT is not an escape hatch: an AKC-defaulted trial on the UKC show is
-- refused just as an explicit one is. This is the shape a hand-written INSERT takes.
do $$
begin
  begin
    insert into public.trials (id, show_id, name, date)
    values ('00000000-0000-0000-0000-000000490024', '00000000-0000-0000-0000-000000490011',
            'MYK9-490 Defaulted Trial', current_date);
    raise exception 'FAIL insert: a default-AKC trial was accepted onto a UKC show';
  exception
    when sqlstate 'MK490' then
      raise notice 'PASS insert: default registry_id is validated like an explicit one';
  end;
end;
$$;

-- A trial naming a show that does not exist must fail with the FOREIGN KEY violation (23503),
-- not MK490. The guard has nothing to compare against and must get out of the way so the
-- error names the real problem.
--
-- This is a live trap, not a hypothetical: `SELECT ... INTO` assigns NULL to EVERY target on
-- zero rows, so a `SELECT s.organization, true INTO v_organization, v_show_found` sentinel
-- comes back NULL rather than false, `IF NOT v_show_found` evaluates to NULL, the early return
-- is skipped, and the missing show derives 'AKC' through the NULL fallback — turning a clean
-- 23503 into a baffling MK490. The guard uses `IF NOT FOUND` instead, and this case is what
-- proves it.
do $$
declare
  v_state text;
begin
  begin
    insert into public.trials (id, show_id, name, date, registry_id)
    values ('00000000-0000-0000-0000-000000490029', '00000000-0000-0000-0000-0000004900ff',
            'MYK9-490 Orphan Trial', current_date, 'UKC');
    raise exception 'FAIL orphan: a trial naming a nonexistent show was accepted';
  exception
    when foreign_key_violation then
      v_state := '23503';
    when sqlstate 'MK490' then
      v_state := 'MK490';
  end;
  if v_state <> '23503' then
    raise exception 'FAIL orphan: expected the foreign key violation 23503, got %', v_state;
  end if;
  raise notice 'PASS orphan: a missing show yields 23503, not MK490';
end;
$$;

-- ---------------------------------------------------------------------------
-- UPDATE PATH: an accepted trial cannot be edited into a mismatch afterwards.
--
-- Without this the guard would be trivially defeatable: insert as AKC, then update to UKC.
-- ---------------------------------------------------------------------------
do $$
declare
  v_registry text;
begin
  begin
    update public.trials
       set registry_id = 'UKC'
     where id = '00000000-0000-0000-0000-000000490021';
    raise exception 'FAIL update: a trial was re-registered to UKC under an AKC show';
  exception
    when sqlstate 'MK490' then
      raise notice 'PASS update: registry_id cannot be edited into a mismatch';
  end;

  select registry_id into v_registry from public.trials
  where id = '00000000-0000-0000-0000-000000490021';
  if v_registry <> 'AKC' then
    raise exception 'FAIL update: trial registry is now %, expected AKC', v_registry;
  end if;
end;
$$;

-- Moving a trial BETWEEN shows re-tests it against its new parent, which is why show_id is in
-- the trigger's column list. Re-parenting an AKC trial onto the UKC show is a mismatch even
-- though registry_id itself did not change.
do $$
begin
  begin
    update public.trials
       set show_id = '00000000-0000-0000-0000-000000490011'
     where id = '00000000-0000-0000-0000-000000490021';
    raise exception 'FAIL reparent: an AKC trial was moved onto a UKC show';
  exception
    when sqlstate 'MK490' then
      raise notice 'PASS reparent: show_id changes are re-validated';
  end;
end;
$$;

-- A write that touches neither column still succeeds: the guard must not make ordinary trial
-- edits (name, date, status) fail or pay for a lookup.
update public.trials
   set name = 'MYK9-490 AKC Obedience (renamed)'
 where id = '00000000-0000-0000-0000-000000490021';

-- ---------------------------------------------------------------------------
-- The show-organization cascade still works THROUGH the new guard.
--
-- sync_trial_registry_from_show() UPDATEs registry_id on every child trial, which now fires
-- the enforcement trigger. It writes exactly the value the guard derives, so the cascade must
-- pass — if the two derivations ever drift, changing a show's organization would start
-- raising MK490 on its own cascade, and this is where that shows up.
-- ---------------------------------------------------------------------------
do $$
declare
  v_registries text;
begin
  update public.shows
     set organization = 'UKC'
   where id = '00000000-0000-0000-0000-000000490010';

  select string_agg(distinct registry_id, ',' order by registry_id) into v_registries
  from public.trials
  where show_id = '00000000-0000-0000-0000-000000490010';

  if v_registries <> 'UKC' then
    raise exception 'FAIL cascade: trials read % after the show became UKC, expected UKC', v_registries;
  end if;
  raise notice 'PASS cascade: a show organization change re-registers its trials';
end;
$$;

-- After the cascade the show is a UKC show, so an AKC trial is now the mismatch. The rule is
-- relative to the show, not to a privileged default registry.
do $$
begin
  begin
    insert into public.trials (id, show_id, name, date, registry_id)
    values ('00000000-0000-0000-0000-000000490025', '00000000-0000-0000-0000-000000490010',
            'MYK9-490 AKC Trial On A UKC Show', current_date, 'AKC');
    raise exception 'FAIL insert: an AKC trial was accepted onto a now-UKC show';
  exception
    when sqlstate 'MK490' then
      raise notice 'PASS insert: the rule follows the show, not a default registry';
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- THE CASCADE MUST ALSO WORK FOR A NON-SUPERUSER.
--
-- This is the case the rest of this file cannot see, because psql runs as superuser and a
-- superuser passes every privilege check. `sync_trial_registry_from_show()` is SECURITY
-- INVOKER, so its NESTED call to `derive_registry_id()` is checked against the CALLER's role.
-- A trigger fires its own function regardless of EXECUTE, but a nested call is not exempt —
-- so revoking EXECUTE on the helper from `authenticated` turns a secretary's ordinary
-- organization edit into `42501 permission denied for function derive_registry_id`, failing
-- the whole UPDATE. Run this against the migration WITHOUT its
-- `GRANT EXECUTE ... TO authenticated` and it fails here and nowhere else.
--
-- `enforce_show_registry_on_trial()` is SECURITY DEFINER, so its own nested call is fine.
-- That asymmetry is why only one of the two callers needed the grant.
-- ---------------------------------------------------------------------------
insert into public.people (id, first_name, last_name, auth_user_id)
values ('00000000-0000-0000-0000-000000490031', 'MYK9-490', 'Club Admin',
        '00000000-0000-0000-0000-000000490041');

insert into public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
select '00000000-0000-0000-0000-000000490031', id,
       '00000000-0000-0000-0000-000000490001', true,
       '00000000-0000-0000-0000-000000490041'
from public.roles where name = 'club_admin';

-- A second AKC show for this case: show ...010 has already been flipped to UKC above, so
-- editing it again would be a no-op and the AFTER UPDATE guard would return before cascading.
insert into public.shows (id, name, organization, start_date, end_date, club_id, status)
values ('00000000-0000-0000-0000-000000490013', 'MYK9-490 Secretary Edit Show', 'AKC',
        current_date, current_date + 1, '00000000-0000-0000-0000-000000490001', 'published');

insert into public.trials (id, show_id, name, date, registry_id)
values
  ('00000000-0000-0000-0000-000000490027', '00000000-0000-0000-0000-000000490013',
   'MYK9-490 Secretary Trial A', current_date, 'AKC'),
  ('00000000-0000-0000-0000-000000490028', '00000000-0000-0000-0000-000000490013',
   'MYK9-490 Secretary Trial B', current_date + 1, 'AKC');

set local role authenticated;

do $$
declare
  v_registries text;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000490041', true);
  perform set_config(
    'request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-000000490041","role":"authenticated"}',
    true
  );

  -- The helper itself must be callable as authenticated. Asserted separately from the UPDATE
  -- so a 42501 is attributed to the privilege, not to RLS.
  begin
    if public.derive_registry_id('UKC') <> 'UKC' then
      raise exception 'FAIL authenticated: derive_registry_id returned the wrong value';
    end if;
  exception
    when insufficient_privilege then
      raise exception 'FAIL authenticated: derive_registry_id is not EXECUTE-able by authenticated (SQLSTATE 42501) — the sync trigger nested-calls it as the caller';
  end;

  -- The real path: a club admin edits the show's organization. The AFTER UPDATE trigger
  -- cascades to both trials, through the enforcement trigger, all as `authenticated`.
  begin
    update public.shows
       set organization = 'UKC'
     where id = '00000000-0000-0000-0000-000000490013';
  exception
    when insufficient_privilege then
      raise exception 'FAIL authenticated: the organization edit died on a privilege check (SQLSTATE 42501) inside the registry cascade';
  end;

  select string_agg(distinct registry_id, ',' order by registry_id) into v_registries
  from public.trials
  where show_id = '00000000-0000-0000-0000-000000490013';

  if v_registries is distinct from 'UKC' then
    raise exception 'FAIL authenticated: trials read % after the edit, expected UKC', coalesce(v_registries, '(none)');
  end if;
  raise notice 'PASS authenticated: a club admin can change a show organization and the cascade runs';
end;
$$;

reset role;

-- An unconfigured organization projects to AKC (the column default), so an AKC trial under it
-- is legal. This is the common real case — most shows carry a free-text organization.
insert into public.shows (id, name, organization, start_date, end_date, club_id, status)
values ('00000000-0000-0000-0000-000000490012', 'MYK9-490 Unconfigured Org Show', 'NACSW',
        current_date, current_date + 1, '00000000-0000-0000-0000-000000490001', 'published');

insert into public.trials (id, show_id, name, date, registry_id)
values ('00000000-0000-0000-0000-000000490026', '00000000-0000-0000-0000-000000490012',
        'MYK9-490 Fallback Trial', current_date, 'AKC');

do $$
begin
  if not exists (select 1 from public.trials where id = '00000000-0000-0000-0000-000000490026') then
    raise exception 'FAIL fallback: an AKC trial was refused under an unconfigured organization';
  end if;
  raise notice 'PASS fallback: an unconfigured organization projects to AKC';
end;
$$;

rollback;
