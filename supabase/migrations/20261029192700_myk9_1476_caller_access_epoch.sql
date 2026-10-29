-- MYK9-1476: a change to the CALLER's own role set moves the rows the results
-- view returns to that caller.
--
-- view_authenticated_entry_results masks score/result fields by the caller's
-- access, computed in private.entry_results_caller_context() from
-- public.user_roles (site_admin, club_admin, club-scoped secretary and
-- trial_secretary, show- or club-scoped steward; is_active and expires_at > now())
-- plus judge assignments and the ringside claim. MYK9-969 set the rule that every
-- input to the privacy mask moves the row's updated_at, but the caller's
-- user_roles were missing from the GREATEST. After a grant, revoke, expiry or
-- deactivation, incremental replication (updated_at > watermark) never re-read
-- the already-cached rows, so they kept the old masking until a 24 h full sync.
--
-- Shape
--   * private.user_access_epoch(auth_user_id, changed_at): one row per account,
--     touched by an AFTER INSERT/UPDATE/DELETE row trigger on public.user_roles
--     for OLD.auth_user_id and NEW.auth_user_id. A DELETE is visible this way
--     where a max(updated_at) over the live rows could not see it.
--   * private.entry_results_caller_access_epoch(): GREATEST of the caller's
--     changed_at and the latest already-passed expires_at among the caller's
--     user_roles. The expiry term moves rows with no write at all.
--   * the view's updated_at and entry_results_changed_since both read it, so the
--     per-caller delta and the cheap "did anything move" probe agree. Other
--     callers' rows are unaffected: the epoch is keyed on auth.uid().
--   * Which rows each role sees and which columns are masked do NOT change.
--   * Backfill: every account that holds a user_roles row is stamped now(), so
--     the first sync after deploy re-reads that caller's rows once.
--
-- Sources copied verbatim, then edited at one spot each:
--   view_authenticated_entry_results  <- 20261029043900_myk9_1473_coin_flip_tie_order.sql
--   entry_results_changed_since       <- 20261028213700_myk9_1369_entry_results_changed_since.sql
--     (header input list now also names the caller access epoch)
-- The replication wrapper view reads updated_at straight from the inner view, so
-- it is untouched. CREATE OR REPLACE VIEW resets reloptions, so
-- security_invoker = false is carried inline; ACLs are kept by CREATE OR REPLACE.
--
-- ROLLBACK (in order):
--   1. Re-apply the view from 20261029043900_myk9_1473_coin_flip_tie_order.sql and
--      the function from 20261028213700_myk9_1369_entry_results_changed_since.sql.
--   2. DROP TRIGGER trg_user_roles_touch_access_epoch ON public.user_roles;
--      DROP FUNCTION private.touch_user_access_epoch();
--      DROP FUNCTION private.entry_results_caller_access_epoch();
--      DROP TABLE private.user_access_epoch;

CREATE TABLE IF NOT EXISTS private.user_access_epoch (
  auth_user_id uuid PRIMARY KEY,
  changed_at timestamptz NOT NULL DEFAULT now()
);
-- This project's default privileges grant anon CRUD on new tables.
REVOKE ALL ON private.user_access_epoch FROM PUBLIC, anon, authenticated;
-- Defence in depth: only the owner-run definer functions below touch it.
ALTER TABLE private.user_access_epoch ENABLE ROW LEVEL SECURITY;

-- clock_timestamp(), not now(): a transaction that began before a client's
-- last read would otherwise stamp a time older than that read's watermark.
-- GREATEST: concurrent transactions never move the epoch backward.
CREATE OR REPLACE FUNCTION private.touch_user_access_epoch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.auth_user_id IS NOT NULL THEN
    INSERT INTO private.user_access_epoch AS ep (auth_user_id, changed_at)
    VALUES (OLD.auth_user_id, clock_timestamp())
    ON CONFLICT (auth_user_id) DO UPDATE
      SET changed_at = GREATEST(ep.changed_at, EXCLUDED.changed_at);
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.auth_user_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id) THEN
    INSERT INTO private.user_access_epoch AS ep (auth_user_id, changed_at)
    VALUES (NEW.auth_user_id, clock_timestamp())
    ON CONFLICT (auth_user_id) DO UPDATE
      SET changed_at = GREATEST(ep.changed_at, EXCLUDED.changed_at);
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION private.touch_user_access_epoch() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_user_roles_touch_access_epoch ON public.user_roles;
CREATE TRIGGER trg_user_roles_touch_access_epoch
  AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION private.touch_user_access_epoch();

