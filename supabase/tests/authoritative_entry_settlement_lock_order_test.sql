-- Source-contract assertion for the canonical show -> class -> judge-day lock order.
-- A two-session behavioral race is also specified in the saved implementation plan.
DO $$
DECLARE
  v_definition text;
  v_show_lock integer;
  v_lineage integer;
  v_capacity integer;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'public.settle_entry_order(text,uuid,jsonb,integer,text,text,jsonb)'::regprocedure
  ) INTO STRICT v_definition;
  v_show_lock := position(
    'hashtext(''showcapacity:'' || v_source_show_id::text)' IN v_definition
  );
  v_lineage := position('FROM public.resolve_entry_payment_lineage' IN v_definition);
  v_capacity := position('FROM public.create_online_paid_entry' IN v_definition);
  IF v_show_lock = 0 OR v_lineage <= v_show_lock OR v_capacity <= v_lineage
     OR position('FOR v_lock IN' IN v_definition) > 0
     OR position('''judgeday:'' || ja.person_id::text' IN v_definition) > 0 THEN
    RAISE EXCEPTION 'FAIL settlement must acquire showcapacity before lineage/capacity work and leave class/judge order to the canonical capacity RPC';
  END IF;
  RAISE NOTICE 'PASS showcapacity pre-lock precedes lineage and capacity RPC';
END;
$$;
