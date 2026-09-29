-- MYK9-662: a single received cash/check submission can contain adult entries
-- paid now and junior entries whose fee is still due. The server decides each
-- line from private DOB, not a client-supplied quote. The temporary submission
-- marker is visible only within this transaction and is replaced by the final
-- idempotent result before commit. It scopes the ledger's coarse entry cascade
-- to this one mixed submission; ordinary partial payments keep their behavior.

BEGIN;

DO $migration$
DECLARE
  definition text;
  old_text text;
  new_text text;
BEGIN
  SELECT pg_get_functiondef(
    'public.submit_show_entries(uuid,uuid,jsonb,uuid,text,jsonb)'::regprocedure
  ) INTO definition;

  old_text := '  v_server_cents  int;';
  new_text := old_text || E'\n  v_payment_deferred boolean;\n  v_has_deferred boolean := false;';
  IF (length(definition) - length(replace(definition, old_text, ''))) / length(old_text) <> 1 THEN
    RAISE EXCEPTION 'MYK9-662: server cents declaration anchor changed';
  END IF;
  definition := replace(definition, old_text, new_text);

  old_text := '  v_created_cents   int := 0;';
  new_text := old_text || E'\n  v_paid_cents      int := 0;';
  IF (length(definition) - length(replace(definition, old_text, ''))) / length(old_text) <> 1 THEN
    RAISE EXCEPTION 'MYK9-662: received cents declaration anchor changed';
  END IF;
  definition := replace(definition, old_text, new_text);

  old_text := '    v_server_cents := ROUND(v_server_fee * 100)::int;';
  new_text := $body$
    -- Only an actual received cash/check submission defers a known junior.
    -- Match the price override's selected-handler/typed-name rule exactly.
    v_payment_deferred := p_payment IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.shows s
        WHERE s.id = p_show_id AND s.junior_handler_fee > 0
      )
      AND (
        NULLIF(v_entry->>'handler_id', '') IS NOT NULL
        OR NULLIF(btrim(v_entry->>'handler_name'), '') IS NULL
      )
      AND private.entry_handler_is_junior(
        v_handler_person_id, v_class_id, v_trial_id
      ) IS TRUE;
$body$ || old_text;
  IF (length(definition) - length(replace(definition, old_text, ''))) / length(old_text) <> 1 THEN
    RAISE EXCEPTION 'MYK9-662: price boundary anchor changed';
  END IF;
  definition := replace(definition, old_text, new_text);

  old_text := $body$
      CASE
        WHEN p_payment_method IN ('secretary_paid', 'group_payment') THEN 'paid'
        WHEN p_payment_method IN ('waived') THEN 'waived'
        ELSE 'pending'
      END,
      p_payment_method,
$body$;
  new_text := $body$
      CASE
        WHEN v_payment_deferred THEN 'pending'
        WHEN p_payment IS NOT NULL AND v_server_cents > 0 THEN 'paid'
        WHEN p_payment_method IN ('secretary_paid', 'group_payment') THEN 'paid'
        WHEN p_payment_method IN ('waived') THEN 'waived'
        ELSE 'pending'
      END,
      CASE WHEN v_payment_deferred THEN NULL ELSE p_payment_method END,
$body$;
  IF (length(definition) - length(replace(definition, old_text, ''))) / length(old_text) <> 1 THEN
    RAISE EXCEPTION 'MYK9-662: entry payment status anchor changed';
  END IF;
  definition := replace(definition, old_text, new_text);

  old_text := '    v_created_cents := v_created_cents + v_server_cents;';
  new_text := old_text || $body$
    IF v_payment_deferred THEN
      v_has_deferred := true;
    ELSIF p_payment IS NOT NULL THEN
      v_paid_cents := v_paid_cents + v_server_cents;
    END IF;
