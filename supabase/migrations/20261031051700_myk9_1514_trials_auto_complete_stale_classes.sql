-- =============================================================================
-- MYK9-1514 — per-trial switch for the stale-class prompt.
--
-- v3's trigger rule (same judge, a different level, class in_progress, last
-- result older than 15 minutes, unscored dogs remain) now only DETECTS on the
-- judge's device and ASKS ("Mark them absent and complete the class?"). A
-- secretary turns the prompt off per trial with this column.
--
-- COLUMN. trials.auto_complete_stale_classes boolean, nullable, NO default:
-- NULL means enabled, so every existing trial keeps the prompt without a
-- backfill (no row rewrite, no updated_at bump, no replica re-pull). Only an
-- explicit false turns it off. The name is v3's, kept so a secretary's habit
-- carries over, even though nothing is completed without a tap.
--
-- GRANTS. public.trials carries table-level grants only (anon SELECT,
-- authenticated read/write through RLS, service_role all; no column ACLs, see
-- 20260725160000_anon_revoke_default_privileges.sql). A new column inherits
-- them, which is what it needs: the show's managers write it through the
-- existing trials_update RLS policy, and a harmless boolean is readable the
-- way every other trials column is. No GRANT or REVOKE is added: a REVOKE here
-- would be a column-level ACL on a table that has none, and would break the
-- replicated `select('*')` pull. Verify after push with:
--   select attname, attacl from pg_attribute
--   where attrelid = 'public.trials'::regclass and attname = 'auto_complete_stale_classes';
-- (attacl must be null.)
-- =============================================================================

ALTER TABLE public.trials
  ADD COLUMN IF NOT EXISTS auto_complete_stale_classes boolean;

COMMENT ON COLUMN public.trials.auto_complete_stale_classes IS
  'MYK9-1514: NULL or true = a judge who moves to a different level is asked whether to mark the previous class''s unscored dogs absent and complete it after 15 idle minutes; false turns the prompt off. Never completes anything by itself.';

