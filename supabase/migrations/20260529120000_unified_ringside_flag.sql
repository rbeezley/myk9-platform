-- Phase 1e — Unified ringside /at-show gate.
--
-- DRAFT — owner review + `supabase db push` is a gated, owner-confirmed action.
-- Adds the per-show opt-in flag the routing layer (1d) checks, plus an optional
-- per-(show,user) override so a single user (e.g. the secretary) can pilot the
-- new surface before the whole show is flipped.
--
-- ⚠️ REVIEW BEFORE PUSH (run /codex:review):
--   1. The override-table management RLS uses is_site_admin() only. A show-scoped
--      staff predicate (secretary/club-admin can manage THEIR show's overrides)
--      does not exist as a helper today — confirm the canonical permission check
--      against roles/permissions/role_permissions before widening (see CLAUDE.md
--      "Debugging seed-data / config bugs"). Left site-admin-only as the safe default.
--   2. If the per-person override is not needed yet, drop the table section and
--      keep only the column (1d only requires the show flag).
--
-- Schema verification results gathered for the same session (read-only probes):
--   • entries.exhibitor_order: MISSING — use existing `run_order` for run-order
--     persist (1a/1h run-order = REAL, not stub).
--   • class_requirements table: MISSING — handlePrintScoresheet hides/distractions
--     must stub or re-point (no direct table).
--   • unlock_entry_for_edit RPC: inconclusive via PostgREST — verify in the push
--     session (DB introspection); default reset-score to STUB until confirmed.
--   • entry/class/trial ids: UUID-native string (resolved PR #424) — no parseInt.

-- ── Per-show flag ────────────────────────────────────────────────────────────
ALTER TABLE public.shows
  ADD COLUMN IF NOT EXISTS unified_ringside_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.shows.unified_ringside_enabled IS
  'Phase 1e: true => this show opts into the unified myK9Show /at-show ringside surface. Default false => legacy myK9Q ringside.';

-- ── Per-(show,user) override (optional; see review note 2) ───────────────────
CREATE TABLE IF NOT EXISTS public.unified_ringside_overrides (
  show_id    uuid        NOT NULL REFERENCES public.shows(id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL REFERENCES auth.users(id)   ON DELETE CASCADE,
  enabled    boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  PRIMARY KEY (show_id, user_id)
);

COMMENT ON TABLE public.unified_ringside_overrides IS
  'Phase 1e: per-(show,user) override of shows.unified_ringside_enabled. Row present => use `enabled` for that user on that show; absent => fall back to the show flag.';

-- Grants — Supabase no longer auto-exposes new public tables to the Data API.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.unified_ringside_overrides TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.unified_ringside_overrides TO service_role;

ALTER TABLE public.unified_ringside_overrides ENABLE ROW LEVEL SECURITY;

-- A user may always read their OWN override row (the flag-read hook needs this).
CREATE POLICY unified_ringside_overrides_select_self
  ON public.unified_ringside_overrides
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Management: site admins only for now (see REVIEW note 1 — widen to show staff
-- once the canonical show-scoped predicate is confirmed).
CREATE POLICY unified_ringside_overrides_admin_all
  ON public.unified_ringside_overrides
  FOR ALL TO authenticated
  USING (public.is_site_admin())
  WITH CHECK (public.is_site_admin());
