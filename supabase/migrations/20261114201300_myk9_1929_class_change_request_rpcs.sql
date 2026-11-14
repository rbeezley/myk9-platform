-- MYK9-1929 phase 1: an exhibitor can ask for a class change, and take the ask back.
--
-- Plan of record: docs/plan-class-change-requests.md. Phase 0 decision (no new
-- table): a request IS the existing move-up request. The secretary's Move-ups
-- list already reads entries whose entry_status is 'move-up-requested'
-- (getPendingMoveUpRequests), and approve / deny already act on that status, so
-- the request lives on the entry row and Phase 3 turns that same list into the
-- class change list. What the row could not say until now was WHERE the dog
-- wants to go, WHY and WHEN, so three columns are added to public.entries:
--
--   class_change_target_class_id  the class asked for
--   class_change_reason           finished_level | wrong_level | wrong_section
--   class_change_requested_at     when the exhibitor asked (a written request
--                                 with a time on it, AKC Ch. 3 s21)
--
-- They mean something only while entry_status = 'move-up-requested'. A deny
-- (client path, unchanged here) restores 'confirmed' and leaves them behind;
-- Phase 3 reads them only for a row still in the requested status, and a new
-- request overwrites all three.
--
-- Two functions, in the pattern of withdraw_own_entry (SECURITY DEFINER, owner
-- scope restated, called directly and awaited: online only, never queued
-- through the MutationManager):
--
--   request_own_entry_class_change(entry, target class, reason, expected version)
--   cancel_own_entry_class_change(entry, expected version)
--
-- The entry stays in its class and keeps its seat there (the capacity readers count
-- 'move-up-requested', see 20261114201700). Nothing moves and no money moves: accepting is
-- the secretary's act, through the unchanged move_up_entry.
--
-- THE SWITCH. The plan's Phase 4 adds two per-show switches. Phase 1 needs the
-- first one to honour "cannot ask when the show's switch is off", so the column
-- is created here with the plan's default (allowed):
--   shows.allow_class_changes_after_close boolean NOT NULL DEFAULT true
-- When false, an exhibitor may not ask once entries have closed (the show's
-- entry_close_date calendar day is behind today in the show's zone). The second
-- switch (move-ups between trials on the same day) and the setup UI are Phase 4.
--
-- Grants. shows has table-level grants only (no column ACLs), so the new shows
-- column reads and writes like its neighbours; writes stay governed by the shows
-- UPDATE policy. entries is column-allowlisted for authenticated, so the three
-- new columns get SELECT only (they are written by the definer functions below)
-- and an explicit REVOKE from anon, ordered before the grant as plain statements
-- (LESSONS: grant-contract-splitter).

BEGIN;

ALTER TABLE public.shows
  ADD COLUMN IF NOT EXISTS allow_class_changes_after_close boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.shows.allow_class_changes_after_close IS
  'MYK9-1929: when false, an exhibitor cannot ask for a class change once entries have closed. The secretary''s own Change class ignores it.';

ALTER TABLE public.entries
  ADD COLUMN IF NOT EXISTS class_change_target_class_id uuid,
  ADD COLUMN IF NOT EXISTS class_change_reason text,
  ADD COLUMN IF NOT EXISTS class_change_requested_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'entries_class_change_reason_check'
       AND conrelid = 'public.entries'::regclass
  ) THEN
    ALTER TABLE public.entries
      ADD CONSTRAINT entries_class_change_reason_check
      CHECK (class_change_reason IS NULL
             OR class_change_reason IN ('finished_level', 'wrong_level', 'wrong_section'));
  END IF;
END;
$$;

-- Deliberately NO foreign key to classes: hard_delete_show fingerprints every FK
-- into shows, trials and classes (stripe_ledger_fks_restrict_test F527.6), and a
-- new edge needs a re-reviewed copy of that 486-line function. The class is
-- checked at request time, and move_up_entry already refuses a target that has
-- since gone ('That class no longer exists.'), so a dangling id is harmless.
COMMENT ON COLUMN public.entries.class_change_target_class_id IS
  'MYK9-1929: the class an exhibitor asked to move this entry to (no FK, see migration). Meaningful only while entry_status = move-up-requested.';