CREATE OR REPLACE FUNCTION private.entry_results_caller_access_epoch()
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT GREATEST(
    (SELECT ue.changed_at FROM private.user_access_epoch ue WHERE ue.auth_user_id = auth.uid()),
    (SELECT max(ur.expires_at) FROM public.user_roles ur
     WHERE ur.auth_user_id = auth.uid() AND ur.expires_at <= now())
  );
$$;
REVOKE ALL ON FUNCTION private.entry_results_caller_access_epoch() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.entry_results_caller_access_epoch()
  FROM anon, authenticated, service_role;
-- Granted exactly like private.entry_results_caller_context(): the view runs the
-- call as the querying role. It returns only the caller's own timestamp.
GRANT EXECUTE ON FUNCTION private.entry_results_caller_access_epoch() TO authenticated;
GRANT EXECUTE ON FUNCTION private.entry_results_caller_access_epoch() TO service_role;

INSERT INTO private.user_access_epoch (auth_user_id, changed_at)
SELECT DISTINCT ur.auth_user_id, now()
FROM public.user_roles ur
WHERE ur.auth_user_id IS NOT NULL
ON CONFLICT (auth_user_id) DO UPDATE SET changed_at = EXCLUDED.changed_at;

CREATE OR REPLACE VIEW public.view_authenticated_entry_results
  WITH (security_invoker = false)
