-- ============================================================================
-- Walk residue cleanup, by EXACT run token (MYK9-734)
-- ----------------------------------------------------------------------------
-- The exhibitor task walk pays for one entry per run with a throwaway dog named
-- `ZZ Walk Dog <run token> #N`. The UI can never remove that dog afterwards:
-- soft_delete_dog refuses a dog holding a paid entry (MK002), and withdraw and
-- refund are out of the walk's scope. So each paying run leaves a dog, a paid
-- entry, its status history, a sandbox stripe_orders row and possibly a
-- checkout-created enrollment. On the walk's target show (a seed-deleted show)
-- that residue also makes the next reseed abort on its money guard.
--
-- This is the sink. It is an OPERATOR step, never run by a walk, and it is two
-- runs, never one:
--
--   1. RECORD. Run without `apply_sha`. Nothing is deleted (the transaction is
--      rolled back). It prints one JSON document holding every row it would
--      remove, then `RECORD SHA256 <hex>`. Save that output and commit it as
--      docs/audits/walk-residue/<token>.txt (docs-only).
--   2. APPLY. Run again with `-v apply_sha=<hex>`. It rebuilds the same record
--      from the database and deletes ONLY if its hash equals the one you
--      recorded. Anything that changed in between (a refund landed, another
--      entry joined the order) changes the hash and the run refuses. So a
--      payment trail can never be hard-deleted without the recorded step.
--
--   psql "<staging url>" -X -v ON_ERROR_STOP=1 -v token='2026-09-13 0305' \
--        -f supabase/ops/walk-residue-cleanup.sql
--
-- Full procedure and what it refuses: docs/operations/walk-residue-cleanup.md.
--
-- SCOPE. Only dogs owned by the two walk accounts (exhibitor@ / exhibitor2@)
-- whose name is EXACTLY `ZZ Walk Dog <token> #<n>`. The token must be a full
-- `YYYY-MM-DD HHMM`; a prefix, a date alone or a pattern is refused, so one
-- run's cleanup can never reach another run's rows.
--
-- REFUSES, rolling back with nothing deleted, when:
--   * the token is not exactly `YYYY-MM-DD HHMM`, or matches no dog;
--   * an order it would delete also paid for an entry outside the scope
--     (a mixed order is not walk residue);
--   * an order has a refund row (refund facts are permanent ledger history),
--     or a live-mode Checkout session (`cs_live_`);
--   * any OTHER table with a cascading or set-null foreign key into the dogs,
--     entries, enrollments or orders it deletes holds a row for them. It reads
--     those constraints from pg_constraint at run time, so a table added later
--     is refused until this file records it, rather than destroyed unrecorded;
--   * the hash does not match (apply mode).
-- A NO ACTION / RESTRICT reference it does not clear fails the DELETE itself
-- with a 23503, inside the same transaction, which is equally safe.
-- ============================================================================

\set ON_ERROR_STOP on
\set QUIET on
\if :{?token}
\else
  \echo 'walk-residue-cleanup: pass -v token=''YYYY-MM-DD HHMM'' (the walk''s exact run token)'
  \quit
\endif

BEGIN;

SELECT set_config('walk_residue.token', :'token', true) AS wr_token \gset
\if :{?apply_sha}
SELECT set_config('walk_residue.apply_sha', :'apply_sha', true) AS wr_sha \gset
\else
SELECT set_config('walk_residue.apply_sha', '', true) AS wr_sha \gset
\endif

DO $$
BEGIN
  IF current_setting('walk_residue.token') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{4}$' THEN
    RAISE EXCEPTION 'walk-residue-cleanup: token % is not an exact run token (YYYY-MM-DD HHMM); prefixes and patterns are refused', current_setting('walk_residue.token');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Scope, from the dogs outward.
