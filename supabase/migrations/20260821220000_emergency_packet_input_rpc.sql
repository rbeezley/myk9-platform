-- One authoritative shape for the emergency trial packet's input (MYK9-228).
--
-- WHY THIS EXISTS. Packet generation is moving off the secretary's browser and
-- onto cron, so an edge function needs the same input the Reports page builds.
-- That assembly currently lives in `reportDataMapping.ts` on React Query hooks
-- and app types. Porting it to Deno would create a second implementation of
-- entry/class/trial mapping -- exactly the duplication MYK9-228 set out to
-- avoid for the renderer, just moved to the data layer. It would also drift:
-- that mapping already carried a live bug this month (`area_count`, a column
-- that has never existed, read instead of `num_areas`).
--
-- So the shaping lives here once. The edge function becomes thin, and the app
-- can migrate onto this later, which COLLAPSES the duplication rather than
-- adding to it.
--
-- SECURITY DEFINER NOTES. This runs as the owner, so RLS is not a backstop and
-- every filter the policies would have applied is restated explicitly:
--   * `deleted_at IS NULL` on shows, trials, classes, entries -- a soft-deleted
--     row must never reach paper that a judge will score from.
--   * No authorization is performed here. EXECUTE is granted to `service_role`
--     ONLY; the caller (deliver/generate edge functions) already checks that
--     the requester manages the show, and the cron path has no user at all.
--     If the app is ever pointed at this, it needs an authenticated overload
--     with an `is_show_manager`-style gate -- do NOT simply widen the grant.
--
-- The JSON keys are camelCase because they are consumed directly as
-- `EmergencyPacketInput`; a rename here is a breaking change for the renderer.

-- `resolveClassSection`: trim, and treat the '-' sentinel as absent. Emitting
-- it raw builds labels like "Exterior Excellent -" on the printed page.
CREATE OR REPLACE FUNCTION public.emergency_packet_section(p_section text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_section IS NULL THEN NULL
    WHEN btrim(p_section) IN ('', '-') THEN NULL
    ELSE btrim(p_section)
  END;
$$;

REVOKE ALL ON FUNCTION public.emergency_packet_section(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.emergency_packet_section(text) TO service_role;

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
    SELECT t.id, t.date, t.name, t.trial_number, t.registry_id
    FROM public.trials t
    WHERE t.show_id = p_show_id
      AND t.deleted_at IS NULL
      -- NULL means "the whole show"; a date restricts to that trial day.
      AND (p_trial_date IS NULL OR t.date = p_trial_date)
  ),
  class_rows AS (
    SELECT
      cl.id, cl.trial_id, cl.name, cl.element, cl.level, cl.section, cl.class_number,
      cl.display_order, cl.judge_name, cl.start_time,
      cl.time_limit_seconds, cl.time_limit_area2_seconds, cl.time_limit_area3_seconds,
      cl.num_areas,
      -- `resolveClassJudgeName` prefers the ASSIGNMENT over `classes.judge_name`,
      -- and classes created through `create_show_with_children` leave
      -- `judge_name` null entirely. Reading only the column would print an
      -- empty judge on paper for normally configured classes.
      COALESCE(
        NULLIF(btrim(ja.judge_full_name), ''),
        NULLIF(btrim(cl.judge_name), '')
      ) AS judge_display_name
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
  ),
  entry_rows AS (
    SELECT
      e.id,
      -- `entries.armband` is TEXT and unconstrained; dog shows really do issue
      -- suffixed armbands ("12A"). A bare ::int would abort the whole packet
      -- for one odd value, so parse only when numeric. (The Reports page does
      -- `Number(armband)`, which yields NaN and prints "#NaN" -- see the
      -- follow-up note in MYK9-228; neither is right, but this cannot crash.)
      -- Digits alone are not enough: a long numeric string passes the regex
      -- and then `integer out of range` aborts the WHOLE packet for one row.
      CASE
        WHEN btrim(COALESCE(e.armband, '')) ~ '^[0-9]{1,9}$' THEN btrim(e.armband)::int
        ELSE 0
      END AS armband,
      e.run_order,
      -- Mirrors `mapReportEntry`: fall back to the armband so a paper row is
      -- never blank, and to '' for a breed we do not hold.
      COALESCE(d.call_name, 'Dog ' || COALESCE(e.armband, '?')) AS call_name,
      COALESCE(d.breed, '') AS breed,
      -- `resolveReportHandlerName`: blank and whitespace both mean unknown.
      CASE WHEN COALESCE(btrim(e.handler), '') = '' THEN 'Unknown Handler' ELSE btrim(e.handler) END
        AS handler,
      cl.id AS class_id,
      cl.trial_id,
      cl.element AS class_element,
      cl.level   AS class_level,
      public.emergency_packet_section(cl.section) AS class_section
    FROM public.entries e
    JOIN class_rows cl ON cl.id = e.class_id
    LEFT JOIN public.dogs d ON d.id = e.dog_id AND d.deleted_at IS NULL
    WHERE e.deleted_at IS NULL
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
        -- Ring is sport-dependent and no column holds one; scent work does not
        -- use rings. Null prints nothing rather than "Ring unassigned"
        -- (#1728). See MYK9-227 for when a ring-using sport arrives.
        'ringLabel', NULL,
        'startTime', cl.start_time,
        'timeLimitSeconds', cl.time_limit_seconds,
        'timeLimitArea2Seconds', cl.time_limit_area2_seconds,
        'timeLimitArea3Seconds', cl.time_limit_area3_seconds,
        'numAreas', cl.num_areas
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
        -- The Reports page does not resolve a registration number either; it
        -- passes null. Mirrored so paper matches the screen.
        'registrationNumber', NULL,
        'section', NULL,
        'classId', e.class_id,
        'trialId', e.trial_id,
        'classElement', e.class_element,
        'classLevel', e.class_level,
        'classSection', e.class_section
      ) ORDER BY e.run_order NULLS LAST, e.armband)
      FROM entry_rows e
    ), '[]'::jsonb)
  )
  WHERE EXISTS (SELECT 1 FROM show_row);
$$;

COMMENT ON FUNCTION public.emergency_packet_input(uuid, date) IS
  'Emergency trial packet input as EmergencyPacketInput-shaped JSON. SECURITY DEFINER with soft-delete filters restated; performs NO authorization, so EXECUTE stays limited to service_role (MYK9-228).';

-- No authorization inside, so no broad grant outside.
REVOKE ALL ON FUNCTION public.emergency_packet_input(uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.emergency_packet_input(uuid, date) TO service_role;

NOTIFY pgrst, 'reload schema';