COMMENT ON COLUMN public.entries.class_change_reason IS
  'MYK9-1929: why the exhibitor asked (finished_level, wrong_level, wrong_section). Meaningful only while entry_status = move-up-requested.';
COMMENT ON COLUMN public.entries.class_change_requested_at IS
  'MYK9-1929: when the exhibitor asked. Meaningful only while entry_status = move-up-requested.';

REVOKE ALL (class_change_target_class_id, class_change_reason, class_change_requested_at)
  ON public.entries FROM anon;
GRANT SELECT (class_change_target_class_id, class_change_reason, class_change_requested_at)
  ON public.entries TO authenticated;

-- ---------------------------------------------------------------------------
-- request_own_entry_class_change
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_own_entry_class_change(
  p_entry_id uuid,
  p_target_class_id uuid,
  p_reason text,
  p_expected_version integer DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_person_id uuid;
  v_show_id uuid;
  v_dog_id uuid;
  v_handler_id uuid;
  v_class_id uuid;
  v_entry_status text;
  v_deleted_at timestamptz;
  v_check_in_status text;
  v_is_in_ring boolean;
  v_is_scored boolean;
  v_current_version integer;
  v_is_owner boolean;
  v_reason text;
  v_show_finished boolean;
  v_entries_closed boolean;
  v_allow_after_close boolean;
  v_target_show_id uuid;
  v_target_class_status text;
  v_avail record;
  v_judge_day_full boolean;
  v_updated_id uuid;
  v_new_version integer;
  -- A request is made by an ACCEPTED entry that has not been to the ring.
  -- Pending-acceptance entries are refused the same way move_up_entry refuses
  -- them (MYK9-980), and 'confirmed' is also what a decline restores, so a
  -- taken-back or declined request always returns the entry to where it was.
  v_pre_show_check_in constant text[] := ARRAY['no-status'];
BEGIN
  v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  IF v_reason IS NULL OR v_reason NOT IN ('finished_level', 'wrong_level', 'wrong_section') THEN
    RAISE EXCEPTION 'request_own_entry_class_change: p_reason must be finished_level, wrong_level or wrong_section'
      USING errcode = '22023';
  END IF;

  SELECT e.show_id, e.dog_id, e.handler_id, e.class_id, e.entry_status,
         e.deleted_at, e.check_in_status, coalesce(e.is_in_ring, false),
         coalesce(e.is_scored, false), e.version
    INTO v_show_id, v_dog_id, v_handler_id, v_class_id, v_entry_status,
         v_deleted_at, v_check_in_status, v_is_in_ring,
         v_is_scored, v_current_version
    FROM public.entries e
   WHERE e.id = p_entry_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Entry % not found', p_entry_id USING errcode = 'P0002';
  END IF;

  -- Owner tier only: the same scope entries_select grants an exhibitor over
  -- their own row (listed handler, dog owner, dog co-owner). A secretary who is
  -- not also the owner has her own Change class and is refused here, so this
  -- function can never be used to ask on someone else's behalf. An anon or
  -- ringside-passcode session resolves to no person and is refused too.
  SELECT p.id
    INTO v_caller_person_id
    FROM public.people p
   WHERE p.auth_user_id = (SELECT auth.uid())
   LIMIT 1;

  v_is_owner := v_caller_person_id IS NOT NULL AND (
    coalesce(v_handler_id = v_caller_person_id, false)
    OR EXISTS (
      SELECT 1 FROM public.dogs d
       WHERE d.id = v_dog_id
         AND (d.owner_id = v_caller_person_id OR d.co_owner_id = v_caller_person_id)
    )
  );

  IF v_is_owner IS NOT TRUE THEN
    RAISE EXCEPTION 'Not authorized to request a class change for entry %', p_entry_id
      USING errcode = '42501';
  END IF;

  IF v_deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Entry % has been removed', p_entry_id USING errcode = '42501';
  END IF;

  -- Same definition of "finished" as withdraw_own_entry (MYK9-778).
  SELECT coalesce(
           s.status = 'completed'
           OR (now() AT TIME ZONE private.show_time_zone(s.id))::date
              > (coalesce(s.end_date, s.start_date) AT TIME ZONE 'UTC')::date,
           false),
         -- Entries are closed once the entry_close_date calendar day is behind
         -- today in the show's zone. No close date: not closed.
         coalesce(
           s.entry_close_date IS NOT NULL
           AND (now() AT TIME ZONE private.show_time_zone(s.id))::date
               > (s.entry_close_date AT TIME ZONE 'UTC')::date,
           false),
         s.allow_class_changes_after_close
    INTO v_show_finished, v_entries_closed, v_allow_after_close
    FROM public.shows s
   WHERE s.id = v_show_id;

  IF coalesce(v_show_finished, false) THEN
    RAISE EXCEPTION 'Entry % cannot change class: the show has finished', p_entry_id
      USING errcode = 'MK006';
  END IF;

  -- The show's switch. Before entries close it does not apply.
  IF v_entries_closed AND v_allow_after_close IS NOT TRUE THEN
    RAISE EXCEPTION 'This show does not take class change requests after entries close.'
      USING errcode = '22023', hint = 'class_changes_not_allowed';
  END IF;

  IF coalesce(v_entry_status, '') = 'move-up-requested' THEN
    RAISE EXCEPTION 'This entry already has a class change request. Take it back before asking again.'
      USING errcode = '22023', hint = 'request_already_open';
  END IF;

  IF coalesce(v_entry_status, '') <> 'confirmed' THEN
    RAISE EXCEPTION 'Entry % cannot ask for a class change from status %', p_entry_id, v_entry_status
      USING errcode = '22023', hint = 'entry_not_accepted';
  END IF;

  IF v_is_scored
     OR v_is_in_ring
     OR (v_check_in_status IS NOT NULL AND NOT (v_check_in_status = ANY (v_pre_show_check_in))) THEN
    RAISE EXCEPTION 'Entry % has already started at the show and cannot change class', p_entry_id
      USING errcode = '22023', hint = 'entry_started';
  END IF;

  -- The class asked for: same show, still there, and not the class the dog is in.
  SELECT t.show_id, c.status
    INTO v_target_show_id, v_target_class_status
    FROM public.classes c
    JOIN public.trials t ON t.id = c.trial_id
   WHERE c.id = p_target_class_id
     AND c.deleted_at IS NULL
     AND t.deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'That class no longer exists.' USING errcode = 'P0002';
  END IF;

  IF v_target_show_id IS DISTINCT FROM v_show_id THEN
    RAISE EXCEPTION 'An entry can only ask for a class in its own show.' USING errcode = '22023';
  END IF;

  IF p_target_class_id = v_class_id THEN
    RAISE EXCEPTION 'That entry is already in this class.' USING errcode = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.entries x
     WHERE x.dog_id = v_dog_id
       AND x.class_id = p_target_class_id
       AND x.deleted_at IS NULL
       AND x.entry_status <> ALL (ARRAY['withdrawn'::text, 'scratched'::text])
  ) THEN
    RAISE EXCEPTION 'This dog is already entered in that class.' USING errcode = '22023';
  END IF;

  -- Full and started are the server's own answers (class_entry_availability,
  -- the reader the wizard and the submit share), never a client count. A class
  -- is full when the class or its judge's day is at its limit, WHETHER OR NOT
  -- it takes a wait list: a class change never joins a wait list, and it never
  -- adds an entry. The exhibitor's own cart holds are not counted against them.
  SELECT a.*
    INTO v_avail
    FROM public.class_entry_availability(
           ARRAY[p_target_class_id], (SELECT auth.uid()), true) a;

  IF v_avail.self_service_block IN ('cancelled', 'finished')
     OR lower(coalesce(v_target_class_status, '')) IN ('complete', 'completed', 'cancelled', 'canceled') THEN
    RAISE EXCEPTION 'That class is finished or cancelled and cannot take a changed entry.'
      USING errcode = '22023', hint = 'class_closed';
  END IF;

  IF v_avail.self_service_block = 'started' OR coalesce(v_avail.has_started, false) THEN
    RAISE EXCEPTION 'That class has already started and cannot take a changed entry.'
      USING errcode = '22023', hint = 'class_started';
  END IF;

  -- The judge day is judged NET of the entry being moved: when the source class
  -- is on the same judge day (same judge, same date), this entry already holds one
  -- of that day's seats, so the change adds nobody to it and is not refused for a
  -- day that is exactly full. Raw figures, not the clamped day_remaining, so a day
  -- already over its limit still reads as full. A missing figure is full.
  SELECT coalesce(bool_or(
           coalesce(t.day_capacity - t.day_taken - t.day_mail_in_reserved, 0)
           + CASE WHEN EXISTS (
                    SELECT 1
                      FROM public.class_judge_day_capacity(
                             ARRAY[v_class_id], (SELECT auth.uid()), true) s
                     WHERE s.judge_id = t.judge_id
                       AND s.show_date = t.show_date
                  ) THEN 1 ELSE 0 END <= 0), false)
    INTO v_judge_day_full
    FROM public.class_judge_day_capacity(
           ARRAY[p_target_class_id], (SELECT auth.uid()), true) t;

  IF coalesce(v_avail.class_full, false) OR v_judge_day_full THEN
    RAISE EXCEPTION 'That class is full.' USING errcode = '22023', hint = 'class_full';
  END IF;

  -- Optimistic concurrency, same contract as withdraw_own_entry.
  IF p_expected_version IS NOT NULL AND v_current_version IS DISTINCT FROM p_expected_version THEN
    RAISE EXCEPTION 'Version conflict requesting a class change for entry % (expected %)',
      p_entry_id, p_expected_version
      USING errcode = '40001', detail = v_current_version::text;
  END IF;

  UPDATE public.entries e
     SET entry_status = 'move-up-requested',
         move_up_requested = true,
         class_change_target_class_id = p_target_class_id,
         class_change_reason = v_reason,
         class_change_requested_at = now(),
         updated_at = now()
   WHERE e.id = p_entry_id
     AND (p_expected_version IS NULL OR e.version = p_expected_version)
  RETURNING e.id INTO v_updated_id;

  IF v_updated_id IS NULL THEN
    SELECT e.version INTO v_current_version FROM public.entries e WHERE e.id = p_entry_id;
    IF FOUND THEN
      RAISE EXCEPTION 'Version conflict requesting a class change for entry % (expected %)',
        p_entry_id, p_expected_version
        USING errcode = '40001', detail = v_current_version::text;
    END IF;
    RAISE EXCEPTION 'Entry % not found', p_entry_id USING errcode = 'P0002';
  END IF;

  SELECT e.version INTO v_new_version FROM public.entries e WHERE e.id = p_entry_id;
  RETURN v_new_version;
