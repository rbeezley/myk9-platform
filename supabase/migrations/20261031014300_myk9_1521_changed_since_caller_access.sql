-- MYK9-1521: entry_results_changed_since also reports whether the caller may
-- read ANY row of the show, so a replica can drop a show the caller was just
-- revoked from on the very next sync (not on the 10-minute count cadence).
--
-- A caller revoked to zero reads zero rows, so no row carries the moved access
-- epoch and the incremental delta stays empty; the stale cleanup runs only on a
-- full sync. The probe already computes the authorization (v_authorized) from
-- the same arms the view admits rows by, so the answer rides the existing round
-- trip. caller_has_access is FALSE only when that authorization is definitely
-- negative; null/unknown arguments, an unknown show and a missing auth.uid()
-- read TRUE (unknown never purges).
--
-- The body is copied from 20261029192700_myk9_1476_caller_access_epoch.sql, the
-- latest definition. An OUT parameter changes the return type, so the function
-- is dropped and re-created and every grant is restated.

DROP FUNCTION IF EXISTS public.entry_results_changed_since(uuid, timestamptz);

CREATE FUNCTION public.entry_results_changed_since(
  p_show_id uuid,
  p_since timestamptz,
  OUT changed boolean,
  OUT server_now timestamptz,
  OUT caller_has_access boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  ctx record;
  v_club_id uuid;
  v_found boolean;
  v_authorized boolean;
  -- Millisecond resolution, rounded UP: a JS client carries watermarks as
  -- epoch milliseconds, so the row that set the watermark (microseconds
  -- truncated away) would otherwise sit above it forever and the answer would
  -- never be FALSE. A row in the SAME millisecond but committed after the
  -- caller's settled read needs a commit lag beyond the client's buffer.
  v_since timestamptz;
BEGIN
  -- Always filled in, for every caller: it names only the server's clock.
  server_now := now();
  -- Unknown never purges: every early return below reads TRUE.
  caller_has_access := true;

  IF p_show_id IS NULL OR p_since IS NULL THEN
    changed := true;
    RETURN;
  END IF;

  v_since := date_trunc('milliseconds', p_since) + interval '1 millisecond';

  SELECT * INTO ctx FROM private.entry_results_caller_context();

  SELECT s.club_id, true INTO v_club_id, v_found
  FROM public.shows s
  WHERE s.id = p_show_id;
  IF v_found IS NOT TRUE THEN
    changed := true;
    RETURN;
  END IF;

  -- Mirrors the view's access lateral: can_manage, is_show_steward and the
  -- ringside passcode claim need no entry row; the rest are per-entry.
  v_authorized := COALESCE(
    ctx.is_site_admin
    OR v_club_id = ANY(ctx.managed_club_ids)
    OR p_show_id = ANY(ctx.managed_show_ids)
    OR p_show_id = ANY(ctx.steward_show_ids)
    OR v_club_id = ANY(ctx.steward_club_ids)
    OR (
      ctx.claim_kind = 'ringside_passcode'
      AND ctx.claim_show_id = p_show_id::text
      AND ctx.claim_generation_current
      AND ctx.claim_role IN ('judge', 'steward', 'admin')
    ),
    false
  );

  IF NOT v_authorized AND ctx.assigned_class_ids IS NOT NULL THEN
    -- is_assigned_judge: a live entry of this show in an assigned class (a
    -- soft-deleted one is admitted only to its own people, handled below).
    v_authorized := EXISTS (
      SELECT 1
      FROM public.entries e
      WHERE e.show_id = p_show_id
        AND e.deleted_at IS NULL
        AND e.class_id = ANY(ctx.assigned_class_ids)
    );
  END IF;

  IF NOT v_authorized AND ctx.person_id IS NOT NULL THEN
    -- is_own_entry (any deleted/withdrawn state) or is_show_exhibitor (live,
    -- not withdrawn/scratched, as handler, owner or co-owner).
    v_authorized := EXISTS (
      SELECT 1
      FROM public.entries e
      LEFT JOIN public.dogs od ON od.id = e.dog_id
      WHERE e.show_id = p_show_id
        AND (
          e.handler_id = ctx.person_id
          OR od.owner_id = ctx.person_id
          OR (
            e.deleted_at IS NULL
            AND e.entry_status NOT IN ('withdrawn', 'scratched')
            AND od.co_owner_id = ctx.person_id
          )
        )
    );
  END IF;

  IF NOT v_authorized THEN
    changed := true;
    -- Definitely no access only for a signed-in caller; no auth.uid() is doubt.
    caller_has_access := auth.uid() IS NULL;
    RETURN;
  END IF;

  changed :=
    -- e
    EXISTS (
      SELECT 1 FROM public.entries e
      WHERE e.show_id = p_show_id AND e.updated_at >= v_since
    )
    -- sh
    OR EXISTS (
      SELECT 1 FROM public.shows s
      WHERE s.id = p_show_id AND s.updated_at >= v_since
    )
    -- show_vis
    OR EXISTS (
      SELECT 1 FROM public.show_visibility_settings sv
      WHERE sv.show_id = p_show_id AND sv.updated_at >= v_since
    )
    -- epoch
    OR EXISTS (
      SELECT 1 FROM private.results_privacy_epoch ep
      WHERE ep.updated_at >= v_since
    )
    -- caller access epoch (MYK9-1476): this caller's own role set changed
    OR COALESCE((SELECT private.entry_results_caller_access_epoch()) >= v_since, false)
    -- c
    OR EXISTS (
      SELECT 1
      FROM public.entries e
      JOIN public.classes c ON c.id = e.class_id
      WHERE e.show_id = p_show_id AND c.updated_at >= v_since
    )
    -- held_trial
    OR EXISTS (
      SELECT 1
      FROM public.entries e
      JOIN public.classes c ON c.id = e.class_id
      JOIN public.trials t ON t.id = c.trial_id
      WHERE e.show_id = p_show_id AND t.updated_at >= v_since
    )
    -- trial_vis
    OR EXISTS (
      SELECT 1
      FROM public.entries e
      JOIN public.classes c ON c.id = e.class_id
      JOIN public.trial_visibility_overrides tv ON tv.trial_id = c.trial_id
      WHERE e.show_id = p_show_id AND tv.updated_at >= v_since
    )
    -- class_vis
    OR EXISTS (
      SELECT 1
      FROM public.entries e
      JOIN public.class_visibility_overrides cv ON cv.class_id = e.class_id
      WHERE e.show_id = p_show_id AND cv.updated_at >= v_since
    )
    -- d
    OR EXISTS (
      SELECT 1
      FROM public.entries e
      JOIN public.dogs d ON d.id = e.dog_id
      WHERE e.show_id = p_show_id AND d.updated_at >= v_since
    )
    -- consent: people, then the exhibitor_profiles reached through
    -- people.auth_user_id, for the dog's owner, co-owner and the handler.
    OR EXISTS (
      SELECT 1
      FROM public.entries e
      LEFT JOIN public.dogs d ON d.id = e.dog_id
      CROSS JOIN LATERAL unnest(ARRAY[d.owner_id, d.co_owner_id, e.handler_id]) AS tied(person_id)
      JOIN public.people tp ON tp.id = tied.person_id
      WHERE e.show_id = p_show_id AND tp.updated_at >= v_since
    )
    OR EXISTS (
      SELECT 1
      FROM public.entries e
      LEFT JOIN public.dogs d ON d.id = e.dog_id
      CROSS JOIN LATERAL unnest(ARRAY[d.owner_id, d.co_owner_id, e.handler_id]) AS tied(person_id)
      JOIN public.people tp ON tp.id = tied.person_id
      JOIN public.exhibitor_profiles tep ON tep.auth_user_id = tp.auth_user_id
      WHERE e.show_id = p_show_id AND tep.updated_at >= v_since
    );
  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.entry_results_changed_since(uuid, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.entry_results_changed_since(uuid, timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.entry_results_changed_since(uuid, timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.entry_results_changed_since(uuid, timestamptz) TO authenticated;

COMMENT ON FUNCTION public.entry_results_changed_since(uuid, timestamptz) IS
  'MYK9-1369: returns one row {changed, server_now, caller_has_access}. server_now is now() for every caller. caller_has_access (MYK9-1521) is FALSE only when the signed-in caller has none of the access arms the results view admits rows by for this show (the same authorization as entry_results_caller_has_no_show_access); NULL arguments, an unknown show and no auth.uid() read TRUE, so unknown never purges a replica. changed is TRUE when anything the replication results view reads for this show moved after p_since (a superset of the view''s delta for any authorized caller; may be TRUE for a row the caller cannot see). A caller the view would admit nothing for always gets TRUE, so the boolean leaks nothing to an outsider. NULL arguments or an unknown show also return changed = TRUE. Callers skip the view read only on changed = FALSE with a settled server_now, and read it otherwise.';
