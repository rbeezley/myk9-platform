-- MYK9-781: the platform_settings singleton cannot be deleted or truncated by
-- any role. Behavioral test for
-- 20260926025100_myk9_781_block_platform_settings_removal.sql.
--
-- Run with psql -X -v ON_ERROR_STOP=1 after migrations. Everything rolls back.
--
-- Each refusal is asserted on its SQLSTATE (MK781), not merely "an error":
-- plain postgres was already refused a row DELETE by the older write guard
-- (trg_guard_platform_settings_write), so any error would pass for it. The
-- cases the older guard let through are the point: service_role DELETE,
-- TRUNCATE, and the cascade from TRUNCATE public.people. Each refusal is
-- followed by a row-count check, and UPDATE is exercised last to prove the
-- existing write rules still hold.

begin;

-- The singleton exists before we start; everything below depends on it.
do $$
begin
  if (select count(*) from public.platform_settings) <> 1 then
    raise exception 'FAIL precondition: platform_settings must hold exactly one row';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. Plain postgres (the migration / psql session): DELETE and TRUNCATE.
-- ---------------------------------------------------------------------------
do $$
begin
  begin
    delete from public.platform_settings where id = true;
    raise exception 'FAIL postgres DELETE of platform_settings was allowed';
  exception when sqlstate 'MK781' then
    raise notice 'PASS postgres DELETE refused (MK781)';
  end;

  begin
    truncate table public.platform_settings;
    raise exception 'FAIL postgres TRUNCATE of platform_settings was allowed';
  exception when sqlstate 'MK781' then
    raise notice 'PASS postgres TRUNCATE refused (MK781)';
  end;

  -- The route the incident suggested: platform_settings.updated_by references
  -- people, so a people truncate cascades into it.
  begin
    truncate table public.people cascade;
    raise exception 'FAIL TRUNCATE public.people CASCADE emptied platform_settings';
  exception when sqlstate 'MK781' then
    raise notice 'PASS TRUNCATE people CASCADE refused at platform_settings (MK781)';
  end;

  if (select count(*) from public.platform_settings) <> 1 then
    raise exception 'FAIL platform_settings lost its row as postgres';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Replication mode: triggers default to firing only in origin mode, so a
--    session in `replica` would skip them. Ours are ENABLE ALWAYS. Setting the
--    GUC needs a superuser or an explicit parameter grant; where the test role
--    has neither, say so rather than pass silently.
-- ---------------------------------------------------------------------------
do $$
begin
  begin
    set local session_replication_role = replica;
  exception when insufficient_privilege then
    raise notice 'SKIP replica-mode case: this role may not set session_replication_role';
    return;
  end;

  begin
    delete from public.platform_settings where id = true;
    raise exception 'FAIL replica-mode DELETE of platform_settings was allowed';
  exception when sqlstate 'MK781' then
    raise notice 'PASS replica-mode DELETE refused (MK781)';
  end;

  begin
    truncate table public.platform_settings;
    raise exception 'FAIL replica-mode TRUNCATE of platform_settings was allowed';
  exception when sqlstate 'MK781' then
    raise notice 'PASS replica-mode TRUNCATE refused (MK781)';
  end;

  set local session_replication_role = origin;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. service_role: the older guard ALLOWS its row DELETE; the new trigger
--    must refuse it, and TRUNCATE (which service_role holds) too.
-- ---------------------------------------------------------------------------
set local role service_role;

do $$
begin
  begin
    delete from public.platform_settings where id = true;
    raise exception 'FAIL service_role DELETE of platform_settings was allowed';
  exception when sqlstate 'MK781' then
    raise notice 'PASS service_role DELETE refused (MK781)';
  end;

  begin
    truncate table public.platform_settings;
    raise exception 'FAIL service_role TRUNCATE of platform_settings was allowed';
  exception when sqlstate 'MK781' then
    raise notice 'PASS service_role TRUNCATE refused (MK781)';
  end;

  if (select count(*) from public.platform_settings) <> 1 then
    raise exception 'FAIL platform_settings lost its row as service_role';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. UPDATE keeps working through the existing write guard: service_role may
--    change values; plain postgres is still refused by that guard.
-- ---------------------------------------------------------------------------
do $$
declare
  v_before numeric;
begin
  select platform_fee_percent into v_before from public.platform_settings where id = true;
  update public.platform_settings
     set platform_fee_percent = case when v_before = 5 then 6 else 5 end
   where id = true;
  if (select platform_fee_percent from public.platform_settings where id = true)
     is not distinct from v_before then
    raise exception 'FAIL service_role UPDATE of platform_settings did not apply';
  end if;
  raise notice 'PASS service_role UPDATE still applies';
end;
$$;

reset role;

do $$
begin
  begin
    update public.platform_settings set platform_fee_percent = platform_fee_percent where id = true;
    raise exception 'FAIL plain postgres UPDATE of platform_settings was allowed';
  exception when raise_exception then
    if sqlerrm <> 'platform_settings is writable only by a site admin' then
      raise;
    end if;
    raise notice 'PASS plain postgres UPDATE still refused by trg_guard_platform_settings_write';
  end;

  if (select count(*) from public.platform_settings) <> 1 then
    raise exception 'FAIL platform_settings does not hold exactly one row at the end';
  end if;
end;
$$;

rollback;
