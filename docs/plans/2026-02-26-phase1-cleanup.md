# Phase 1 Cleanup — Post-Implementation Improvements

**Date:** February 26, 2026
**Status:** In Progress
**Context:** Follow-up from Phase 1B code review. Addresses technical concerns before adding more sports.

---

## Quick Wins (bounded, do now)

### 1. ~~Normalize ClassRuleFields to single naming convention~~ DONE

**Problem:** `ClassRuleFields` accepts three naming conventions (`areaCount`, `area_count`, `num_areas`) for the same field. Confuses future contributors and hides boundary inconsistencies.

**Fix:** Update each app's ReplicatedClass mapping to produce consistent camelCase fields. Simplify `ClassRuleFields` to accept only camelCase. The builder stays a pure function — the normalization moves to the boundary where DB rows become app objects.

**Files:**
- `packages/scoring-ui/src/types/resolvedClassRules.ts` — simplify `ClassRuleFields`
- `packages/scoring-ui/src/utils/buildResolvedClassRules.ts` — remove fallback chains
- `packages/scoring-ui/src/utils/buildResolvedClassRules.test.ts` — update tests
- `apps/myk9q/src/services/replication/tables/ReplicatedClassesTable.ts` — map DB columns to camelCase
- `apps/myk9show/src/services/replication/ReplicatedClassesTable.ts` — map DB columns to camelCase

### 2. ~~Mark fallback heuristics for deprecation~~ DONE

**Problem:** `isDualTimerLevel()`, `getAreaCount()`, `getDefaultMaxTime()`, and friends still exist alongside the rules-driven path. Two sources of truth that can drift.

**Fix:** Add `@deprecated` JSDoc tags with removal timeline. After verifying all production classes have rule fields populated (via backfill migration), remove the fallback code paths.

**Files:**
- `packages/scoring-ui/src/components/scoresheets/UKC/UKCNoseworkScoresheet.tsx`
- `packages/scoring-ui/src/components/scoresheets/ASCA/ASCAScentDetectionScoresheet.tsx`
- `apps/myk9q/src/pages/scoresheets/UKC/UKCNoseworkScoresheet.tsx`
- `apps/myk9q/src/pages/scoresheets/hooks/useEntryNavigationHelpers.ts`

### 3. ~~Write scoresheet rendering tests~~ DONE

**Problem:** `buildResolvedClassRules` has 10 unit tests, but no tests verify that scoresheets actually render differently based on rules (dual timer, multi-area, etc.).

**Fix:** Add component tests for the three shared scoresheets verifying rules-driven behavior.

**Files:**
- `packages/scoring-ui/src/components/scoresheets/AKC/__tests__/AKCScentWorkScoresheet.test.tsx`
- `packages/scoring-ui/src/components/scoresheets/UKC/__tests__/UKCNoseworkScoresheet.test.tsx`
- `packages/scoring-ui/src/components/scoresheets/ASCA/__tests__/ASCAScentDetectionScoresheet.test.tsx`

---

## Planned (needs design or larger scope)

### 4. ~~Replace detectScoresheetType() with trial sport_type~~ DONE

**Problem:** `ScoresheetPage.tsx` parses class name strings to guess organization and sport type. Fragile — a class named "Interior" could match the wrong organization.

**Fix:** Added `sportType` to `ReplicatedTrial`, loaded trial via `cls.trialId` in `ScoresheetPage.loadData()`, added `mapSportType()` for direct sport_type→org mapping. `detectScoresheetType()` kept as `@deprecated` fallback for pre-migration trials.

**Files modified:**
- `apps/myk9show/src/pages/scoring/ScoresheetPage.tsx` — load trial, `mapSportType()`, deprecate `detectScoresheetType()`
- `apps/myk9show/src/services/replication/ReplicatedTrialsTable.ts` — add `sportType` field + mapping + `toSupabaseRow()`

### 5. ~~Clean up wizard rule enrichment pipeline~~ DONE

**Problem:** `createClasses()` fetches `sport_class_rules` separately and patches ReplicatedClass after creation — a side-channel that bypasses the normal `ClassData` → `classDataToReplicatedClass()` pipeline.

**Fix:** Added optional `SportClassRuleRow` parameter to `classDataToReplicatedClass()` so it maps all fields — including scoring rules — in one pass. Removed post-creation mutation block. `ClassData` type unchanged (rule fields don't belong on wizard state).

**File modified:**
- `apps/myk9show/src/pages/secretary/ShowCreationWizard/useShowCreationWizardActions.ts`

### 6. Scoresheet codebase convergence

**Problem:** myK9Show and myK9Q have separate implementations of the same scoresheets. Every scoresheet change must happen in two places.

**Fix:** Evaluate whether myK9Q scoresheets can migrate to the shared `packages/scoring-ui/` components. Requires abstracting the hook-driven vs. props-driven data patterns.

**Scope:** Large. Architectural decision. Probably a separate design session.

**Depends on:** Phase 2 direction — if myK9Q is being sunset or converging with myK9Show, this becomes moot.

---

## Priority Order

1. Normalize ClassRuleFields (removes confusion, small blast radius)
2. Deprecate fallback heuristics (prevents drift)
3. Scoresheet rendering tests (catches regressions)
4. Replace detectScoresheetType (eliminates fragile parsing)
5. Wizard pipeline cleanup (cleaner data flow)
6. Scoresheet convergence (big, depends on product direction)