-- ---------------------------------------------------------------------------
-- LOCKS, parents first, held until this transaction ends. Codex review of
-- #2453: without them another session could add an entry to a matched dog
-- after the record was built, the hash would still match (the record never
-- saw it), and the dog delete would cascade that unrecorded entry away. A
-- FOR UPDATE lock on a row conflicts with the FOR KEY SHARE lock every FK
-- insert takes on its parent, so while these are held nobody can attach a
-- new entry to a scoped dog, a new history row to a scoped entry, or edit a
-- scoped row. A writer that tries simply waits for this run to finish.
DO $$
BEGIN
  PERFORM 1
  FROM public.dogs d
  JOIN public.people p ON p.id = d.owner_id
  WHERE lower(p.email) IN ('exhibitor@myk9t.com', 'exhibitor2@myk9t.com')
    AND d.name ~ ('^ZZ Walk Dog ' || current_setting('walk_residue.token') || ' #[0-9]+$')
  FOR UPDATE OF d;
END $$;

CREATE TEMP TABLE wr_dogs ON COMMIT DROP AS
SELECT d.*
FROM public.dogs d
JOIN public.people p ON p.id = d.owner_id
WHERE lower(p.email) IN ('exhibitor@myk9t.com', 'exhibitor2@myk9t.com')
  AND d.name ~ ('^ZZ Walk Dog ' || current_setting('walk_residue.token') || ' #[0-9]+$');

DO $$
BEGIN
  PERFORM 1 FROM public.entries WHERE dog_id IN (SELECT id FROM wr_dogs) FOR UPDATE;
END $$;

CREATE TEMP TABLE wr_entries ON COMMIT DROP AS
SELECT e.* FROM public.entries e WHERE e.dog_id IN (SELECT id FROM wr_dogs);

CREATE TEMP TABLE wr_history ON COMMIT DROP AS
SELECT h.* FROM public.entry_status_history h WHERE h.entry_id IN (SELECT id FROM wr_entries);

DO $$
BEGIN
  PERFORM 1 FROM public.stripe_orders
  WHERE entry_ids && ARRAY(SELECT id FROM wr_entries) FOR UPDATE;
  PERFORM 1 FROM public.enrollments
  WHERE id IN (SELECT registration_id FROM wr_entries WHERE registration_id IS NOT NULL)
  FOR UPDATE;
END $$;

CREATE TEMP TABLE wr_orders ON COMMIT DROP AS
SELECT o.* FROM public.stripe_orders o
WHERE o.entry_ids && ARRAY(SELECT id FROM wr_entries);

CREATE TEMP TABLE wr_refunds ON COMMIT DROP AS
SELECT r.* FROM public.stripe_order_refunds r WHERE r.order_id IN (SELECT id FROM wr_orders);

-- An enrollment is removed only when nothing outside the scope still points at
-- it. The walk account's enrollment on a show is unique per (show, handler), so
-- one enrollment can carry several runs' entries; it stays until the last one
-- is cleaned up.
CREATE TEMP TABLE wr_enrollments ON COMMIT DROP AS
SELECT en.*
FROM public.enrollments en
WHERE (en.id IN (SELECT registration_id FROM wr_entries WHERE registration_id IS NOT NULL)
       OR en.id IN (SELECT enrollment_id FROM wr_orders WHERE enrollment_id IS NOT NULL))
  AND NOT EXISTS (SELECT 1 FROM public.entries e
                  WHERE e.registration_id = en.id AND e.id NOT IN (SELECT id FROM wr_entries))
  AND NOT EXISTS (SELECT 1 FROM public.stripe_orders o
                  WHERE o.enrollment_id = en.id AND o.id NOT IN (SELECT id FROM wr_orders));

CREATE TEMP TABLE wr_cart_items ON COMMIT DROP AS
SELECT c.* FROM public.entry_cart_items c
WHERE c.dog_id IN (SELECT id FROM wr_dogs)
   OR c.entry_id IN (SELECT id FROM wr_entries);

CREATE TEMP TABLE wr_waitlist ON COMMIT DROP AS
SELECT w.* FROM public.waitlist_entries w WHERE w.dog_id IN (SELECT id FROM wr_dogs);

CREATE TEMP TABLE wr_armbands ON COMMIT DROP AS
SELECT a.* FROM public.armbands a WHERE a.dog_id IN (SELECT id FROM wr_dogs);