END;
$$;

COMMENT ON FUNCTION public.request_own_entry_class_change(uuid, uuid, text, integer) IS
  'MYK9-1929: an exhibitor asks to move their OWN confirmed entry to another class of the same show. '
  'Records the target class, the reason (finished_level | wrong_level | wrong_section) and the time, and '
  'sets entry_status = move-up-requested, which the secretary''s Move-ups list already reads. Refuses a '
  'caller who is not the entry''s handler, dog owner or co-owner (a secretary has her own Change class), '
  'a full class (class or judge day), a started, finished or cancelled class, and, once entries have '
  'closed, a show whose allow_class_changes_after_close is false. Moves nothing and charges nothing: '
  'the secretary accepts through move_up_entry. Online only, awaited by the client.';

REVOKE ALL ON FUNCTION public.request_own_entry_class_change(uuid, uuid, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.request_own_entry_class_change(uuid, uuid, text, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.request_own_entry_class_change(uuid, uuid, text, integer) TO authenticated;

-- ---------------------------------------------------------------------------
-- cancel_own_entry_class_change: take the request back
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_own_entry_class_change(
  p_entry_id uuid,
  p_expected_version integer DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_person_id uuid;
  v_dog_id uuid;
  v_handler_id uuid;
  v_entry_status text;
  v_deleted_at timestamptz;
  v_current_version integer;
  v_is_owner boolean;
  v_updated_id uuid;
  v_new_version integer;
BEGIN
  SELECT e.dog_id, e.handler_id, e.entry_status, e.deleted_at, e.version
    INTO v_dog_id, v_handler_id, v_entry_status, v_deleted_at, v_current_version
    FROM public.entries e
   WHERE e.id = p_entry_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Entry % not found', p_entry_id USING errcode = 'P0002';
  END IF;

  SELECT p.id
    INTO v_caller_person_id
    FROM public.people p
   WHERE p.auth_user_id = (SELECT auth.uid())
   LIMIT 1;

  v_is_owner := v_caller_person_id IS NOT NULL AND (
    coalesce(v_handler_id = v_caller_person_id, false)
    OR EXISTS (
      SELECT 1 FROM public.dogs d
       WHERE d.id = v_dog_id
         AND (d.owner_id = v_caller_person_id OR d.co_owner_id = v_caller_person_id)
    )
  );

  IF v_is_owner IS NOT TRUE THEN
    RAISE EXCEPTION 'Not authorized to take back the class change request for entry %', p_entry_id
      USING errcode = '42501';
  END IF;

  IF v_deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Entry % has been removed', p_entry_id USING errcode = '42501';
  END IF;

  -- Only while it is still waiting. An accepted request has already moved the
  -- entry ('moved'); a declined one is back to 'confirmed'. Neither is waiting.
  IF coalesce(v_entry_status, '') <> 'move-up-requested' THEN
    RAISE EXCEPTION 'Entry % has no waiting class change request', p_entry_id
      USING errcode = '22023', hint = 'no_open_request';
  END IF;

  IF p_expected_version IS NOT NULL AND v_current_version IS DISTINCT FROM p_expected_version THEN
    RAISE EXCEPTION 'Version conflict taking back the class change request for entry % (expected %)',
      p_entry_id, p_expected_version
      USING errcode = '40001', detail = v_current_version::text;
  END IF;

  -- Back to 'confirmed': the only status a request can be made from, and the
  -- one the secretary's decline restores.
  UPDATE public.entries e
     SET entry_status = 'confirmed',
         move_up_requested = false,
         class_change_target_class_id = NULL,
         class_change_reason = NULL,
         class_change_requested_at = NULL,
         updated_at = now()
   WHERE e.id = p_entry_id
     AND (p_expected_version IS NULL OR e.version = p_expected_version)
  RETURNING e.id INTO v_updated_id;

  IF v_updated_id IS NULL THEN
    SELECT e.version INTO v_current_version FROM public.entries e WHERE e.id = p_entry_id;
    IF FOUND THEN
      RAISE EXCEPTION 'Version conflict taking back the class change request for entry % (expected %)',
        p_entry_id, p_expected_version
        USING errcode = '40001', detail = v_current_version::text;
    END IF;
    RAISE EXCEPTION 'Entry % not found', p_entry_id USING errcode = 'P0002';
  END IF;

  SELECT e.version INTO v_new_version FROM public.entries e WHERE e.id = p_entry_id;
  RETURN v_new_version;
END;
$$;

COMMENT ON FUNCTION public.cancel_own_entry_class_change(uuid, integer) IS
  'MYK9-1929: an exhibitor takes back their OWN waiting class change request. Restores entry_status = confirmed '
  'and clears the target class, reason and time. Refused unless the entry is still move-up-requested. '
  'Online only, awaited by the client.';

REVOKE ALL ON FUNCTION public.cancel_own_entry_class_change(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_own_entry_class_change(uuid, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.cancel_own_entry_class_change(uuid, integer) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
