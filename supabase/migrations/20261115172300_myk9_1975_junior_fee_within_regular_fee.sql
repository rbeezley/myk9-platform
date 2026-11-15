-- =============================================================================
-- MYK9-1975: the junior handler fee can never be more than the lowest regular fee.
--
-- Owner decision 2026-11-14 (MYK9-1952 / #3905 review). Checkout charges
-- LEAST(junior fee, regular fee) (private.price_entry_fee, and getShowEntryFee on
-- the client), but the premium and the landing page print the junior fee alone. A
-- junior fee above a regular fee therefore promised an amount checkout would never
-- charge. Show setup now refuses it: the Fees tab and the creation wizard check it
-- before saving, and these triggers make a direct write refuse it too.
--
-- "LOWEST REGULAR FEE" is every value the second argument of that LEAST can take,
-- read straight from private.price_entry_fee:
--   * shows.pre_entry_fee, when it is NOT NULL (zero included: a free entry);
--   * shows.day_of_show_fee, when it is above zero (zero means "no day-of tier");
--   * COALESCE(classes.entry_fee, 0) for each live class of the show, ONLY when
--     shows.pre_entry_fee IS NULL, because that is the only time pricing reads a
--     class's fee. Soft-deleted classes and trials take no entries and are skipped.
-- No change to how an entry is priced: the LEAST stays as the safety net for rows
-- written before this migration.
--
-- WRITE-ONLY, NO CHECK CONSTRAINT. Existing rows are not validated. On UPDATE a
-- trigger only checks when a value it compares actually changed, so an unrelated
-- edit (or a full-row upload from the replica) to a show already over the limit
-- still saves. Run the read-only query in the PR body before pushing to list them.
--
-- Two triggers:
--   trg_shows_junior_fee_within_regular   shows: a junior fee above the limit, or a
--                                         tier lowered below the junior fee.
--   trg_classes_fee_within_junior_fee     classes: a class fee written below the
--                                         junior fee on a show with no pre-entry fee.
-- Both raise SQLSTATE 23514 (check_violation) with the same plain-words message the
-- app shows: "The junior fee can't be more than $15, the lowest class fee in this
-- show." The helpers are SECURITY DEFINER so the class scan is not narrowed by the
-- writer's RLS; EXECUTE is revoked from every API role.
--
-- Behavioral coverage: supabase/tests/myk9_1975_junior_fee_within_regular_fee_test.sql
-- (behavioral SQL tests run only in CI).
-- =============================================================================

BEGIN;

-- The lowest regular fee a junior entry of this show could be priced at, or NULL
-- when there is none. p_exclude_class leaves out the class a trigger is writing, so
-- the caller can fold in that row's NEW fee instead of its OLD one.
CREATE OR REPLACE FUNCTION private.lowest_regular_entry_fee(
  p_show_id       uuid,
  p_pre_fee       numeric,
  p_dos_fee       numeric,
  p_exclude_class uuid DEFAULT NULL
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT min(fees.fee)
    FROM (
      SELECT p_pre_fee AS fee WHERE p_pre_fee IS NOT NULL
      UNION ALL
      SELECT p_dos_fee WHERE p_dos_fee IS NOT NULL AND p_dos_fee > 0
      UNION ALL
      SELECT COALESCE(c.entry_fee, 0)
        FROM public.classes c
        JOIN public.trials t ON t.id = c.trial_id
       WHERE p_pre_fee IS NULL
         AND t.show_id = p_show_id
         AND c.deleted_at IS NULL
         AND t.deleted_at IS NULL
         AND c.id IS DISTINCT FROM p_exclude_class
    ) AS fees;
$$;

COMMENT ON FUNCTION private.lowest_regular_entry_fee(uuid, numeric, numeric, uuid) IS
  'MYK9-1975: the lowest regular fee a junior entry of the show could be priced at (every value of the regular-fee side of LEAST in private.price_entry_fee), or NULL. Class fees count only when the show has no pre-entry fee.';

-- "$15" for whole dollars, "$15.50" otherwise: the same shape as formatFeeLimit in
-- apps/myk9show/src/features/_shared/juniorFeeLimit.ts.
CREATE OR REPLACE FUNCTION private.junior_fee_limit_message(p_limit numeric)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT 'The junior fee can''t be more than $'
    || CASE
         WHEN round(p_limit, 2) = trunc(p_limit) THEN pg_catalog.to_char(trunc(p_limit), 'FM999,999,990')
         ELSE pg_catalog.to_char(round(p_limit, 2), 'FM999,999,990.00')
       END
    || ', the lowest class fee in this show.';
$$;

CREATE OR REPLACE FUNCTION private.shows_junior_fee_within_regular()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_limit numeric;
BEGIN
  -- NULL or 0 = no junior tier.
  IF NEW.junior_handler_fee IS NULL OR NEW.junior_handler_fee <= 0 THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.junior_handler_fee IS NOT DISTINCT FROM OLD.junior_handler_fee
     AND NEW.pre_entry_fee IS NOT DISTINCT FROM OLD.pre_entry_fee
     AND NEW.day_of_show_fee IS NOT DISTINCT FROM OLD.day_of_show_fee THEN
    RETURN NEW;
  END IF;

  v_limit := private.lowest_regular_entry_fee(NEW.id, NEW.pre_entry_fee, NEW.day_of_show_fee);
  IF v_limit IS NOT NULL AND NEW.junior_handler_fee > v_limit THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = private.junior_fee_limit_message(v_limit),
      HINT = 'Lower the junior fee, or raise the fee that is below it.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_shows_junior_fee_within_regular ON public.shows;
CREATE TRIGGER trg_shows_junior_fee_within_regular
  BEFORE INSERT OR UPDATE OF junior_handler_fee, pre_entry_fee, day_of_show_fee
  ON public.shows
  FOR EACH ROW
  EXECUTE FUNCTION private.shows_junior_fee_within_regular();

CREATE OR REPLACE FUNCTION private.classes_fee_within_junior_fee()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_show_id    uuid;
  v_junior_fee numeric;
  v_pre_fee    numeric;
  v_dos_fee    numeric;
  v_class_fee  numeric;
  v_limit      numeric;
BEGIN
  -- A deleted class takes no entries, so its fee is never charged.
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.entry_fee IS NOT DISTINCT FROM OLD.entry_fee
     AND NEW.trial_id IS NOT DISTINCT FROM OLD.trial_id
     AND NEW.deleted_at IS NOT DISTINCT FROM OLD.deleted_at THEN
    RETURN NEW;
  END IF;

  SELECT s.id, s.junior_handler_fee, s.pre_entry_fee, s.day_of_show_fee
    INTO v_show_id, v_junior_fee, v_pre_fee, v_dos_fee
    FROM public.trials t
    JOIN public.shows s ON s.id = t.show_id
   WHERE t.id = NEW.trial_id
     AND t.deleted_at IS NULL;

  -- Pricing reads a class's fee only when the show has no pre-entry fee.
  IF NOT FOUND OR v_junior_fee IS NULL OR v_junior_fee <= 0 OR v_pre_fee IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_class_fee := COALESCE(NEW.entry_fee, 0);
  IF v_class_fee >= v_junior_fee THEN
    RETURN NEW;
  END IF;

  v_limit := LEAST(
    v_class_fee,
    COALESCE(private.lowest_regular_entry_fee(v_show_id, v_pre_fee, v_dos_fee, NEW.id), v_class_fee)
  );
  RAISE EXCEPTION USING
    ERRCODE = '23514',
    MESSAGE = private.junior_fee_limit_message(v_limit),
    HINT = 'Lower the show''s junior fee first, or keep this class fee at or above it.';
END;
$$;

DROP TRIGGER IF EXISTS trg_classes_fee_within_junior_fee ON public.classes;
CREATE TRIGGER trg_classes_fee_within_junior_fee
  BEFORE INSERT OR UPDATE OF entry_fee, trial_id, deleted_at
  ON public.classes
  FOR EACH ROW
  EXECUTE FUNCTION private.classes_fee_within_junior_fee();

REVOKE ALL ON FUNCTION private.lowest_regular_entry_fee(uuid, numeric, numeric, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.lowest_regular_entry_fee(uuid, numeric, numeric, uuid) FROM anon;
REVOKE ALL ON FUNCTION private.lowest_regular_entry_fee(uuid, numeric, numeric, uuid) FROM authenticated;
REVOKE ALL ON FUNCTION private.lowest_regular_entry_fee(uuid, numeric, numeric, uuid) FROM service_role;
REVOKE ALL ON FUNCTION private.junior_fee_limit_message(numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.junior_fee_limit_message(numeric) FROM anon;
REVOKE ALL ON FUNCTION private.junior_fee_limit_message(numeric) FROM authenticated;
REVOKE ALL ON FUNCTION private.junior_fee_limit_message(numeric) FROM service_role;
REVOKE ALL ON FUNCTION private.shows_junior_fee_within_regular() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.shows_junior_fee_within_regular() FROM anon;
REVOKE ALL ON FUNCTION private.shows_junior_fee_within_regular() FROM authenticated;
REVOKE ALL ON FUNCTION private.shows_junior_fee_within_regular() FROM service_role;
REVOKE ALL ON FUNCTION private.classes_fee_within_junior_fee() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.classes_fee_within_junior_fee() FROM anon;
REVOKE ALL ON FUNCTION private.classes_fee_within_junior_fee() FROM authenticated;
REVOKE ALL ON FUNCTION private.classes_fee_within_junior_fee() FROM service_role;

COMMIT;
