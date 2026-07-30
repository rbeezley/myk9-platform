-- =============================================================================
-- Migration 20260730140000: withhold scent-work hide secrets from anon
--
-- MYK9-116 / SA-2026-07-29-01 (P0, score integrity).
--
-- PROBLEM: `20260725160000_anon_revoke_default_privileges.sql:68` grants anon a
-- table-wide `SELECT ON public.classes` — all 55 columns — and `classes_select`
-- (migration 108) is a PUBLIC-role policy admitting anon for any published /
-- upcoming / in_progress / completed show. So `num_hides`, `has_blank` and
-- `hides_known` were readable by any unauthenticated client holding the
-- publishable anon key that ships in the browser bundle, INCLUDING for classes
-- explicitly flagged `hides_known = false` — the ones whose hide count is
-- deliberately undisclosed to competitors. Verified on staging:
--
--   GET /rest/v1/classes?select=name,level,hides_known,num_hides,has_blank
--       &hides_known=is.false
--   → 200 [{"name":"Exterior Excellent","hides_known":false,"num_hides":2,...},
--          {"name":"Buried Master","hides_known":false,"num_hides":3,...}]
--
-- Both classes were `status = upcoming` — not yet run. A competitor could learn
-- the hide count before running an Excellent or Master class, invalidating the
-- results for it. No account, no passcode, no preconditions.
--
-- FIX: Postgres cannot subtract one column from a table-wide grant, so replace
-- anon's table grant with a SELECT grant on an explicit column allowlist that
-- omits the three hide columns — the same revoke + allowlist pattern used for
-- `entries` in `20260616120000_public_results_release_gate.sql`.
--
-- RLS is untouched: `classes_select` still governs which ROWS anon sees. Grants
-- and RLS are orthogonal and both remain required.
--
-- SCOPE: anon only. `authenticated` keeps its table-wide grant, so every logged-in
-- exhibitor retains the same read — tracked separately, because restricting it
-- means splitting hide data out of the offline-replicated class row that ringside
-- scoring depends on. Ringside passcode sessions are NOT affected by this
-- migration: `signInAnonymously()` issues a JWT with `role: authenticated`
-- (`is_anonymous` is a separate flag), so they execute as `authenticated`.
--
-- CLIENT COUPLING: three anon-reachable readers in
-- `services/database/classes/reads.ts` previously used `select=*`, which PostgREST
-- expands to every column in the table — a hard 42501 against a column-scoped
-- grant. They now name the same columns granted below (`CLASS_COLUMNS`). The two
-- lists must stay in sync; `anonEntriesGrantContract.test.ts` pins both sides.
-- =============================================================================

-- Defensive, mirroring the entries gate: anon's SELECT may have been granted to
-- the `anon` role directly (Supabase bootstrap convention) OR via the PUBLIC
-- pseudo-role. Revoke both so the allowlist cannot be silently bypassed, then
-- re-grant the non-anon roles explicitly so the PUBLIC revoke cannot strip them.
REVOKE SELECT ON public.classes FROM anon;
REVOKE SELECT ON public.classes FROM PUBLIC;

GRANT SELECT ON public.classes TO authenticated;
GRANT SELECT ON public.classes TO service_role;

-- Every column EXCEPT num_hides, has_blank, hides_known. Enumerated rather than
-- subtracted because Postgres has no "grant all but" form. New columns are not
-- auto-granted to anon, so the default for future columns is safe.
GRANT SELECT (
  id,
  trial_id,
  name,
  description,
  level,
  element,
  section,
  competition_type,
  entry_fee,
  max_entries,
  allow_waitlist,
  max_dogs_per_handler,
  breed_restrictions,
  jump_heights,
  age_min,
  age_max,
  height_min,
  height_max,
  handler_age_min,
  handler_age_max,
  start_time,
  estimated_duration,
  actual_start_time,
  actual_end_time,
  status,
  time_limit_seconds,
  num_areas,
  max_faults,
  qualifying_threshold,
  is_scoring_finalized,
  results_released_at,
  dogs_ahead_notification_count,
  total_entries_count,
  checked_in_count,
  scored_count,
  created_at,
  updated_at,
  deleted_at,
  deleted_by,
  class_number,
  timer_mode,
  distraction_count,
  is_results_reviewed,
  judge_name,
  time_limit_area2_seconds,
  time_limit_area3_seconds,
  display_order,
  results_released_by,
  version,
  status_source,
  reopened_after_closeout_at,
  revised_expected_start
) ON public.classes TO anon;

COMMENT ON COLUMN public.classes.num_hides IS
  'Scent-work hide count. Withheld from anon by column grant (MYK9-116) — a competitor must not learn it before running the class.';
COMMENT ON COLUMN public.classes.has_blank IS
  'Whether an area is blank. Withheld from anon by column grant (MYK9-116).';
COMMENT ON COLUMN public.classes.hides_known IS
  'Whether the hide count is disclosed to competitors. Withheld from anon by column grant (MYK9-116).';