AS
WITH caller_context AS MATERIALIZED (
  SELECT * FROM private.entry_results_caller_context()
),
-- MYK9-1369: the shows where the caller has a live, non-withdrawn entry as
-- handler, dog owner or dog co-owner. Depends on caller_context only, and
-- MATERIALIZED guarantees one evaluation per query. Three UNION ALL arms, one
-- per role, so each is an index lookup on the caller's own rows
-- (entries_active_handler_id_idx; dogs_owner_id_idx / dogs_co_owner_id_idx ->
-- entries_active_dog_id_idx) rather than an OR across the join, which would
-- scan every live entry on the platform. The union is the same set the old
-- `handler OR own_dog.owner OR own_dog.co_owner` over entries LEFT JOIN dogs
-- admitted: an entry with no dog row can match only through its handler arm.
exhibitor_shows AS MATERIALIZED (
  SELECT COALESCE(
    (
      SELECT array_agg(DISTINCT own.show_id)
      FROM (
        SELECT own_e.show_id
        FROM public.entries own_e
        WHERE own_e.handler_id = ctx0.person_id
          AND own_e.deleted_at IS NULL
          AND own_e.entry_status NOT IN ('withdrawn', 'scratched')
        UNION ALL
        SELECT own_e.show_id
        FROM public.dogs own_dog
        JOIN public.entries own_e ON own_e.dog_id = own_dog.id
        WHERE own_dog.owner_id = ctx0.person_id
          AND own_e.deleted_at IS NULL
          AND own_e.entry_status NOT IN ('withdrawn', 'scratched')
        UNION ALL
        SELECT own_e.show_id
        FROM public.dogs own_dog
        JOIN public.entries own_e ON own_e.dog_id = own_dog.id
        WHERE own_dog.co_owner_id = ctx0.person_id
          AND own_e.deleted_at IS NULL
          AND own_e.entry_status NOT IN ('withdrawn', 'scratched')
      ) own
    ),
    ARRAY[]::uuid[]
  ) AS show_ids
  FROM caller_context ctx0
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
    -- MYK9-1476: the caller's own role set is an input to the mask too
    -- (can_view_scores, steward, club-manager arms read user_roles). A grant,
    -- revoke, deactivation, hard delete or expiry moves every row THIS caller
    -- reads and no other caller's; see private.entry_results_caller_access_epoch().
    (SELECT private.entry_results_caller_access_epoch()),
    -- MYK9-1162: changing the trial's registry flips awaiting_registration_number
    -- for every entry in it, so the trial moves the row for the replication
    -- cursor (updated_at, id). Registration changes do not appear here: a
    -- DELETE cannot be seen by a max(updated_at), so
    -- trg_dog_registrations_touch_entries bumps the dog's entries instead.
    held_trial.updated_at
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
  public.entry_awaiting_registration_number(e.dog_id, e.class_id, e.entry_status, e.deleted_at) AS awaiting_registration_number,
  -- MYK9-1473: the tie marker and the secretary's recorded order, masked
  -- EXACTLY like final_placement (the ranking they explain): visible to the
  -- people who can see scores, and to everyone else only when the placement is
  -- visible to them. Appended at the END because CREATE OR REPLACE VIEW may
  -- only add columns there.
  CASE WHEN access.can_view_scores OR vis.placement_visible THEN e.placement_tie END AS placement_tie,
  CASE WHEN access.can_view_scores OR vis.placement_visible THEN e.placement_tiebreak END AS placement_tiebreak
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
CROSS JOIN exhibitor_shows
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
    COALESCE(e.show_id = ANY(exhibitor_shows.show_ids), false) AS is_show_exhibitor,
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

COMMENT ON VIEW public.view_authenticated_entry_results IS
  'Authenticated entry results. Scored columns stay gated by can_view_scores and '
  'payment columns by can_view_admin, which now also masks the enumerated '
  'withdrawal_reason_code beside the free-text withdrawal_reason (MYK9-632). A '
  'club-less show is manageable by site admins only (MYK9-258 / MYK9-329). Class '
  'result visibility resolves once per class via private.class_result_visibility '
  '(MYK9-126). moved_from_entry_id (MYK9-639) is unmasked: it is structural provenance, like class_id. registration_confirmation_number (MYK9-659) is appended after it and is NOT a sibling of payment_reference: it is a cross-table column from public.enrollments, reached by an owner-run LEFT JOIN that evaluates no enrollments policy, so can_view_admin is its ONLY guard -- a different predicate from enrollments_select, which matches the enrollment''s own handler_id. That is deliberate: the order reference belongs to whoever the ENTRY belongs to, so the entry''s handler or the dog''s owner sees the reference of the order their entry is on, even when another person placed it, and both client read paths apply that one rule. MYK9-969 results privacy: an entry''s results are public only when the show is not private (show_visibility_settings.results_private) and every tied person (dog owner, co-owner, handler) has exhibitor_profiles.results_public; otherwise every result column is NULL for a caller who is neither show staff nor a tied person, and results_private says so. Staff paths (can_view_scores, stewards, ringside staff claims) are unaffected. The view remains security_invoker = false. awaiting_registration_number (MYK9-1162) is appended last: TRUE for a live entry whose dog has no registration number for the trial''s registry, from public.entry_awaiting_registration_number(), and unmasked because it carries no registration data. is_show_exhibitor (MYK9-1369) is computed once per query from a materialized set of the caller''s exhibitor show ids, not once per entry; the access rule is unchanged. placement_tie and placement_tiebreak (MYK9-1473) are appended after it and masked exactly like final_placement (can_view_scores OR placement_visible), so the replica holds the coin-flip state wherever it holds the placement. The caller''s own role set (MYK9-1476) is an input to updated_at via private.entry_results_caller_access_epoch(), so a grant, revoke, deactivation, hard delete or expiry moves every row this caller reads.';


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
    -- caller access epoch (MYK9-1476): this caller's own role set changed
    OR COALESCE((SELECT private.entry_results_caller_access_epoch()) >= v_since, false)
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