CREATE TEMP TABLE wr_dog_registrations ON COMMIT DROP AS
SELECT r.* FROM public.dog_registrations r WHERE r.dog_id IN (SELECT id FROM wr_dogs);

-- ---------------------------------------------------------------------------
-- Refusals.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_n integer;
  v_ids text;
  r record;
  v_parent_ids uuid[];
BEGIN
  SELECT count(*) INTO v_n FROM wr_dogs;
  IF v_n = 0 THEN
    RAISE EXCEPTION 'walk-residue-cleanup: no walk dog is named exactly "ZZ Walk Dog % #<n>" on the walk accounts; nothing to do', current_setting('walk_residue.token');
  END IF;

  SELECT count(*), string_agg(o.id::text, ', ') INTO v_n, v_ids
  FROM wr_orders o
  WHERE EXISTS (SELECT 1 FROM unnest(o.entry_ids) AS x(id) WHERE x.id NOT IN (SELECT id FROM wr_entries));
  IF v_n > 0 THEN
    RAISE EXCEPTION 'walk-residue-cleanup: order(s) % also paid for entries outside this run''s scope; a mixed order is not walk residue', v_ids;
  END IF;

  SELECT count(*) INTO v_n FROM wr_refunds;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'walk-residue-cleanup: % refund row(s) hang off this run''s orders; refund facts are permanent ledger history, so this is not walk residue', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM wr_orders WHERE stripe_checkout_session_id LIKE 'cs_live_%';
  IF v_n > 0 THEN
    RAISE EXCEPTION 'walk-residue-cleanup: % order(s) were paid through a LIVE Checkout session; this script only ever removes sandbox residue', v_n;
  END IF;

  -- Every other cascading or set-null reference into what this run deletes.
  FOR r IN
    SELECT format('%I.%I', cn.nspname, cc.relname) AS child, cc.relname AS child_name,
           pc.relname AS parent, a.attname AS col
    FROM pg_constraint c
    JOIN pg_class cc ON cc.oid = c.conrelid
    JOIN pg_namespace cn ON cn.oid = cc.relnamespace
    JOIN pg_class pc ON pc.oid = c.confrelid
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f'
      AND c.confdeltype IN ('c', 'n', 'd')
      AND array_length(c.conkey, 1) = 1
      AND c.confrelid IN ('public.dogs'::regclass, 'public.entries'::regclass,
                          'public.enrollments'::regclass, 'public.stripe_orders'::regclass)
  LOOP
    -- Recorded above, so their removal is not silent.
    CONTINUE WHEN r.child = format('public.%I', r.child_name) AND (r.child_name, r.col::text) IN (
      ('entry_status_history', 'entry_id'),
      ('dog_registrations', 'dog_id'),
      ('entries', 'dog_id'),
      ('entry_cart_items', 'dog_id'),
      ('entry_cart_items', 'entry_id'),
      ('waitlist_entries', 'dog_id'),
      ('armbands', 'dog_id'),
      ('stripe_order_refunds', 'order_id'),
      ('entries', 'registration_id'),
      ('stripe_orders', 'enrollment_id'));

    v_parent_ids := CASE r.parent
      WHEN 'dogs' THEN ARRAY(SELECT id FROM wr_dogs)
      WHEN 'entries' THEN ARRAY(SELECT id FROM wr_entries)
      WHEN 'enrollments' THEN ARRAY(SELECT id FROM wr_enrollments)
      WHEN 'stripe_orders' THEN ARRAY(SELECT id FROM wr_orders)
    END;
    EXECUTE format('SELECT count(*) FROM %s WHERE %I = ANY($1)', r.child, r.col)
      INTO v_n USING v_parent_ids;
    IF v_n > 0 THEN
      RAISE EXCEPTION 'walk-residue-cleanup: % row(s) in % reference this run''s % through %.% and would be removed or altered unrecorded; record that table in this file first', v_n, r.child, r.parent, r.child, r.col;
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- The record. Deterministic: every array is ordered, and jsonb prints its keys
-- in a fixed order, so the same database state always hashes the same.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE wr_record ON COMMIT DROP AS
SELECT jsonb_build_object(
  'walk_residue_token', current_setting('walk_residue.token'),
  'dogs',                 (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id), '[]') FROM wr_dogs t),
  'dog_registrations',    (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id), '[]') FROM wr_dog_registrations t),
  'entries',              (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id), '[]') FROM wr_entries t),
  'entry_status_history', (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id), '[]') FROM wr_history t),
  'stripe_orders',        (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id), '[]') FROM wr_orders t),
  'enrollments',          (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id), '[]') FROM wr_enrollments t),
  'entry_cart_items',     (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id), '[]') FROM wr_cart_items t),
  'waitlist_entries',     (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id), '[]') FROM wr_waitlist t),
  'armbands',             (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id), '[]') FROM wr_armbands t)
) AS record;

