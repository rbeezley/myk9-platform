-- MYK9-969: results privacy -- a per-person account setting (default PRIVATE)
-- plus a show-wide private switch the club sets.
--
-- Owner rules (issue MYK9-969, 2026-10-03):
--   * "Show my results publicly" is a per-PERSON account setting, OFF by
--     default. A dog's result in a class is public only if EVERY person tied to
--     the entry -- the dog's owner, its co-owner and the entry's handler -- has
--     opted in. Most private wins.
--   * A club can make a whole show private. A club setting can never make a
--     person's private results public (it only ever adds privacy).
--   * Private results still show to the tied people themselves and to show
--     staff (secretary/club admin, the class's judge, stewards, ringside staff
--     passcode sessions, site admins).
--   * A private entry stays in the standings as "Private entry" at its place.
--   * Scope: ONLY what other exhibitors and the public see in the app. No
--     report changes -- catalogs, results PDFs, registry files and staff views
--     read through staff paths that this file leaves exactly as they were.
--
-- Where the settings live, and why:
--   * exhibitor_profiles.results_public -- every account has exactly one
--     exhibitor_profiles row (handle_new_user() creates it, unique on
--     auth_user_id), it already carries this account's other self-only flags
--     (onboarded_roles, MYK9-970), and its RLS is self-only (auth_user_id =
--     auth.uid(), or site admin) with anon revoked. NOT on people: people_update
--     admits show managers (can_manage_show_person), so a secretary could have
--     flipped an exhibitor's privacy. A person with no account (a mail-in
--     owner) has no profile and so is private, which is the default the owner
--     chose. Existing rows take the DEFAULT false: every current account starts
--     private (the backfill IS the default).
--   * show_visibility_settings.results_private -- the show's existing results
--     settings row (the cascade root the club already edits on the Results
--     page, secretary/club admin/platform admin RLS). DEFAULT false keeps
--     today's behaviour for every existing show.
--
-- The opt-in is read through the person's OWN account (people.auth_user_id ->
-- exhibitor_profiles.auth_user_id, both unique), never through
-- exhibitor_profiles.person_id: the self-only UPDATE policy lets a user rewrite
-- their own row's person_id, so keying on it would let anyone opt a stranger in.
--
-- Enforcement is server-side, in the two views that already decide result
-- visibility for non-staff readers -- nothing new is added beside them:
--   * view_public_entry_results (anon, and the released-results pages every
--     signed-in reader also uses): a masked row is ANONYMISED -- placement and
--     qualification kept, identity and time/score/faults removed.
--   * view_authenticated_entry_results (+ its _replication wrapper, which feeds
--     every device's offline replica): a masked row keeps its identity (the
--     run order is not a result) and every result column is NULL. Because the
--     replica is fed from this view, another exhibitor's device never stores a
--     private result. The privacy mask is folded into the existing `vis` flags,
--     so every result column expression is byte-identical to 20260918193700.
--   * Both views gain `results_private` (appended last) so the app can say
--     "Results private" / "Private entry" instead of "Pending".
--   * view_authenticated_entry_results.updated_at now also moves with a tied
--     person's exhibitor_profiles.updated_at, so a public->private flip reaches
--     replicas that pull incrementally.
--
-- Not changed (and why that keeps reports unaffected): entries itself (no
-- result column is granted to authenticated or anon -- the column allowlist
-- stops at is_scored), recalculate_class_placements and every placement/count
-- path, get_entries_for_export, class_results_push_audience (a push only ever
-- names the recipient's own dog), and every staff arm of both views.
--
-- Copied from the LATEST definitions: view_public_entry_results from
-- 20260916234500, view_authenticated_entry_results and its _replication wrapper
-- from 20260918193700 (no later migration redefines any of them; checked
-- against origin/main). WITH (security_invoker = false) is restated inline on
-- every view -- CREATE OR REPLACE VIEW resets reloptions without it.
--
-- NOT PUSHED by the authoring agent.

BEGIN;

ALTER TABLE public.exhibitor_profiles
  ADD COLUMN IF NOT EXISTS results_public boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.exhibitor_profiles.results_public IS
  'MYK9-969: "Show my results publicly". Default false (private). An entry''s results are public only when every tied person (dog owner, co-owner, handler) has this true, read through people.auth_user_id, and the show is not private.';

ALTER TABLE public.show_visibility_settings
  ADD COLUMN IF NOT EXISTS results_private boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.show_visibility_settings.results_private IS
  'MYK9-969: the club''s show-wide private switch. TRUE hides every entry''s results from other exhibitors and the public; it never makes a person''s private results public.';

-- No new GRANTs: both are new columns on tables with no column-level ACLs, so
-- the existing table grants cover them. exhibitor_profiles has no anon grant at
-- all (20260730220000); show_visibility_settings is anon-readable by design (a
-- show's results settings are public), and a show being private is not secret.

CREATE OR REPLACE VIEW public.view_public_entry_results
WITH (security_invoker = false) AS
 WITH caller_context AS MATERIALIZED (
   SELECT * FROM private.entry_results_caller_context()
 )
 SELECT
    -- MYK9-969: a private entry keeps its place in the standings but loses
    -- everything that names it or joins it back to a named row. The id is a
    -- fresh random uuid per read: the real entry id is visible to every other
    -- exhibitor at the show through view_authenticated_entry_results, so it
    -- would undo the anonymisation.
    CASE WHEN privacy.masked THEN gen_random_uuid() ELSE e.id END AS id,
    e.class_id AS class_id,
    c.trial_id,
    e.show_id,
    CASE WHEN privacy.masked THEN NULL::uuid ELSE e.dog_id END AS dog_id,
    CASE WHEN privacy.masked THEN NULL::text ELSE e.armband END AS armband,
    CASE WHEN privacy.masked THEN NULL::text ELSE e.handler END AS handler,
    CASE WHEN privacy.masked THEN NULL::integer ELSE e.run_order END AS run_order,
    e.is_in_ring AS is_in_ring,
    e.is_scored AS is_scored,
    e.check_in_status AS check_in_status,
    e.entry_status AS entry_status,
    CASE WHEN privacy.masked THEN NULL::timestamptz ELSE e.scoring_completed_at END AS scoring_completed_at,
    CASE WHEN privacy.masked THEN NULL::timestamptz ELSE e.created_at END AS created_at,
    -- Placement stays: "Private entry" is shown AT its place so the standings
    -- still read correctly (MYK9-969 owner decision). Qualification stays for
    -- the same reason -- it is what the placement and the class's Q tally are
    -- made of, and on an anonymous row it names no one.
    CASE
      WHEN vis.placement_visible THEN e.final_placement
      ELSE NULL::integer
    END AS final_placement,
    CASE
      WHEN vis.qualification_visible THEN e.result_status
      ELSE NULL::text
    END AS result_status,
    CASE
      WHEN vis.time_visible AND NOT privacy.masked THEN e.search_time_seconds
      ELSE NULL::numeric
    END AS search_time_seconds,
    CASE
      WHEN vis.time_visible AND NOT privacy.masked THEN e.total_score
      ELSE NULL::numeric
    END AS total_score,
    CASE
      WHEN vis.faults_visible AND NOT privacy.masked THEN e.total_faults
      ELSE NULL::integer
    END AS total_faults,
    CASE
      WHEN vis.qualification_visible AND e.is_scored = true
        AND e.result_status = 'qualified'::text THEN 'Q'::text
      WHEN vis.qualification_visible AND e.is_scored = true
        AND e.result_status = 'nq'::text THEN 'NQ'::text
      WHEN vis.qualification_visible AND e.is_scored = true
        AND e.result_status = 'absent'::text THEN 'ABS'::text
      WHEN vis.qualification_visible AND e.is_scored = true
        AND e.result_status = 'excused'::text THEN 'EX'::text
      WHEN vis.qualification_visible AND e.is_scored = true
        AND e.result_status = 'withdrawn'::text THEN 'WD'::text
      ELSE 'pending'::text
    END AS result_text,
    CASE WHEN privacy.masked THEN 'Private entry'::text ELSE d.name END AS dog_name,
    CASE WHEN privacy.masked THEN 'Private entry'::text ELSE d.call_name END AS dog_call_name,
    CASE WHEN privacy.masked THEN NULL::text ELSE d.breed END AS dog_breed,
    CASE WHEN privacy.masked THEN NULL::text ELSE d.image_url END AS dog_image_url,
    c.name AS class_name,
    c.level AS class_level,
    c.element AS class_element,
    c.results_released_at AS class_results_released_at,
    -- MYK9-969, appended last (CREATE OR REPLACE VIEW only adds columns at the
    -- end): TRUE when the row above is the anonymised "Private entry" shape.
    privacy.masked AS results_private
   FROM public.entries e
     JOIN public.classes c ON c.id = e.class_id
     JOIN public.shows sh ON sh.id = e.show_id
     LEFT JOIN public.trials t ON t.id = c.trial_id
     LEFT JOIN public.dogs d ON d.id = e.dog_id
     LEFT JOIN public.show_visibility_settings show_vis ON show_vis.show_id = e.show_id
     CROSS JOIN caller_context ctx
     LEFT JOIN private.class_result_visibility cvr ON cvr.class_id = e.class_id
     CROSS JOIN LATERAL (
       SELECT
         COALESCE(cvr.placement_visible, false) AS placement_visible,
         COALESCE(cvr.qualification_visible, false) AS qualification_visible,
         COALESCE(cvr.time_visible, false) AS time_visible,
         COALESCE(cvr.faults_visible, false) AS faults_visible
     ) vis
     -- MYK9-969: the same consent rule view_authenticated_entry_results applies
     -- (see that view): public only when the show is not private and every
     -- tied person opted in through their own account.
     CROSS JOIN LATERAL (
       SELECT bool_and(COALESCE(tep.results_public, false)) AS all_opted_in
       FROM unnest(ARRAY[d.owner_id, d.co_owner_id, e.handler_id]) AS tied(person_id)
       LEFT JOIN public.people tp ON tp.id = tied.person_id
       LEFT JOIN public.exhibitor_profiles tep ON tep.auth_user_id = tp.auth_user_id
       WHERE tied.person_id IS NOT NULL
     ) consent
     CROSS JOIN LATERAL (
       SELECT (
         (COALESCE(show_vis.results_private, false) OR consent.all_opted_in IS NOT TRUE)
         -- COALESCE: the claim arms are NULL for a caller with no claim.
         AND NOT COALESCE(
           -- Show staff: the same arms as the authenticated view's
           -- can_view_scores / is_show_steward / is_ringside_claim.
           ctx.is_site_admin
           OR sh.club_id = ANY(ctx.managed_club_ids)
           OR e.show_id = ANY(ctx.managed_show_ids)
           OR e.class_id = ANY(ctx.assigned_class_ids)
           OR e.show_id = ANY(ctx.steward_show_ids)
           OR sh.club_id = ANY(ctx.steward_club_ids)
           OR (
             ctx.claim_kind = 'ringside_passcode'
             AND ctx.claim_show_id = e.show_id::text
             AND ctx.claim_generation_current
             AND ctx.claim_role IN ('judge', 'steward', 'admin')
           )
           -- The people tied to the entry.
           OR (
             ctx.person_id IS NOT NULL
             AND ctx.person_id IN (e.handler_id, d.owner_id, d.co_owner_id)
           ),
           false
         )
       ) AS masked
     ) privacy
  WHERE e.deleted_at IS NULL
    AND c.deleted_at IS NULL
    AND c.results_released_at IS NOT NULL
    AND (t.id IS NULL OR t.deleted_at IS NULL)
    AND sh.deleted_at IS NULL
    AND sh.status = ANY (ARRAY['published'::text, 'upcoming'::text, 'in_progress'::text, 'completed'::text]);

GRANT SELECT ON public.view_public_entry_results TO anon;
GRANT SELECT ON public.view_public_entry_results TO authenticated;

COMMENT ON VIEW public.view_public_entry_results IS
  'Anon-readable RELEASED results only. The WHERE clause requires '
  'classes.results_released_at IS NOT NULL, so a class whose results are not '
  'released yields NO ROWS at all - no entry identity, and no class or show '
  'identifiers either. Within a released class the vis.*_visible guards still '
  'decide which scored columns (placement, qualification, time, faults) are '
  'published. MYK9-969 results privacy: an entry is public only when the show is '
  'not private and every tied person (dog owner, co-owner, handler) opted in '
  '(exhibitor_profiles.results_public, read through the person''s own account). '
  'For any other caller than show staff or a tied person, a private entry keeps '
  'its placement and qualification but is anonymised: a random per-read id, '
  'dog_name/dog_call_name ''Private entry'', and NULL dog_id, armband, handler, '
  'run_order, timestamps, breed, image, time, score and faults; results_private '
  'is TRUE. Owner-run (security_invoker = false): this body is the only guard '
  'anon meets, so do not remove the results_released_at predicate (MYK9-466, MYK9-552).';

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
    -- MYK9-969: a tied person flipping their results setting changes what
    -- this row shows, so their profile stamp must move the row for replication.
    consent.profiles_updated_at
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
  privacy.masked AS results_private
FROM public.entries e
LEFT JOIN public.enrollments en ON en.id = e.registration_id
LEFT JOIN public.dogs d ON d.id = e.dog_id
LEFT JOIN public.classes c ON c.id = e.class_id
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
    max(tep.updated_at) AS profiles_updated_at
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
  '(MYK9-126). moved_from_entry_id (MYK9-639) is unmasked: it is structural provenance, like class_id. registration_confirmation_number (MYK9-659) is appended after it and is NOT a sibling of payment_reference: it is a cross-table column from public.enrollments, reached by an owner-run LEFT JOIN that evaluates no enrollments policy, so can_view_admin is its ONLY guard -- a different predicate from enrollments_select, which matches the enrollment''s own handler_id. That is deliberate: the order reference belongs to whoever the ENTRY belongs to, so the entry''s handler or the dog''s owner sees the reference of the order their entry is on, even when another person placed it, and both client read paths apply that one rule. MYK9-969 results privacy: an entry''s results are public only when the show is not private (show_visibility_settings.results_private) and every tied person (dog owner, co-owner, handler) has exhibitor_profiles.results_public; otherwise every result column is NULL for a caller who is neither show staff nor a tied person, and results_private says so. Staff paths (can_view_scores, stewards, ringside staff claims) are unaffected. The view remains security_invoker = false.';

-- MYK9-291's wrapper, re-emitted with the star expanded (see the header).
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
  entries.results_private
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
  'Replication feed wrapping view_authenticated_entry_results, adding the shows join needed to replicate soft-deleted shows (MYK9-291). Owner-run (security_invoker = false) like the view it wraps; the score/payment gating is inherited from that inner view body, and the shows columns are reachable only for entries the inner view already admitted. Advisor security_definer_view ERROR accepted by design 2026-09-09 (docs/improve-audit-2026-07-11/009-advisor-disposition-sweep.md, Verdict 1). Any rebuild MUST carry WITH (security_invoker = false) inline -- CREATE OR REPLACE VIEW resets reloptions. The select list is explicit (MYK9-632): `entries.*` re-expanded on every rebuild and would have reordered the columns the moment the inner view gained one. moved_from_entry_id (MYK9-639) is appended after it. registration_confirmation_number (MYK9-659) is appended after that, so the offline receipt prints the same order reference as the online one -- guarded by the inner view''s can_view_admin alone (see that view''s comment), which is the entry''s access, not the enrollment''s. results_private (MYK9-969) is appended last and carried from the inner view, whose privacy mask already NULLed the result columns, so a replica on another exhibitor''s device never holds a private result.';


NOTIFY pgrst, 'reload schema';

COMMIT;