$body$;
  IF (length(definition) - length(replace(definition, old_text, ''))) / length(old_text) <> 1 THEN
    RAISE EXCEPTION 'MYK9-662: created cents anchor changed';
  END IF;
  definition := replace(definition, old_text, new_text);

  old_text := '''fee_cents'', 0,';
  new_text := E'''fee_cents'', 0,\n        ''payment_deferred'', false,';
  IF (length(definition) - length(replace(definition, old_text, ''))) / length(old_text) <> 2 THEN
    RAISE EXCEPTION 'MYK9-662: non-created outcome anchors changed';
  END IF;
  definition := replace(definition, old_text, new_text);

  old_text := '''fee_cents'', v_server_cents,';
  new_text := E'''fee_cents'', v_server_cents,\n      ''payment_deferred'', v_payment_deferred,';
  IF (length(definition) - length(replace(definition, old_text, ''))) / length(old_text) <> 1 THEN
    RAISE EXCEPTION 'MYK9-662: created outcome anchor changed';
  END IF;
  definition := replace(definition, old_text, new_text);

  old_text := $body$
  IF p_payment IS NOT NULL AND v_created_cents > 0 THEN
    UPDATE public.enrollments
       SET total_amount = COALESCE(total_amount, 0) + v_created_cents,
           payment_method = v_pay_method,
           updated_at = now()
     WHERE id = p_registration_id;

    PERFORM private.record_enrollment_payment_core(
      p_registration_id, 'payment', v_created_cents / 100.0, v_pay_method, v_pay_received_on,
      NULLIF(btrim(p_payment->>'reference'), ''), NULL, p_submission_id
    );
  END IF;
$body$;
  new_text := $body$
  IF p_payment IS NOT NULL AND v_created_cents > 0 THEN
    UPDATE public.enrollments
       SET total_amount = COALESCE(total_amount, 0) + v_created_cents,
           payment_method = CASE WHEN v_paid_cents > 0 THEN v_pay_method ELSE payment_method END,
           updated_at = now()
     WHERE id = p_registration_id;

    IF v_paid_cents > 0 THEN
      IF v_has_deferred THEN
        INSERT INTO public.entry_submissions (id, result)
        VALUES (p_submission_id, jsonb_build_object(
          'registration_id', p_registration_id,
          'mixed_junior_payment_pending', true
        ));
      END IF;
      PERFORM private.record_enrollment_payment_core(
        p_registration_id, 'payment', v_paid_cents / 100.0, v_pay_method, v_pay_received_on,
        NULLIF(btrim(p_payment->>'reference'), ''), NULL, p_submission_id
      );
    END IF;
  END IF;
$body$;
  IF (length(definition) - length(replace(definition, old_text, ''))) / length(old_text) <> 1 THEN
    RAISE EXCEPTION 'MYK9-662: payment ledger anchor changed';
  END IF;
  definition := replace(definition, old_text, new_text);

  old_text := E'  INSERT INTO public.entry_submissions (id, result)\n  VALUES (p_submission_id, v_result);';
  -- Replace in one step, keeping the final result as the only committed value.
  IF (length(definition) - length(replace(definition, old_text, ''))) / length(old_text) <> 1 THEN
    RAISE EXCEPTION 'MYK9-662: idempotent result anchor changed';
  END IF;
  definition := replace(definition, old_text,
    '  INSERT INTO public.entry_submissions (id, result)' || E'\n'
    || '  VALUES (p_submission_id, v_result)' || E'\n'
    || '  ON CONFLICT (id) DO UPDATE SET result = EXCLUDED.result;');

  EXECUTE definition;
END;
$migration$;

DO $migration$
DECLARE
  definition text;
  anchor text := '  PERFORM private.cascade_enrollment_entry_payment_status(p_enrollment_id, v_entry_status);';
BEGIN
  SELECT pg_get_functiondef(
    'private.record_enrollment_payment_core(uuid,text,numeric,text,date,text,text,uuid)'::regprocedure
  ) INTO definition;
  IF (length(definition) - length(replace(definition, anchor, ''))) / length(anchor) <> 1 THEN
    RAISE EXCEPTION 'MYK9-662: ledger cascade anchor changed';
  END IF;
  definition := replace(definition, anchor, $body$
  -- A mixed submit already wrote each new line's exact status. Preserve those
  -- and older lines while the enrollment remains partly paid. Ordinary partial
  -- desk payments still use the existing coarse cascade.
  IF NOT (p_kind = 'payment'
      AND p_client_payment_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.entry_submissions es
        WHERE es.id = p_client_payment_id
          AND es.result->>'registration_id' = p_enrollment_id::text
          AND es.result->>'mixed_junior_payment_pending' = 'true'
      )) THEN
    PERFORM private.cascade_enrollment_entry_payment_status(p_enrollment_id, v_entry_status);
  END IF;
$body$);
  EXECUTE definition;
END;
$migration$;

COMMIT;
