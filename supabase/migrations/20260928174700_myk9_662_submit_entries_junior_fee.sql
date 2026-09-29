-- MYK9-662: patch the latest submit_show_entries definition from
-- 20260926231700 (MYK9-841), preserving MYK9-824's
-- owner fallback and MYK9-841's staff acceptance behavior. The exact anchor
-- assertion fails the migration if the function changes before this applies.
BEGIN;

DO $migration$
DECLARE
  definition text;
  anchor constant text := '    v_server_cents := ROUND(v_server_fee * 100)::int;';
  junior_override constant text := $body$
    -- MYK9-662: only a known junior at this trial gets the configured rate.
    v_server_fee := COALESCE(
      (SELECT s.junior_handler_fee
         FROM public.shows s
        WHERE s.id = p_show_id
          AND s.junior_handler_fee > 0
          AND (
            NULLIF(v_entry->>'handler_id', '') IS NOT NULL
            OR NULLIF(v_entry->>'handler_name', '') IS NULL
          )
          AND private.entry_handler_is_junior(v_handler_person_id, v_class_id, v_trial_id) IS TRUE),
      v_server_fee
    );

$body$;
BEGIN
  SELECT pg_get_functiondef(
    'public.submit_show_entries(uuid,uuid,jsonb,uuid,text,jsonb)'::regprocedure
  ) INTO definition;

  IF definition IS NULL OR
     (length(definition) - length(replace(definition, anchor, ''))) / length(anchor) <> 1 THEN
    RAISE EXCEPTION 'MYK9-662: submit_show_entries fee anchor changed; rebuild from latest definition';
  END IF;

  EXECUTE replace(definition, anchor, junior_override || anchor);
END;
$migration$;

-- Offline show-desk entries cannot read private handler birth dates. They queue a
-- pending entry with NULL entry_fee; this trigger prices it on insert, before
-- ledger/replication readers see it. Explicit fees and waived entries retain
-- their existing behavior. A stale offline show may not know whether a junior
-- tier exists, so every pending myk9 row with a NULL fee needs server pricing.
CREATE FUNCTION private.price_pending_offline_junior_entry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_pre_fee numeric;
  v_dos_fee numeric;
  v_junior_fee numeric;
  v_class_fee numeric;
  v_trial_id uuid;
  v_handler_id uuid;
BEGIN
  IF NEW.entry_source IS DISTINCT FROM 'myk9'
     OR NEW.payment_status IS DISTINCT FROM 'pending'
     OR NEW.entry_fee IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT s.pre_entry_fee, s.day_of_show_fee, s.junior_handler_fee,
         c.entry_fee, t.id
    INTO v_pre_fee, v_dos_fee, v_junior_fee, v_class_fee, v_trial_id
    FROM public.classes c
    JOIN public.trials t ON t.id = c.trial_id
    JOIN public.shows s ON s.id = t.show_id
   WHERE c.id = NEW.class_id AND s.id = NEW.show_id;

  IF v_trial_id IS NULL THEN
    RAISE EXCEPTION 'class % does not belong to show %', NEW.class_id, NEW.show_id
      USING ERRCODE = '22023';
  END IF;

  -- A blank handler means the dog owner handles, matching submit_show_entries.
  v_handler_id := NEW.handler_id;
  IF v_handler_id IS NULL AND nullif(btrim(NEW.handler), '') IS NULL THEN
    SELECT d.owner_id INTO v_handler_id FROM public.dogs d WHERE d.id = NEW.dog_id;
    NEW.handler_id := v_handler_id;
  END IF;

  NEW.entry_fee := coalesce(
    CASE WHEN v_junior_fee > 0 AND v_handler_id IS NOT NULL
           AND private.entry_handler_is_junior(v_handler_id, NEW.class_id, v_trial_id) IS TRUE
      THEN v_junior_fee END,
    CASE WHEN NEW.is_day_of_show IS TRUE AND v_dos_fee > 0 THEN v_dos_fee
      ELSE v_pre_fee END,
    v_class_fee,
    0
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.price_pending_offline_junior_entry() FROM PUBLIC;
-- PostgreSQL fires same-kind triggers by name. Price and resolve the owner
-- before trg_entries_handler_is_junior records the derived flag.
CREATE TRIGGER trg_entries_fee_before_junior_flag
  BEFORE INSERT ON public.entries
  FOR EACH ROW EXECUTE FUNCTION private.price_pending_offline_junior_entry();

COMMIT;
