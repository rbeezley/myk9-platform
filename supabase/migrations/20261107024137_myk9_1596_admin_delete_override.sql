-- MYK9-1596: a SITE ADMIN can override a blocked delete of a show, trial or class.
--
-- WHAT EXISTED. soft_delete_show / _trial / _class (20261002015900) already take
-- p_override: private.require_override_allowed refuses `true` for anyone but a
-- site admin (42501) and private.raise_if_blocked skips the MK010 refusal. The
-- override left no record of who did it or why, and the dialog never offered it.
--
-- WHAT CHANGES
--   1. The three RPCs gain `p_reason text DEFAULT NULL`. With p_override => true
--      a blank reason is refused (22023); with p_override => false the reason is
--      ignored, so every existing caller works unchanged. The audit row is
--      written in the SAME transaction as the delete, so a delete that rolls back
--      leaves no row and a row never exists without its delete.
--   2. The audit row is an activity_log row (record_type show/trial/class,
--      action 'deleted'), the same table force_delete_dog writes
--      (20260924104100). Who (actor_id/actor_name), when (created_at and
--      metadata.deleted_at), why (metadata.reason) and what money was recorded on
--      the paid/scored entries (metadata.payments, with the unrefunded Stripe
--      count and amount). The override issues NO refund: refund_issued is false.
--   3. delete_preview (show/trial/class branches) also reports paid_amount (sum
--      of entry_fee on paid entries), stripe_unrefunded (paid entries with a
--      stripe_payment_intent_id and no refund_amount) and stripe_unrefunded_amount,
--      so the dialog can state the consequence in numbers. Other scopes report 0.
--
-- THE SIGNATURE CHANGES, so the old (uuid, boolean) functions are DROPPED first.
-- Leaving both would make a call that names only p_show_id ambiguous and PostgREST
-- would answer 300. Nothing in the database calls these three functions. The ACLs
-- are restated exactly as 20261002015900 left them (never anon or PUBLIC).
--
-- Still a soft delete; restore_show / restore_trial / restore_class are untouched
-- and bring back everything carrying the delete's one deleted_at stamp, including
-- the paid and scored entries the override tombstoned.
--
-- DEPENDENCY (as force_delete_dog): public.activity_log has FORCE ROW LEVEL
-- SECURITY and an INSERT policy of actor_id = auth.uid() TO authenticated. The
-- insert reaches the table because the definer owner `postgres` has BYPASSRLS.
-- Bodies below are copied from 20261002015900 (the latest definition of each);
-- delete_preview from 20261002143717.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Internal helpers (never executable by a client role).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.require_override_reason(p_override boolean, p_reason text)
RETURNS text
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF p_override IS TRUE AND NULLIF(btrim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'A reason is required to override the paid or scored guard'
      USING ERRCODE = '22023';
  END IF;
  RETURN NULLIF(btrim(p_reason), '');
END;
$$;

-- Runs nested inside the definer delete RPCs (current_user = postgres), so it is
-- SECURITY INVOKER on purpose: it adds no privilege of its own.
CREATE OR REPLACE FUNCTION private.record_delete_override(
  p_scope text,
  p_id uuid,
  p_reason text,
  p_deleted_at timestamptz,
  p_entries jsonb
)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_name text;
  v_actor_name text;
  v_paid integer;
  v_paid_amount numeric;
  v_stripe integer;
  v_stripe_amount numeric;
BEGIN
  v_name := CASE p_scope
    WHEN 'show' THEN (SELECT s.name FROM public.shows s WHERE s.id = p_id)
    WHEN 'trial' THEN (SELECT t.name FROM public.trials t WHERE t.id = p_id)
    ELSE (SELECT c.name FROM public.classes c WHERE c.id = p_id)
  END;

  SELECT TRIM(COALESCE(pe.first_name, '') || ' ' || COALESCE(pe.last_name, ''))
  INTO v_actor_name
  FROM public.people pe
  WHERE pe.auth_user_id = (SELECT auth.uid())
  LIMIT 1;

  SELECT count(*) FILTER (WHERE x ->> 'payment_status' = 'paid')::integer,
         COALESCE(sum((x ->> 'entry_fee')::numeric) FILTER (WHERE x ->> 'payment_status' = 'paid'), 0),
         count(*) FILTER (WHERE x ->> 'payment_status' = 'paid'
                            AND x ->> 'stripe_payment_intent_id' IS NOT NULL
                            AND COALESCE((x ->> 'refund_amount')::numeric, 0) = 0)::integer,
         COALESCE(sum((x ->> 'entry_fee')::numeric) FILTER (WHERE x ->> 'payment_status' = 'paid'
                            AND x ->> 'stripe_payment_intent_id' IS NOT NULL
                            AND COALESCE((x ->> 'refund_amount')::numeric, 0) = 0), 0)
  INTO v_paid, v_paid_amount, v_stripe, v_stripe_amount
  FROM jsonb_array_elements(p_entries) AS x;

  INSERT INTO public.activity_log (
    trial_id, record_type, record_id, action_type, description,
    actor_id, actor_name, metadata, created_at
  )
  VALUES (
    NULL,
    p_scope,
    p_id,
    'deleted',
    format(
      'Site admin deleted %s "%s" over the paid/scored guard (%s paid entr%s, $%s recorded; %s paid online, $%s not refunded). Reason: %s. No refund was issued.',
      p_scope,
      COALESCE(v_name, p_id::text),
      v_paid,
      CASE WHEN v_paid = 1 THEN 'y' ELSE 'ies' END,
      to_char(v_paid_amount, 'FM999999990.00'),
      v_stripe,
      to_char(v_stripe_amount, 'FM999999990.00'),
      p_reason
    ),
    (SELECT auth.uid()),
    NULLIF(v_actor_name, ''),
    jsonb_build_object(
      'override', 'soft_delete_' || p_scope,
      'scope', p_scope,
      'record_id', p_id,
      'record_name', v_name,
      'reason', p_reason,
      'deleted_at', to_jsonb(p_deleted_at),
      'blocking_entries', jsonb_array_length(p_entries),
      'paid_entries', v_paid,
      'paid_amount', v_paid_amount,
      'stripe_unrefunded_entries', v_stripe,
      'stripe_unrefunded_amount', v_stripe_amount,
      'payments', p_entries,
      'refund_issued', false
    ),
    clock_timestamp()
  );
END;
$$;

REVOKE ALL ON FUNCTION private.require_override_reason(boolean, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.record_delete_override(text, uuid, text, timestamptz, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. soft_delete_show / _class / _trial with p_reason. The old signature goes.
-- ---------------------------------------------------------------------------
DROP FUNCTION public.soft_delete_show(uuid, boolean);
DROP FUNCTION public.soft_delete_class(uuid, boolean);
DROP FUNCTION public.soft_delete_trial(uuid, boolean);

CREATE OR REPLACE FUNCTION public.soft_delete_show(p_show_id uuid, p_override boolean DEFAULT false, p_reason text DEFAULT NULL)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_club_id UUID;
  v_show_exists BOOLEAN := FALSE;
  v_rows_affected INT;
  v_blocked INT;
  v_now TIMESTAMPTZ := NOW();
  v_user_id UUID := auth.uid();
  v_reason text;
  v_money jsonb := '[]'::jsonb;
BEGIN
  -- MYK9-923: the exclusive parent gate, before the existence check and the
  -- cascade take their snapshots. Entry inserts under this show hold it shared.
  PERFORM private.entry_parent_gate('show', p_show_id, true);

  SELECT s.club_id, TRUE
  INTO v_club_id, v_show_exists
  FROM public.shows s
  WHERE s.id = p_show_id
    AND s.deleted_at IS NULL;

  IF NOT COALESCE(v_show_exists, FALSE) THEN
    RAISE EXCEPTION 'Show not found or already deleted' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    (v_club_id IS NOT NULL AND (SELECT public.is_club_admin(v_club_id)))
    OR (v_club_id IS NOT NULL AND (SELECT public.is_trial_secretary(v_club_id)))
    OR (SELECT public.is_site_admin())
    OR (SELECT public.is_platform_admin())
  ) THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  PERFORM private.require_override_allowed(p_override);
  -- MYK9-1596: an override needs a typed reason (22023 when blank); null otherwise.
  v_reason := private.require_override_reason(p_override, p_reason);

  -- Entries FIRST, and the guard is the RETURNING of this very statement: it
  -- judges exactly the rows being tombstoned, including one a concurrent
  -- transaction committed just before the statement's snapshot or updated while
  -- it ran (EvalPlanQual re-reads the updated row). A raise rolls everything back.
  WITH tombstoned AS (
    UPDATE public.entries e
    SET deleted_at = v_now, deleted_by = v_user_id, updated_at = v_now
    WHERE e.deleted_at IS NULL
      AND (
        e.show_id = p_show_id
        OR e.class_id IN (
          SELECT c.id FROM public.classes c
          JOIN public.trials t ON c.trial_id = t.id
          WHERE t.show_id = p_show_id
        )
      )
    RETURNING private.is_blocking_entry(e.payment_status, e.is_scored, e.scoring_completed_at, e.result_status) AS blocking,
      e.id AS entry_id, e.payment_status, e.entry_fee, e.refund_amount, e.stripe_payment_intent_id
  )
  SELECT count(*) FILTER (WHERE blocking)::integer,
         COALESCE(
           jsonb_agg(
             jsonb_build_object(
               'entry_id', entry_id,
               'payment_status', payment_status,
               'entry_fee', entry_fee,
               'refund_amount', refund_amount,
               'stripe_payment_intent_id', stripe_payment_intent_id
             )
             ORDER BY entry_id
           ) FILTER (WHERE blocking),
           '[]'::jsonb
         )
  INTO v_blocked, v_money
  FROM tombstoned;
  PERFORM private.raise_if_blocked('show', v_blocked, p_override);

  UPDATE public.classes
  SET deleted_at = v_now, deleted_by = v_user_id, updated_at = v_now
  WHERE trial_id IN (
    SELECT id FROM public.trials WHERE show_id = p_show_id
  )
  AND deleted_at IS NULL;

  UPDATE public.trials
  SET deleted_at = v_now, deleted_by = v_user_id, updated_at = v_now
  WHERE show_id = p_show_id
  AND deleted_at IS NULL;

  UPDATE public.shows
  SET deleted_at = v_now, deleted_by = v_user_id, updated_at = v_now
  WHERE id = p_show_id
  AND deleted_at IS NULL;

  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;

  -- A concurrent delete between the existence check and here.
  IF v_rows_affected = 0 THEN
    RAISE EXCEPTION 'Show not found or already deleted' USING ERRCODE = 'P0002';
  END IF;

  -- MYK9-1596: the override is on the record, in this transaction.
  IF p_override IS TRUE THEN
    PERFORM private.record_delete_override('show', p_show_id, v_reason, v_now, v_money);
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.soft_delete_class(p_class_id uuid, p_override boolean DEFAULT false, p_reason text DEFAULT NULL)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_trial_id UUID;
  v_blocked INT;
  v_now TIMESTAMPTZ := NOW();
  v_user_id UUID := auth.uid();
  v_reason text;
  v_money jsonb := '[]'::jsonb;
BEGIN
  -- MYK9-923: the exclusive parent gate, before the existence check and the
  -- cascade take their snapshots. Entry inserts under this class hold it shared.
  PERFORM private.entry_parent_gate('class', p_class_id, true);

  -- Resolve the parent trial. Returning NULL distinguishes "row gone" from
  -- "row not visible" once we run with SECURITY DEFINER (which bypasses
  -- the caller's RLS).
  SELECT c.trial_id INTO v_trial_id
  FROM public.classes c
  WHERE c.id = p_class_id AND c.deleted_at IS NULL;

  IF v_trial_id IS NULL THEN
    RAISE EXCEPTION 'Class not found or already deleted'
      USING ERRCODE = 'P0002';
  END IF;

  -- Permission check matches `classes_delete` RLS (migration 038):
  -- platform admin, or someone who can manage this trial.
  IF NOT (
    (SELECT public.is_platform_admin())
    OR (SELECT public.can_manage_trial(v_trial_id))
  ) THEN
    RAISE EXCEPTION 'Permission denied'
      USING ERRCODE = '42501';
  END IF;

  PERFORM private.require_override_allowed(p_override);
  -- MYK9-1596: an override needs a typed reason (22023 when blank); null otherwise.
  v_reason := private.require_override_reason(p_override, p_reason);

  -- Entries first; the guard is this statement's RETURNING (see soft_delete_show).
  WITH tombstoned AS (
    UPDATE public.entries e
    SET deleted_at = v_now, deleted_by = v_user_id, updated_at = v_now
    WHERE e.class_id = p_class_id
      AND e.deleted_at IS NULL
    RETURNING private.is_blocking_entry(e.payment_status, e.is_scored, e.scoring_completed_at, e.result_status) AS blocking,
      e.id AS entry_id, e.payment_status, e.entry_fee, e.refund_amount, e.stripe_payment_intent_id
  )
  SELECT count(*) FILTER (WHERE blocking)::integer,
         COALESCE(
           jsonb_agg(
             jsonb_build_object(
               'entry_id', entry_id,
               'payment_status', payment_status,
               'entry_fee', entry_fee,
               'refund_amount', refund_amount,
               'stripe_payment_intent_id', stripe_payment_intent_id
             )
             ORDER BY entry_id
           ) FILTER (WHERE blocking),
           '[]'::jsonb
         )
  INTO v_blocked, v_money
  FROM tombstoned;
  PERFORM private.raise_if_blocked('class', v_blocked, p_override);

  UPDATE public.classes
  SET deleted_at = v_now, deleted_by = v_user_id, updated_at = v_now
  WHERE id = p_class_id
    AND deleted_at IS NULL;

  -- MYK9-1596: the override is on the record, in this transaction.
  IF p_override IS TRUE THEN
    PERFORM private.record_delete_override('class', p_class_id, v_reason, v_now, v_money);
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.soft_delete_trial(p_trial_id uuid, p_override boolean DEFAULT false, p_reason text DEFAULT NULL)
 RETURNS TABLE(id uuid, name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_column
DECLARE
  v_show_id uuid;
  v_name text;
  v_blocked integer;
  v_now timestamptz := now();
  v_user_id uuid := auth.uid();
  v_reason text;
  v_money jsonb := '[]'::jsonb;
BEGIN
  -- MYK9-923: the exclusive parent gate, before the existence check and the
  -- cascade take their snapshots. Entry inserts under this trial hold it shared.
  PERFORM private.entry_parent_gate('trial', p_trial_id, true);

  SELECT t.show_id, t.name INTO v_show_id, v_name
  FROM public.trials t
  WHERE t.id = p_trial_id AND t.deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Trial not found or already deleted' USING ERRCODE = 'P0002';
  END IF;

  -- Matches trials_update RLS.
  IF NOT (SELECT public.can_manage_show(v_show_id)) THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  PERFORM private.require_override_allowed(p_override);
  -- MYK9-1596: an override needs a typed reason (22023 when blank); null otherwise.
  v_reason := private.require_override_reason(p_override, p_reason);

  -- One stamp across the cascade, entries first; the guard is this statement's
  -- RETURNING (see soft_delete_show).
  WITH tombstoned AS (
    UPDATE public.entries e
    SET deleted_at = v_now, deleted_by = v_user_id, updated_at = v_now
    WHERE e.deleted_at IS NULL
      AND (
        e.trial_id = p_trial_id
        OR e.class_id IN (SELECT c.id FROM public.classes c WHERE c.trial_id = p_trial_id)
      )
    RETURNING private.is_blocking_entry(e.payment_status, e.is_scored, e.scoring_completed_at, e.result_status) AS blocking,
      e.id AS entry_id, e.payment_status, e.entry_fee, e.refund_amount, e.stripe_payment_intent_id
  )
  SELECT count(*) FILTER (WHERE blocking)::integer,
         COALESCE(
           jsonb_agg(
             jsonb_build_object(
               'entry_id', entry_id,
               'payment_status', payment_status,
               'entry_fee', entry_fee,
               'refund_amount', refund_amount,
               'stripe_payment_intent_id', stripe_payment_intent_id
             )
             ORDER BY entry_id
           ) FILTER (WHERE blocking),
           '[]'::jsonb
         )
  INTO v_blocked, v_money
  FROM tombstoned;
  PERFORM private.raise_if_blocked('trial', v_blocked, p_override);

  UPDATE public.classes c
  SET deleted_at = v_now, deleted_by = v_user_id, updated_at = v_now
  WHERE c.trial_id = p_trial_id AND c.deleted_at IS NULL;

  UPDATE public.trials t
  SET deleted_at = v_now, deleted_by = v_user_id, updated_at = v_now
  WHERE t.id = p_trial_id AND t.deleted_at IS NULL;

  -- MYK9-1596: the override is on the record, in this transaction.
  IF p_override IS TRUE THEN
    PERFORM private.record_delete_override('trial', p_trial_id, v_reason, v_now, v_money);
  END IF;

  RETURN QUERY SELECT p_trial_id, v_name;
END;
$function$;


COMMENT ON FUNCTION public.soft_delete_show(uuid, boolean, text) IS
  'Soft-deletes a show and everything under it. A paid or scored entry refuses it '
  '(MK010) unless a site admin passes p_override => true WITH a non-blank p_reason; '
  'the override is recorded in activity_log (who, when, why, the money) and issues no refund.';
COMMENT ON FUNCTION public.soft_delete_class(uuid, boolean, text) IS
  'Soft-deletes a class and its entries. Same override and audit rules as soft_delete_show.';
COMMENT ON FUNCTION public.soft_delete_trial(uuid, boolean, text) IS
  'Soft-deletes a trial and everything under it. Same override and audit rules as soft_delete_show.';

-- ---------------------------------------------------------------------------
-- 3. delete_preview: the money the dialog states for an override.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_preview(p_scope text, p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_parent uuid;
  v_found boolean := false;
  v_person_id uuid;
  v_trials integer := 0;
  v_classes integer := 0;
  v_entries integer := 0;
  v_shows integer := 0;
  v_dogs integer := 0;
  v_paid integer := 0;
  v_scored integer := 0;
  v_blocking integer := 0;
  v_paid_amount numeric := 0;
  v_stripe_unrefunded integer := 0;
  v_stripe_unrefunded_amount numeric := 0;
BEGIN
  IF p_scope = 'show' THEN
    -- soft_delete_show: found (P0002) first, then the club/site gate (42501).
    SELECT s.club_id, TRUE INTO v_parent, v_found
    FROM public.shows s
    WHERE s.id = p_id AND s.deleted_at IS NULL;

    IF NOT COALESCE(v_found, FALSE) THEN
      RAISE EXCEPTION 'Show not found or already deleted' USING ERRCODE = 'P0002';
    END IF;

    IF NOT (
      (v_parent IS NOT NULL AND (SELECT public.is_club_admin(v_parent)))
      OR (v_parent IS NOT NULL AND (SELECT public.is_trial_secretary(v_parent)))
      OR (SELECT public.is_site_admin())
      OR (SELECT public.is_platform_admin())
    ) THEN
      RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
    END IF;

    SELECT count(*)::integer INTO v_trials
    FROM public.trials t
    WHERE t.show_id = p_id AND t.deleted_at IS NULL;

    SELECT count(*)::integer INTO v_classes
    FROM public.classes c
    WHERE c.trial_id IN (SELECT t.id FROM public.trials t WHERE t.show_id = p_id)
      AND c.deleted_at IS NULL;

    SELECT count(*)::integer,
           count(*) FILTER (WHERE e.payment_status = 'paid')::integer,
           count(*) FILTER (WHERE e.is_scored IS TRUE OR e.scoring_completed_at IS NOT NULL
                              OR (e.result_status IS NOT NULL AND e.result_status <> 'pending'))::integer,
           count(*) FILTER (WHERE private.is_blocking_entry(e.payment_status, e.is_scored, e.scoring_completed_at, e.result_status))::integer,
           COALESCE(sum(e.entry_fee) FILTER (WHERE e.payment_status = 'paid'), 0),
           count(*) FILTER (WHERE e.payment_status = 'paid' AND e.stripe_payment_intent_id IS NOT NULL
                              AND COALESCE(e.refund_amount, 0) = 0)::integer,
           COALESCE(sum(e.entry_fee) FILTER (WHERE e.payment_status = 'paid' AND e.stripe_payment_intent_id IS NOT NULL
                              AND COALESCE(e.refund_amount, 0) = 0), 0)
    INTO v_entries, v_paid, v_scored, v_blocking, v_paid_amount, v_stripe_unrefunded, v_stripe_unrefunded_amount
    FROM public.entries e
    WHERE e.deleted_at IS NULL
      AND (
        e.show_id = p_id
        OR e.class_id IN (
          SELECT c.id FROM public.classes c
          JOIN public.trials t ON c.trial_id = t.id
          WHERE t.show_id = p_id
        )
      );

  ELSIF p_scope = 'trial' THEN
    SELECT t.show_id, TRUE INTO v_parent, v_found
    FROM public.trials t
    WHERE t.id = p_id AND t.deleted_at IS NULL;

    IF NOT COALESCE(v_found, FALSE) THEN
      RAISE EXCEPTION 'Trial not found or already deleted' USING ERRCODE = 'P0002';
    END IF;

    IF NOT (SELECT public.can_manage_show(v_parent)) THEN
      RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
    END IF;

    SELECT count(*)::integer INTO v_classes
    FROM public.classes c
    WHERE c.trial_id = p_id AND c.deleted_at IS NULL;

    SELECT count(*)::integer,
           count(*) FILTER (WHERE e.payment_status = 'paid')::integer,
           count(*) FILTER (WHERE e.is_scored IS TRUE OR e.scoring_completed_at IS NOT NULL
                              OR (e.result_status IS NOT NULL AND e.result_status <> 'pending'))::integer,
           count(*) FILTER (WHERE private.is_blocking_entry(e.payment_status, e.is_scored, e.scoring_completed_at, e.result_status))::integer,
           COALESCE(sum(e.entry_fee) FILTER (WHERE e.payment_status = 'paid'), 0),
           count(*) FILTER (WHERE e.payment_status = 'paid' AND e.stripe_payment_intent_id IS NOT NULL
                              AND COALESCE(e.refund_amount, 0) = 0)::integer,
           COALESCE(sum(e.entry_fee) FILTER (WHERE e.payment_status = 'paid' AND e.stripe_payment_intent_id IS NOT NULL
                              AND COALESCE(e.refund_amount, 0) = 0), 0)
    INTO v_entries, v_paid, v_scored, v_blocking, v_paid_amount, v_stripe_unrefunded, v_stripe_unrefunded_amount
    FROM public.entries e
    WHERE e.deleted_at IS NULL
      AND (
        e.trial_id = p_id
        OR e.class_id IN (SELECT c.id FROM public.classes c WHERE c.trial_id = p_id)
      );

  ELSIF p_scope = 'class' THEN
    SELECT c.trial_id INTO v_parent
    FROM public.classes c
    WHERE c.id = p_id AND c.deleted_at IS NULL;

    IF v_parent IS NULL THEN
      RAISE EXCEPTION 'Class not found or already deleted' USING ERRCODE = 'P0002';
    END IF;

    IF NOT (
      (SELECT public.is_platform_admin())
      OR (SELECT public.can_manage_trial(v_parent))
    ) THEN
      RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
    END IF;

    SELECT count(*)::integer,
           count(*) FILTER (WHERE e.payment_status = 'paid')::integer,
           count(*) FILTER (WHERE e.is_scored IS TRUE OR e.scoring_completed_at IS NOT NULL
                              OR (e.result_status IS NOT NULL AND e.result_status <> 'pending'))::integer,
           count(*) FILTER (WHERE private.is_blocking_entry(e.payment_status, e.is_scored, e.scoring_completed_at, e.result_status))::integer,
           COALESCE(sum(e.entry_fee) FILTER (WHERE e.payment_status = 'paid'), 0),
           count(*) FILTER (WHERE e.payment_status = 'paid' AND e.stripe_payment_intent_id IS NOT NULL
                              AND COALESCE(e.refund_amount, 0) = 0)::integer,
           COALESCE(sum(e.entry_fee) FILTER (WHERE e.payment_status = 'paid' AND e.stripe_payment_intent_id IS NOT NULL
                              AND COALESCE(e.refund_amount, 0) = 0), 0)
    INTO v_entries, v_paid, v_scored, v_blocking, v_paid_amount, v_stripe_unrefunded, v_stripe_unrefunded_amount
    FROM public.entries e
    WHERE e.class_id = p_id AND e.deleted_at IS NULL;

  ELSIF p_scope = 'entry' THEN
    SELECT COALESCE(e.show_id, t.show_id), TRUE INTO v_parent, v_found
    FROM public.entries e
    LEFT JOIN public.classes c ON c.id = e.class_id
    LEFT JOIN public.trials t ON t.id = COALESCE(e.trial_id, c.trial_id)
    WHERE e.id = p_id AND e.deleted_at IS NULL;

    IF NOT COALESCE(v_found, FALSE) THEN
      RAISE EXCEPTION 'Entry not found or already deleted' USING ERRCODE = 'P0002';
    END IF;

    IF NOT (SELECT public.can_manage_show(v_parent)) THEN
      RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
    END IF;

    -- The entry itself: nothing else goes with it, so "entries" stays 0.
    SELECT (e.payment_status = 'paid')::integer,
           (e.is_scored IS TRUE OR e.scoring_completed_at IS NOT NULL
              OR (e.result_status IS NOT NULL AND e.result_status <> 'pending'))::integer,
           private.is_blocking_entry(e.payment_status, e.is_scored, e.scoring_completed_at, e.result_status)::integer
    INTO v_paid, v_scored, v_blocking
    FROM public.entries e
    WHERE e.id = p_id;
    v_paid := COALESCE(v_paid, 0);
    v_scored := COALESCE(v_scored, 0);
    v_blocking := COALESCE(v_blocking, 0);

  ELSIF p_scope = 'dog' THEN
    -- soft_delete_dog: a live row (P0002), then owner, co-owner or platform
    -- admin (42501).
    SELECT public.get_my_person_id() INTO v_person_id;

    IF NOT EXISTS (SELECT 1 FROM public.dogs d WHERE d.id = p_id AND d.deleted_at IS NULL) THEN
      RAISE EXCEPTION 'Dog not found or already deleted' USING ERRCODE = 'P0002';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.dogs d
      WHERE d.id = p_id
        AND d.deleted_at IS NULL
        AND (
          d.owner_id = v_person_id
          OR d.co_owner_id = v_person_id
          OR (SELECT public.is_platform_admin())
        )
    ) THEN
      RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
    END IF;

    SELECT count(*)::integer,
           count(*) FILTER (WHERE e.payment_status = 'paid')::integer,
           count(*) FILTER (WHERE e.is_scored IS TRUE OR e.scoring_completed_at IS NOT NULL
                              OR (e.result_status IS NOT NULL AND e.result_status <> 'pending'))::integer
    INTO v_entries, v_paid, v_scored
    FROM public.entries e
    WHERE e.dog_id = p_id AND e.deleted_at IS NULL;

    v_blocking := private.count_dog_blocking_entries(p_id);

  ELSIF p_scope = 'person' THEN
    -- soft_delete_person: "not found" (P0002) first, then the gate (42501).
    IF NOT EXISTS (SELECT 1 FROM public.people p WHERE p.id = p_id AND p.deleted_at IS NULL) THEN
      RAISE EXCEPTION 'Person not found or already deleted' USING ERRCODE = 'P0002';
    END IF;

    -- MYK9-934: site admin or self only, as soft_delete_person.
    IF NOT (
      (SELECT public.is_site_admin())
      OR EXISTS (
        SELECT 1 FROM public.people p
        WHERE p.id = p_id
          AND p.auth_user_id = (SELECT auth.uid())
          AND p.deleted_at IS NULL
      )
    ) THEN
      RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
    END IF;

    -- Same row set as the owns-dogs trigger (prevent_orphaning_dogs_on_person_delete).
    SELECT count(*)::integer INTO v_dogs
    FROM public.dogs d
    WHERE d.owner_id = p_id AND d.deleted_at IS NULL;
    v_blocking := v_dogs;

  ELSIF p_scope = 'club' THEN
    -- soft_delete_club: "not found" (P0002) first, then site admin only (42501).
    IF NOT EXISTS (SELECT 1 FROM public.clubs c WHERE c.id = p_id AND c.deleted_at IS NULL) THEN
      RAISE EXCEPTION 'Club not found or already deleted' USING ERRCODE = 'P0002';
    END IF;

    IF NOT (SELECT public.is_platform_admin()) THEN
      RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
    END IF;

    SELECT count(*)::integer INTO v_shows
    FROM public.shows s
    WHERE s.club_id = p_id AND s.deleted_at IS NULL;
    v_blocking := v_shows;

  ELSE
    RAISE EXCEPTION 'Unknown delete scope %', p_scope USING ERRCODE = '22023';
  END IF;

  RETURN jsonb_build_object(
    'scope', p_scope,
    'trials', v_trials,
    'classes', v_classes,
    'entries', v_entries,
    'shows', v_shows,
    'dogs', v_dogs,
    'paid', v_paid,
    'scored', v_scored,
    'blocking', v_blocking,
    'paid_amount', v_paid_amount,
    'stripe_unrefunded', v_stripe_unrefunded,
    'stripe_unrefunded_amount', v_stripe_unrefunded_amount
  );
END;
$function$;


-- ---------------------------------------------------------------------------
-- 4. ACLs, restated as 20261002015900 left them (never anon or PUBLIC).
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.soft_delete_show(uuid, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.soft_delete_class(uuid, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.soft_delete_trial(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.soft_delete_show(uuid, boolean, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.soft_delete_class(uuid, boolean, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.soft_delete_trial(uuid, boolean, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.delete_preview(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_preview(text, uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