-- =============================================================================
-- ringside_complete_stale_class (MYK9-1514): the ONE server action behind the
-- judge's "Mark absent & complete" tap.
--
-- Why a function. The client used to write each unscored dog absent, one call
-- per dog, then check the class. That loop cannot be atomic: a partial failure
-- left some dogs absent, a timed-out sync was read as success, and a dog could
-- be added to the class after the judge had looked at the list. This function
-- does the whole thing in one transaction against the live rows.
--
-- CONTRACT. The caller passes the entry ids the judge was shown. Under a lock on
-- the class row, the function recomputes the class's current unscored entries.
--   - Same set (order and duplicates ignored): those entries, and only those, are
--     marked absent, with the columns the live scoresheet's Absent chip writes.
--     Returns {ok: true, marked_count}.
--   - Any other set (a dog was scored, pulled, added or entered the ring since
--     the judge looked): nothing changes. Returns
--     {ok: false, current_entry_ids: [...]} so the client can ask again with the
--     list as it stands now.
-- The class then completes through the existing derivation trigger. Only a class
-- whose status a person set by hand (status_source = 'manual', which the
-- derivation never touches) gets its status written here, in the same
-- transaction, exactly as the ringside Status write would.
--
-- "Unscored" is entryAccounting.ts's outstandingEntries (expected AND not
-- accounted for): a live entry whose entry_status is not
-- withdrawn/scratched/absent/moved/not_accepted, not pulled, not scored, and
-- with no absent/excused/disqualified result.
--
-- A class is refused (ok:false, no ids) while it is not in_progress (a
-- secretary cancelled or reset it) or while any unscored dog is in the ring
-- (is_in_ring, or check_in_status 'in-ring', which opening a scoresheet sets).
-- Nothing is marked and nothing is completed under a dog being run.
--
-- LOCK ORDER matches the scoring path (entry rows first, then the class row via
-- its scoring-state trigger), so an overlapping score cannot deadlock with this.
-- The set compared against the caller's ids is read AFTER the class row is locked, so
-- an entry added between the entry-row locks and the class lock still refuses the call.
--
-- AUTHORIZATION is ringside_update_entry's, copied from the latest migration
-- defining it (20260925143700): a manager, the class's assigned judge, or a
-- judge/admin passcode for the show with a current generation. There is no
-- steward tier because absent is a scoring-column write. Keyed on the class
-- (as ringside_update_class is) since a class may have no entries to key on.
--
-- The 20261014214300 held-entry guard allows exactly this write (absent, zero
-- time, scoring_started_at untouched), so held dogs can be marked absent.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.ringside_complete_stale_class(
  p_class_id uuid,
  p_expected_entry_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_show_id uuid;
  v_club_id uuid;
  v_caller_person_id uuid;
  v_is_manager boolean;
  v_is_assigned_judge boolean;
  v_claim_kind text;
  v_claim_show_id text;
  v_claim_role text;
  v_has_judge_claim boolean;
  v_status_source text;
  v_class_status text;
  v_current uuid[];
  v_expected uuid[];
  v_any_in_ring boolean;
BEGIN
  -- 1. Class context (unlocked: the class row is locked after the entry rows).
  SELECT tr.show_id
    INTO v_show_id
    FROM public.classes c
    JOIN public.trials tr ON tr.id = c.trial_id
   WHERE c.id = p_class_id
     AND c.deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Class % not found', p_class_id USING errcode = 'P0002';
  END IF;

  SELECT s.club_id INTO v_club_id FROM public.shows s WHERE s.id = v_show_id;
  IF v_club_id IS NULL THEN
    RAISE EXCEPTION 'Class % has no show/club context', p_class_id USING errcode = '42501';
  END IF;

  -- 2. Caller identity (NULL person for a passcode/anon session).
  SELECT p.id INTO v_caller_person_id
    FROM public.people p
   WHERE p.auth_user_id = (SELECT auth.uid())
   LIMIT 1;

  -- 3. Authorization tiers, as ringside_update_entry (no steward tier).
  v_is_manager :=
    public.is_site_admin()
    OR public.is_trial_secretary(v_club_id)
    OR public.is_club_admin(v_club_id);

  v_is_assigned_judge := v_caller_person_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.judge_assignments ja
     WHERE ja.person_id = v_caller_person_id
       AND ja.class_id = p_class_id
       AND ja.status IN ('confirmed', 'invited')
  );

  v_claim_kind := (SELECT auth.jwt()) -> 'app_metadata' ->> 'kind';
  v_claim_show_id := nullif(((SELECT auth.jwt()) -> 'app_metadata' ->> 'show_id'), '');
  v_claim_role := (SELECT auth.jwt()) -> 'app_metadata' ->> 'ringside_role';
  v_has_judge_claim :=
    v_claim_kind = 'ringside_passcode'
    AND v_claim_show_id IS NOT NULL
    AND v_claim_show_id = v_show_id::text
    AND v_claim_role IN ('judge', 'admin');

  IF v_has_judge_claim
     AND NOT (v_is_manager OR v_is_assigned_judge)
     AND public.ringside_claim_generation_current() IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Passcode has been regenerated; re-enter a new code'
      USING errcode = '42501';
  END IF;

  IF NOT (v_is_manager OR v_is_assigned_judge OR v_has_judge_claim) THEN
    RAISE EXCEPTION 'Not authorized to complete class %', p_class_id
      USING errcode = '42501';
  END IF;

  -- 4. Lock, in the scoring path's order: the class's unscored entry rows first, so
  -- a score landing now waits and is not overwritten, then the class row.
  PERFORM e.id
     FROM public.entries e
    WHERE e.class_id = p_class_id
      AND e.deleted_at IS NULL
      AND coalesce(e.entry_status, '') NOT IN
          ('withdrawn', 'scratched', 'absent', 'moved', 'not_accepted')
      AND e.check_in_status IS DISTINCT FROM 'pulled'
      AND e.is_scored IS NOT TRUE
      AND coalesce(e.result_status, '') NOT IN ('absent', 'excused', 'disqualified')
      FOR UPDATE OF e;

  SELECT c.status_source, c.status
    INTO v_status_source, v_class_status
    FROM public.classes c
   WHERE c.id = p_class_id
     FOR UPDATE OF c;

  -- 4b. Only now read the set to compare. The read above locked the rows that existed
  -- then; a day-of entry an official added between that read and the class lock is
  -- not among them, so the set is re-read (a new statement sees it) and compared
  -- against what the judge was shown. Same predicate as the lock above.
  SELECT coalesce(array_agg(s.id ORDER BY s.id), '{}'::uuid[]),
         coalesce(bool_or(s.in_ring), false)
    INTO v_current, v_any_in_ring
    FROM (
      SELECT e.id,
             (e.is_in_ring IS TRUE OR e.check_in_status = 'in-ring') AS in_ring
        FROM public.entries e
       WHERE e.class_id = p_class_id
         AND e.deleted_at IS NULL
         AND coalesce(e.entry_status, '') NOT IN
             ('withdrawn', 'scratched', 'absent', 'moved', 'not_accepted')
         AND e.check_in_status IS DISTINCT FROM 'pulled'
         AND e.is_scored IS NOT TRUE
         AND coalesce(e.result_status, '') NOT IN ('absent', 'excused', 'disqualified')
    ) s;

  -- A class a secretary cancelled or reset, or one with a dog in the ring, is
  -- not stale: refuse with no dogs to offer.
  IF v_class_status IS DISTINCT FROM 'in_progress' OR v_any_in_ring THEN
    RETURN jsonb_build_object('ok', false, 'current_entry_ids', '[]'::jsonb);
  END IF;

  SELECT coalesce(array_agg(DISTINCT x ORDER BY x), '{}'::uuid[])
    INTO v_expected
    FROM unnest(coalesce(p_expected_entry_ids, '{}'::uuid[])) AS x;

  IF cardinality(v_expected) = 0 OR v_expected IS DISTINCT FROM v_current THEN
    RETURN jsonb_build_object('ok', false, 'current_entry_ids', to_jsonb(v_current));
  END IF;

  -- 5. Mark exactly those entries absent: what the Absent chip writes (zero time,
  -- zero counts, "Absent" reason, scoring_started_at untouched).
  UPDATE public.entries e
     SET result_status = 'absent',
         is_scored = true,
         search_time_seconds = 0,
         area1_time_seconds = NULL,
         area2_time_seconds = NULL,
         area3_time_seconds = NULL,
         area4_time_seconds = NULL,
         total_correct_finds = 0,
         total_incorrect_finds = 0,
         total_faults = 0,
         no_finish_count = 0,
         points_earned = 0,
         disqualification_reason = 'Absent',
         scoring_completed_at = now()
   WHERE e.id = ANY (v_current);

  -- 6. A hand-set status is never derived; complete it here, in the same
  -- transaction. A derived class completes through the entries trigger above.
  IF v_status_source = 'manual' THEN
    UPDATE public.classes SET status = 'completed' WHERE id = p_class_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'marked_count', cardinality(v_current));
END;
$$;

REVOKE ALL ON FUNCTION public.ringside_complete_stale_class(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ringside_complete_stale_class(uuid, uuid[]) TO authenticated;

COMMENT ON FUNCTION public.ringside_complete_stale_class(uuid, uuid[]) IS
  'MYK9-1514: marks a class''s unscored dogs absent in one transaction, only if they are exactly the ids the judge saw; otherwise changes nothing and returns {ok:false, current_entry_ids}. Authorized as ringside_update_entry (manager, assigned judge, judge passcode).';

NOTIFY pgrst, 'reload schema';
