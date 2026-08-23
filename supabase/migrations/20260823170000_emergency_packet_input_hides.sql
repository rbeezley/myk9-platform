-- ROLLBACK: re-apply the function body from
-- supabase/migrations/20260821220000_emergency_packet_input_rpc.sql as a new
-- CREATE OR REPLACE migration. The two added JSON keys are additive; a renderer
-- built before this migration ignores them, so an older app against a newer DB
-- is safe. The reverse (newer renderer, older RPC) yields null hides and
-- distractions, which the header already treats as "not configured".

-- Carry hides and distraction counts through to the emergency trial packet
-- (MYK9-228 unified scoresheet). The Reports scoresheet header prints both;
-- without them the packet's header is permanently thinner than the Reports
-- one and the two documents are not the same sheet.

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
      -- `trials_status_check` permits 'cancelled', and a cancelled trial is
      -- not soft-deleted. A day holding two trials, one cancelled, would
      -- otherwise print a full section for the one that will not run.
      AND COALESCE(t.status, '') <> 'cancelled'
  ),
  class_rows AS (
    SELECT
      cl.id, cl.trial_id, cl.name, cl.element, cl.level, cl.section, cl.class_number,
      cl.display_order, cl.judge_name, cl.start_time,
      cl.time_limit_seconds, cl.time_limit_area2_seconds, cl.time_limit_area3_seconds,
      cl.num_areas, cl.num_hides, cl.distraction_count,
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
      -- Same for a single cancelled class: `classes_status_check` permits it
      -- without a soft delete, and its entries are otherwise active.
      AND COALESCE(cl.status, '') <> 'cancelled'
  ),
  entry_rows AS (
    SELECT
      e.id,
      -- `entries.armband` is TEXT and unconstrained; dog shows really do issue
      -- suffixed armbands ("12A"). A bare ::int would abort the whole packet
      -- for one odd value, so parse only when numeric. (The Reports page does
      -- `Number(armband)`, which yields NaN and prints "#NaN" -- see the
      -- follow-up note in MYK9-228; neither is right, but this cannot crash.)
      -- `entries.armband` is a DENORMALISED copy that lags when the
      -- replication UPDATE has not synced; `armbands` is the authoritative
      -- source, written atomically by assign_armband. The Reports read path
      -- backfills from it by (show_id, dog_id) and paper must not disagree —
      -- a wrong armband misidentifies a dog and misorders the running order.
      --
      -- Digits alone are not enough to cast: a long numeric string passes an
      -- unbounded regex and `integer out of range` aborts the WHOLE packet.
      CASE
        WHEN btrim(COALESCE(NULLIF(btrim(e.armband), ''), ab.armband_number::text, '')) ~ '^[0-9]{1,9}$'
          THEN btrim(COALESCE(NULLIF(btrim(e.armband), ''), ab.armband_number::text))::int
        ELSE 0
      END AS armband,
      e.run_order,
      -- Mirrors `mapReportEntry`: fall back to the armband so a paper row is
      -- never blank, and to '' for a breed we do not hold.
      COALESCE(
        d.call_name,
        'Dog ' || COALESCE(NULLIF(btrim(e.armband), ''), ab.armband_number::text, '?')
      ) AS call_name,
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
    LEFT JOIN LATERAL (
      SELECT a2.armband_number
      FROM public.armbands a2
      WHERE a2.show_id = p_show_id
        AND a2.dog_id = e.dog_id
      ORDER BY a2.assigned_at DESC NULLS LAST
      LIMIT 1
    ) ab ON TRUE
    WHERE e.deleted_at IS NULL
      -- Soft-delete is not the only way an entry stops running, and these are
      -- NOT deleted -- that is the normal lifecycle. This is the union of the
      -- two canonical predicates, spelled with the RAW values the column holds
      -- (`getEntryStatusKind` folds several spellings onto one kind):
      --
      --   isRunnableScheduleStatus -> withdrawn | not_accepted | scratched | moved
      --     `moved` matters most: a move-up leaves the ORIGINAL row behind, so
      --     including it prints the same dog twice, once under a class it is
      --     no longer in. `promotion-expired` and `rejected` fold onto
      --     not_accepted; `cancelled` onto withdrawn.
      --   replicatedRunQueue.NOT_RUNNING_LIFECYCLE -> adds `absent`
      --
      -- DENYLIST, deliberately, not an allowlist. `draft`, `submitted`,
      -- `no-status` and `pending-payment` all fold onto kind `pending`, which
      -- `isRunnableScheduleStatus` treats as RUNNABLE. Excluding them here
      -- would make cron paper stricter than the Reports page the secretary
      -- just looked at -- the exact divergence this function exists to remove
      -- -- and would leave a dog who turns up with no row to write on, which
      -- is worse than listing one who should not have. If those states should
      -- be off paperwork, change `isRunnableScheduleStatus` so every surface
      -- moves together, then mirror it here. Raised twice in review; the
      -- answer is the same both times.
      AND COALESCE(e.entry_status, '') NOT IN (
        'withdrawn', 'cancelled',
        'not_accepted', 'rejected', 'promotion-expired',
        'scratched',
        'moved',
        'absent'
      )
      -- TWO axes, and the check-in one WINS. `pulled` lives on
      -- `check_in_status`, never on `entry_status` (migration 003 does not
      -- allow it there), so filtering the lifecycle alone leaves a dog pulled
      -- at the gate on the sheet -- the exact trap `queueStatus` documents.
      -- `in-ring` is NOT excluded: that dog is competing right now.
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
        -- Ring is sport-dependent and no column holds one; scent work does not
        -- use rings. Null prints nothing rather than "Ring unassigned"
        -- (#1728). See MYK9-227 for when a ring-using sport arrives.
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
