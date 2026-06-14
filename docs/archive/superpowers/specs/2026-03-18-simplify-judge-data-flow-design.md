# Simplify Judge Data Flow

**Date:** 2026-03-18
**Status:** Approved

## Problem

Judge data flows through three independent sources (`judge_assignments` table, `classes.judge_name`, wizard store) that frequently fall out of sync. Every consumer needs fallback logic to check multiple sources, creating a fragile chain that keeps breaking.

## Design

### Single Source of Truth

- **`judge_assignments` table** is the authority for "which judges are available for this show" (the pool).
- **`classes.judge_name`** records which judge was picked for each class (the assignment).
- **Wizard store** is ephemeral — only lives during show creation, written to `judge_assignments` on save.

### Changes

#### 1. Add `judge_assignments` join to `getAllShows()`

**File:** `apps/myk9show/src/services/database/queries/showQueries.ts`

`getAllShows()` currently only joins `clubs` and `trials`. Add the same `judge_assignments` join that `getShowById()` already has. This ensures every show object always has `assignedJudges` populated — no fallbacks needed.

#### 2. Remove all fallback/derivation code

- **`ShowOverviewTab.tsx`** — Remove the `useMemo` that derives judges from `showClasses`. Just pass `show.assignedJudges` directly to `JudgesList`. Remove the `showClasses` prop entirely.
- **`ShowDetailsPage.tsx`** — Stop passing `showClasses` to `ShowOverviewTab`.
- **`ShowCreationWizardPage.tsx`** — Remove the fallback that derives judges from class `judgeName` fields (lines 189-206). Just use `existingShow.assignedJudges` directly.

#### 3. Keep wizard flow as-is

The wizard is self-contained:

- Step 1: Secretary adds judges to the wizard store (`show.judgeIds`)
- Step 3: Class selection reads from wizard store — always has the judges
- On save: `persistShowJudgeAssignments()` writes to `judge_assignments`

No changes needed to the wizard's internal flow.

#### 4. Keep class-level `judge_name`

Classes store their assigned judge's name. This is the per-class assignment (picked from the show's pool). No change here — it's a different concern from the show-level pool.

### What Gets Simpler

| Consumer              | Before                                                 | After                                 |
| --------------------- | ------------------------------------------------------ | ------------------------------------- |
| Show overview tab     | 3-tier fallback (assignedJudges → showClasses → empty) | Direct: `show.assignedJudges`         |
| Wizard edit-mode init | Derive from class judgeName when assignedJudges empty  | Direct: `existingShow.assignedJudges` |
| Classes tab           | Already reads `judgeName` from class                   | No change                             |
| Show list views       | No judge data (getAllShows missing join)               | Judge data always present             |

### Not Changing

- `persistShowJudgeAssignments()` — already extracted and shared
- Wizard internal store flow — already works correctly
- Edit Show dialog — already writes to `judge_assignments` on save
- `ClassDetailsPage` replication fallback — separate issue (class data source, not judge data)

## Testing

- Delete existing test show, re-create via wizard
- Verify judges appear on overview tab after creation
- Verify "Add Trials" mode shows judge dropdown
- Verify Edit Show → save judges → judges persist on reload
