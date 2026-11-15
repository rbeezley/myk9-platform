-- =============================================================================
-- MYK9-1975: a show's junior handler fee can never be set above the lowest
-- regular fee a junior entry could be priced at.
--
-- WHY. Checkout charges LEAST(junior fee, the class's regular fee)
-- (private.price_entry_fee, 20260930214300; getShowEntryFee on the client). The
-- premium and the landing page print the junior fee alone, so a junior fee above
-- a regular fee promises an amount checkout will not charge. Owner decision
-- 2026-11-14 (MYK9-1952 / #3905 review): stop it at show setup. The LEAST rule
-- stays as the safety net; this migration changes no price and no entry.
--
-- "LOWEST REGULAR FEE" = the lowest fee private.price_entry_fee can return as the
-- normal (non-junior) fee for any class of the show. That function prices
--   day_of_show_fee when it is a day-of entry and the fee is > 0, else
--   pre_entry_fee, else the class's own entry_fee, else 0.
-- So the candidates are:
--   * shows.pre_entry_fee, when it is NOT NULL (0 counts: it is charged as 0);
--   * shows.day_of_show_fee, when it is > 0 (0 / NULL = no day-of tier);
--   * classes.entry_fee of every live class (deleted_at IS NULL) in every live
--     trial of the show, ONLY when pre_entry_fee IS NULL, because a class's own
--     fee is reached only then. A NULL class fee is not a fee and is skipped.
-- A show with no candidate has no limit. A junior fee that is NULL or 0 is "no
-- junior tier" (the 20260930214300 convention) and is never limited.
--
-- ENFORCEMENT. Two AFTER ROW triggers, so existing rows never fail:
--   * trg_shows_junior_fee_limit: AFTER INSERT, or an UPDATE that changes
--     junior_handler_fee, pre_entry_fee or day_of_show_fee. An update that leaves
--     all three unchanged (a rename, a full-row upload) is not checked, so a show
--     already over the limit keeps working until someone changes a fee.
--   * trg_classes_junior_fee_limit: AFTER INSERT, or an UPDATE that changes
--     entry_fee or trial_id, of a live class whose show has a junior tier and no
--     pre-entry fee (the only case a class fee is priced).
-- AFTER, not BEFORE: an AFTER trigger sees the final row after every BEFORE
-- trigger, and does not fire for a row that INSERT ... ON CONFLICT DO NOTHING
-- skipped (create_show_with_children re-uses ids that way on a retry).
-- No CHECK constraint: it would fail on existing data.
--
-- Both raise SQLSTATE 23514 with a plain sentence naming the limit; the app's
-- save-error copy (utils/friendlySaveError.ts) shows an authored message as is.
--
-- SECURITY DEFINER with SET search_path = '': the limit must see every class and
-- trial of the show whatever RLS shows the writer, and every name is
-- schema-qualified. EXECUTE is revoked from PUBLIC, anon, authenticated and
-- service_role; a trigger function needs no EXECUTE grant to fire.
--
-- Behavioral coverage: supabase/tests/myk9_1975_junior_fee_limit_test.sql
-- (behavioral SQL tests run only in CI).
-- =============================================================================

BEGIN;

-- The lowest regular fee of a show, from the show's own (possibly not yet
-- written) fee columns and its stored classes. NULL = nothing to compare against.
CREATE OR REPLACE FUNCTION private.show_lowest_regular_fee(
  p_show_id         uuid,
  p_pre_entry_fee   numeric,
  p_day_of_show_fee numeric
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_class_fee numeric;
BEGIN
  IF p_pre_entry_fee IS NULL THEN
    SELECT pg_catalog.min(c.entry_fee)
      INTO v_class_fee
      FROM public.classes c
      JOIN public.trials t ON t.id = c.trial_id
     WHERE t.show_id = p_show_id
       AND t.deleted_at IS NULL
       AND c.deleted_at IS NULL
       AND c.entry_fee IS NOT NULL;
  END IF;

  -- LEAST ignores NULLs and is NULL only when every argument is.
  RETURN LEAST(
    p_pre_entry_fee,
    CASE WHEN p_day_of_show_fee > 0 THEN p_day_of_show_fee END,
    v_class_fee
  );
END;
$$;

-- "$15" for whole dollars, "$15.50" otherwise: the copy the Fees tab shows.
CREATE OR REPLACE FUNCTION private.format_fee_dollars(p_amount numeric)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT '$' || pg_catalog.regexp_replace(
    pg_catalog.to_char(p_amount, 'FM999999990.00'), '\.00$', ''
  );
$$;

CREATE OR REPLACE FUNCTION private.shows_junior_fee_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_limit numeric;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.junior_handler_fee IS NOT DISTINCT FROM OLD.junior_handler_fee
     AND NEW.pre_entry_fee IS NOT DISTINCT FROM OLD.pre_entry_fee
     AND NEW.day_of_show_fee IS NOT DISTINCT FROM OLD.day_of_show_fee
  THEN
    RETURN NULL;
  END IF;

  IF NEW.junior_handler_fee IS NULL OR NEW.junior_handler_fee <= 0 THEN
    RETURN NULL;
  END IF;

  v_limit := private.show_lowest_regular_fee(NEW.id, NEW.pre_entry_fee, NEW.day_of_show_fee);

  IF v_limit IS NOT NULL AND NEW.junior_handler_fee > v_limit THEN
    RAISE EXCEPTION 'The junior fee can''t be more than %, the lowest class fee in this show.',
      private.format_fee_dollars(v_limit)
      USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION private.classes_junior_fee_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_junior numeric;
  v_pre    numeric;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.entry_fee IS NOT DISTINCT FROM OLD.entry_fee
     AND NEW.trial_id IS NOT DISTINCT FROM OLD.trial_id
  THEN
    RETURN NULL;
  END IF;

  IF NEW.deleted_at IS NOT NULL OR NEW.entry_fee IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT s.junior_handler_fee, s.pre_entry_fee
    INTO v_junior, v_pre
    FROM public.trials t
    JOIN public.shows s ON s.id = t.show_id
   WHERE t.id = NEW.trial_id
     AND t.deleted_at IS NULL;

  -- A class's own fee is priced only when the show has no pre-entry fee.
  IF v_junior IS NULL OR v_junior <= 0 OR v_pre IS NOT NULL THEN
    RETURN NULL;
  END IF;

  IF NEW.entry_fee < v_junior THEN
    RAISE EXCEPTION 'A class fee can''t be less than the junior fee of %. Lower the junior fee first.',
      private.format_fee_dollars(v_junior)
      USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_shows_junior_fee_limit ON public.shows;
CREATE TRIGGER trg_shows_junior_fee_limit
  AFTER INSERT OR UPDATE OF junior_handler_fee, pre_entry_fee, day_of_show_fee ON public.shows
  FOR EACH ROW EXECUTE FUNCTION private.shows_junior_fee_limit();

DROP TRIGGER IF EXISTS trg_classes_junior_fee_limit ON public.classes;
CREATE TRIGGER trg_classes_junior_fee_limit
  AFTER INSERT OR UPDATE OF entry_fee, trial_id ON public.classes
  FOR EACH ROW EXECUTE FUNCTION private.classes_junior_fee_limit();

COMMENT ON FUNCTION private.show_lowest_regular_fee(uuid, numeric, numeric) IS
  'MYK9-1975: the lowest normal fee private.price_entry_fee can charge for any class of the show (pre-entry fee when set; day-of fee when > 0; live class fees only when there is no pre-entry fee). NULL when there is none.';
COMMENT ON FUNCTION private.shows_junior_fee_limit() IS
  'MYK9-1975: refuses a show write that leaves the junior handler fee above the lowest regular fee. Fires only when a fee column changes, so existing rows never fail.';
COMMENT ON FUNCTION private.classes_junior_fee_limit() IS
  'MYK9-1975: refuses a class fee below the show''s junior handler fee when that class fee is what checkout charges (the show has no pre-entry fee).';

REVOKE ALL ON FUNCTION private.show_lowest_regular_fee(uuid, numeric, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.show_lowest_regular_fee(uuid, numeric, numeric) FROM anon;
REVOKE ALL ON FUNCTION private.show_lowest_regular_fee(uuid, numeric, numeric) FROM authenticated;
REVOKE ALL ON FUNCTION private.show_lowest_regular_fee(uuid, numeric, numeric) FROM service_role;
REVOKE ALL ON FUNCTION private.format_fee_dollars(numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.format_fee_dollars(numeric) FROM anon;
REVOKE ALL ON FUNCTION private.format_fee_dollars(numeric) FROM authenticated;
REVOKE ALL ON FUNCTION private.format_fee_dollars(numeric) FROM service_role;
REVOKE ALL ON FUNCTION private.shows_junior_fee_limit() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.shows_junior_fee_limit() FROM anon;
REVOKE ALL ON FUNCTION private.shows_junior_fee_limit() FROM authenticated;
REVOKE ALL ON FUNCTION private.shows_junior_fee_limit() FROM service_role;
REVOKE ALL ON FUNCTION private.classes_junior_fee_limit() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.classes_junior_fee_limit() FROM anon;
REVOKE ALL ON FUNCTION private.classes_junior_fee_limit() FROM authenticated;
REVOKE ALL ON FUNCTION private.classes_junior_fee_limit() FROM service_role;

-- Fail the push rather than ship a callable definer function.
DO $$
DECLARE
  v_fn   text;
  v_role text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'private.show_lowest_regular_fee(uuid, numeric, numeric)',
    'private.format_fee_dollars(numeric)',
    'private.shows_junior_fee_limit()',
    'private.classes_junior_fee_limit()'
  ] LOOP
    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
      IF pg_catalog.has_function_privilege(v_role, v_fn, 'EXECUTE') THEN
        RAISE EXCEPTION '% can execute %; it must not', v_role, v_fn;
      END IF;
    END LOOP;
  END LOOP;
END $$;

COMMIT;
