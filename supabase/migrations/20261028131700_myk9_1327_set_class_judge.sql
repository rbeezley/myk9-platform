-- MYK9-1327 (Option C): one atomic server write per class-judge pick.
--
-- WHY
-- A class judge lives in judge_assignments (classes.judge_name was dropped by MYK9-479). A pick
-- used to queue a judge_assignments DELETE, a judge_assignments INSERT and a full-row classes
-- UPDATE as independent client mutations with no ordering, so the class UPDATE could ack while
-- the assignment was still backing off, the row went clean, and the next pull handed the old
-- judge back. This RPC replaces the whole value in ONE transaction, so the client queues one
-- mutation and stores one answer.
--
-- SECURITY INVOKER, on purpose. The judge_assignments INSERT/DELETE policies
-- (20260801160000_remove_steward_office_writes.sql) stay the real guard, and
-- touch_class_on_judge_assignment_change() (20260914174500) is already SECURITY DEFINER, so the
-- classes.updated_at / version bump needs no classes UPDATE grant here. An INVOKER DELETE that RLS
-- filters away removes zero rows without an error, so the policy predicate
-- (is_site_admin() OR is_show_office_manager(show)) is restated up front and raises 42501.
--
-- Errors: P0002 class not found (or not visible / soft-deleted), 42501 not an office manager of
-- the class's show, 22023 person missing or soft-deleted. Registry qualification is NOT enforced
-- (parity with the client write this replaces).
--
-- No OCC precondition: a pick replaces the whole value. Across devices, commit order decides.

CREATE OR REPLACE FUNCTION public.set_class_judge(p_class_id uuid, p_person_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_trial_id uuid;
  v_show_id uuid;
  v_rows integer;
  v_matching integer;
  v_version integer;
  v_updated_at timestamptz;
  v_judge jsonb;
BEGIN
  -- 1. Resolve the class and derive the show; the client never supplies it.
  SELECT c.trial_id, tr.show_id
    INTO v_trial_id, v_show_id
  FROM public.classes c
  JOIN public.trials tr ON tr.id = c.trial_id
  WHERE c.id = p_class_id
    AND c.deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'set_class_judge: class % not found', p_class_id
      USING ERRCODE = 'P0002';
  END IF;

  -- 2. Restates the judge_assignments write policies.
  IF NOT (public.is_site_admin() OR public.is_show_office_manager(v_show_id)) THEN
    RAISE EXCEPTION 'set_class_judge: not permitted to assign judges for this show'
      USING ERRCODE = '42501';
  END IF;

  -- 3. Two concurrent picks for one class must not both insert.
  PERFORM pg_advisory_xact_lock(hashtextextended('set_class_judge:' || p_class_id::text, 0));

  -- 4. The judge must be a live person.
  IF p_person_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.people pe
    WHERE pe.id = p_person_id AND pe.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'set_class_judge: person % not found', p_person_id
      USING ERRCODE = '22023';
  END IF;

  -- 5. Idempotent no-op: a replay after a lost response neither bumps the class version nor
  --    churns the assignment id.
  SELECT count(*)::integer,
         count(*) FILTER (WHERE ja.person_id = p_person_id AND ja.status = 'confirmed')::integer
    INTO v_rows, v_matching
  FROM public.judge_assignments ja
  WHERE ja.class_id = p_class_id;

  IF NOT (
    (p_person_id IS NULL AND v_rows = 0)
    OR (p_person_id IS NOT NULL AND v_rows = 1 AND v_matching = 1)
  ) THEN
    -- 6. Replace every class-level row (any status); show-level rows (class_id IS NULL) are
    --    never touched.
    DELETE FROM public.judge_assignments WHERE class_id = p_class_id;

    IF p_person_id IS NOT NULL THEN
      INSERT INTO public.judge_assignments
        (person_id, show_id, trial_id, class_id, status, confirmed_at)
      VALUES
        (p_person_id, v_show_id, NULL, p_class_id, 'confirmed', now());
    END IF;
  END IF;

  -- 7. One consistent read AFTER the writes (the touch trigger has bumped the class). The judge
  --    resolves like get_show_judges / pickConfirmedAssignment: lowest-id confirmed class-level
  --    row whose person is not deleted.
  SELECT c.version, c.updated_at
    INTO v_version, v_updated_at
  FROM public.classes c
  WHERE c.id = p_class_id;

  SELECT jsonb_build_object(
           'person_id', pe.id,
           'first_name', pe.first_name,
           'last_name', pe.last_name
         )
    INTO v_judge
  FROM public.judge_assignments ja
  JOIN public.people pe ON pe.id = ja.person_id
  WHERE ja.class_id = p_class_id
    AND ja.status = 'confirmed'
    AND pe.deleted_at IS NULL
  ORDER BY ja.id
  LIMIT 1;

  RETURN jsonb_build_object(
    'version', v_version,
    'updated_at', v_updated_at,
    'judge', v_judge
  );
END;
$$;

COMMENT ON FUNCTION public.set_class_judge(uuid, uuid) IS
  'MYK9-1327: atomically replaces the class-level judge_assignments for one class (NULL person '
  'removes the judge) and returns {version, updated_at, judge}. SECURITY INVOKER: the '
  'judge_assignments write policies stay the guard; the explicit is_site_admin() OR '
  'is_show_office_manager(show) check only turns a silent RLS no-op into 42501. P0002 class '
  'missing, 22023 person missing/deleted. Idempotent: an already-matching state writes nothing. '
  'Show-level rows are untouched. Not on the anon keep-list.';

REVOKE ALL ON FUNCTION public.set_class_judge(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_class_judge(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_class_judge(uuid, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
