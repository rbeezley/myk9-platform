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

COMMIT;
