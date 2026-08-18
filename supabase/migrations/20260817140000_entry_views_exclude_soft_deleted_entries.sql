-- =============================================================================
-- Entry-exposing views must exclude soft-deleted entries.
--
-- Six live views expose entries.final_placement. Only two of them --
-- view_public_entry_results and view_own_entry_results -- carry an
-- e.deleted_at IS NULL row predicate. The three rebuilt here did not, so a
-- tombstoned entry still surfaced through them:
--
--   * view_entry_with_results -- read by the AskQ tool executor
--     (supabase/functions/_shared/askq/toolExecutor.ts). ask-myk9show passes it
--     the SERVICE-ROLE client, so these reads bypass RLS entirely and the view
--     body is the only thing that could ever have hidden a tombstone.
--   * view_myk9q_entries      -- legacy myK9Q-compatibility entry feed.
--   * view_stats_summary      -- base view for view_breed_stats,
--     view_judge_stats, view_clean_sweep_dogs and view_fastest_times, all four
--     of which inherit this predicate transitively.
--
-- Why RLS does not already cover this: all three are security_invoker=true, so
-- they run under the caller's policies -- but entries' authenticated SELECT
-- policy (entries_select) has NO deleted_at predicate. Only the anon policy
-- (entries_anon_select_for_tv) filters tombstones. The gap is therefore
-- authenticated-only, which is exactly the audience these three views serve.
--
-- None of the three carried an // INTENT: note or any other record of
-- deliberately retaining tombstones. view_myk9q_entries -- the one view with a
-- plausible legacy-compatibility argument -- selects a fixed column list that
-- omits deleted_at entirely, so a consumer could not distinguish a tombstone
-- from a live entry anyway. It cannot be a deliberate tombstone feed.
--
-- The sixth view, view_authenticated_entry_results, has the same defect and is
-- fixed in the companion migration
-- 20260817150000_authenticated_entry_results_excludes_soft_deleted.sql. It is
-- kept separate because it is far larger and more recently churned; note that
-- an `ilike '%deleted_at is null%'` probe wrongly reports THAT view as already
-- filtered, matching a nested subquery rather than its row predicate.
--
-- Latent, not active: zero tombstoned entries existed platform-wide when this
-- was written (2026-08-17).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. view_entry_with_results
--
-- Latest prior definition: 094_add_results_released_to_view.sql, which used
-- `e.*`. That star is re-expanded on every rebuild, and `entries` has grown
-- from 70 to 88 columns since 094 ran. Re-creating with `e.*` would therefore
-- ALSO publish 18 columns this view has never exposed -- including
-- stripe_payment_intent_id, refund_amount, refund_notes, refunded_at,
-- refund_decision, refund_decided_by, withdrawal_policy_snapshot and
-- capacity_override -- to every authenticated caller, through a view the AskQ
-- assistant queries. The star is replaced with the exact 70-column list the
-- live view already exposes: no widening, and the output column set is
-- unchanged, so CREATE OR REPLACE succeeds and the view keeps its ACL and its
-- security_invoker setting (a DROP would silently reset both).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.view_entry_with_results AS
SELECT
  e.id,
  e.dog_id,
  e.class_id,
  e.show_id,
  e.trial_id,
  e.handler_id,
  e.entry_status,
  e.payment_status,
  e.handler,
  e.entry_fee,
  e.submitted_at,
  e.special_requests,
  e.armband,
  e.run_order,
  e.jump_height,
  e.preferred_judge,
  e.move_up_requested,
  e.is_scored,
  e.is_in_ring,
  e.result_status,
  e.ring_entry_time,
  e.ring_exit_time,
  e.scoring_started_at,
  e.scoring_completed_at,
  e.search_time_seconds,
  e.area1_time_seconds,
  e.area2_time_seconds,
  e.area3_time_seconds,
  e.area4_time_seconds,
  e.total_correct_finds,
  e.total_incorrect_finds,
  e.total_faults,
  e.no_finish_count,
  e.area1_correct,
  e.area1_incorrect,
  e.area1_faults,
  e.area2_correct,
  e.area2_incorrect,
  e.area2_faults,
  e.area3_correct,
  e.area3_incorrect,
  e.area3_faults,
  e.total_score,
  e.points_earned,
  e.points_possible,
  e.bonus_points,
  e.penalty_points,
  e.time_over_limit,
  e.time_limit_exceeded_seconds,
  e.final_placement,
  e.judge_notes,
  e.judge_signature,
  e.judge_signature_timestamp,
  e.disqualification_reason,
  e.has_video_review,
  e.video_review_notes,
  e.license_key,
  e.local_id,
  e.sync_version,
  e.last_synced_at,
  e.created_at,
  e.updated_at,
  e.deleted_at,
  e.deleted_by,
  e.promo_code_id,
  e.discount_amount,
  e.comped,
  e.comped_reason,
  e.registration_id,
  e.check_in_status,
  CASE
    WHEN e.is_scored = TRUE AND e.result_status = 'qualified' THEN 'Q'
    WHEN e.is_scored = TRUE AND e.result_status = 'nq' THEN 'NQ'
    WHEN e.is_scored = TRUE AND e.result_status = 'absent' THEN 'ABS'
    WHEN e.is_scored = TRUE AND e.result_status = 'excused' THEN 'EX'
    WHEN e.is_scored = TRUE AND e.result_status = 'withdrawn' THEN 'WD'
    ELSE 'pending'
  END as result_text,
  d.name as dog_name,
  d.call_name as dog_call_name,
  d.breed as dog_breed,
  c.name as class_name,
  c.level as class_level,
  c.element as class_element,
  c.results_released_at as class_results_released_at
