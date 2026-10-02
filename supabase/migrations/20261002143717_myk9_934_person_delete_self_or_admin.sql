-- MYK9-934: only a site admin or the person themselves may delete a person.
--
-- WHY
--
--   Owner decision (2026-10-02): secretaries and club admins never delete a
--   person. soft_delete_person admitted anyone who manages a show the person has
--   a live entry in (can_manage_show_person), so a secretary could tombstone an
--   exhibitor's whole account by entering them once. "Delete only the people you
--   added" cannot be expressed: people has no creator column, only created_at.
--
-- WHAT CHANGES
--
--   soft_delete_person and delete_preview's 'person' branch drop the
--   can_manage_show_person arm. The gate is now exactly
--       is_site_admin()
--       OR people.auth_user_id = auth.uid()   -- the person's own account
--   Everything else is unchanged: P0002 for a missing or already-deleted person
--   (checked first, for every caller), 42501 "Permission denied" for a refusal,
--   MK001 from the owns-dogs trigger, user_roles deactivation, SECURITY DEFINER,
--   the empty search_path and the ACL (authenticated + service_role, never anon
--   or PUBLIC). The preview and the delete keep the same gate, so the dialog
--   never offers a Delete the server refuses.
--
--   can_manage_show_person itself is NOT changed: people_update and other read
--   and edit paths still use it. Only the delete arm goes.
--
--   delete_show_managed_person, the other show-manager person delete (unused by
--   the app), becomes site admin only; its other guards stay. See its section.
--
-- SOURCES (LESSONS replace-function-latest), each the latest migration on
-- origin/main that defines the function:
--   soft_delete_person          20261001235300_crud_standard_delete_not_found_code.sql
--   delete_preview              20261001233700_crud_standard_delete_preview.sql
--   delete_show_managed_person  20261002014700_myk9_921_show_managed_person_deleted_by.sql
-- Every body is copied verbatim except the changed permission check and its comment.
--
-- Behavioral coverage: supabase/tests/myk9_934_person_delete_self_or_admin_test.sql
-- and supabase/tests/myk9_921_show_managed_person_deleted_by_test.sql

BEGIN;

-- ---------------------------------------------------------------------------
-- soft_delete_person: site admin or self.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.soft_delete_person(p_person_id uuid)
RETURNS SETOF public.people
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_deleted_at timestamptz := NOW();
  v_rows int;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.people
    WHERE id = p_person_id AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Person not found or already deleted' USING ERRCODE = 'P0002';
  END IF;

  -- MYK9-934: no show-staff arm. Secretaries and club admins never delete a person.
  IF NOT (
    (SELECT public.is_site_admin())
    OR EXISTS (
      SELECT 1 FROM public.people
      WHERE id = p_person_id
        AND auth_user_id = (SELECT auth.uid())
        AND deleted_at IS NULL
    )
  ) THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  UPDATE public.people
  SET deleted_at = v_deleted_at, deleted_by = auth.uid(), updated_at = NOW()
  WHERE id = p_person_id AND deleted_at IS NULL;

  -- A concurrent delete between the existence check and here.
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'Person not found or already deleted' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.user_roles
  SET is_active = false, deactivated_at = v_deleted_at
  WHERE user_id = p_person_id AND is_active;

  RETURN QUERY SELECT * FROM public.people WHERE id = p_person_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- delete_preview: the 'person' branch takes the same gate. Every other branch
-- is copied unchanged.
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
    'blocking', v_blocking
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- delete_show_managed_person: site admin only (owner decision on MYK9-934).
--
-- It let anyone who manages the show (can_manage_show) soft-delete an
-- account-less person linked to that show with no live entries and no dogs: a
-- second show-manager person delete. Nothing in the app calls it. The role arm
-- becomes is_site_admin(); every other guard stays (the person must be linked
-- through the show, have no sign-in account, no live entries, no live dogs),
-- and so does the MYK9-921 deleted_by = auth uid stamp.
--
-- Why replace the check instead of REVOKE EXECUTE from authenticated: a site
-- admin calls RPCs as `authenticated` too, so a revoke would remove the site
-- admin's path as well, and a caller would get a bare privilege error instead
-- of the 42501 "Permission denied" every other delete RPC raises.
-- Not dropped: the generated types and the 921 behavioral test reference it.
--
-- SOURCE (LESSONS replace-function-latest): copied from the latest migration
-- that defines it, 20261002014700_myk9_921_show_managed_person_deleted_by.sql.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_show_managed_person(
  p_show_id uuid,
  p_person_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- MYK9-934: secretaries and club admins never delete a person.
  if not (select public.is_site_admin()) then
    RAISE EXCEPTION 'Permission denied' using errcode = '42501';
  end if;

  if not public.can_manage_show_person_for_show(p_show_id, p_person_id) then
    RAISE EXCEPTION 'Person % is not managed through show %', p_person_id, p_show_id
      using errcode = '42501';
  end if;

  -- deleted_by references auth.users(id): stamp the caller's auth uid, which
  -- is also what the Undo window (private.can_undo_soft_delete) compares.
  update public.people p
  set deleted_at = now(),
      deleted_by = (select auth.uid())
  where p.id = p_person_id
    and p.auth_user_id is null
    and p.deleted_at is null
    and not exists (
      select 1
      from public.entries e
      where e.handler_id = p_person_id
        and e.deleted_at is null
    )
    and not exists (
      select 1
      from public.dogs d
      where (d.owner_id = p_person_id or d.co_owner_id = p_person_id)
        and d.deleted_at is null
    );
end;
$$;

-- The live ACLs, restated (CREATE OR REPLACE keeps them): signed-in callers and
-- service_role, never anon or PUBLIC.
REVOKE ALL ON FUNCTION public.delete_show_managed_person(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_show_managed_person(uuid, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.soft_delete_person(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.soft_delete_person(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.delete_preview(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_preview(text, uuid) TO authenticated, service_role;

COMMIT;
