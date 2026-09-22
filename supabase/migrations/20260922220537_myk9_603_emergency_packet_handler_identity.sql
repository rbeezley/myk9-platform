-- MYK9-603: make the scheduled packet use the entry's assigned handler
-- identity, with the dog owner as fallback only for entries without one.
--
-- This is a full replacement of the latest emergency_packet_input definition
-- (20260912234500). All filters, JSON shape, and service-role-only access stay
-- unchanged.
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
      t.id, t.date, t.name, t.trial_number, t.registry_id,
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
  Emergency trial packet input as EmergencyPacketInput-shaped JSON. SECURITY DEFINER with soft-delete filters restated; performs NO authorization, so EXECUTE stays limited to service_role (MYK9-228). Judge names resolve through judge_assignments only (MYK9-479). Handler names prefer entry text, then the assigned person, then the dog's owner only when no handler identity is assigned (MYK9-603).
$comment$;

REVOKE ALL ON FUNCTION public.emergency_packet_input(uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.emergency_packet_input(uuid, date) TO service_role;
