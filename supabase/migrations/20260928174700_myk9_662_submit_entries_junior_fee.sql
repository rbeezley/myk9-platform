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

COMMIT;
