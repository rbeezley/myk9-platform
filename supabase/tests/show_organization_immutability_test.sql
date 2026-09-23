-- MYK9-604: persisted show registry cannot drift away from the classes it already owns.
-- Run with psql -X -v ON_ERROR_STOP=1 after migrations. All fixtures roll back.
BEGIN;

INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-000000604001', 'MYK9-604 Organization Guard Club');

INSERT INTO public.shows (id, name, type, start_date, end_date, organization, club_id)
VALUES
  ('00000000-0000-0000-0000-000000604010', 'MYK9-604 Live Trial Show', 'Specialty', current_date, current_date + 1, 'AKC', '00000000-0000-0000-0000-000000604001'),
  ('00000000-0000-0000-0000-000000604011', 'MYK9-604 Empty Show', 'Specialty', current_date, current_date + 1, 'AKC', '00000000-0000-0000-0000-000000604001'),
  ('00000000-0000-0000-0000-000000604012', 'MYK9-604 Soft Deleted Trial Show', 'Specialty', current_date, current_date + 1, 'AKC', '00000000-0000-0000-0000-000000604001');

INSERT INTO public.trials (id, show_id, name, date, registry_id)
VALUES
  ('00000000-0000-0000-0000-000000604020', '00000000-0000-0000-0000-000000604010', 'MYK9-604 Live Trial', current_date, 'AKC'),
  ('00000000-0000-0000-0000-000000604021', '00000000-0000-0000-0000-000000604012', 'MYK9-604 Deleted Trial', current_date, 'AKC');

UPDATE public.trials
SET deleted_at = now()
WHERE id = '00000000-0000-0000-0000-000000604021';

-- A non-organization edit must still work on a show with a live trial.
UPDATE public.shows
SET name = 'MYK9-604 Renamed Live Trial Show'
WHERE id = '00000000-0000-0000-0000-000000604010';

-- Changing organization while a live trial exists raises the exact constraint SQLSTATE.
DO $test$
DECLARE
  v_state text;
BEGIN
  BEGIN
    UPDATE public.shows
    SET organization = 'UKC'
    WHERE id = '00000000-0000-0000-0000-000000604010';
    RAISE EXCEPTION 'FAIL: a show with a live trial changed organization';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
    IF v_state <> '23514' THEN
      RAISE EXCEPTION 'FAIL: expected SQLSTATE 23514, got %', v_state;
    END IF;
  END;
END;
$test$;

-- No persisted trial means changing the show organization remains allowed.
UPDATE public.shows
SET organization = 'UKC'
WHERE id = '00000000-0000-0000-0000-000000604011';

-- The resulting registry remains authoritative for future child writes.
DO $test$
DECLARE
  v_state text;
BEGIN
  BEGIN
    INSERT INTO public.trials (id, show_id, name, date, registry_id)
    VALUES ('00000000-0000-0000-0000-000000604022', '00000000-0000-0000-0000-000000604011',
            'MYK9-604 Foreign Registry Trial', current_date, 'AKC');
    RAISE EXCEPTION 'FAIL: an AKC trial was accepted on the UKC show';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
    IF v_state <> 'MK490' THEN
      RAISE EXCEPTION 'FAIL: expected SQLSTATE MK490 for a foreign trial, got %', v_state;
    END IF;
  END;
END;
$test$;

-- Soft-deleted trials still lock the show because admin restore can make their classes live
-- again under the original registry.
DO $test$
DECLARE
  v_state text;
BEGIN
  BEGIN
    UPDATE public.shows
    SET organization = 'UKC'
    WHERE id = '00000000-0000-0000-0000-000000604012';
    RAISE EXCEPTION 'FAIL: a show with a soft-deleted trial changed organization';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
    IF v_state <> '23514' THEN
      RAISE EXCEPTION 'FAIL: expected SQLSTATE 23514 for soft-deleted child, got %', v_state;
    END IF;
  END;
END;
$test$;

-- Confirm the installed child trigger exists and the function uses the reviewed SHARE-lock
-- implementation. The behavioral rejection above proves registry enforcement, not a concurrent
-- race; concurrency follows from Postgres SHARE conflicting with NO KEY UPDATE on the parent.
DO $test$
DECLARE
  v_function text;
  v_trigger_count integer;
BEGIN
  SELECT pg_get_functiondef(function_row.oid)
    INTO v_function
  FROM pg_proc AS function_row
  JOIN pg_namespace AS schema_row ON schema_row.oid = function_row.pronamespace
  WHERE schema_row.nspname = 'public'
    AND function_row.proname = 'enforce_show_registry_on_trial';

  SELECT count(*)
    INTO v_trigger_count
  FROM pg_trigger AS trigger_row
  JOIN pg_class AS table_row ON table_row.oid = trigger_row.tgrelid
  JOIN pg_namespace AS schema_row ON schema_row.oid = table_row.relnamespace
  JOIN pg_proc AS function_row ON function_row.oid = trigger_row.tgfoid
  WHERE schema_row.nspname = 'public'
    AND table_row.relname = 'trials'
    AND NOT trigger_row.tgisinternal
    AND function_row.proname = 'enforce_show_registry_on_trial';

  IF v_function IS NULL OR v_trigger_count <> 1 THEN
    RAISE EXCEPTION 'FAIL wiring: expected installed trial validator function and one trigger, found function=% trigger_count=%',
      v_function IS NOT NULL, v_trigger_count;
  END IF;
  IF position('FOR SHARE' IN v_function) = 0 THEN
    RAISE EXCEPTION 'FAIL: trial registry enforcement must lock the parent show FOR SHARE';
  END IF;
END;
$test$;

DO $test$
DECLARE
  v_timing text;
  v_columns text;
BEGIN
  SELECT CASE WHEN trigger_row.tgtype & 2 = 2 THEN 'BEFORE' ELSE 'AFTER' END,
         COALESCE((
           SELECT string_agg(attribute.attname, ',' ORDER BY attribute.attname)
           FROM unnest(trigger_row.tgattr::int2[]) AS column_number(attnum)
           JOIN pg_attribute AS attribute
             ON attribute.attrelid = trigger_row.tgrelid
            AND attribute.attnum = column_number.attnum
         ), '(none)')
    INTO v_timing, v_columns
  FROM pg_trigger AS trigger_row
  JOIN pg_class AS table_row ON table_row.oid = trigger_row.tgrelid
  JOIN pg_namespace AS schema_row ON schema_row.oid = table_row.relnamespace
  JOIN pg_proc AS function_row ON function_row.oid = trigger_row.tgfoid
  WHERE schema_row.nspname = 'public'
    AND table_row.relname = 'shows'
    AND NOT trigger_row.tgisinternal
    AND function_row.proname = 'prevent_persisted_show_organization_change';

  IF v_timing IS DISTINCT FROM 'BEFORE' OR v_columns IS DISTINCT FROM 'organization' THEN
    RAISE EXCEPTION 'FAIL wiring: expected BEFORE UPDATE OF organization, found % UPDATE OF %', v_timing, v_columns;
  END IF;

  RAISE NOTICE 'PASS show organization immutability: any persisted child locks; empty shows remain editable';
END;
$test$;

ROLLBACK;
