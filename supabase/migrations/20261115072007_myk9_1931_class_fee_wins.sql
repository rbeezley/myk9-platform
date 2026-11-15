-- =============================================================================
-- MYK9-1931: the show's fee is the default; a class's own fee wins when one is set.
-- Plan: docs/plan-class-fees.md. Owner decisions 2026-11-13.
--
-- BEFORE. private.price_entry_fee (20260930214300) priced
--   the show's day-of fee (day-of entry, fee > 0), else the show's pre-entry fee,
--   else the class's own fee, else 0.
-- A class fee was reached only on a show with no pre-entry fee, and the setup
-- wizard copied the show's fee into every class it created, so a class fee was a
-- stale copy, never a choice.
--
-- AFTER.
--   * A class's own fee is classes.entry_fee when it is above 0. NULL or 0 is
--     "no own fee: charge the show's fee". Zero is never a price (free entries
--     have their own path), the same way a day-of fee of 0 means "no day-of tier".
--   * Pre-entry: the class's own fee, else the show's pre-entry fee, else 0.
--   * Day-of (and the show's day-of fee is > 0):
--       - a class with its own fee costs that fee PLUS the show's day-of
--         surcharge, meaning day_of_show_fee - pre_entry_fee when the show has a
--         pre-entry fee and the day-of fee is above it; otherwise nothing is added;
--       - a class without its own fee costs the show's day-of fee, as before.
--   * Junior: unchanged, LEAST(junior fee, normal fee) on an explicit secretary
--     override, so a junior pays the junior fee in a dearer class too.
--
-- CLEAN-UP, once. Every class fee that equals its show's pre-entry fee (a copy)
-- or is 0 is set to NULL, so it follows the show's fee from now on. A fee above
-- 0 that differs from the show's is a real choice and is kept. A class fee on a
-- show with no pre-entry fee is kept too (it was already the price). Prices do
-- not move: a copy equal to the show's fee prices the same either way, and a 0
-- class fee was never reached on a show with a fee (and prices 0 on a show
-- without one, as NULL does). The clean-up is private.clear_copied_class_fees(),
-- kept so the behavioral test exercises the same statement; it is idempotent.
--
-- EXISTING ENTRIES keep the fee they were charged: entries.entry_fee is frozen at
-- creation (20260930214300) and nothing here touches entries.
--
-- MYK9-1975 MIRRORS THE NEW ORDER. private.show_lowest_regular_fee is the lowest
-- normal fee price_entry_fee can return for any class of the show. Its candidates
-- are now: the pre-entry fee when set (0 counts), the day-of fee when > 0, and
-- every live class's own fee when > 0, plus 0 for a live class without its own
-- fee on a show with no pre-entry fee (it is priced at 0). The class trigger now
-- checks a class's own fee whenever one is set, and a class without one only
-- when the show has no pre-entry fee (otherwise the show's fee prices it, and the
-- show trigger owns that limit). An update that only swaps 0 for NULL (or back)
-- changes no price and is not checked, so the clean-up never trips it.
--
-- Client mirrors changed in the same PR: getShowEntryFee
-- (components/shows/RegistrationWorkflow/PaymentStep/utils.ts), the checkout
-- authority (supabase/functions/_shared/authoritativeFee.ts), the Finish
-- Payment fallback (store/cartStore.recovery.ts) and lowestRegularFee
-- (features/_shared/juniorFeeLimit.ts).
--
-- Function signatures are unchanged (CREATE OR REPLACE keeps ACLs); every
-- function is re-revoked from the API roles anyway and asserted below.
-- private.price_entry_fee stays SECURITY INVOKER (its callers are definer code).
-- show_lowest_regular_fee and classes_junior_fee_limit stay SECURITY DEFINER
-- with SET search_path = '' and schema-qualified names.
--
-- Behavioral coverage: supabase/tests/myk9_1931_class_fee_wins_test.sql and the
-- updated supabase/tests/myk9_1975_junior_fee_limit_test.sql (CI only).
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- The ONE pricing function, new order. Rebuilt from 20260930214300, the only
-- migration that defines it; the signature, OUT columns, the secretary check
-- and the junior LEAST are unchanged.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.price_entry_fee(
  p_show_id         uuid,
  p_class_id        uuid,
  p_is_day_of_show  boolean,
  p_junior_override boolean,
  OUT fee                numeric,
  OUT junior_fee_applied boolean
)
RETURNS record
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  v_junior_fee numeric;
  v_pre_fee    numeric;
  v_dos_fee    numeric;
  v_class_fee  numeric;
  v_own_fee    numeric;
  v_day_of     boolean;
  v_normal     numeric;
BEGIN
  SELECT s.junior_handler_fee, s.pre_entry_fee, s.day_of_show_fee
    INTO v_junior_fee, v_pre_fee, v_dos_fee
    FROM public.shows s
   WHERE s.id = p_show_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'show % not found', p_show_id USING ERRCODE = '22023';
  END IF;

  -- The override is a secretary's choice; anyone else asking for it is refused
  -- BEFORE anything is priced, whether or not this show has a junior fee, so a
  -- probe cannot learn the show's tier from the answer.
  IF p_junior_override AND NOT public.is_show_secretary(p_show_id) THEN
    RAISE EXCEPTION 'only the show secretary or a site admin can charge the junior handler fee'
      USING ERRCODE = '42501';
  END IF;

  SELECT c.entry_fee
    INTO v_class_fee
    FROM public.classes c
    JOIN public.trials t ON t.id = c.trial_id
   WHERE c.id = p_class_id
     AND t.show_id = p_show_id;

  -- A class's own fee: set and above 0. NULL or 0 = follow the show's fee.
  v_own_fee := CASE WHEN v_class_fee > 0 THEN v_class_fee END;

  -- A blank Day-of-Show Fee persists as 0.00, not NULL: zero means "no day-of
  -- tier", not "free" (MYK9-642). Must agree with getShowEntryFee on the client.
  v_day_of := p_is_day_of_show AND v_dos_fee IS NOT NULL AND v_dos_fee > 0;

  IF v_own_fee IS NOT NULL THEN
    -- The class's own fee, plus the show's day-of surcharge on a day-of entry.
    v_normal := v_own_fee + CASE
      WHEN v_day_of AND v_pre_fee IS NOT NULL AND v_dos_fee > v_pre_fee THEN v_dos_fee - v_pre_fee
      ELSE 0
    END;
  ELSE
    v_normal := COALESCE(
      CASE WHEN v_day_of THEN v_dos_fee ELSE v_pre_fee END,
      0
    );
  END IF;

  fee := v_normal;
  junior_fee_applied := false;

  -- Explicit override on a show that HAS a junior tier (NULL or 0 = none). LEAST: a
  -- junior tier configured above the regular fee never produces a fee above what the
  -- client can quote. Never reads a date of birth.
  IF p_junior_override AND v_junior_fee IS NOT NULL AND v_junior_fee > 0 THEN
    fee := LEAST(v_junior_fee, v_normal);
    junior_fee_applied := true;
  END IF;
END;
$$;

COMMENT ON FUNCTION private.price_entry_fee(uuid, uuid, boolean, boolean) IS
  'MYK9-878 / MYK9-1931: the ONE place an entry is priced. A class''s own fee (> 0) wins, plus the show''s day-of surcharge on a day-of entry; otherwise the show''s fee (day-of when > 0, else pre-entry), else 0. Junior ONLY on an explicit secretary / site-admin override, LEAST(junior, normal). No API role may execute it; callers are SECURITY DEFINER.';

-- ---------------------------------------------------------------------------
-- MYK9-1975's lowest regular fee, mirroring the new order.
-- ---------------------------------------------------------------------------
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
  -- A class's own fee (> 0) is always priced. A class without one is priced at the
  -- pre-entry fee (already a candidate) or, with no pre-entry fee, at 0.
  SELECT pg_catalog.min(
           CASE
             WHEN c.entry_fee > 0 THEN c.entry_fee
             WHEN p_pre_entry_fee IS NULL THEN 0
           END
         )
    INTO v_class_fee
    FROM public.classes c
    JOIN public.trials t ON t.id = c.trial_id
   WHERE t.show_id = p_show_id
     AND t.deleted_at IS NULL
     AND c.deleted_at IS NULL;

  -- LEAST ignores NULLs and is NULL only when every argument is.
  RETURN LEAST(
    p_pre_entry_fee,
    CASE WHEN p_day_of_show_fee > 0 THEN p_day_of_show_fee END,
    v_class_fee
  );
END;
$$;

CREATE OR REPLACE FUNCTION private.classes_junior_fee_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_junior  numeric;
  v_pre     numeric;
  v_new_own numeric;
  v_price   numeric;
BEGIN
  v_new_own := CASE WHEN NEW.entry_fee > 0 THEN NEW.entry_fee END;

  -- 0 and NULL are the same "no own fee": swapping one for the other changes no price.
  IF TG_OP = 'UPDATE'
     AND v_new_own IS NOT DISTINCT FROM (CASE WHEN OLD.entry_fee > 0 THEN OLD.entry_fee END)
     AND NEW.trial_id IS NOT DISTINCT FROM OLD.trial_id
  THEN
    RETURN NULL;
  END IF;

  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NULL;
  END IF;

  SELECT s.junior_handler_fee, s.pre_entry_fee
    INTO v_junior, v_pre
    FROM public.trials t
    JOIN public.shows s ON s.id = t.show_id
   WHERE t.id = NEW.trial_id
     AND t.deleted_at IS NULL;

  IF v_junior IS NULL OR v_junior <= 0 THEN
    RETURN NULL;
  END IF;

  -- The class's own fee when it has one. Without one it is priced at the show's
  -- pre-entry fee (the show trigger owns that limit) or, with none, at 0.
  v_price := COALESCE(v_new_own, CASE WHEN v_pre IS NULL THEN 0 END);

  IF v_price IS NOT NULL AND v_price < v_junior THEN
    RAISE EXCEPTION 'A class fee can''t be less than the junior fee of %. Lower the junior fee first.',
      private.format_fee_dollars(v_junior)
      USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION private.show_lowest_regular_fee(uuid, numeric, numeric) IS
  'MYK9-1975 / MYK9-1931: the lowest normal fee private.price_entry_fee can charge for any class of the show (pre-entry fee when set; day-of fee when > 0; every live class''s own fee when > 0; 0 for a live class without one when there is no pre-entry fee). NULL when there is none.';
COMMENT ON FUNCTION private.classes_junior_fee_limit() IS
  'MYK9-1975 / MYK9-1931: refuses a class fee below the show''s junior handler fee: a class''s own fee whenever it is set, and a class without one when the show has no pre-entry fee (it is priced at 0).';

-- ---------------------------------------------------------------------------
-- The clean-up: empty copied and zero class fees.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.clear_copied_class_fees()
RETURNS integer
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.classes c
     SET entry_fee = NULL
    FROM public.trials t
    JOIN public.shows s ON s.id = t.show_id
   WHERE t.id = c.trial_id
     AND c.entry_fee IS NOT NULL
     AND (c.entry_fee = 0 OR c.entry_fee = s.pre_entry_fee);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION private.clear_copied_class_fees() IS
  'MYK9-1931: sets classes.entry_fee to NULL where it is 0 or equals the show''s pre-entry fee (a copy made at class creation), so the class follows the show''s fee. A different fee above 0 is kept. Idempotent; returns the number of classes changed. Run once by its migration.';

DO $$
DECLARE
  v_cleared integer;
BEGIN
  v_cleared := private.clear_copied_class_fees();
  RAISE NOTICE 'MYK9-1931: emptied % copied or zero class fees', v_cleared;
END $$;

REVOKE ALL ON FUNCTION private.price_entry_fee(uuid, uuid, boolean, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.price_entry_fee(uuid, uuid, boolean, boolean) FROM anon;
REVOKE ALL ON FUNCTION private.price_entry_fee(uuid, uuid, boolean, boolean) FROM authenticated;
REVOKE ALL ON FUNCTION private.price_entry_fee(uuid, uuid, boolean, boolean) FROM service_role;
REVOKE ALL ON FUNCTION private.show_lowest_regular_fee(uuid, numeric, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.show_lowest_regular_fee(uuid, numeric, numeric) FROM anon;
REVOKE ALL ON FUNCTION private.show_lowest_regular_fee(uuid, numeric, numeric) FROM authenticated;
REVOKE ALL ON FUNCTION private.show_lowest_regular_fee(uuid, numeric, numeric) FROM service_role;
REVOKE ALL ON FUNCTION private.classes_junior_fee_limit() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.classes_junior_fee_limit() FROM anon;
REVOKE ALL ON FUNCTION private.classes_junior_fee_limit() FROM authenticated;
REVOKE ALL ON FUNCTION private.classes_junior_fee_limit() FROM service_role;
REVOKE ALL ON FUNCTION private.clear_copied_class_fees() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.clear_copied_class_fees() FROM anon;
REVOKE ALL ON FUNCTION private.clear_copied_class_fees() FROM authenticated;
REVOKE ALL ON FUNCTION private.clear_copied_class_fees() FROM service_role;

-- Fail the push rather than ship a callable pricing or clean-up function.
DO $$
DECLARE
  v_fn   text;
  v_role text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'private.price_entry_fee(uuid, uuid, boolean, boolean)',
    'private.show_lowest_regular_fee(uuid, numeric, numeric)',
    'private.classes_junior_fee_limit()',
    'private.clear_copied_class_fees()'
  ] LOOP
    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
      IF pg_catalog.has_function_privilege(v_role, v_fn, 'EXECUTE') THEN
        RAISE EXCEPTION '% can execute %; it must not', v_role, v_fn;
      END IF;
    END LOOP;
  END LOOP;
END $$;

COMMIT;
