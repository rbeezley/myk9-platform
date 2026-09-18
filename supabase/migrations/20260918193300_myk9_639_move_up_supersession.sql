-- MYK9-639 / MYK9-640: a move-up is a SUPERSESSION, not a waiver.
--
-- Today `moveUpShowMapEntry` creates the destination entry with
-- `payment_status = 'waived'`, `entry_fee = 0` and drops the dog's check-in,
-- then marks the source `entry_status = 'moved'`. Two entries exist for one
-- paid run: the Financial Report counts both and labels the destination
-- "Waived/Comped" though `comped` is false and nobody waived anything, while
-- the UKC Nosework Trial Report counts one. A club cannot reconcile against
-- both (MYK9-639). The same write leaves the dog looking unseen in their new
-- class, and there is no control anywhere that moves them back (MYK9-640).
--
-- The representation this migration adds is the missing half of that write:
--
--   entries.moved_from_entry_id -> entries.id
--
-- set on the DESTINATION entry, pointing at the source it supersedes. With it,
-- the destination carries the source's money (payment_status, entry_fee,
-- payment method/reference/received-on/notes, comped, discount) and its
-- check-in, the source stays `moved` and is excluded from the Financial
-- Report, and the pair nets to exactly ONE entry at the amount actually paid --
-- agreeing with `Total Entries` on the registry report. No new
-- `payment_status` value is introduced, and `waived` keeps meaning only what a
-- secretary deliberately waived.
--
-- It is also the durable way back for MYK9-640: the reverse move reads this
-- column to find the entry to restore, long after the 8-second undo banner is
-- gone. (The client additionally falls back to the pre-existing
-- "Moved up from class <id>" note so move-ups recorded BEFORE this migration
-- are reversible too -- see services/database/entries/moveUpNote.ts.)
--
-- ON DELETE SET NULL, not CASCADE: a hard-deleted source must not take the live
-- destination entry with it. The link simply becomes unknown and the reverse
-- move stops being offered.
--
-- Grants. `public.entries` carries NO table-level SELECT for `authenticated`
-- (`relacl` reads `authenticated=awd/postgres`); SELECT is granted column by
-- column, so a new column is invisible -- PostgREST 42501 -- until it is named.
-- UPDATE is table-wide (`w`), so only SELECT is granted here. `anon` holds no
-- table grant and no column grant on `entries` (verified: 0 of 55 column ACLs
-- mention it); the REVOKE below states that rather than assuming it.
--
-- Index: FK-leading, partial. Almost every entry has no supersession link, so
-- the `WHERE ... IS NOT NULL` predicate keeps it to the handful of rows a
-- move-up creates while still serving the reverse-move lookup and any future
-- ON DELETE SET NULL scan.
--
-- The two view bodies below are copied from 20260918041700 (MYK9-632), which is
-- the LATEST migration defining them -- `grep -l view_authenticated_entry_results
-- supabase/migrations/` confirms nothing after it redefines either body. They
-- are byte-identical to that file except for the one appended column on each,
-- the refreshed COMMENTs, and they carry `WITH (security_invoker = false)`
-- inline on both, because CREATE OR REPLACE VIEW resets reloptions
-- (20260817190000).
--
-- NOT PUSHED by the authoring agent: `supabase db push` on the linked project is
-- Richard's to run. Until it lands, `moved_from_entry_id` is absent from the
-- views, every client read of it is `undefined`, and the reverse move falls back
-- to the note-based lookup, which resolves the same pair.

BEGIN;

ALTER TABLE public.entries
  ADD COLUMN IF NOT EXISTS moved_from_entry_id uuid
    REFERENCES public.entries(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.entries.moved_from_entry_id IS
  'MYK9-639: set on the DESTINATION entry of a move-up, pointing at the source '
  'entry it supersedes (that source carries entry_status = ''moved''). The pair '
  'is ONE paid run: the destination carries the money and the check-in, and the '
  'source is excluded from the Financial Report. Also the durable link the '
  'reverse move (MYK9-640) reads to restore the source. NULL on every entry that '
  'is not the product of a move-up.';

GRANT SELECT (moved_from_entry_id) ON public.entries TO authenticated;
-- Stated, not assumed: anon must never read this column (it holds none on this
-- table today, and omitting a GRANT is not the same as keeping a role out).
REVOKE ALL (moved_from_entry_id) ON public.entries FROM anon;

CREATE INDEX IF NOT EXISTS entries_moved_from_entry_id_fk_idx
  ON public.entries (moved_from_entry_id)
  WHERE moved_from_entry_id IS NOT NULL;


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
    class_vis.updated_at
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
  e.moved_from_entry_id
FROM public.entries e
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
) AS vis
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
  '(MYK9-126). moved_from_entry_id (MYK9-639) is unmasked: it is structural provenance, like class_id. The view remains security_invoker = false.';

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
  entries.moved_from_entry_id
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
  'Replication feed wrapping view_authenticated_entry_results, adding the shows join needed to replicate soft-deleted shows (MYK9-291). Owner-run (security_invoker = false) like the view it wraps; the score/payment gating is inherited from that inner view body, and the shows columns are reachable only for entries the inner view already admitted. Advisor security_definer_view ERROR accepted by design 2026-09-09 (docs/improve-audit-2026-07-11/009-advisor-disposition-sweep.md, Verdict 1). Any rebuild MUST carry WITH (security_invoker = false) inline -- CREATE OR REPLACE VIEW resets reloptions. The select list is explicit (MYK9-632): `entries.*` re-expanded on every rebuild and would have reordered the columns the moment the inner view gained one. moved_from_entry_id (MYK9-639) is appended after it.';

NOTIFY pgrst, 'reload schema';

COMMIT;
