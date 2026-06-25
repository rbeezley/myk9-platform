-- =============================================================================
-- Migration 20260625180000: normalize entries.final_placement "unplaced" to NULL
--
-- Context (found 2026-06-25 while verifying placement calculation):
--   `recalculate_class_placements` (20260525170000) writes a 1-based rank to
--   QUALIFIED + scored entries and NULL to everyone else. But the column was
--   created (migration 003) with `final_placement INTEGER DEFAULT 0 CHECK
--   (>= 0)`. So an entry that has NEVER been through a recalc keeps the literal
--   default 0, while one cleared by a recalc holds NULL — two encodings for the
--   SAME concept ("no placement"). Live staging confirmed the split: 7 rows at
--   0, 3 legitimately placed (>= 1).
--
--   The UI tolerates both today (every PlacementPill caller guards with a falsy
--   check or `>= 1`, and `resultCardModel` uses `finalPlacement != null && >= 1`),
--   because `0` is falsy in JS. But that is a latent FOOTGUN: the first future
--   caller that writes `placement != null` WITHOUT the `>= 1` floor would render
--   a phantom "0th place". A placement is 1-based; 0 was never a valid value.
--
-- Fix — make NULL the single canonical "unplaced" encoding:
--   1. Backfill the legacy 0 sentinel to NULL. Safe + idempotent: 0 already
--      means "unplaced" everywhere, and `final_placement` is NOT in the
--      `entries_refresh_class_scoring_state` trigger's `UPDATE OF` column list
--      (class_id, is_scored, result_status, search_time_seconds, total_faults,
--      points_earned), so this backfill does NOT cascade a placement recompute.
--   2. Drop the `DEFAULT 0` so new rows are born NULL — matching what the
--      recalc function writes for non-placed entries.
--   3. Tighten the CHECK to `NULL OR >= 1` so 0 (and negatives) can never come
--      back. Step 1 must run first or this constraint would reject the old 0s.
-- =============================================================================

-- 1. Backfill: legacy 0 sentinel -> canonical NULL.
UPDATE public.entries
SET final_placement = NULL
WHERE final_placement = 0;

-- 2. New rows default to NULL (unplaced), not 0.
ALTER TABLE public.entries
  ALTER COLUMN final_placement DROP DEFAULT;

-- 3. A placement is NULL (unplaced) or a 1-based rank. 0 is no longer valid.
ALTER TABLE public.entries
  DROP CONSTRAINT IF EXISTS entries_final_placement_check;
ALTER TABLE public.entries
  ADD CONSTRAINT entries_final_placement_check
  CHECK (final_placement IS NULL OR final_placement >= 1);

NOTIFY pgrst, 'reload schema';