FROM entries e
LEFT JOIN dogs d ON e.dog_id = d.id
LEFT JOIN classes c ON e.class_id = c.id
WHERE e.deleted_at IS NULL;

-- -----------------------------------------------------------------------------
-- 2. view_myk9q_entries
-- Latest prior definition: 116_myk9q_compatibility.sql (117 and
-- 20260613100000 only adjust its grants and security_invoker setting).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.view_myk9q_entries AS
SELECT
  e.id,
  e.armband::INTEGER as armband,
  e.handler as handler,
  d.call_name as dog_call_name,
  d.breed as dog_breed,
  e.entry_status,
  e.run_order as run_order,
  e.created_at,
  e.updated_at,
  e.is_scored,
  e.is_in_ring,
  e.result_status,
  e.search_time_seconds,
  e.total_faults,
  e.final_placement,
  e.total_correct_finds,
  e.total_incorrect_finds,
  e.no_finish_count,
  e.points_earned,
  e.scoring_completed_at,
  c.id AS class_id,
  c.element,
  c.level,
  c.judge_name,
  c.section,
  c.status AS class_status,
  c.time_limit_seconds,
  c.time_limit_area2_seconds,
  c.time_limit_area3_seconds,
  c.num_areas AS area_count,
  c.is_scoring_finalized,
  c.results_released_at,
  t.id AS trial_id,
  t.trial_number,
  t.date AS trial_date,
  s.id AS show_id,
  s.license_key,
  s.name AS show_name
FROM entries e
LEFT JOIN dogs d ON e.dog_id = d.id
LEFT JOIN classes c ON e.class_id = c.id
LEFT JOIN trials t ON e.trial_id = t.id
LEFT JOIN shows s ON e.show_id = s.id
WHERE e.deleted_at IS NULL;

-- -----------------------------------------------------------------------------
-- 3. view_stats_summary
-- Latest prior definition: 116_myk9q_compatibility.sql. CREATE OR REPLACE, not
-- DROP: view_breed_stats, view_judge_stats, view_clean_sweep_dogs and
-- view_fastest_times all read from this view, so a DROP would need CASCADE and
-- would take them with it. Replacing in place fixes all four transitively.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.view_stats_summary AS
SELECT
  s.id as show_id,
  s.name as show_name,
  s.license_key,
  t.id as trial_id,
  t.date as trial_date,
  t.name as trial_name,
  c.id as class_id,
  c.element,
  c.level,
  c.judge_name,
  e.id as entry_id,
  e.armband::INTEGER as armband_number,
  d.call_name as dog_call_name,
  d.breed as dog_breed,
  e.handler as handler_name,
  e.result_status,
  e.is_scored,
  e.search_time_seconds,
  e.total_faults,
  e.final_placement,
  e.total_score as score,
  e.points_earned as qualifying_score,
  CASE WHEN e.result_status = 'qualified' THEN 1 ELSE 0 END as is_qualified,
  CASE WHEN e.search_time_seconds > 0 THEN e.search_time_seconds ELSE NULL END as valid_time
FROM shows s
JOIN trials t ON t.show_id = s.id
JOIN classes c ON c.trial_id = t.id
JOIN entries e ON e.class_id = c.id
LEFT JOIN dogs d ON e.dog_id = d.id
WHERE e.is_scored = true
  AND e.deleted_at IS NULL;

-- -----------------------------------------------------------------------------
-- 4. Codify view_entry_with_results' service-role read grant.
--
-- Separate defect, found because it broke this change's own test in CI. NO
-- migration has ever granted this view to any role: 003 created it, 094 dropped
-- and recreated it (discarding whatever grants existed), and nothing since has
-- granted it. It is readable on the live database purely because ALTER DEFAULT
-- PRIVILEGES in schema public hands new relations out to authenticated and
-- service_role. A migrations-only rebuild -- which is what CI and any fresh
-- environment are -- leaves it owner-only, so the AskQ tool executor's two
-- reads, which run as service_role, would fail there.
--
-- service_role ONLY. Granting `authenticated` as well would be a false
-- affordance: this view is security_invoker = true, so an authenticated caller
-- also needs privileges on every base column it selects, and `authenticated`
-- deliberately holds NO table-level SELECT on public.entries -- only a column
-- allowlist, which omits result_status, final_placement, total_score and
-- judge_notes. Such a caller would get 42501 no matter what is granted here.
-- Authenticated entry results are served by view_authenticated_entry_results,
-- which is owner-run precisely so it can apply its own column masking.
--
-- anon is revoked explicitly rather than left to the default privileges above,
-- which would otherwise hand it the judge_notes and payment columns.
-- -----------------------------------------------------------------------------
GRANT SELECT ON public.view_entry_with_results TO service_role;
REVOKE ALL ON public.view_entry_with_results FROM anon;

NOTIFY pgrst, 'reload schema';
