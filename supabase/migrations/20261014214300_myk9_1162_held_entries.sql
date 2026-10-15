-- =============================================================================
-- MYK9-1162: trial managers may enter a dog that has no registration number.
--
-- Owner decision (2026-10-14), relaxing the 2026-08-28 rule
-- (20260828210000_require_dog_registration_for_entries.sql) for the one person
-- who can resolve the gap. A secretary holding a mail-in with a missing or
-- illegible number could not key it in, and the show could fill while the number
-- was chased. The entry now holds its capacity place; it is surfaced under the
-- Entries cockpit's "Registration number needed" exception and kept off
-- catalogs, run sheets, scoresheets and the emergency packet until a number
-- exists. "Held" is derived, never stored.
--
-- Copied from the only prior definition (20260828210000), which no later
-- migration redefines. The single change is the early RETURN for
-- public.can_manage_trial(<trial id>). Everything else is unchanged: INSERT
-- only, registry resolved per trial with blank meaning AKC, the conformation
-- puppy carve-out, SECURITY DEFINER with an empty search_path. Exhibitors still
-- get the 23514 refusal. CREATE OR REPLACE keeps the existing ACL and trigger.
--
-- The same migration carries owner decision A for ringside: a held entry keeps
-- its run-order place, is flagged by the entry-results views
-- (awaiting_registration_number, computed server-side), and cannot be scored
-- (BEFORE UPDATE guard on public.entries). See the sections further down.
--
-- Rollback: re-apply the 20260828210000 definition.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.entries_require_dog_registration()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_trial_id     uuid;
  v_registry     text;
  v_trial_type   text;
  v_class_meta   text;
  v_has_number   boolean;
BEGIN
  IF NEW.dog_id IS NULL OR NEW.class_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT
    t.id,
    coalesce(nullif(btrim(t.registry_id), ''), 'AKC'),
    coalesce(t.trial_type, ''),
    lower(concat_ws(' ', c.name, c.element, c.level))
  INTO v_trial_id, v_registry, v_trial_type, v_class_meta
  FROM public.classes c
  JOIN public.trials t ON t.id = c.trial_id
  WHERE c.id = NEW.class_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- MYK9-1162: the person who manages the trial may enter a dog whose number
  -- has not arrived (a mail-in with a missing or illegible number). The entry
  -- holds its capacity place and stays off paperwork until the number exists
  -- (isAwaitingRegistrationNumber). auth.uid() still reflects the caller's JWT
  -- inside this SECURITY DEFINER function, so self-service exhibitors fail as
  -- before and a secretary's offline upload passes under the same identity.
  IF public.can_manage_trial(v_trial_id) THEN
    RETURN NEW;
  END IF;

  -- Conformation puppy classes may be entered before registration completes.
  IF lower(v_trial_type) LIKE '%conformation%' AND v_class_meta LIKE '%puppy%' THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.dog_registrations r
    WHERE r.dog_id = NEW.dog_id
      AND btrim(coalesce(r.registration_number, '')) <> ''
      AND public.normalize_registry_organization(r.organization)
          = public.normalize_registry_organization(v_registry)
  )
  INTO v_has_number;

  IF NOT v_has_number THEN
    RAISE EXCEPTION
      'This dog has no % registration number. A registration number is required to enter.',
      v_registry
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

-- Same explicit ACL as 20260828210000: a trigger function is invoked by the
-- trigger, never called directly, so no API role holds EXECUTE.
REVOKE ALL ON FUNCTION public.entries_require_dog_registration() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.entries_require_dog_registration() FROM anon;
REVOKE EXECUTE ON FUNCTION public.entries_require_dog_registration() FROM authenticated;

COMMENT ON FUNCTION public.entries_require_dog_registration() IS
  'Rejects an INSERT into public.entries when the dog has no registration number '
  'for the trial''s registry, unless the caller manages the trial (MYK9-1162: '
  'the entry is then held until a number exists). Mirrors registrationPrerequisite.ts, '
  'including the conformation-puppy exception. INSERT only by design -- see the '
  '20260828210000 header.';

