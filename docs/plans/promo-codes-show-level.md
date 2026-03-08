# Plan: Move Promo Codes & Financials to Show Level

**Date:** 2026-03-08
**Status:** Complete

## Decision

Support promo codes at **both** show and trial level:

- **Show-level** (95% of cases): code applies to all trials in a show
- **Trial-level** (5%): code applies only to a specific trial (e.g., multi-discipline shows with separate promos per discipline)

Financials: add show-level aggregate view, keep trial-level detail view.

## Phase 1: DB Migration (052) ✅

**File:** `supabase/migrations/052_promo_codes_show_level.sql`

- Add `show_id UUID REFERENCES shows(id) ON DELETE CASCADE` (nullable)
- Make `trial_id` nullable (currently `NOT NULL`)
- Add CHECK constraint: exactly one of `show_id` or `trial_id` must be set
- Drop existing unique constraint `promo_codes_trial_code_unique`
- Add partial unique indexes: `(show_id, code) WHERE show_id IS NOT NULL` and `(trial_id, code) WHERE trial_id IS NOT NULL`
- Add index on `show_id`
- Update RLS: INSERT/DELETE policies need to work for show-scoped codes too (current policies use `created_by = auth.uid()` which is scope-independent, so no change needed)
- Existing data: leave as-is (all existing codes remain trial-scoped)

## Phase 2: Update Types, Queries, Hooks, Mappers ✅

- `PromoCode` type: added `show_id: string | null`, made `trial_id: string | null`, added `PromoCodeScope` and `PromoCodeTarget` types
- `promoCodeQueries.ts`: added `getPromoCodesByShow()`, `findPromoCodeByCode()` (dual-scope lookup), `validatePromoCodeForEntry()` (dual-scope validation)
- `usePromoCodeDatabase.ts`: added `usePromoCodesByShowQuery()` hook, updated mutations for `PromoCodeTarget`
- `promoCodeMappers.ts`: updated `mapAppPromoCodeToDbInsert` to accept `PromoCodeTarget`
- Database types: updated `supabase.ts` and `database.types.ts` with `show_id` column

## Phase 3: Update PromoCodesSection Component ✅

- Changed props to discriminated union: `{ showId: string } | { trialId: string }`
- Show mode: displays show-scoped codes with "Show-wide" scope badge
- Trial mode: existing behavior preserved
- `AddPromoCodeDialog`: updated to accept `defaultTarget`, scope-aware description text
- Delete mutation correctly invalidates show or trial cache based on code scope

## Phase 4: Create ShowFinancialSummary ✅

- New `ShowFinancialSummary` component with `showId` prop
- New `getEntriesByShowForFinancials` query (joins entries → dogs → classes → promo_codes → trials)
- Same 5 summary cards as FinancialSummary but aggregated across all trials
- Collapsible per-trial breakdown table with subtotals
- Entry details table with trial name column and trial filter dropdown
- CSV export includes trial name column
- Existing `FinancialSummary` (trial-level) unchanged

## Phase 5: Add Tabs to ShowDetailsEnhanced ✅

- Added "Promo Codes" tab → `<PromoCodesSection showId={show.id} />`
- Added "Financials" tab → `<ShowFinancialSummary showId={show.id} />`
- Visible to secretary/club admin/site admin roles only
- Tab ordering: Overview, Management, Promo Codes, Financials, Trials
- Grid cols updated to 5 for management roles

## Phase 6: Update Registration Promo Validation ✅

- `validatePromoCodeForEntry(trialId, showId, code)` checks trial-level first, falls back to show-level
- `findPromoCodeByCode` implements the dual-scope lookup logic
- Original `validatePromoCode(trialId, code)` preserved for backward compatibility

## Phase 7: Tests ✅

- 15 unit tests in `promo-codes-show-level.test.ts`
- Mapper tests: show-scoped and trial-scoped mapping, code uppercasing
- Query tests: getPromoCodesByShow, getPromoCodesByTrial, findPromoCodeByCode (trial-first, show fallback)
- Validation tests: valid code, expired, exhausted, not found
- calculateDiscount tests: percentage and flat with cap
- All 2542 tests pass (15 new + 2527 existing)
