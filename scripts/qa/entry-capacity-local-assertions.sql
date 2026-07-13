\set ON_ERROR_STOP on

BEGIN;
SET LOCAL test.is_official = 'true';
TRUNCATE public.entries, public.waitlist_entries, public.entry_submissions;
UPDATE public.classes SET max_entries = 5, allow_waitlist = true;
UPDATE public.shows SET default_judge_day_capacity = 2, mail_in_value = 1;

DO $$
DECLARE
  r record;
  first_waitlist_id uuid;
  second_waitlist_id uuid;
  result jsonb;
  retry_result jsonb;
BEGIN
  INSERT INTO public.entries (class_id, entry_status, dog_id)
  VALUES (
    '00000000-0000-0000-0000-000000000003',
    'submitted',
    '00000000-0000-0000-0000-000000000032'
  );

  SELECT * INTO r
  FROM public.evaluate_entry_capacity(
    '00000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000030',
    '00000000-0000-0000-0000-000000000012',
    '00000000-0000-0000-0000-000000000010',
    'self_service',
    false
  );
  IF r.outcome <> 'waitlisted' THEN
    RAISE EXCEPTION 'self-service reserve test failed: %', r.outcome;
  END IF;

  first_waitlist_id := r.waitlist_entry_id;
  SELECT * INTO r
  FROM public.evaluate_entry_capacity(
    '00000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000030',
    '00000000-0000-0000-0000-000000000012',
    '00000000-0000-0000-0000-000000000010',
    'self_service',
    false
  );
  second_waitlist_id := r.waitlist_entry_id;
  IF second_waitlist_id IS DISTINCT FROM first_waitlist_id THEN
    RAISE EXCEPTION 'duplicate waitlist idempotency failed';
  END IF;

  DELETE FROM public.waitlist_entries;
  SELECT * INTO r
  FROM public.evaluate_entry_capacity(
    '00000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000030',
    '00000000-0000-0000-0000-000000000012',
    '00000000-0000-0000-0000-000000000010',
    'organizer',
    true
  );
  IF r.outcome <> 'available' THEN
    RAISE EXCEPTION 'organizer physical-capacity test failed: %', r.outcome;
  END IF;

  UPDATE public.classes SET max_entries = 1;
  SELECT * INTO r
  FROM public.evaluate_entry_capacity(
    '00000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000031',
    '00000000-0000-0000-0000-000000000012',
    '00000000-0000-0000-0000-000000000010',
    'organizer',
    true
  );
  IF r.outcome <> 'waitlisted' THEN
    RAISE EXCEPTION 'class maximum test failed: %', r.outcome;
  END IF;

  UPDATE public.classes SET allow_waitlist = false;
  SELECT * INTO r
  FROM public.evaluate_entry_capacity(
    '00000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000031',
    '00000000-0000-0000-0000-000000000012',
    '00000000-0000-0000-0000-000000000010',
    'organizer',
    true
  );
  IF r.outcome <> 'denied' THEN
    RAISE EXCEPTION 'denied outcome test failed: %', r.outcome;
  END IF;

  SELECT * INTO r
  FROM public.evaluate_entry_capacity(
    '00000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000031',
    '00000000-0000-0000-0000-000000000012',
    '00000000-0000-0000-0000-000000000010',
    'show_desk',
    true
  );
  IF r.outcome <> 'available' OR r.capacity_override IS NOT TRUE THEN
    RAISE EXCEPTION 'show-desk override test failed: %, %', r.outcome, r.capacity_override;
  END IF;

  PERFORM set_config('test.is_official', 'false', true);
  PERFORM set_config(
    'request.jwt.claim.sub',
    '00000000-0000-0000-0000-000000000011',
    true
  );
  BEGIN
    PERFORM public.submit_show_entries(
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000040',
      jsonb_build_array(jsonb_build_object(
        'dog_id', '00000000-0000-0000-0000-000000000030',
        'class_id', '00000000-0000-0000-0000-000000000003',
        'handler_id', '00000000-0000-0000-0000-000000000010',
        'handler_name', 'Owner One',
        'client_fee_cents', 2500,
        'submission_source', 'organizer'
      )),
      '00000000-0000-0000-0000-000000000051',
      'check'
    );
    RAISE EXCEPTION 'unauthorized organizer source was accepted';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;

  BEGIN
    PERFORM public.submit_show_entries(
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000041',
      jsonb_build_array(jsonb_build_object(
        'dog_id', '00000000-0000-0000-0000-000000000030',
        'class_id', '00000000-0000-0000-0000-000000000003',
        'handler_id', '00000000-0000-0000-0000-000000000010',
        'handler_name', 'Owner One',
        'client_fee_cents', 2500,
        'submission_source', 'self_service'
      )),
      '00000000-0000-0000-0000-000000000052',
      'check'
    );
    RAISE EXCEPTION 'cross-enrollment self-service submission was accepted';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
  PERFORM set_config('test.is_official', 'true', true);

  DELETE FROM public.entries;
  DELETE FROM public.waitlist_entries;
  UPDATE public.classes SET max_entries = 1, allow_waitlist = true;
  UPDATE public.shows SET default_judge_day_capacity = 10, mail_in_value = 0;

  result := public.submit_show_entries(
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000040',
    jsonb_build_array(
      jsonb_build_object(
        'dog_id', '00000000-0000-0000-0000-000000000030',
        'class_id', '00000000-0000-0000-0000-000000000003',
        'handler_id', '00000000-0000-0000-0000-000000000010',
        'handler_name', 'Owner One',
        'client_fee_cents', 2500,
        'submission_source', 'organizer'
      ),
      jsonb_build_object(
        'dog_id', '00000000-0000-0000-0000-000000000031',
        'class_id', '00000000-0000-0000-0000-000000000003',
        'handler_id', '00000000-0000-0000-0000-000000000010',
        'handler_name', 'Owner One',
        'client_fee_cents', 2500,
        'submission_source', 'organizer'
      )
    ),
    '00000000-0000-0000-0000-000000000050',
    'check'
  );

  IF jsonb_array_length(result->'entries') <> 1
     OR jsonb_array_length(result->'outcomes') <> 2
     OR result #>> '{outcomes,0,outcome}' <> 'created'
     OR result #>> '{outcomes,1,outcome}' <> 'waitlisted' THEN
    RAISE EXCEPTION 'mixed submit outcomes failed: %', result;
  END IF;

  retry_result := public.submit_show_entries(
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000040',
    '[]'::jsonb,
    '00000000-0000-0000-0000-000000000050',
    'check'
  );
  IF retry_result IS DISTINCT FROM result THEN
    RAISE EXCEPTION 'submission idempotency failed';
  END IF;

  PERFORM set_config('test.is_official', 'false', true);
  PERFORM set_config(
    'request.jwt.claim.sub',
    '00000000-0000-0000-0000-000000000021',
    true
  );
  BEGIN
    PERFORM public.submit_show_entries(
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000041',
      '[]'::jsonb,
      '00000000-0000-0000-0000-000000000050',
      'check'
    );
    RAISE EXCEPTION 'cross-registration idempotency result was exposed';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
END;
$$;

ROLLBACK;
