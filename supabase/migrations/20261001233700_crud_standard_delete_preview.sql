-- CRUD standard, Phase 2 (one client delete path): delete_preview, the read the
-- shared DeleteObjectDialog makes before it lets anyone press Delete.
-- docs/plan-crud-standard.md.
--
-- WHAT IT RETURNS
--
--   delete_preview(p_scope, p_id) -> jsonb
--     { "scope", "trials", "classes", "entries", "shows", "dogs",
--       "paid", "scored", "blocking" }
--
--   * trials / classes / entries: the LIVE rows the matching soft_delete_<scope>
--     would tombstone with the item, counted with exactly that RPC's WHERE
--     clauses (20261001214300). The behavioral test checks each count against
--     the rows the delete then actually stamps.
--   * paid / scored: how many of those entries are paid, and how many are
--     scored (an entry can be both). "blocking" is how many the delete RPC
--     would refuse over (private.is_blocking_entry, MK010; for a dog, the same
--     arms as private.count_dog_blocking_entries, MK002).
--   * shows: a club's live shows (soft_delete_club refuses, MK011).
--   * dogs: the live dogs a person owns (the owns-dogs trigger refuses, MK001).
--     For club and person, "blocking" is that count.
--
-- WHY A SERVER READ AND NOT THE REPLICA
--
--   The dialog has to say what goes with the item and whether the server will
--   refuse. The replica cannot answer either honestly: entries replicate per
--   show and only for shows a device has opened, a cold or partly synced cache
--   reads as "0 entries", and RLS hides entries a club admin cannot read but the
--   delete still tombstones. A delete needs the server anyway (every
--   soft_delete_* is an RPC), so an offline device has nothing to preview: the
--   client reports "unknown" and keeps Delete disabled.
--
-- PERMISSION
--
--   Each scope runs the same checks as its soft_delete_<scope>, in the same
--   order, with the same SQLSTATEs (20261001235300, MYK9-922):
--     * P0002 (no_data_found): the row does not exist or is already deleted,
--       checked FIRST, for every caller;
--     * 42501: the row is live but the caller may not delete it. The message
--       says permission only, never "not found".
--   The client reads the SQLSTATE alone: P0002 means "already gone, drop it
--   from this device and from the selection", 42501 means "refused".
--   SECURITY DEFINER because the counts must include rows the caller's RLS
--   hides (the same reason as count_blocking_entries_by_dog, MYK9-822).
--   Read-only: STABLE, and it writes nothing.

BEGIN;

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
           count(*) FILTER (WHERE private.is_blocking_entry(e.payment_status, e.is_scored, e.scoring_completed_at, e.result_status))::integer
    INTO v_entries, v_paid, v_scored, v_blocking
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
           count(*) FILTER (WHERE private.is_blocking_entry(e.payment_status, e.is_scored, e.scoring_completed_at, e.result_status))::integer
    INTO v_entries, v_paid, v_scored, v_blocking
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
           count(*) FILTER (WHERE private.is_blocking_entry(e.payment_status, e.is_scored, e.scoring_completed_at, e.result_status))::integer
    INTO v_entries, v_paid, v_scored, v_blocking
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

    IF NOT (
      (SELECT public.is_site_admin())
      OR (SELECT public.can_manage_show_person(p_id))
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
    'blocking', v_blocking
  );
END;
$function$;

COMMENT ON FUNCTION public.delete_preview(text, uuid) IS
  'CRUD standard Phase 2: what a soft_delete_<scope> would take with it (live '
  'trials/classes/entries), how many of those entries are paid or scored, and '
  'how many rows would make the delete refuse. Same permission gate as the '
  'matching delete RPC. Read-only.';

REVOKE ALL ON FUNCTION public.delete_preview(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_preview(text, uuid) TO authenticated, service_role;

COMMIT;
