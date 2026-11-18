-- MYK9-2077 behavioral contract: the registry deadline reminder is claimed once per
-- (show, registry, deadline date). A re-run claims nothing, a moved deadline or another registry
-- is a new claim, and only the service role can touch the table. All fixtures roll back.

BEGIN;

DO $$
DECLARE
  v_show constant uuid := '00000000-0000-0000-0000-000000207701';
  v_claimed integer;
BEGIN
  -- First run: the claim lands.
  WITH claim AS (
    INSERT INTO public.registry_deadline_reminders (show_id, registry_id, deadline_date)
    VALUES (v_show, 'AKC', DATE '2026-11-24')
    ON CONFLICT (show_id, registry_id, deadline_date) DO NOTHING
    RETURNING id
  )
  SELECT count(*) INTO v_claimed FROM claim;
  IF v_claimed <> 1 THEN
    RAISE EXCEPTION 'first claim should insert one row, got %', v_claimed;
  END IF;

  -- Re-run, same show, registry and date: nothing is claimed, so nothing is sent.
  WITH claim AS (
    INSERT INTO public.registry_deadline_reminders (show_id, registry_id, deadline_date)
    VALUES (v_show, 'AKC', DATE '2026-11-24')
    ON CONFLICT (show_id, registry_id, deadline_date) DO NOTHING
    RETURNING id
  )
  SELECT count(*) INTO v_claimed FROM claim;
  IF v_claimed <> 0 THEN
    RAISE EXCEPTION 're-run should claim nothing, got %', v_claimed;
  END IF;

  -- The last trial day moved, so the deadline moved: one new reminder for the new date.
  WITH claim AS (
    INSERT INTO public.registry_deadline_reminders (show_id, registry_id, deadline_date)
    VALUES (v_show, 'AKC', DATE '2026-11-25')
    ON CONFLICT (show_id, registry_id, deadline_date) DO NOTHING
    RETURNING id
  )
  SELECT count(*) INTO v_claimed FROM claim;
  IF v_claimed <> 1 THEN
    RAISE EXCEPTION 'a new deadline date should claim one row, got %', v_claimed;
  END IF;

  -- A second registry on the same show and date is its own reminder.
  WITH claim AS (
    INSERT INTO public.registry_deadline_reminders (show_id, registry_id, deadline_date)
    VALUES (v_show, 'ASCA', DATE '2026-11-24')
    ON CONFLICT (show_id, registry_id, deadline_date) DO NOTHING
    RETURNING id
  )
  SELECT count(*) INTO v_claimed FROM claim;
  IF v_claimed <> 1 THEN
    RAISE EXCEPTION 'a second registry should claim one row, got %', v_claimed;
  END IF;

  -- Only AKC, UKC and ASCA are registries.
  BEGIN
    INSERT INTO public.registry_deadline_reminders (show_id, registry_id, deadline_date)
    VALUES (v_show, 'NACSW', DATE '2026-11-24');
    RAISE EXCEPTION 'an unknown registry should be refused';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
END
$$;

DO $$
BEGIN
  IF has_table_privilege('anon', 'public.registry_deadline_reminders', 'SELECT')
     OR has_table_privilege('anon', 'public.registry_deadline_reminders', 'INSERT')
     OR has_table_privilege('authenticated', 'public.registry_deadline_reminders', 'SELECT')
     OR has_table_privilege('authenticated', 'public.registry_deadline_reminders', 'INSERT') THEN
    RAISE EXCEPTION 'anon and authenticated must have no access to registry_deadline_reminders';
  END IF;
  IF NOT (has_table_privilege('service_role', 'public.registry_deadline_reminders', 'SELECT')
      AND has_table_privilege('service_role', 'public.registry_deadline_reminders', 'INSERT')
      AND has_table_privilege('service_role', 'public.registry_deadline_reminders', 'UPDATE')
      AND has_table_privilege('service_role', 'public.registry_deadline_reminders', 'DELETE')) THEN
    RAISE EXCEPTION 'service_role must be able to claim, stamp and release reminders';
  END IF;
  IF NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class
          WHERE oid = 'public.registry_deadline_reminders'::regclass) THEN
    RAISE EXCEPTION 'registry_deadline_reminders must have row level security enabled and forced';
  END IF;
  IF has_function_privilege('authenticated',
       'public.request_registry_deadline_reminders(text, text)', 'EXECUTE')
     OR has_function_privilege('anon',
       'public.request_registry_deadline_reminders(text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'the cron entry point must not be callable by client roles';
  END IF;
END
$$;

ROLLBACK;
