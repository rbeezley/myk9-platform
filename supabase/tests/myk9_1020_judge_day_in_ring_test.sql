-- MYK9-1020: the summary view must count every status that occupies judge-day
-- capacity. This checks the deployed view definition, including the in-ring
-- state that was missing, without relying on a specific show's fixture rows.
DO $$
DECLARE
  v_definition text := pg_get_viewdef('public.judge_day_summary'::regclass, true);
  v_status text;
BEGIN
  FOREACH v_status IN ARRAY ARRAY[
    'submitted', 'paid', 'confirmed', 'checked-in', 'competing',
    'in-ring', 'pending-payment'
  ] LOOP
    IF position(quote_literal(v_status) IN v_definition) = 0 THEN
      RAISE EXCEPTION 'judge_day_summary misses capacity status %', v_status;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class
    WHERE oid = 'public.judge_day_summary'::regclass
      AND 'security_invoker=true' = ANY (reloptions)
  ) THEN
    RAISE EXCEPTION 'judge_day_summary lost security_invoker';
  END IF;
END;
$$;
