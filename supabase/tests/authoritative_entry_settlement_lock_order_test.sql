-- Source-contract assertion for the mixed-cart judge-day/class lock order.
-- A two-session behavioral race is also specified in the saved implementation plan.
DO $$
DECLARE
  v_definition text;
  v_judge_loop integer;
  v_judge_lock integer;
  v_lineage integer;
  v_capacity integer;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'public.settle_entry_order(text,uuid,jsonb,integer,text,text,jsonb)'::regprocedure
  ) INTO STRICT v_definition;
  v_judge_loop := position('FOR v_lock IN' IN v_definition);
  v_judge_lock := position('pg_advisory_xact_lock(v_lock.lock_key)' IN v_definition);
  v_lineage := position('FROM public.resolve_entry_payment_lineage' IN v_definition);
  v_capacity := position('FROM public.create_online_paid_entry' IN v_definition);
  IF v_judge_loop = 0 OR v_judge_lock <= v_judge_loop
     OR v_lineage <= v_judge_lock OR v_capacity <= v_lineage
     OR position('ORDER BY ja.person_id, t.date' IN v_definition) = 0
     OR position('''judgeday:'' || ja.person_id::text || '':'' || t.date::text' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'FAIL settlement must lock exact judge-day keys in deterministic order before lineage/class capacity work';
  END IF;
  RAISE NOTICE 'PASS judge-day advisory locks precede lineage and capacity locks';
END;
$$;
