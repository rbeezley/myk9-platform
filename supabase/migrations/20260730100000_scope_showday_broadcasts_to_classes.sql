-- Keep show-day Broadcast advisory and show-scoped, but include only the old/new
-- class UUIDs needed for clients to ignore unrelated changes. Trial moves force
-- an unscoped reconciliation; deletions include only the affected identifier.
-- Row/result data remains authoritative through the replication pull.

CREATE OR REPLACE FUNCTION public.broadcast_showday_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old_show_id uuid;
  v_new_show_id uuid;
  v_old_class_id uuid;
  v_new_class_id uuid;
  v_reconcile_class_id uuid;
  v_topic text;
  v_class_ids uuid[];
  v_requires_full_sync boolean := false;
BEGIN
  IF TG_TABLE_NAME = 'entries' THEN
    IF TG_OP <> 'INSERT' THEN
      v_old_show_id := OLD.show_id;
      v_old_class_id := OLD.class_id;
    END IF;

    IF TG_OP <> 'DELETE' THEN
      v_new_show_id := NEW.show_id;
      v_new_class_id := NEW.class_id;
    END IF;
  ELSIF TG_TABLE_NAME = 'classes' THEN
    IF TG_OP <> 'INSERT' THEN
      v_old_class_id := OLD.id;
      SELECT trials.show_id
      INTO v_old_show_id
      FROM public.trials
      WHERE trials.id = OLD.trial_id;

      IF TG_OP = 'DELETE' THEN
        v_reconcile_class_id := OLD.id;
        v_requires_full_sync := true;
      END IF;
    END IF;

    IF TG_OP <> 'DELETE' THEN
      v_new_class_id := NEW.id;
      SELECT trials.show_id
      INTO v_new_show_id
      FROM public.trials
      WHERE trials.id = NEW.trial_id;
    END IF;

    IF TG_OP = 'UPDATE' THEN
      IF OLD.trial_id IS DISTINCT FROM NEW.trial_id
        OR (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
      THEN
        v_reconcile_class_id := NEW.id;
        v_requires_full_sync := true;
      END IF;
    END IF;
  ELSE
    RETURN NULL;
  END IF;

  FOR v_topic, v_class_ids IN
    SELECT
      format('show:%s:changes', scoped.show_id),
      CASE
        WHEN v_requires_full_sync THEN NULL::uuid[]
        ELSE array_agg(DISTINCT scoped.class_id) FILTER (WHERE scoped.class_id IS NOT NULL)
      END
    FROM (
      SELECT v_old_show_id AS show_id, v_old_class_id AS class_id
      UNION ALL
      SELECT v_new_show_id AS show_id, v_new_class_id AS class_id
    ) AS scoped
    WHERE scoped.show_id IS NOT NULL
    GROUP BY scoped.show_id
  LOOP
    BEGIN
      PERFORM realtime.send(
        jsonb_strip_nulls(jsonb_build_object(
          'table', TG_TABLE_NAME,
          'class_ids', to_jsonb(v_class_ids),
          'id', v_reconcile_class_id
        )),
        'showday_change',
        v_topic,
        true
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Could not broadcast show-day change for %.%: %',
        TG_TABLE_SCHEMA,
        TG_TABLE_NAME,
        SQLERRM;
    END;
  END LOOP;

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- Realtime is advisory. A signaling failure must never abort a show-day write.
  RAISE WARNING 'Could not prepare show-day change broadcast for %.%: %',
    TG_TABLE_SCHEMA,
    TG_TABLE_NAME,
    SQLERRM;
  RETURN NULL;
END;
$$;

-- Trigger functions fire through their triggers; API roles never call them directly.
REVOKE EXECUTE ON FUNCTION public.broadcast_showday_change()
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.broadcast_showday_change() IS
  'Broadcasts advisory show-day invalidations with affected class UUIDs; row data remains replication-authoritative.';
