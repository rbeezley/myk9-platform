# Code Quality Wave B P1 Launch Gates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the confirmed Wave B P1 launch-gate gaps with direct tests for fee, scoring, placement math, and the judge check-in false-empty state.

**Architecture:** Keep this as a focused test-and-wiring slice. Do not refactor scoring or placement services beyond what the tests force. For `/judge/check-in`, reuse the existing `useJudgeCheckInStats` query instead of creating another judge assignment data path.

**Tech Stack:** TypeScript, React, React Query, Vitest, Testing Library, Supabase client mocks, existing `@/` Vite aliases.

---

## Files

- Create: `apps/myk9show/src/store/cartStore.helpers.test.ts`
- Create: `apps/myk9show/src/services/scoring/ScoreValidatorService.test.ts`
- Create: `apps/myk9show/src/services/scoring/PlacementCalculatorService.helpers.test.ts`
- Create: `apps/myk9show/src/pages/judge/JudgeCheckInDashboard.test.tsx`
- Modify: `apps/myk9show/src/pages/judge/JudgeCheckInDashboard.tsx`
- Modify: `OPEN-TODOS.md`
- Modify: `docs/audits/2026-06-code-quality/09-phase-2-verification.md`
- Modify: `docs/audits/2026-06-code-quality/SUMMARY.md`

## Task 1: Cart total helper coverage

**Files:**

- Create: `apps/myk9show/src/store/cartStore.helpers.test.ts`
- Read: `apps/myk9show/src/store/cartStore.helpers.ts`
- Read: `apps/myk9show/supabase/functions/_shared/platformFee.ts`

- [ ] **Step 1: Write failing tests for cart totals**

Create tests that import `calculateCartTotals`, `PLATFORM_FEE_PERCENT`, and `PLATFORM_FEE_PERCENT_LABEL`. Use a local `cartItem(entry_fee_cents)` helper cast to `CartItemWithDetails` so the test only depends on the field the helper reads.

Coverage:

- Empty cart returns all zeros.
- Multiple items sum subtotal and total.
- 350 cents rounds 7% to 25 cents, matching the server integer expression.
- Percent label derives from the constant.

- [ ] **Step 2: Run the focused cart tests red**

Run:

```bash
cd apps/myk9show && pnpm exec vitest run src/store/cartStore.helpers.test.ts --reporter=verbose
```

Expected: fail because the test file is new or because no direct coverage existed before the file is added.

- [ ] **Step 3: Make only test/support changes needed for green**

Do not change `calculateCartTotals` unless a test exposes real drift from `_shared/platformFee.ts`.

- [ ] **Step 4: Run the focused cart tests green**

Run:

```bash
cd apps/myk9show && pnpm exec vitest run src/store/cartStore.helpers.test.ts --reporter=verbose
```

Expected: pass.

## Task 2: ScoreValidatorService direct coverage

**Files:**

- Create: `apps/myk9show/src/services/scoring/ScoreValidatorService.test.ts`
- Read: `apps/myk9show/src/services/scoring/ScoreValidatorService.ts`
- Read: `apps/myk9show/src/services/scoring/validationRules.ts`
- Read: `apps/myk9show/src/types/scoring-types.ts`

- [ ] **Step 1: Write failing tests for validator behavior**

Use a local `baseScore(overrides)` helper returning a valid `BaseScore`.

Coverage:

- Required fields reject missing `entryId` and blank `judgeId`.
- Range validation rejects scent work `searchTime` above 600000.
- Real-time mode validates only critical required/range rules.
- Custom rules added through `addCustomRules` participate in `validateScore`.
- Future `recordedAt` is an error.
- Old `recordedAt` is a warning.
- `Not Qualified` without notes/reason warns for Q/NQ consistency.
- `validateScores` keys results by `entryId-classId-judgeId`.

- [ ] **Step 2: Run the focused validator tests red**

Run:

```bash
cd apps/myk9show && pnpm exec vitest run src/services/scoring/ScoreValidatorService.test.ts --reporter=verbose
```

Expected: fail because the direct test file is new or because an uncovered behavior is missing.

- [ ] **Step 3: Make minimal production changes only if tests reveal a bug**

Prefer no production changes. If a real defect appears, fix the smallest branch in `ScoreValidatorService.ts` and rerun only this test file first.

- [ ] **Step 4: Run the focused validator tests green**

Run:

```bash
cd apps/myk9show && pnpm exec vitest run src/services/scoring/ScoreValidatorService.test.ts --reporter=verbose
```

Expected: pass.

## Task 3: Placement helper coverage

**Files:**

- Create: `apps/myk9show/src/services/scoring/PlacementCalculatorService.helpers.test.ts`
- Read: `apps/myk9show/src/services/scoring/PlacementCalculatorService.helpers.ts`
- Read: `apps/myk9show/src/types/scoring-types.ts`

