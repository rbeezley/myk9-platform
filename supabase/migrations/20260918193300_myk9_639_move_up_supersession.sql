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
-- set on the DESTINATION entry, pointing at the SOURCE it supersedes.
--
-- MONEY DOES NOT MOVE. The destination is created money-neutral --
-- `payment_status = 'pending'`, `entry_fee = 0`, no method, no reference, no
-- comp, no discount, no Stripe intent -- and this column is the ONLY link back
-- to the entry the exhibitor actually paid for. The SOURCE keeps the
-- settlement and is the row every reader takes dollars from; the source is
-- excluded from the COUNT (the dog runs once, in the destination class) while
-- its money still reaches the report through the live descendant.
--
-- The client half of that rule is `features/financial/moneyRoot.ts`, which
-- follows this column back to the paying entry. Copying the money forward was
-- the first attempt and it was wrong twice over: `payment_method = 'online'` +
-- `payment_status = 'paid'` on an INSERT is exactly what
-- `trg_entries_protect_payment_fields_insert` raises 42501 on, so every
-- Stripe-paid dog would have failed to move at all; and the refund would have
-- followed the row the report excludes, leaving `stripe-refund-entry` with no
-- payment intent to refund.
--
-- No new `payment_status` value is introduced, and `waived` keeps meaning only
-- what a secretary deliberately waived.
--
-- It is also the durable way back for MYK9-640: `reverse_move_up_entry` reads
-- this column to find the entry to restore, long after the 8-second undo banner
-- is gone. (The client additionally falls back to the pre-existing
-- "Moved up from class <id>" note when READING a legacy pair recorded before
-- this migration -- 0 such rows exist live today -- see
-- services/database/entries/moveUpNote.ts.)
--
-- Two SECURITY DEFINER functions at the end of this file make the move-up and
-- its reverse ONE transaction each; see their own header for why DEFINER and
-- what each restates. They are what the client calls -- there is no longer a
-- client-side pair of writes that can half-land.
--
-- This file also repairs `entries_dog_class_unique_idx`, which reserved a class
-- seat for soft-deleted rows and so broke the second move-up after an undo. See
-- the comment above the index.
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
-- Richard's to run, and it MUST land before (or with) the merge. The client no
-- longer writes `moved_from_entry_id` through PostgREST at all -- it calls
-- `public.move_up_entry`, which does not exist until this file is applied. So in
-- the window between a Vercel deploy and the push, a move-up fails CLEANLY: the
-- RPC 404s (PGRST202), which the client classifies by name and reports as
-- "not available on this server yet -- nothing was changed". No local write is
-- made at all (the call awaits the server before touching the replica), so the
-- dog stays exactly where they were. Nothing half-lands, and no row is written
-- that the schema cannot hold.

BEGIN;

