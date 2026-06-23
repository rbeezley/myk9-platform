-- Remove the unified ringside feature flag.
--
-- Pre-launch (no real users): the `/at-show` ringside surface is promoted to
-- always-available, gated only by access control (`AtShowAccessGate` — role /
-- passcode). The per-show opt-in flag and its per-(show,user) override table
-- (added in 20260529120000) are no longer read by any code path
-- (`atShowFeatureFlag.ts` + `UnifiedRingsideGate.tsx` deleted). See
-- docs/plan-remove-unified-ringside-flag.md.
--
-- DRAFT — `supabase db push` is a gated, owner-confirmed action.

-- ── Drop the per-(show,user) override table ──────────────────────────────────
-- Dropping the table cascades its RLS policies and the BEFORE INSERT/UPDATE
-- trigger; the trigger function is dropped explicitly afterward.
DROP TABLE IF EXISTS public.unified_ringside_overrides;
DROP FUNCTION IF EXISTS public.unified_ringside_overrides_guard_created_by();

-- ── Drop the per-show flag column ────────────────────────────────────────────
ALTER TABLE public.shows
  DROP COLUMN IF EXISTS unified_ringside_enabled;