-- -----------------------------------------------------------------------------
-- emergency_packet_input: leave entries awaiting a registration number out.
--
-- Full replacement of the latest definition (20260922220537, MYK9-603). Only
-- the entry_rows filter and trial_rows.trial_type change; JSON shape, the
-- handler identity rules and service-role-only access stay as they were.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.emergency_packet_input(
  p_show_id     uuid,
  p_trial_date  date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  WITH show_row AS (
    SELECT s.id, s.name, s.organization, s.start_date, s.end_date, c.name AS club_name
    FROM public.shows s
    LEFT JOIN public.clubs c ON c.id = s.club_id AND c.deleted_at IS NULL
    WHERE s.id = p_show_id
      AND s.deleted_at IS NULL
  ),
  trial_rows AS (
    SELECT
      t.id, t.date, t.name, t.trial_number, t.registry_id, t.trial_type,
      public.emergency_packet_registry_key(COALESCE(NULLIF(btrim(t.registry_id), ''), 'AKC'))
        AS registry_key
    FROM public.trials t
    WHERE t.show_id = p_show_id
      AND t.deleted_at IS NULL
      AND (p_trial_date IS NULL OR t.date = p_trial_date)
      AND COALESCE(t.status, '') <> 'cancelled'
  ),
  class_rows AS (
    SELECT
      cl.id, cl.trial_id, cl.name, cl.element, cl.level, cl.section, cl.class_number,
      cl.display_order, cl.start_time,
      cl.time_limit_seconds, cl.time_limit_area2_seconds, cl.time_limit_area3_seconds,
      cl.num_areas, cl.num_hides, cl.distraction_count,
      NULLIF(btrim(ja.judge_full_name), '') AS judge_display_name
    FROM public.classes cl
    JOIN trial_rows t ON t.id = cl.trial_id
    LEFT JOIN LATERAL (
      SELECT btrim(concat_ws(' ', p.first_name, p.last_name)) AS judge_full_name
      FROM public.judge_assignments a
      JOIN public.people p ON p.id = a.person_id AND p.deleted_at IS NULL
      WHERE a.class_id = cl.id
        AND a.status = 'confirmed'
      ORDER BY a.confirmed_at DESC NULLS LAST, a.created_at DESC
      LIMIT 1
    ) ja ON TRUE
    WHERE cl.deleted_at IS NULL
      AND COALESCE(cl.status, '') <> 'cancelled'
  ),
  entry_rows AS (
    SELECT
      e.id,
      NULLIF(btrim(COALESCE(NULLIF(btrim(ab.armband_number), ''), e.armband, '')), '')
        AS armband,
      CASE
        WHEN COALESCE(NULLIF(btrim(ab.armband_number), ''), e.armband, '') ~ '^\s*[0-9]'
          THEN NULLIF(substring(btrim(COALESCE(NULLIF(btrim(ab.armband_number), ''), e.armband, '')) from '^[0-9]{1,9}'), '')::int
        ELSE NULL
      END AS armband_sort,
      e.run_order,
      COALESCE(
        d.call_name,
        'Dog ' || COALESCE(NULLIF(btrim(ab.armband_number), ''), NULLIF(btrim(e.armband), ''), '?')
      ) AS call_name,
      COALESCE(d.breed, '') AS breed,
      CASE
        WHEN NULLIF(btrim(e.handler), '') IS NOT NULL THEN btrim(e.handler)
        WHEN e.handler_id IS NOT NULL THEN
          COALESCE(NULLIF(btrim(concat_ws(' ', handler_person.first_name, handler_person.last_name)), ''), 'Unknown Handler')
        WHEN d.owner_id IS NOT NULL THEN
          COALESCE(NULLIF(btrim(concat_ws(' ', owner_person.first_name, owner_person.last_name)), ''), 'Unknown Handler')
        ELSE 'Unknown Handler'
      END AS handler,
      registration.registration_number,
      cl.id AS class_id,
      cl.trial_id,
      cl.element AS class_element,
      cl.level   AS class_level,
      public.emergency_packet_section(cl.section) AS class_section
    FROM public.entries e
    JOIN class_rows cl ON cl.id = e.class_id
    JOIN trial_rows t ON t.id = cl.trial_id
    LEFT JOIN public.dogs d ON d.id = e.dog_id AND d.deleted_at IS NULL
    LEFT JOIN public.people handler_person
      ON handler_person.id = e.handler_id
     AND handler_person.deleted_at IS NULL
    LEFT JOIN public.people owner_person
      ON owner_person.id = d.owner_id
     AND owner_person.deleted_at IS NULL
    LEFT JOIN LATERAL (
      SELECT a2.armband_number
      FROM public.armbands a2
      WHERE a2.show_id = p_show_id
        AND a2.dog_id = e.dog_id
      ORDER BY a2.assigned_at DESC NULLS LAST
      LIMIT 1
    ) ab ON TRUE
    LEFT JOIN LATERAL (
      SELECT NULLIF(btrim(dr.registration_number), '') AS registration_number
      FROM public.dog_registrations dr
      WHERE dr.dog_id = e.dog_id
        AND public.emergency_packet_registry_key(dr.organization) = t.registry_key
      ORDER BY dr.is_primary DESC, dr.created_at ASC NULLS LAST, dr.id ASC
      LIMIT 1
    ) registration ON TRUE
    WHERE e.deleted_at IS NULL
      AND COALESCE(e.entry_status, '') NOT IN (
        'withdrawn', 'cancelled',
        'not_accepted', 'rejected', 'promotion-expired',
        'scratched',
        'moved',
        'absent'
      )
      AND COALESCE(e.check_in_status, '') <> 'pulled'
      -- MYK9-1162: an entry awaiting a registration number holds its capacity
      -- place but is never listed. Mirrors entries_require_dog_registration()
      -- and isAwaitingRegistrationNumber: a live entry whose dog has no
      -- non-blank number for the trial's registry, outside the conformation
      -- puppy carve-out. An entry with no dog is not held.
      AND NOT (
        e.dog_id IS NOT NULL
        AND NOT (
          lower(COALESCE(t.trial_type, '')) LIKE '%conformation%'
          AND lower(concat_ws(' ', cl.name, cl.element, cl.level)) LIKE '%puppy%'
        )
        AND NOT EXISTS (
          SELECT 1
          FROM public.dog_registrations held_dr
          WHERE held_dr.dog_id = e.dog_id
            AND NULLIF(btrim(held_dr.registration_number), '') IS NOT NULL
            AND public.emergency_packet_registry_key(held_dr.organization) = t.registry_key
        )
      )
  )
  SELECT jsonb_build_object(
    'show', (
      SELECT jsonb_build_object(
        'id', s.id,
        'name', COALESCE(s.name, ''),
        'clubName', s.club_name,
        'organization', s.organization,
        'startDate', COALESCE(s.start_date::date::text, ''),
        'endDate', COALESCE(s.end_date::date::text, s.start_date::date::text, '')
      )
      FROM show_row s
    ),
    'trials', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', t.id,
        'date', COALESCE(t.date::text, ''),
        'name', COALESCE(t.name, 'Trial ' || COALESCE(t.trial_number, '')),
        'trialNumber', COALESCE(t.trial_number, ''),
        'registryId', COALESCE(t.registry_id::text, '')
      ) ORDER BY t.date, t.trial_number)
      FROM trial_rows t
    ), '[]'::jsonb),
    'classes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', cl.id,
        'trialId', COALESCE(cl.trial_id::text, ''),
        'name', COALESCE(cl.name, concat_ws(' ', cl.element, cl.level, cl.section)),
        'element', COALESCE(cl.element, ''),
        'level', COALESCE(cl.level, ''),
        'section', public.emergency_packet_section(cl.section),
        'classNumber', cl.class_number,
        'displayOrder', cl.display_order,
        'judgeName', COALESCE(cl.judge_display_name, ''),
        'ringLabel', NULL,
        'startTime', cl.start_time,
        'timeLimitSeconds', cl.time_limit_seconds,
        'timeLimitArea2Seconds', cl.time_limit_area2_seconds,
        'timeLimitArea3Seconds', cl.time_limit_area3_seconds,
        'numAreas', cl.num_areas,
        'numHides', cl.num_hides,
        'distractionCount', cl.distraction_count
      ) ORDER BY cl.display_order NULLS LAST, cl.element, cl.level)
      FROM class_rows cl
    ), '[]'::jsonb),
    'entries', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', e.id,
        'armband', e.armband,
        'runOrder', e.run_order,
        'callName', e.call_name,
        'breed', e.breed,
        'handler', e.handler,
        'registrationNumber', e.registration_number,
        'section', NULL,
        'classId', e.class_id,
        'trialId', e.trial_id,
        'classElement', e.class_element,
        'classLevel', e.class_level,
        'classSection', e.class_section
      ) ORDER BY e.run_order NULLS LAST, e.armband_sort NULLS LAST, e.armband)
      FROM entry_rows e
    ), '[]'::jsonb)
  )
  WHERE EXISTS (SELECT 1 FROM show_row);