\pset format unaligned
\pset tuples_only on
SELECT jsonb_pretty(record) FROM wr_record;
SELECT 'RECORD SHA256 ' || encode(sha256(convert_to(record::text, 'UTF8')), 'hex') FROM wr_record;
\pset tuples_only off
\pset format aligned

\if :{?apply_sha}
-- ---------------------------------------------------------------------------
-- Apply: only the exact state that was recorded.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_sha text;
BEGIN
  SELECT encode(sha256(convert_to(record::text, 'UTF8')), 'hex') INTO v_sha FROM wr_record;
  IF v_sha <> current_setting('walk_residue.apply_sha') THEN
    RAISE EXCEPTION 'walk-residue-cleanup: the database no longer matches the recorded state (recorded %, now %); record again and review before applying', current_setting('walk_residue.apply_sha'), v_sha;
  END IF;
END $$;

-- Children first. entry_status_history and dog_registrations go with their
-- parents by cascade, and both are in the record above.
DELETE FROM public.entry_cart_items WHERE id IN (SELECT id FROM wr_cart_items);
DELETE FROM public.waitlist_entries WHERE id IN (SELECT id FROM wr_waitlist);
DELETE FROM public.armbands WHERE id IN (SELECT id FROM wr_armbands);
DELETE FROM public.stripe_orders WHERE id IN (SELECT id FROM wr_orders);
DELETE FROM public.entries WHERE id IN (SELECT id FROM wr_entries);
DELETE FROM public.enrollments WHERE id IN (SELECT id FROM wr_enrollments);
DELETE FROM public.dogs WHERE id IN (SELECT id FROM wr_dogs);

DO $$
DECLARE
  v_left integer;
  v_late integer;
BEGIN
  -- stripe_orders.entry_ids has no foreign key, so no lock can stop an order
  -- created after the record from naming a scoped entry. Such an order would
  -- be left pointing at a deleted id; refuse instead.
  SELECT count(*) INTO v_late
  FROM public.stripe_orders o
  WHERE o.entry_ids && ARRAY(SELECT id FROM wr_entries)
    AND o.id NOT IN (SELECT id FROM wr_orders);
  IF v_late > 0 THEN
    RAISE EXCEPTION 'walk-residue-cleanup: % order(s) created after the record name this run''s entries; record again', v_late;
  END IF;

  SELECT (SELECT count(*) FROM public.dogs WHERE id IN (SELECT id FROM wr_dogs))
       + (SELECT count(*) FROM public.entries WHERE id IN (SELECT id FROM wr_entries))
       + (SELECT count(*) FROM public.stripe_orders WHERE id IN (SELECT id FROM wr_orders))
       + (SELECT count(*) FROM public.enrollments WHERE id IN (SELECT id FROM wr_enrollments))
    INTO v_left;
  IF v_left <> 0 THEN
    RAISE EXCEPTION 'walk-residue-cleanup: % recorded row(s) survived the delete', v_left;
  END IF;
END $$;

\echo 'walk-residue-cleanup: APPLIED. The recorded rows are deleted.'
COMMIT;
\else
\echo 'walk-residue-cleanup: RECORD ONLY. Nothing was deleted. Commit the JSON above, then rerun with -v apply_sha=<the SHA256 above>.'
ROLLBACK;
\endif