- [ ] **Step 1: Write failing tests for placement helpers**

Use a local `placementEntry(id, primaryScore, secondaryScore, overrides)` helper.

Coverage:

- `sortEntriesByFormat` sorts by weighted placement rules.
- `assignPlacementsWithTieHandling` uses competition ranking gaps and marks ties.
- `findTiedGroups` returns tied groups once.
- `resolveTiesWithRules` applies tie-breaker order and clears resolved ties.
- `createEmptyPlacementCalculation` returns an empty calculation with the requested class/format.
- `serializePlacementCalculation` and `deserializePlacementCalculation` preserve `Date` fields.

- [ ] **Step 2: Run the focused placement tests red**

Run:

```bash
cd apps/myk9show && pnpm exec vitest run src/services/scoring/PlacementCalculatorService.helpers.test.ts --reporter=verbose
```

Expected: fail because the direct helper test file is new or because an uncovered behavior is missing.

- [ ] **Step 3: Make minimal production changes only if tests reveal a bug**

Do not rewrite placement calculation. If a test exposes a defect, patch only the helper responsible.

- [ ] **Step 4: Run the focused placement tests green**

Run:

```bash
cd apps/myk9show && pnpm exec vitest run src/services/scoring/PlacementCalculatorService.helpers.test.ts --reporter=verbose
```

Expected: pass.

## Task 4: Judge check-in false-empty fix

**Files:**

- Create: `apps/myk9show/src/pages/judge/JudgeCheckInDashboard.test.tsx`
- Modify: `apps/myk9show/src/pages/judge/JudgeCheckInDashboard.tsx`
- Read: `apps/myk9show/src/hooks/queries/useJudgeCheckInStats.ts`
- Read: `apps/myk9show/src/test/utils/testUtils.tsx`

- [ ] **Step 1: Write failing dashboard tests**

Mock `useJudgeCheckInStats` instead of Supabase. Tests should prove:

- Loading state renders without the false "No Ring Assignments" empty state.
- Error state renders retry-safe copy and does not show false empty state.
- A returned ring assignment renders class, totals, checked-in count, and enables Multi-Ring View.
- True empty loaded state still renders "No Ring Assignments".

- [ ] **Step 2: Run dashboard tests red**

Run:

```bash
cd apps/myk9show && pnpm exec vitest run src/pages/judge/JudgeCheckInDashboard.test.tsx --reporter=verbose
```

Expected: fail because the component still uses a hardcoded empty array instead of `useJudgeCheckInStats`.

- [ ] **Step 3: Wire the dashboard to `useJudgeCheckInStats`**

Replace the hardcoded `useState<RingAssignment[]>([])` with the hook result. Map `JudgeRingAssignment` into the existing dashboard shape without inventing fake conflicts or gate counts:

- `ringNumber`: use a stable class-derived label/id until a real ring column exists.
- `judgeName`: keep existing fallback.
- `className`: hook class name.
- `startTime`: use a display-safe current date only if needed by the existing UI.
- `totalEntries`: hook total.
- `checkedInCount`: hook checked-in.
- `conflictCount`: hook conflicts.
- `atGateCount`: zero.
- `isActive`: false.

Add explicit loading and error states above the stats grid so the component never shows a false empty state while data is unknown.

- [ ] **Step 4: Run dashboard tests green**

Run:

```bash
cd apps/myk9show && pnpm exec vitest run src/pages/judge/JudgeCheckInDashboard.test.tsx --reporter=verbose
```

Expected: pass.

## Task 5: Tracking docs and verification

**Files:**

- Modify: `OPEN-TODOS.md`
- Modify: `docs/audits/2026-06-code-quality/09-phase-2-verification.md`
- Modify: `docs/audits/2026-06-code-quality/SUMMARY.md`

- [ ] **Step 1: Update tracking docs**

Record that Wave B slice 1 type unification merged in PR #653, and this branch implements the P1 launch-gate coverage/fix slice. Keep remaining Wave B P2 duplication clusters open.

- [ ] **Step 2: Run focused test batch**

Run:

```bash
cd apps/myk9show && pnpm exec vitest run \
  src/store/cartStore.helpers.test.ts \
  src/services/scoring/ScoreValidatorService.test.ts \
  src/services/scoring/PlacementCalculatorService.helpers.test.ts \
  src/pages/judge/JudgeCheckInDashboard.test.tsx \
  src/hooks/queries/__tests__/useJudgeCheckInStats.test.ts \
  --reporter=verbose
```

- [ ] **Step 3: Run app typecheck**

Run:

```bash
pnpm --filter @myk9/show typecheck
```

- [ ] **Step 4: Run diff hygiene**

Run:

```bash
git diff --check
```

- [ ] **Step 5: Commit**

Commit only the files in this plan after all verification passes.
