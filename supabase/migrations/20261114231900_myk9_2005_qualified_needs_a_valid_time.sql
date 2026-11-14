-- MYK9-2005: the server refuses a Qualified that has no time, or a time over the class's limit.
--
-- The scoresheet refuses these since MYK9-2004 (packages/scoring-ui qualifiedCheck.ts), but a
-- stale phone, a queued offline score, paper scoring and a secretary's results edit all reach
-- the entries table without it. A Qualified saved with a time of 0 placed FIRST: placement is
-- time ascending and 0 beats every real time, while the paper-scoring page's own ranking
-- already skipped it (apps/myk9show/src/pages/scoring/types.ts calculatePlacements).
--
-- One trigger covers every path that sets result_status = 'qualified' for a signed-in or
-- anonymous-session caller: ringside_update_entry (judge and steward codes, secretary, manager;
-- it runs this UPDATE under definer rights but the caller's JWT claims stay set), a secretary's
-- direct entries UPDATE and the paper-scoring and results-edit pages, which write the table
-- directly. Writes with no end-user JWT role (migrations, the service role, the SQL
-- editor, legacy import) are not gated: the refusal is for people at the keyboard, and an
-- import must be able to land what the old system recorded.
--
-- What is refused (SQLSTATE 23514, a class-23 error: the replication layer never retries it,
-- so a queued score parks as a dead letter and shows in the judge's "Scores not sent" list):
--   * a Qualified whose search_time_seconds is null or 0 (hint qualified_needs_time);
--   * a Qualified whose time for an area is over that area's limit (hint
--     qualified_over_time_limit). The limits are classes.time_limit_seconds (area 1),
--     time_limit_area2_seconds and time_limit_area3_seconds, against entries.area1/2/3_time_seconds;
--     an area with no limit of its own uses area 1's, as buildResolvedClassRules does. A class
--     with no limit (null or 0), or an area whose time is blank (null or 0, its column default), is never refused for time. A
--     one-area class that saved only search_time_seconds is checked on that. A time EQUAL to
--     the limit is accepted.
-- Only a write that changes the result, a time, or the class is checked, so an unrelated edit to
-- a row that was saved before this rule (a payment note, a withdrawal) is never blocked.
--
-- The sentences match the scoresheet's ("Add a time to save a Qualified", "3:40 is over the
-- 3:00 limit. Fix the time, or choose NQ."), with a clause a secretary can act on.
--
-- Auto-complete paths (auto_complete_stale_classes, ringside_complete_stale_class) write
-- search_time_seconds = 0 only together with result_status = 'absent', so they never reach
-- this check.
--
-- Placements: recalculate_class_placements no longer ranks a Qualified with a null or zero
-- time (section 2), so the server agrees with the client ranking even for a row written
-- outside the gate.

-- ---------------------------------------------------------------------------
-- 1. The refusal
-- ---------------------------------------------------------------------------

-- "3:40", or "3:40.50" with hundredths: formatDuration(seconds, 'search') with the ".00" dropped.
CREATE OR REPLACE FUNCTION private.qualified_time_label(p_seconds numeric)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT (round(p_seconds * 100)::bigint / 6000)::text
         || ':' || lpad(((round(p_seconds * 100)::bigint / 100) % 60)::text, 2, '0')
         || CASE WHEN round(p_seconds * 100)::bigint % 100 = 0 THEN ''
                 ELSE '.' || lpad((round(p_seconds * 100)::bigint % 100)::text, 2, '0') END;
$function$;

REVOKE ALL ON FUNCTION private.qualified_time_label(numeric) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.entries_refuse_invalid_qualified()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_class public.classes%ROWTYPE;
  v_times numeric[];
  v_limits numeric[];
  v_area integer;
  v_limit numeric;
  v_areas integer;
BEGIN
  IF NEW.result_status IS DISTINCT FROM 'qualified'
     OR coalesce((SELECT auth.jwt()) ->> 'role', '') NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.result_status IS NOT DISTINCT FROM NEW.result_status
     AND OLD.class_id IS NOT DISTINCT FROM NEW.class_id
     AND OLD.search_time_seconds IS NOT DISTINCT FROM NEW.search_time_seconds
     AND OLD.area1_time_seconds IS NOT DISTINCT FROM NEW.area1_time_seconds
     AND OLD.area2_time_seconds IS NOT DISTINCT FROM NEW.area2_time_seconds
     AND OLD.area3_time_seconds IS NOT DISTINCT FROM NEW.area3_time_seconds THEN
    RETURN NEW;
  END IF;

  IF coalesce(NEW.search_time_seconds, 0) <= 0 THEN
    RAISE EXCEPTION 'A Qualified needs a time. Add the time, or change the result to NQ.'
      USING ERRCODE = '23514', HINT = 'qualified_needs_time';
  END IF;

  SELECT * INTO v_class FROM public.classes c WHERE c.id = NEW.class_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  v_areas := greatest(1, least(coalesce(v_class.num_areas, 1), 3));
  -- The area columns default to 0, so 0 reads as blank, like null.
  v_times := ARRAY[
    nullif(NEW.area1_time_seconds, 0), nullif(NEW.area2_time_seconds, 0), nullif(NEW.area3_time_seconds, 0)
  ];
  -- An area with no limit of its own uses area 1's; 0 means no limit.
  v_limits := ARRAY[
    nullif(v_class.time_limit_seconds, 0),
    coalesce(nullif(v_class.time_limit_area2_seconds, 0), nullif(v_class.time_limit_seconds, 0)),
    coalesce(nullif(v_class.time_limit_area3_seconds, 0), nullif(v_class.time_limit_seconds, 0))
  ];

  -- A one-area class that saved only the total (paper scoring, an older device): the total is
  -- its area 1 time.
  IF v_areas = 1 AND v_times[1] IS NULL THEN
    v_times[1] := NEW.search_time_seconds;
  END IF;

  FOR v_area IN 1 .. 3 LOOP
    v_limit := v_limits[v_area];
    IF v_times[v_area] IS NOT NULL AND v_limit IS NOT NULL AND v_times[v_area] > v_limit THEN
      RAISE EXCEPTION '% is over the % limit. Fix the time, or change the result to NQ.',
        CASE WHEN v_areas > 1 THEN 'Area ' || v_area || ' time ' ELSE '' END
          || private.qualified_time_label(v_times[v_area]),
        private.qualified_time_label(v_limit)
        USING ERRCODE = '23514', HINT = 'qualified_over_time_limit';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION private.entries_refuse_invalid_qualified() FROM PUBLIC, anon, authenticated, service_role;

-- trg_03: after the cancelled-class refusal (trg_02), whose message wins on a cancelled class.
DROP TRIGGER IF EXISTS trg_03_entries_refuse_invalid_qualified ON public.entries;
CREATE TRIGGER trg_03_entries_refuse_invalid_qualified
  BEFORE INSERT OR UPDATE ON public.entries
  FOR EACH ROW EXECUTE FUNCTION private.entries_refuse_invalid_qualified();

-- ---------------------------------------------------------------------------
-- 2. recalculate_class_placements: a Qualified with no time is not ranked
--    (20261029043900 with one more eligibility condition)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recalculate_class_placements(
  p_class_ids uuid[],
  p_is_nationals boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_class_id uuid;
BEGIN
  FOREACH v_class_id IN ARRAY p_class_ids
  LOOP
    WITH keyed AS (
      SELECT
        e2.id,
        e2.placement_tiebreak,
        coalesce(
          e2.is_scored = true
            AND e2.result_status = 'qualified'
            -- MYK9-2005: a null or zero time is never ranked (0 sorts ahead of every real time).
            AND e2.search_time_seconds > 0
            AND e2.deleted_at IS NULL,
          false
        ) AS eligible,
        -- Nationals: most points first. Otherwise (NULL included, as the old
        -- IF/ELSE did): fewest faults first. The other key is NULL for every
        -- row, so it never reorders anything.
        CASE WHEN p_is_nationals THEN e2.points_earned END AS points_key,
        CASE WHEN p_is_nationals IS NOT TRUE THEN e2.total_faults END AS faults_key,
        e2.search_time_seconds AS time_key
      FROM public.entries e2
      WHERE e2.class_id = v_class_id
    ),
    ranked AS (
      SELECT
        k.*,
        CASE WHEN k.eligible THEN
          ROW_NUMBER() OVER (
            PARTITION BY k.eligible
            ORDER BY
              k.points_key DESC NULLS LAST,
              k.faults_key ASC NULLS LAST,
              k.time_key ASC NULLS LAST,
              k.placement_tiebreak ASC NULLS LAST,
              k.id ASC
          )
        END AS row_place,
        CASE WHEN k.eligible THEN
          RANK() OVER (
            PARTITION BY k.eligible
            ORDER BY
              k.points_key DESC NULLS LAST,
              k.faults_key ASC NULLS LAST,
              k.time_key ASC NULLS LAST
          )
        END AS competition_rank,
        count(*) OVER tie_group AS tie_size,
        count(k.placement_tiebreak) OVER tie_group AS tiebreaks_set,
        count(*) OVER (
          PARTITION BY k.eligible, k.points_key, k.faults_key, k.time_key, k.placement_tiebreak
        ) AS same_tiebreak
      FROM keyed k
      WINDOW tie_group AS (PARTITION BY k.eligible, k.points_key, k.faults_key, k.time_key)
    ),
    placed AS (
      SELECT
        r.id,
        -- Ribbon range: the recorded flip order. Below it: the shared rank.
        CASE WHEN r.competition_rank <= 4 THEN r.row_place ELSE r.competition_rank END AS placement,
        CASE
          WHEN NOT r.eligible OR r.tie_size < 2 THEN NULL
          WHEN r.competition_rank > 4 THEN 'shared'
          WHEN r.tiebreaks_set < r.tie_size
               OR bool_or(r.placement_tiebreak IS NOT NULL AND r.same_tiebreak > 1)
                    OVER (PARTITION BY r.eligible, r.points_key, r.faults_key, r.time_key)
            THEN 'unresolved'
        END AS tie
      FROM ranked r
    )
    UPDATE public.entries e
       SET final_placement = p.placement,
           placement_tie = p.tie
      FROM placed p
     WHERE e.id = p.id
       AND (e.final_placement IS DISTINCT FROM p.placement
            OR e.placement_tie IS DISTINCT FROM p.tie);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.recalculate_class_placements(uuid[], boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recalculate_class_placements(uuid[], boolean) TO service_role;

COMMENT ON FUNCTION public.recalculate_class_placements(uuid[], boolean) IS
  'Recalculates final placements for scored, qualified, non-deleted entries with a '
  'time above zero in each supplied class: the rule''s keys, then the secretary-recorded '
  'coin-flip order (placement_tiebreak), then entry id only for a stable write. A tie '
  'within 1st-4th is placed consecutively and marked unresolved until its flip '
  'is recorded; a tie below 4th shares the competition rank and is marked '
  'shared (placement_tie). Writes only rows that change (MYK9-1473). '
  'Soft-deleted entries and a Qualified with no time are left unplaced (MYK9-2005).';