$$;

COMMENT ON FUNCTION public.emergency_packet_input(uuid, date) IS $comment$
  Emergency trial packet input as EmergencyPacketInput-shaped JSON. SECURITY DEFINER with soft-delete filters restated; performs NO authorization, so EXECUTE stays limited to service_role (MYK9-228). Judge names resolve through judge_assignments only (MYK9-479). Handler names prefer entry text, then the assigned person, then the dog's owner only when no handler identity is assigned (MYK9-603). Entries awaiting a registration number for the trial's registry are left out (MYK9-1162).
$comment$;

REVOKE ALL ON FUNCTION public.emergency_packet_input(uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.emergency_packet_input(uuid, date) TO service_role;

-- -----------------------------------------------------------------------------
-- MYK9-1162 (owner decision A): a held entry stays in its run-order place in
-- Show Map and ringside, shows "Registration number needed", and cannot be
-- scored until the number is added. The flag is computed HERE, server-side, so a
-- ringside device that cannot read dog_registrations still sees it.
--
-- public.entry_awaiting_registration_number is the ONE definition of "held" in
-- SQL for the view and the scoring guard. It is the same rule as
-- entries_require_dog_registration() and emergency_packet_input: a live entry
-- (not deleted, not withdrawn/scratched/absent/moved/not_accepted, mirroring the
-- client's isOnClassRunList) whose dog has no non-blank registration number for
-- the trial's registry (normalize_registry_organization, blank registry means
-- AKC), outside the conformation-puppy carve-out. An unknown class is not held.
-- Internal: EXECUTE is revoked from every client role; the owner-run views and
-- the SECURITY DEFINER trigger below reach it.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.entry_awaiting_registration_number(
  p_dog_id uuid,
  p_class_id uuid,
  p_entry_status text,
  p_deleted_at timestamptz
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT p_dog_id IS NOT NULL
     AND p_deleted_at IS NULL
     AND coalesce(p_entry_status, '') NOT IN ('withdrawn', 'scratched', 'absent', 'moved', 'not_accepted')
     AND EXISTS (
       SELECT 1
         FROM public.classes c
         JOIN public.trials t ON t.id = c.trial_id
        WHERE c.id = p_class_id
          AND NOT (
            lower(coalesce(t.trial_type, '')) LIKE '%conformation%'
            AND lower(concat_ws(' ', c.name, c.element, c.level)) LIKE '%puppy%'
          )
          AND NOT EXISTS (
            SELECT 1
              FROM public.dog_registrations r
             WHERE r.dog_id = p_dog_id
               AND btrim(coalesce(r.registration_number, '')) <> ''
               AND public.normalize_registry_organization(r.organization)
                   = public.normalize_registry_organization(coalesce(nullif(btrim(t.registry_id), ''), 'AKC'))
          )
     );
$$;

REVOKE ALL ON FUNCTION public.entry_awaiting_registration_number(uuid, uuid, text, timestamptz)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.entry_awaiting_registration_number(uuid, uuid, text, timestamptz) IS
  'True for a live entry whose dog has no registration number for the trial''s registry (a held entry, MYK9-1162). The single SQL definition of "held" for the entry-results views and the scoring guard; same rule as entries_require_dog_registration() and emergency_packet_input.';

-- Scoring guard. Every score write reaches public.entries: ringside_update_entry
-- (judges, stewards, passcode sessions) runs a dynamic UPDATE, and a manager's
-- paper entry is a direct UPDATE. One BEFORE UPDATE trigger therefore covers
-- both, and any future score-writing path. It fires only when a result is being
-- recorded (marked scored, a result status other than pending, a search time, a
-- scoring start), so check-in, run-order, withdraw and reset-score writes pass.
-- 23514 is a permanent error to the replication outbox, so a score queued
-- offline for a dog that is held at upload time dead-letters into the existing
-- refused-write Retry/Discard UX instead of being dropped or retried forever.
CREATE OR REPLACE FUNCTION public.entries_block_score_when_awaiting_registration()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF (NEW.is_scored IS TRUE AND OLD.is_scored IS DISTINCT FROM TRUE)
     OR (NEW.result_status IS DISTINCT FROM OLD.result_status
         AND NEW.result_status IS NOT NULL AND NEW.result_status <> 'pending')
     OR (NEW.search_time_seconds IS DISTINCT FROM OLD.search_time_seconds
         AND NEW.search_time_seconds IS NOT NULL)
     OR (NEW.scoring_started_at IS DISTINCT FROM OLD.scoring_started_at
         AND NEW.scoring_started_at IS NOT NULL)
  THEN
    IF public.entry_awaiting_registration_number(
         NEW.dog_id, NEW.class_id, NEW.entry_status, NEW.deleted_at) THEN
      RAISE EXCEPTION 'Registration number needed. See the secretary.'
        USING ERRCODE = '23514', HINT = 'registration_number_needed';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.entries_block_score_when_awaiting_registration()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_entries_block_score_when_awaiting_registration ON public.entries;
CREATE TRIGGER trg_entries_block_score_when_awaiting_registration
  BEFORE UPDATE ON public.entries
  FOR EACH ROW
  EXECUTE FUNCTION public.entries_block_score_when_awaiting_registration();

COMMENT ON FUNCTION public.entries_block_score_when_awaiting_registration() IS
  'Refuses a score write (23514, "Registration number needed. See the secretary.") for an entry awaiting a registration number (MYK9-1162). Covers ringside_update_entry and direct manager writes alike.';

-- -----------------------------------------------------------------------------
-- The entry-results views gain awaiting_registration_number (appended last).
-- Both bodies are copied from 20261011003700, the latest definitions, with the
-- explicit column list and WITH (security_invoker = false) carried inline.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.view_authenticated_entry_results
  WITH (security_invoker = false)
AS
WITH caller_context AS MATERIALIZED (
  SELECT * FROM private.entry_results_caller_context()
)
SELECT
  e.id,
  e.dog_id,
  e.class_id,
  e.show_id,
  e.trial_id,
  e.handler_id,
  e.entry_status,
  CASE WHEN access.can_view_admin THEN e.payment_status END AS payment_status,
  e.handler,
  (CASE WHEN access.can_view_admin THEN e.entry_fee END)::numeric(10,2) AS entry_fee,
  e.submitted_at,
  CASE WHEN access.can_view_admin THEN e.special_requests END AS special_requests,
  e.armband,
  e.run_order,
  e.jump_height,
  e.preferred_judge,
  e.move_up_requested,
  e.is_scored,
  e.is_in_ring,
  CASE WHEN access.can_view_scores OR vis.qualification_visible THEN e.result_status END AS result_status,
  e.ring_entry_time,
  e.ring_exit_time,
  e.scoring_started_at,
  e.scoring_completed_at,
  CASE WHEN access.can_view_scores OR vis.time_visible THEN e.search_time_seconds END AS search_time_seconds,
  CASE WHEN access.can_view_scores THEN e.area1_time_seconds END AS area1_time_seconds,
  CASE WHEN access.can_view_scores THEN e.area2_time_seconds END AS area2_time_seconds,
  CASE WHEN access.can_view_scores THEN e.area3_time_seconds END AS area3_time_seconds,
  CASE WHEN access.can_view_scores THEN e.area4_time_seconds END AS area4_time_seconds,
  CASE WHEN access.can_view_scores THEN e.total_correct_finds END AS total_correct_finds,
  CASE WHEN access.can_view_scores THEN e.total_incorrect_finds END AS total_incorrect_finds,
  CASE WHEN access.can_view_scores OR vis.faults_visible THEN e.total_faults END AS total_faults,
  CASE WHEN access.can_view_scores THEN e.no_finish_count END AS no_finish_count,
  CASE WHEN access.can_view_scores THEN e.area1_correct END AS area1_correct,
  CASE WHEN access.can_view_scores THEN e.area1_incorrect END AS area1_incorrect,
  CASE WHEN access.can_view_scores THEN e.area1_faults END AS area1_faults,
  CASE WHEN access.can_view_scores THEN e.area2_correct END AS area2_correct,
  CASE WHEN access.can_view_scores THEN e.area2_incorrect END AS area2_incorrect,
  CASE WHEN access.can_view_scores THEN e.area2_faults END AS area2_faults,
  CASE WHEN access.can_view_scores THEN e.area3_correct END AS area3_correct,
  CASE WHEN access.can_view_scores THEN e.area3_incorrect END AS area3_incorrect,
  CASE WHEN access.can_view_scores THEN e.area3_faults END AS area3_faults,
  CASE WHEN access.can_view_scores OR vis.time_visible THEN e.total_score END AS total_score,
  CASE WHEN access.can_view_scores THEN e.points_earned END AS points_earned,
  CASE WHEN access.can_view_scores THEN e.points_possible END AS points_possible,
  CASE WHEN access.can_view_scores THEN e.bonus_points END AS bonus_points,
  CASE WHEN access.can_view_scores THEN e.penalty_points END AS penalty_points,
  CASE WHEN access.can_view_scores THEN e.time_over_limit END AS time_over_limit,
  CASE WHEN access.can_view_scores THEN e.time_limit_exceeded_seconds END AS time_limit_exceeded_seconds,
  CASE WHEN access.can_view_scores OR vis.placement_visible THEN e.final_placement END AS final_placement,
  CASE WHEN access.can_view_scores THEN e.judge_notes END AS judge_notes,
  CASE WHEN access.can_view_scores THEN e.judge_signature END AS judge_signature,
  CASE WHEN access.can_view_scores THEN e.judge_signature_timestamp END AS judge_signature_timestamp,
  CASE WHEN access.can_view_scores THEN e.disqualification_reason END AS disqualification_reason,
  CASE WHEN access.can_view_scores THEN e.has_video_review END AS has_video_review,
  CASE WHEN access.can_view_scores THEN e.video_review_notes END AS video_review_notes,
  e.license_key,
  e.local_id,
  e.sync_version,
  e.last_synced_at,
  e.created_at,
  GREATEST(
    e.updated_at,
    c.updated_at,
    sh.updated_at,
    show_vis.updated_at,
    trial_vis.updated_at,
    class_vis.updated_at,
    -- MYK9-969: every input to the privacy mask moves the row (see the
    -- header's input table): tied people's profiles and people rows, the
    -- dog's ownership, and the one-time epoch of this migration.
    consent.profiles_updated_at,
    d.updated_at,
    (SELECT max(epoch.updated_at) FROM private.results_privacy_epoch epoch),
    -- MYK9-1162: adding or editing a registration, or changing the trial's
    -- registry, flips awaiting_registration_number, so it must move the row for
    -- the replication cursor (updated_at, id).
    held_trial.updated_at,
    (SELECT max(hr.updated_at) FROM public.dog_registrations hr WHERE hr.dog_id = e.dog_id)
  ) AS updated_at,
  e.deleted_at,
  CASE WHEN access.can_view_admin THEN e.deleted_by END AS deleted_by,
  e.check_in_status,
  CASE WHEN access.can_view_admin THEN e.payment_method END AS payment_method,
  e.entry_source,
  e.is_day_of_show,
  e.registration_id,
  CASE WHEN access.can_view_admin THEN e.withdrawal_reason END AS withdrawal_reason,
  (CASE WHEN access.can_view_admin THEN e.refund_amount END)::numeric(10,2) AS refund_amount,
  CASE WHEN access.can_view_admin THEN e.refund_notes END AS refund_notes,
  CASE WHEN access.can_view_admin THEN e.refunded_at END AS refunded_at,
  CASE WHEN access.can_view_admin THEN e.stripe_payment_intent_id END AS stripe_payment_intent_id,
  CASE WHEN access.can_view_admin THEN e.comped END AS comped,
  CASE WHEN access.can_view_admin THEN e.comped_reason END AS comped_reason,
  (CASE WHEN access.can_view_admin THEN e.discount_amount END)::numeric(10,2) AS discount_amount,
  CASE WHEN access.can_view_admin THEN e.promo_code_id END AS promo_code_id,
  CASE WHEN access.can_view_admin THEN e.confirmation_email_sent_at END AS confirmation_email_sent_at,
  CASE WHEN access.can_view_admin THEN e.confirmation_email_message_id END AS confirmation_email_message_id,
  CASE WHEN access.can_view_admin THEN e.confirmation_email_status END AS confirmation_email_status,
  e.version,
  CASE
    WHEN (access.can_view_scores OR vis.qualification_visible) AND e.is_scored = true AND e.result_status = 'qualified'  THEN 'Q'
    WHEN (access.can_view_scores OR vis.qualification_visible) AND e.is_scored = true AND e.result_status = 'nq'         THEN 'NQ'
    WHEN (access.can_view_scores OR vis.qualification_visible) AND e.is_scored = true AND e.result_status = 'absent'     THEN 'ABS'
    WHEN (access.can_view_scores OR vis.qualification_visible) AND e.is_scored = true AND e.result_status = 'excused'    THEN 'EX'
    WHEN (access.can_view_scores OR vis.qualification_visible) AND e.is_scored = true AND e.result_status = 'disqualified' THEN 'DQ'
    WHEN (access.can_view_scores OR vis.qualification_visible) AND e.is_scored = true AND e.result_status = 'withdrawn'  THEN 'WD'
    ELSE NULL
  END AS result_text,
  d.name AS dog_name,
  d.call_name AS dog_call_name,
  d.breed AS dog_breed,
  d.image_url AS dog_image_url,
  c.name AS class_name,
  c.level AS class_level,
  c.element AS class_element,
  c.results_released_at AS class_results_released_at,
  sh.name AS show_name,
  sh.start_date AS show_start_date,
  sh.organization AS show_organization,
  access.is_own_entry AS is_own_entry,
  -- Secretary payment bookkeeping. Masked by `can_view_admin` exactly like the
  -- other payment columns above; appended at the END of the select list because
  -- CREATE OR REPLACE VIEW may only add columns there.
  CASE WHEN access.can_view_admin THEN e.payment_reference END AS payment_reference,
  CASE WHEN access.can_view_admin THEN e.payment_received_on END AS payment_received_on,
  CASE WHEN access.can_view_admin THEN e.payment_notes END AS payment_notes,
  -- MYK9-632: the ENUMERATED withdrawal reason, beside the free-text
  -- `withdrawal_reason` above and masked by the same `can_view_admin` (a show
  -- manager, or the entry's own exhibitor). Appended at the END of the select
  -- list because CREATE OR REPLACE VIEW may only add columns there.
  CASE WHEN access.can_view_admin THEN e.withdrawal_reason_code END AS withdrawal_reason_code,
  -- MYK9-639: the supersession link. Structural, not financial, so it is NOT
  -- masked by can_view_admin -- it is the same kind of fact as e.class_id, and
  -- anyone this view already admits to the row may know which entry this one
  -- replaced. Appended at the END of the select list because CREATE OR REPLACE
  -- VIEW may only add columns there.
  e.moved_from_entry_id,
  -- MYK9-659: the ORDER's human reference. `enrollments.confirmation_number`
  -- is NOT NULL and defaulted from generate_confirmation_number(), and
  -- submit_show_entries always writes entries.registration_id, so every
  -- order the app creates has one. It reached the client only through the
  -- PostgREST `registration:registration_id(...)` embed, which the offline
  -- replica path cannot make -- so the same order printed `Confirmation #:
  -- MK9-000146` online and a raw enrollment UUID offline.
  --
  -- NOT the sibling of `payment_reference` above. That is an `entries` column,
  -- also reachable under `entries` RLS; this is a CROSS-TABLE column from
  -- `public.enrollments`, reached by an owner-run LEFT JOIN that evaluates no
  -- `enrollments` policy, so `access.can_view_admin` is its ONLY guard -- and
  -- a different predicate from `enrollments_select`, which matches the
  -- enrollment's own handler_id. Deliberate: the order reference belongs to
  -- whoever the ENTRY belongs to, so the entry's handler or the dog's owner
  -- sees the reference of the order their entry is on, even when another
  -- person placed it. Both client read paths apply that one rule.
  --
  -- Appended at the END of the select list because CREATE OR REPLACE VIEW may
  -- only add columns there.
  CASE WHEN access.can_view_admin THEN en.confirmation_number END AS registration_confirmation_number,
  -- MYK9-969: TRUE when this row's results are private and the caller is
  -- neither show staff nor a person tied to the entry, so every result column
  -- above arrived NULL for that reason (not because results are unreleased).
  -- Appended at the END: CREATE OR REPLACE VIEW may only add columns there.
  privacy.masked AS results_private,
  -- MYK9-1162: TRUE when this live entry's dog has no registration number for
  -- the trial's registry (a held entry). Computed here, server-side, by the one
  -- predicate public.entry_awaiting_registration_number() so a ringside device
  -- that cannot read dog_registrations (RLS, passcode sessions) still knows.
  -- Not masked: it names no registration data. Appended at the END because
  -- CREATE OR REPLACE VIEW may only add columns there.
  public.entry_awaiting_registration_number(e.dog_id, e.class_id, e.entry_status, e.deleted_at) AS awaiting_registration_number
FROM public.entries e
LEFT JOIN public.enrollments en ON en.id = e.registration_id
LEFT JOIN public.dogs d ON d.id = e.dog_id
LEFT JOIN public.classes c ON c.id = e.class_id
LEFT JOIN public.trials held_trial ON held_trial.id = c.trial_id
LEFT JOIN public.shows sh ON sh.id = e.show_id
LEFT JOIN public.show_visibility_settings show_vis ON show_vis.show_id = e.show_id
LEFT JOIN public.trial_visibility_overrides trial_vis ON trial_vis.trial_id = c.trial_id
LEFT JOIN public.class_visibility_overrides class_vis ON class_vis.class_id = e.class_id
CROSS JOIN caller_context ctx
LEFT JOIN private.class_result_visibility cvr ON cvr.class_id = e.class_id
-- MYK9-126: `vis` keeps its four column names, so every downstream reference
-- above is byte-identical to 20260902130000. The COALESCE reproduces the
-- function's fail-closed RETURN for an unknown or trial-less class, which a
-- LEFT JOIN would otherwise surface as NULL.
CROSS JOIN LATERAL (
  SELECT
    COALESCE(cvr.placement_visible, false)     AS placement_visible,
    COALESCE(cvr.qualification_visible, false) AS qualification_visible,
    COALESCE(cvr.time_visible, false)          AS time_visible,
    COALESCE(cvr.faults_visible, false)        AS faults_visible
) AS cascade_vis
CROSS JOIN LATERAL (
  SELECT
    (
      sh.id IS NOT NULL
      AND (
        -- MYK9-329: a club-less show is site-admin only. The former arm that
        -- admitted any holder of a manager role when the show had no club handed every
        -- club admin and secretary on the platform can_manage (and therefore
        -- can_view_admin: payment_status, entry_fee, judge_notes, ...) on any
        -- show with no club. MYK9-258 (20260828230000) removed that semantics
        -- from can_manage_show / manageable_show_ids / get_entries_for_export;
        -- this view was re-emitted with the old arm and left behind. Parity
        -- with can_manage_show() is restored here.
        ctx.is_site_admin
        OR sh.club_id = ANY(ctx.managed_club_ids)
        OR e.show_id = ANY(ctx.managed_show_ids)
      )
    ) AS can_manage,
    e.class_id = ANY(ctx.assigned_class_ids) AS is_assigned_judge,
    (
      e.show_id = ANY(ctx.steward_show_ids)
      OR sh.club_id = ANY(ctx.steward_club_ids)
    ) AS is_show_steward,
    (
      ctx.person_id = e.handler_id
      OR EXISTS (
        SELECT 1
        FROM public.dogs owned_dog
        WHERE owned_dog.id = e.dog_id
          AND owned_dog.owner_id = ctx.person_id
      )
    ) AS is_own_entry,
    EXISTS (
      SELECT 1
      FROM public.entries own_e
      LEFT JOIN public.dogs own_dog ON own_dog.id = own_e.dog_id
      WHERE own_e.show_id = e.show_id
        AND own_e.deleted_at IS NULL
        AND own_e.entry_status NOT IN ('withdrawn', 'scratched')
        AND (
          own_e.handler_id = ctx.person_id
          OR own_dog.owner_id = ctx.person_id
          OR own_dog.co_owner_id = ctx.person_id
        )
    ) AS is_show_exhibitor,
    (
      ctx.claim_kind = 'ringside_passcode'
      AND ctx.claim_show_id = e.show_id::text
      AND ctx.claim_generation_current
    ) AS claim_show_match,
    ctx.claim_role
) AS flags
CROSS JOIN LATERAL (
  SELECT
    flags.can_manage,
    flags.is_assigned_judge,
    flags.is_show_steward,
    flags.is_own_entry,
    flags.is_show_exhibitor,
    (flags.claim_show_match AND flags.claim_role IN ('judge', 'steward', 'admin')) AS is_ringside_claim,
    (
      flags.can_manage
      OR flags.is_assigned_judge
      OR (flags.claim_show_match AND flags.claim_role IN ('judge', 'admin'))
    ) AS can_view_scores,
    (flags.can_manage OR flags.is_own_entry) AS can_view_admin
) AS access
-- MYK9-969: results privacy. An entry's results are PUBLIC only when the show
-- is not private AND every person tied to the entry (the dog's owner and
-- co-owner, the entry's handler) has opted in on their own account. Most
-- private wins; an entry with no tied person, or a tied person with no
-- account, stays private (nobody opted in).
--
-- The opt-in is read through the person's OWN account: people.auth_user_id ->
-- exhibitor_profiles.auth_user_id (unique on both sides). It is never read via
-- exhibitor_profiles.person_id, which the row's own user may rewrite under the
-- self-only UPDATE policy -- keying on it would let anyone opt a stranger in.
CROSS JOIN LATERAL (
  SELECT
    bool_and(COALESCE(tep.results_public, false)) AS all_opted_in,
    -- people.updated_at too: relinking an account changes WHICH profile
    -- counts, and a deleted profile touches its person (trigger above).
    max(GREATEST(tep.updated_at, tp.updated_at)) AS profiles_updated_at
  FROM unnest(ARRAY[d.owner_id, d.co_owner_id, e.handler_id]) AS tied(person_id)
  LEFT JOIN public.people tp ON tp.id = tied.person_id
  LEFT JOIN public.exhibitor_profiles tep ON tep.auth_user_id = tp.auth_user_id
  WHERE tied.person_id IS NOT NULL
) AS consent
CROSS JOIN LATERAL (
  SELECT
    (
      (COALESCE(show_vis.results_private, false) OR consent.all_opted_in IS NOT TRUE)
      -- COALESCE: the claim arms are NULL (not false) for a caller with no
      -- ringside claim, and a NULL here would leave results_private NULL.
      AND NOT COALESCE(
        -- Show staff see every result: manager, the class's judge, a steward,
        -- and a current ringside judge/steward/admin passcode session.
        access.can_view_scores
        OR access.is_show_steward
        OR access.is_ringside_claim
        -- The people tied to the entry see their own results.
        OR access.is_own_entry
        OR (ctx.person_id IS NOT NULL AND ctx.person_id = d.co_owner_id),
        false
      )
    ) AS masked
) AS privacy
-- The cascade-visible flags, with privacy applied on top. Every result column
-- above reads `vis`, so masking here leaves their expressions byte-identical.
-- can_view_scores already short-circuits those columns for staff.
CROSS JOIN LATERAL (
  SELECT
    cascade_vis.placement_visible     AND NOT privacy.masked AS placement_visible,
    cascade_vis.qualification_visible AND NOT privacy.masked AS qualification_visible,
    cascade_vis.time_visible          AND NOT privacy.masked AS time_visible,
    cascade_vis.faults_visible        AND NOT privacy.masked AS faults_visible
) AS vis
WHERE (e.deleted_at IS NULL OR access.is_own_entry)
  AND (
    access.can_manage
    OR access.is_assigned_judge
    OR access.is_show_steward
    OR access.is_own_entry
    OR access.is_show_exhibitor
    OR access.is_ringside_claim
  );

GRANT SELECT ON public.view_authenticated_entry_results TO authenticated;
GRANT SELECT ON public.view_authenticated_entry_results TO service_role;
REVOKE ALL ON public.view_authenticated_entry_results FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.view_authenticated_entry_results FROM authenticated;

COMMENT ON VIEW public.view_authenticated_entry_results IS
  'Authenticated entry results. Scored columns stay gated by can_view_scores and '
  'payment columns by can_view_admin, which now also masks the enumerated '
  'withdrawal_reason_code beside the free-text withdrawal_reason (MYK9-632). A '
  'club-less show is manageable by site admins only (MYK9-258 / MYK9-329). Class '
  'result visibility resolves once per class via private.class_result_visibility '
  '(MYK9-126). moved_from_entry_id (MYK9-639) is unmasked: it is structural provenance, like class_id. registration_confirmation_number (MYK9-659) is appended after it and is NOT a sibling of payment_reference: it is a cross-table column from public.enrollments, reached by an owner-run LEFT JOIN that evaluates no enrollments policy, so can_view_admin is its ONLY guard -- a different predicate from enrollments_select, which matches the enrollment''s own handler_id. That is deliberate: the order reference belongs to whoever the ENTRY belongs to, so the entry''s handler or the dog''s owner sees the reference of the order their entry is on, even when another person placed it, and both client read paths apply that one rule. MYK9-969 results privacy: an entry''s results are public only when the show is not private (show_visibility_settings.results_private) and every tied person (dog owner, co-owner, handler) has exhibitor_profiles.results_public; otherwise every result column is NULL for a caller who is neither show staff nor a tied person, and results_private says so. Staff paths (can_view_scores, stewards, ringside staff claims) are unaffected. The view remains security_invoker = false. awaiting_registration_number (MYK9-1162) is appended last: TRUE for a live entry whose dog has no registration number for the trial''s registry, from public.entry_awaiting_registration_number(), and unmasked because it carries no registration data.';



CREATE OR REPLACE VIEW public.view_authenticated_entry_results_replication
  WITH (security_invoker = false)
AS
SELECT
  entries.id,
  entries.dog_id,
  entries.class_id,
  entries.show_id,
  entries.trial_id,
  entries.handler_id,
  entries.entry_status,
  entries.payment_status,
  entries.handler,
  entries.entry_fee,
  entries.submitted_at,
  entries.special_requests,
  entries.armband,
  entries.run_order,
  entries.jump_height,
  entries.preferred_judge,
  entries.move_up_requested,
  entries.is_scored,
  entries.is_in_ring,
  entries.result_status,
  entries.ring_entry_time,
  entries.ring_exit_time,
  entries.scoring_started_at,
  entries.scoring_completed_at,
  entries.search_time_seconds,
  entries.area1_time_seconds,
  entries.area2_time_seconds,
  entries.area3_time_seconds,
  entries.area4_time_seconds,
  entries.total_correct_finds,
  entries.total_incorrect_finds,
  entries.total_faults,
  entries.no_finish_count,
  entries.area1_correct,
  entries.area1_incorrect,
  entries.area1_faults,
  entries.area2_correct,
  entries.area2_incorrect,
  entries.area2_faults,
  entries.area3_correct,
  entries.area3_incorrect,
  entries.area3_faults,
  entries.total_score,
  entries.points_earned,
  entries.points_possible,
  entries.bonus_points,
  entries.penalty_points,
  entries.time_over_limit,
  entries.time_limit_exceeded_seconds,
  entries.final_placement,
  entries.judge_notes,
  entries.judge_signature,
  entries.judge_signature_timestamp,
  entries.disqualification_reason,
  entries.has_video_review,
  entries.video_review_notes,
  entries.license_key,
  entries.local_id,
  entries.sync_version,
  entries.last_synced_at,
  entries.created_at,
  entries.updated_at,
  entries.deleted_at,
  entries.deleted_by,
  entries.check_in_status,
  entries.payment_method,
  entries.entry_source,
  entries.is_day_of_show,
  entries.registration_id,
  entries.withdrawal_reason,
  entries.refund_amount,
  entries.refund_notes,
  entries.refunded_at,
  entries.stripe_payment_intent_id,
  entries.comped,
  entries.comped_reason,
  entries.discount_amount,
  entries.promo_code_id,
  entries.confirmation_email_sent_at,
  entries.confirmation_email_message_id,
  entries.confirmation_email_status,
  entries.version,
  entries.result_text,
  entries.dog_name,
  entries.dog_call_name,
  entries.dog_breed,
  entries.dog_image_url,
  entries.class_name,
  entries.class_level,
  entries.class_element,
  entries.class_results_released_at,
  entries.show_name,
  entries.show_start_date,
  entries.show_organization,
  entries.is_own_entry,
  entries.payment_reference,
  entries.payment_received_on,
  entries.payment_notes,
  shows.deleted_at AS show_deleted_at,
  shows.name AS source_show_name,
  shows.start_date AS source_show_start_date,
  shows.end_date AS source_show_end_date,
  -- Appended last: CREATE OR REPLACE VIEW may only add columns at the end, and
  -- the four `shows` columns above already hold ordinals 99-102.
  entries.withdrawal_reason_code,
  -- MYK9-639, appended last for the same CREATE OR REPLACE reason.
  entries.moved_from_entry_id,
  -- MYK9-659, appended last for the same CREATE OR REPLACE reason. Already
  -- masked by the inner view; the wrapper only carries it.
  entries.registration_confirmation_number,
  -- MYK9-969, appended last for the same CREATE OR REPLACE reason. Computed by
  -- the inner view; the wrapper only carries it.
  entries.results_private,
  -- MYK9-1162, appended last for the same CREATE OR REPLACE reason. Computed by
  -- the inner view; the wrapper only carries it.
  entries.awaiting_registration_number
FROM public.view_authenticated_entry_results AS entries
LEFT JOIN public.shows AS shows ON shows.id = entries.show_id;

GRANT SELECT ON public.view_authenticated_entry_results_replication TO authenticated;
GRANT SELECT ON public.view_authenticated_entry_results_replication TO service_role;
-- REVOKE ALL, not REVOKE SELECT. 20260901120000 created this wrapper with
-- CREATE OR REPLACE under this project's ALTER DEFAULT PRIVILEGES, which hands
-- anon full arwdDxtm on a newly created relation, and only SELECT was ever
-- taken back; 20260912183000 revoked the dormant writes from `authenticated`
-- but not from `anon`. The view is not updatable (multi-table), so the
-- residue is inert -- but owner-run plus a standing write grant is exactly
-- the pairing that migration existed to remove, and this file already
-- re-asserts the ACL.
REVOKE ALL ON public.view_authenticated_entry_results_replication FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.view_authenticated_entry_results_replication FROM authenticated;

COMMENT ON VIEW public.view_authenticated_entry_results_replication IS
  'Replication feed wrapping view_authenticated_entry_results, adding the shows join needed to replicate soft-deleted shows (MYK9-291). Owner-run (security_invoker = false) like the view it wraps; the score/payment gating is inherited from that inner view body, and the shows columns are reachable only for entries the inner view already admitted. Advisor security_definer_view ERROR accepted by design 2026-09-09 (docs/improve-audit-2026-07-11/009-advisor-disposition-sweep.md, Verdict 1). Any rebuild MUST carry WITH (security_invoker = false) inline -- CREATE OR REPLACE VIEW resets reloptions. The select list is explicit (MYK9-632): `entries.*` re-expanded on every rebuild and would have reordered the columns the moment the inner view gained one. moved_from_entry_id (MYK9-639) is appended after it. registration_confirmation_number (MYK9-659) is appended after that, so the offline receipt prints the same order reference as the online one -- guarded by the inner view''s can_view_admin alone (see that view''s comment), which is the entry''s access, not the enrollment''s. results_private (MYK9-969) is appended last and carried from the inner view, whose privacy mask already NULLed the result columns, so a replica on another exhibitor''s device never holds a private result. awaiting_registration_number (MYK9-1162) is appended after it, carried from the inner view, so a ringside device knows a held entry without reading dog_registrations.';

NOTIFY pgrst, 'reload schema';

COMMIT;
