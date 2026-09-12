-- MYK9-472 / SA-2026-09-12-04 behavioral contract: no write grants on the three OWNER-RUN
-- entry-results views.
--
-- The revoked grants were INERT, so there is no exploit to replay. What this pins is the pair of
-- conditions that made them inert, because the safety was incidental and a future edit can
-- remove it silently: each view is owner-run (security_invoker = false) AND not auto-updatable
-- (it joins entries to classes/shows/dogs). Simplify one to a single base table, or give it an
-- INSTEAD OF trigger, and a write grant becomes an RLS bypass executing as the table owner.
--
-- No fixtures and no writes — these are catalogue assertions. Wrapped in a transaction anyway so
-- the harness's per-file ROLLBACK contract holds uniformly.

BEGIN;

DO $$
DECLARE
  v regclass;
  bits integer;
  invoker text;
BEGIN
  FOREACH v IN ARRAY ARRAY[
    'public.view_public_entry_results'::regclass,
    'public.view_authenticated_entry_results'::regclass,
    'public.view_authenticated_entry_results_replication'::regclass
  ]
  LOOP
    IF has_table_privilege('authenticated', v, 'INSERT')
       OR has_table_privilege('authenticated', v, 'UPDATE')
       OR has_table_privilege('authenticated', v, 'DELETE') THEN
      RAISE EXCEPTION 'FAIL % still grants a write privilege to authenticated. These views are '
        'owner-run (security_invoker = false), so a write through one would execute as the view '
        'owner with base-table RLS skipped.', v;
    END IF;

    -- Positive control: reads must still work, or the revoke took too much. Without this the
    -- assertions above would pass just as well on a view nobody can touch at all.
    IF NOT has_table_privilege('authenticated', v, 'SELECT') THEN
      RAISE EXCEPTION 'FAIL % no longer grants SELECT to authenticated — the revoke was too broad', v;
    END IF;

    -- Premise 1: still owner-run. CREATE OR REPLACE VIEW resets reloptions, so this flips on an
    -- edit that carries no inline WITH (security_invoker = ...) clause. Fold NULL to false.
    SELECT coalesce((SELECT option_value
                     FROM pg_options_to_table((SELECT c.reloptions FROM pg_class c WHERE c.oid = v))
                     WHERE option_name = 'security_invoker'), 'false')
      INTO invoker;
    IF invoker <> 'false' THEN
      RAISE EXCEPTION 'FAIL % is no longer owner-run (security_invoker = %). That may be a correct '
        'change, but it moves the premise of MYK9-472 and of the 20260909203500 definer '
        'acceptance — read both before updating this test.', v, invoker;
    END IF;

    -- Premise 2: still not auto-updatable.
    bits := pg_relation_is_updatable(v, true);
    IF bits <> 0 THEN
      RAISE EXCEPTION 'FAIL % became auto-updatable (bits %). Combined with an owner-run body '
        'that is an RLS bypass waiting for a write grant — re-check MYK9-472.', v, bits;
    END IF;
  END LOOP;

  -- anon keeps its read on the public results view; the revoke was authenticated-only.
  IF NOT has_table_privilege('anon', 'public.view_public_entry_results'::regclass, 'SELECT') THEN
    RAISE EXCEPTION 'FAIL anon lost SELECT on view_public_entry_results — that is the public '
      'results release gate';
  END IF;

  RAISE NOTICE 'PASS MYK9-472: no write grants to authenticated on the three entry-results '
    'views, reads intact, and both premises (owner-run, non-updatable) still hold';
END;
$$;

ROLLBACK;