ALTER TABLE public.entries
  ADD COLUMN IF NOT EXISTS moved_from_entry_id uuid
    REFERENCES public.entries(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.entries.moved_from_entry_id IS
  'MYK9-639: set on the DESTINATION entry of a move-up, pointing at the SOURCE '
  'entry it supersedes (that source carries entry_status = ''moved''). The pair '
  'is ONE paid run, and the money does NOT move: the destination is created '
  'money-neutral (payment_status = ''pending'', entry_fee = 0, no method, no '
  'comp, no discount, no Stripe intent) and the SOURCE keeps the settlement. '
  'Every money reader follows this column back to the source and counts the '
  'live descendant once; the source is excluded from the count, never from the '
  'dollars. Also the durable link reverse_move_up_entry (MYK9-640) reads to '
  'restore the source. NULL on every entry that is not the product of a '
  'move-up.';

GRANT SELECT (moved_from_entry_id) ON public.entries TO authenticated;
-- Stated, not assumed: anon must never read this column (it holds none on this
-- table today, and omitting a GRANT is not the same as keeping a role out).
REVOKE ALL (moved_from_entry_id) ON public.entries FROM anon;

-- A soft-deleted entry must not reserve a class seat (MYK9-640, review round 2).
--
-- `entries_dog_class_unique_idx` (003_entries_and_scoring.sql, the only file that
-- has ever defined it — verified by grep and against the live catalog) is
-- UNIQUE (dog_id, class_id) WHERE entry_status NOT IN ('withdrawn','scratched').
-- That predicate never learned about `deleted_at`, so a tombstoned row keeps
-- holding its (dog, class) slot forever.
--
-- It becomes reachable the moment the reverse below exists, and on exactly the
-- round trip MYK9-640 is FOR: move up to Advanced, undo, move up to Advanced
-- again. The reverse soft-deletes the destination and leaves its
-- `entry_status = 'confirmed'`, so the second move-up's INSERT collides with an
-- invisible row and dies 23505 inside the RPC — an opaque failure on show
-- morning, on the second press of a button that worked the first time.
--
-- Fixed at the index rather than by parking the tombstone in some excluded
-- status: `withdrawn`/`scratched` are meaningful acts (the dog gave up their
-- run) and writing one to dodge an index would be a lie that also fires
-- `stamp_entry_withdrawn_at` and nulls the refund decision. A deleted row
-- constraining a live one was always wrong.
--
-- This RELAXES the constraint: re-entering a dog into a class whose previous
-- entry was soft-deleted is now permitted, which is the intended behaviour and
-- is what "deleted" has meant everywhere else in this schema. Live rows are
-- unaffected — nothing today has a soft-deleted entry competing with a live one
-- for the same (dog, class).
DROP INDEX IF EXISTS public.entries_dog_class_unique_idx;
CREATE UNIQUE INDEX entries_dog_class_unique_idx
  ON public.entries (dog_id, class_id)
  WHERE deleted_at IS NULL
    AND entry_status <> ALL (ARRAY['withdrawn'::text, 'scratched'::text]);

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

-- ---------------------------------------------------------------------------
-- The move-up write, as ONE transaction.
--
-- Before this, the client did two independent replicated writes: INSERT the
-- destination, then UPDATE the source to `moved`. Between them the dog could be
-- entered twice, and if the second upload never landed the source sat `moved`
-- with no destination anywhere -- no live entry on any other device or report.
-- The TypeScript rollback could only repair the device that happened to run it.
--
-- SECURITY DEFINER, not INVOKER, for one concrete reason: the move-back guard
-- has to read `result_status`, `final_placement`, `points_earned`,
-- `search_time_seconds` and the area times, and NONE of those five carries a
-- column grant for `authenticated` (verified against pg_attribute: 55 of 92
-- columns are allowlisted and these are outside it). An INVOKER function would
-- 42501 on the very read the guard exists to make. DEFINER therefore restates
-- the authorization these tables' policies apply -- `can_manage_show(show_id)`,
-- byte-for-byte the predicate on `entries_insert` and `entries_update` -- so the
-- functions admit exactly who the direct writes admit and nobody else. EXECUTE
-- is revoked from PUBLIC and anon; `search_path` is pinned empty.
--
-- MONEY DOES NOT MOVE. The destination is created money-neutral:
-- `payment_status = 'pending'`, `entry_fee = 0`, no `payment_method`, no
-- reference, no comp, no discount, no `stripe_payment_intent_id`. The
-- settlement stays on the entry the exhibitor actually paid for, and
-- `moved_from_entry_id` is the only link to it. Copying it forward was worse
-- than untidy: `payment_method = 'online'` + `payment_status = 'paid'` on an
-- INSERT is exactly what `trg_entries_protect_payment_fields_insert` raises
-- 42501 on, so every Stripe-paid dog would have failed to move at all.

CREATE OR REPLACE FUNCTION public.move_up_entry(
  p_entry_id uuid,
  p_target_class_id uuid,
  p_new_entry_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_source         public.entries%ROWTYPE;
  v_target_show_id uuid;
  v_target_trial_id uuid;
  v_note           text;
BEGIN
  SELECT * INTO v_source
  FROM public.entries
  WHERE id = p_entry_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'That entry no longer exists.' USING ERRCODE = 'P0002';
  END IF;

  -- Restated authorization (see the header): identical to entries_update.
  IF NOT public.can_manage_show(v_source.show_id) THEN
    RAISE EXCEPTION 'You do not have permission to move entries in this show.'
      USING ERRCODE = '42501';
  END IF;

  -- A dog who has been pulled, withdrawn, scratched, marked absent, already
  -- moved, or soft-deleted is not movable. Refusing here is what lets the
  -- move-back restore an unambiguous source, and what stops a pulled dog being
  -- carried into a class the readiness counters then drop them from.
  IF v_source.deleted_at IS NOT NULL
     OR COALESCE(v_source.entry_status, '') IN
        ('moved', 'withdrawn', 'scratched', 'absent', 'not_accepted')
     OR v_source.check_in_status = 'pulled' THEN
    RAISE EXCEPTION 'This entry is not in a state that can be moved.'
      USING ERRCODE = '22023';
  END IF;

  SELECT t.show_id, c.trial_id
  INTO v_target_show_id, v_target_trial_id
  FROM public.classes c
  JOIN public.trials t ON t.id = c.trial_id
  WHERE c.id = p_target_class_id
    AND c.deleted_at IS NULL
    AND t.deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'That class no longer exists.' USING ERRCODE = 'P0002';
  END IF;

  IF v_target_show_id IS DISTINCT FROM v_source.show_id THEN
    RAISE EXCEPTION 'An entry can only move within its own show.'
      USING ERRCODE = '22023';
  END IF;

  IF p_target_class_id = v_source.class_id THEN
    RAISE EXCEPTION 'That entry is already in this class.' USING ERRCODE = '22023';
  END IF;

  -- The element/level ladder stays in the client (`utils/moveUpEligibility.ts`):
  -- it is registry-aware and the registry lives on the trial, not on a CHECK.
  -- What this function owns is what a stale or hostile client cannot be trusted
  -- with -- who may write, that the row is movable, and that both halves land.

  -- A dog already entered in the target class would otherwise die on
  -- `entries_dog_class_unique_idx` with raw constraint text in the secretary's
  -- toast. Say it in words instead, in the same 22023 the client already
  -- renders verbatim.
  IF EXISTS (
    SELECT 1
    FROM public.entries e
    WHERE e.dog_id = v_source.dog_id
      AND e.class_id = p_target_class_id
      AND e.deleted_at IS NULL
      AND COALESCE(e.entry_status, '') <> ALL (ARRAY['withdrawn', 'scratched'])
  ) THEN
    RAISE EXCEPTION 'This dog is already entered in that class.' USING ERRCODE = '22023';
  END IF;

  v_note := 'Moved up from class ' || v_source.class_id::text
            || COALESCE(': ' || NULLIF(btrim(p_reason), ''), '');

  INSERT INTO public.entries (
    id, dog_id, show_id, class_id, trial_id,
    handler_id, handler, armband, jump_height,
    entry_status, check_in_status,
    payment_status, entry_fee,
    is_day_of_show, entry_source, registration_id,
    special_requests, moved_from_entry_id
  )
  VALUES (
    p_new_entry_id, v_source.dog_id, v_source.show_id, p_target_class_id, v_target_trial_id,
    v_source.handler_id, v_source.handler, v_source.armband, v_source.jump_height,
    -- The dog's APPROVAL state travels; a move-up is not an acceptance. Writing
    -- 'confirmed' unconditionally promoted a `pending-payment` or `submitted`
    -- entry the secretary had never accepted, and a round trip then restored it
    -- as 'confirmed' -- because the reverse restores from the destination. The
    -- movability guard above has already refused every status that must not
    -- move at all.
    v_source.entry_status,
    -- MYK9-640: a check-in travels, and ONLY as a check-in. 'pulled' cannot
    -- reach here (refused above); 'in-ring', 'at-gate' and 'completed' describe
    -- a run in the class being left, not the one being entered.
    CASE WHEN v_source.check_in_status = 'checked-in' THEN 'checked-in' ELSE 'no-status' END,
    -- Money-neutral. See the header.
    'pending', 0,
    -- Provenance, NOT money: who collected the entry and under which
    -- enrollment. `entry_source` is the only field that proves UKC collected a
    -- fee ('ukc_online'), and `is_day_of_show` is the day-of/pre-entry split --
    -- both are per-BUCKET lines on the registry report, so losing them bills
    -- the club for a run a registry already collected, and strands the
    -- destination off the exhibitor's order card.
    v_source.is_day_of_show, v_source.entry_source, v_source.registration_id,
    v_note, p_entry_id
  );

  -- Deliberately does NOT touch the source's `special_requests`: the FK above is
  -- the lineage, and that column is where a secretary writes "reactive dog,
  -- needs the ramp".
  UPDATE public.entries
  SET entry_status = 'moved'
  WHERE id = p_entry_id;

  RETURN p_new_entry_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.move_up_entry(uuid, uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.move_up_entry(uuid, uuid, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.move_up_entry(uuid, uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.move_up_entry(uuid, uuid, uuid, text) TO service_role;

COMMENT ON FUNCTION public.move_up_entry(uuid, uuid, uuid, text) IS
  'MYK9-639/MYK9-640: move an entry to a higher class as ONE transaction -- insert '
  'the money-neutral destination carrying moved_from_entry_id, and mark the source '
  'moved. SECURITY DEFINER because the sibling reverse function must read score '
  'columns that carry no column grant for authenticated; it restates '
  'can_manage_show(show_id), the exact predicate on entries_insert/entries_update. '
  'The registry level ladder stays client-side (utils/moveUpEligibility.ts).';

-- The same shape in reverse.

CREATE OR REPLACE FUNCTION public.reverse_move_up_entry(
  p_destination_entry_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_dest             public.entries%ROWTYPE;
  v_source           public.entries%ROWTYPE;
  v_restored_status  text;
BEGIN
  SELECT * INTO v_dest
  FROM public.entries
  WHERE id = p_destination_entry_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'That entry no longer exists.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.can_manage_show(v_dest.show_id) THEN
    RAISE EXCEPTION 'You do not have permission to move entries in this show.'
      USING ERRCODE = '42501';
  END IF;

  IF v_dest.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'That entry has already been removed.' USING ERRCODE = '22023';
  END IF;

  IF v_dest.moved_from_entry_id IS NULL THEN
    RAISE EXCEPTION 'This entry was not created by a move-up, so there is nothing to move back.'
      USING ERRCODE = '22023';
  END IF;

  -- A run that has STARTED can never be un-run. Not just "has a result":
  -- the dog standing in the ring with two area times recorded is mid-run, and
  -- soft-deleting the row being scored into would take the judge's work with it.
  IF COALESCE(v_dest.is_scored, false)
     OR COALESCE(v_dest.is_in_ring, false)
     OR v_dest.scoring_started_at IS NOT NULL
     OR v_dest.ring_entry_time IS NOT NULL
     OR COALESCE(v_dest.result_status, 'pending') <> 'pending'
     OR v_dest.final_placement IS NOT NULL
     OR COALESCE(v_dest.points_earned, 0) <> 0
     OR COALESCE(v_dest.search_time_seconds, 0) <> 0
     OR COALESCE(v_dest.area1_time_seconds, 0) <> 0
     OR COALESCE(v_dest.area2_time_seconds, 0) <> 0
     OR COALESCE(v_dest.area3_time_seconds, 0) <> 0
     OR COALESCE(v_dest.area4_time_seconds, 0) <> 0
     OR COALESCE(v_dest.total_faults, 0) <> 0
     OR COALESCE(v_dest.total_correct_finds, 0) <> 0
     OR COALESCE(v_dest.total_score, 0) <> 0
     OR COALESCE(v_dest.total_incorrect_finds, 0) <> 0
     OR COALESCE(v_dest.no_finish_count, 0) <> 0
     OR COALESCE(v_dest.points_possible, 0) <> 0
     OR v_dest.scoring_completed_at IS NOT NULL
     OR v_dest.check_in_status IN ('in-ring', 'completed') THEN
    RAISE EXCEPTION 'This run has already started, so the move-up can no longer be reversed.'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_source
  FROM public.entries
  WHERE id = v_dest.moved_from_entry_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_source.deleted_at IS NOT NULL
     OR COALESCE(v_source.entry_status, '') <> 'moved' THEN
    RAISE EXCEPTION 'The original entry is no longer there to restore.'
      USING ERRCODE = '22023';
  END IF;

  -- The SOURCE is a second row, in a second show potentially, and this function
  -- is DEFINER — owned by `postgres`, which carries rolbypassrls, so the UPDATE
  -- below is checked by nothing but this. Authorizing only the destination's
  -- show was a real hole: `entries.relacl` grants `authenticated` table-wide
  -- UPDATE with no column restriction and no trigger guards
  -- `moved_from_entry_id`, so a secretary could point one of their own entries
  -- at a `moved` entry in a show they do not manage and have this function flip
  -- it live. `entries_update` would have applied its predicate to BOTH rows;
  -- restating it here is what makes that true again.
  IF v_source.show_id IS DISTINCT FROM v_dest.show_id
     OR NOT public.can_manage_show(v_source.show_id) THEN
    RAISE EXCEPTION 'The original entry is no longer there to restore.'
      USING ERRCODE = '22023';
  END IF;

  -- Restore from the destination's OWN live state, because that is the row that
  -- has been live since the move: the dog may have been checked in on it hours
  -- after the move happened.
  v_restored_status := CASE
    WHEN COALESCE(v_dest.entry_status, '') IN ('', 'moved') THEN 'confirmed'
    ELSE v_dest.entry_status
  END;

  UPDATE public.entries
  SET entry_status = v_restored_status,
      check_in_status = v_dest.check_in_status
  WHERE id = v_source.id;

  UPDATE public.entries
  SET deleted_at = now()
  WHERE id = p_destination_entry_id;

  RETURN v_source.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.reverse_move_up_entry(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reverse_move_up_entry(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.reverse_move_up_entry(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_move_up_entry(uuid) TO service_role;

COMMENT ON FUNCTION public.reverse_move_up_entry(uuid) IS
  'MYK9-640: undo a move-up as ONE transaction -- restore the superseded source '
  'from the destination''s live entry_status and check_in_status, then soft-delete '
  'the destination. Refuses once the run has STARTED (in ring, ring entry, scoring '
  'started, any area time, points, a result, or a placement). Touches no money: '
  'after MYK9-639 the destination never held any. Same restated can_manage_show '
  'guard as move_up_entry.';


NOTIFY pgrst, 'reload schema';

COMMIT;
