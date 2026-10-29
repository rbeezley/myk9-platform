-- MYK9-1369 item 1: public.entry_results_changed_since(show_id, since).
--
-- A warm replica's incremental pull reads
--   view_authenticated_entry_results_replication WHERE show_id = S AND updated_at > T
-- and the view computes its 41-subplan row for EVERY entry of the show before
-- that delta predicate applies (MYK9-1468 has the live EXPLAIN). When nothing
-- changed, the answer is empty and the work was wasted. This function answers
-- "did anything move after T?" from max(updated_at)-style probes on each table
-- the view's updated_at reads, so an unchanged poll costs about a dozen
-- per-show EXISTS scans over entries(show_id) joined by primary key (still
-- O(entries in show), but no per-row subplans: 1.8-2.7 ms at 517 entries on the
-- native stack, against 46-166 ms for a view page) and the client skips the
-- view read entirely.
--
-- Contract
--   SUPERSET: TRUE whenever the view's delta for this show is non-empty for ANY
--   authorized caller. Each input of the view's
--   GREATEST(e, c, sh, show_vis, trial_vis, class_vis, consent, d, epoch,
--   held_trial) maps to one EXISTS below, joined the way the view joins it
--   (through the entry's class, not through trials.show_id). It may be TRUE when
--   the caller's rows did not change (a change to a row they cannot see): that
--   only costs one view read. It must never be FALSE when a row changed.
--   LEAK GUARD: the caller's show access is restated from
--   private.entry_results_caller_context() exactly as the view's WHERE admits
--   rows. A caller the view would admit nothing for gets TRUE unconditionally,
--   before and after any change, so the boolean carries no information for an
--   outsider. Only an authorized caller gets the real answer, and the real
--   answer is only "something changed after T" (T taken at millisecond
--   resolution: updated_at >= floor_ms(T) + 1 ms, because the client's
--   watermark is epoch milliseconds and the row that set it carries microseconds).
--   Deliberate width: the show-level staff arms (manager, steward, ringside
--   claim) do not require an admissible entry row, so a show's own staff get the
--   real answer even for a show with no entries yet. They can manage or work that
--   show, so "something in it moved" tells them nothing they cannot already see.
--   NOT a visibility oracle: result columns are not read here, only
--   updated_at columns; results stay masked by the view.
--
-- Not covered, because the VIEW does not cover it either (not fixed here):
-- public.enrollments (registration_confirmation_number reads it; no
-- updated_at in the view's GREATEST).
--
-- SERVER TIME: the single result row is {changed, server_now}. server_now is
-- now() (the transaction start, at or before the start of any later request),
-- filled in for every caller including an outsider and NULL arguments; it names
-- only the server's clock. The client skips a view read only when changed is
-- FALSE and the last completed read's server_now is at or after watermark +
-- buffer, so the decision never compares the device clock with a server-stamped
-- updated_at.
--
-- ROLLBACK:  DROP FUNCTION public.entry_results_changed_since(uuid, timestamptz);
--   (OUT parameters are not part of the identity; the two input types are.)
-- The client treats any RPC error as "unknown" and reads the view as before, so
-- the app is safe both before this is applied and after a rollback.

CREATE OR REPLACE FUNCTION public.entry_results_changed_since(
  p_show_id uuid,
  p_since timestamptz,
  OUT changed boolean,
  OUT server_now timestamptz
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
  'MYK9-1369: returns one row {changed, server_now}. server_now is now() for every caller. changed is TRUE when anything the replication results view reads for this show moved after p_since (a superset of the view''s delta for any authorized caller; may be TRUE for a row the caller cannot see). A caller the view would admit nothing for always gets TRUE, so the boolean leaks nothing to an outsider. NULL arguments or an unknown show also return changed = TRUE. Callers skip the view read only on changed = FALSE with a settled server_now, and read it otherwise.';
