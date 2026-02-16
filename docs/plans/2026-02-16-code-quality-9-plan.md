# Code Quality Sprint (7 → 9) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan
> task-by-task.

**Goal:** Raise code quality from 7/10 to 9/10 by adding CI coverage enforcement, eliminating type
safety bypasses, refactoring oversized files, and running E2E tests in CI.

**Architecture:** No architectural changes. This is purely quality enforcement and cleanup — adding
gates to CI, replacing `as any` casts with proper types, splitting large files using the established
types/helpers extraction pattern, and wiring existing Playwright tests into the CI pipeline.

**Tech Stack:** Vitest (coverage), ESLint (type rules), Playwright (E2E), GitHub Actions (CI)

---

## Session 1: CI Coverage Gates + ESLint Unification

### Task 1.1: Create vitest config for myK9Q

myK9Q currently has no `vitest.config.ts` — it runs vitest with defaults. Create one with coverage
configuration.

**Files:**

- Create: `apps/myk9q/vitest.config.ts`

**Step 1: Create the config file**

```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/test/',
        'tests/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/types/**',
      ],
    },
    testTimeout: 10000,
    hookTimeout: 10000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
```

**Step 2: Verify tests still pass**

Run: `cd apps/myk9q && pnpm test`

Expected: All existing tests pass (no behavior change)

**Step 3: Commit**

```bash
git add apps/myk9q/vitest.config.ts
git commit -m "chore(myk9q): add vitest config with coverage support"
```

### Task 1.2: Measure current coverage baselines

Before setting thresholds, measure what coverage actually is today.

**Step 1: Run coverage for myK9Show**

Run: `cd apps/myk9show && pnpm test -- --run --coverage`

Record the summary line (statements, branches, functions, lines percentages).

**Step 2: Run coverage for myK9Q**

Run: `cd apps/myk9q && pnpm test -- --run --coverage`

Record the summary line.

**Step 3: Document baselines**

Note the exact numbers. We'll set thresholds ~2% below these in the next task.

### Task 1.3: Add coverage thresholds to both apps

**Files:**

- Modify: `apps/myk9show/vitest.config.ts`
- Modify: `apps/myk9q/vitest.config.ts`

**Step 1: Add thresholds to myK9Show vitest config**

Inside the `coverage` block, add a `thresholds` property with values ~2% below measured baseline:

```typescript
coverage: {
  provider: 'v8',
  reporter: ['text', 'json', 'html'],
  thresholds: {
    statements: <baseline - 2>,
    branches: <baseline - 2>,
    functions: <baseline - 2>,
    lines: <baseline - 2>,
  },
  exclude: [
    // ... existing excludes
  ],
},
```

**Step 2: Add same thresholds to myK9Q vitest config**

Same pattern, using myK9Q's measured baseline.

**Step 3: Verify thresholds pass**

Run: `cd apps/myk9show && pnpm test -- --run --coverage`
Run: `cd apps/myk9q && pnpm test -- --run --coverage`

Both should pass (thresholds are below current coverage).

**Step 4: Commit**

```bash
git add apps/myk9show/vitest.config.ts apps/myk9q/vitest.config.ts
git commit -m "chore: add coverage thresholds to vitest configs"
```

### Task 1.4: Add coverage to CI pipeline

**Files:**

- Modify: `.github/workflows/ci.yml`

**Step 1: Update test commands to include coverage**

In the `test-myk9q` job, change the test command:

```yaml
- name: Run tests with coverage
  run: pnpm --filter=@myk9/q test -- --run --reporter=default --coverage
  env:
    NODE_OPTIONS: --max-old-space-size=4096
```

In the `test-myk9show` job, change the test command:

```yaml
- name: Run tests with coverage
  run: pnpm --filter=@myk9/show test -- --run --reporter=default --coverage --exclude '**/integration/**' --exclude '**/debug-*.test.*'
  env:
    NODE_OPTIONS: --max-old-space-size=4096
```

**Step 2: Verify CI config is valid YAML**

Run: `cd /Users/richardbeezley/AI\ Projects/myk9-platform && pnpm typecheck && pnpm lint`

Expected: Pass (no code changes, just CI config)

**Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: enforce coverage thresholds in CI pipeline"
```

### Task 1.5: Unify ESLint — promote no-explicit-any to error everywhere

**Files:**

- Modify: `eslint.config.js` (root)
- Modify: `apps/myk9q/.eslintrc.json`

**Step 1: Change root ESLint config**

In `eslint.config.js`, line 61, change:

```javascript
'@typescript-eslint/no-explicit-any': 'warn',
```

to:

```javascript
'@typescript-eslint/no-explicit-any': 'error',
```

**Step 2: Remove the `off` override in myK9Q**

In `apps/myk9q/.eslintrc.json`, line 28, remove:

```json
"@typescript-eslint/no-explicit-any": "off",
```

**Important:** Do NOT run `pnpm lint` yet — it will fail because of the 384 existing `as any` casts.
This change sets the rule but we'll fix violations in Sessions 2 and 3.

For now, verify typecheck still passes:

Run: `pnpm typecheck`

**Step 3: Commit**

```bash
git add eslint.config.js apps/myk9q/.eslintrc.json
git commit -m "chore: promote no-explicit-any to error in all ESLint configs"
```

> **Note:** Lint will fail until Sessions 2-3 clean up the `as any` casts. The pre-commit hook runs
> both typecheck AND lint, so you may need to temporarily bypass lint for this commit, or batch this
> with Session 2 to keep CI green. Decide at implementation time based on whether you want the rule
> change committed separately or atomically with the cleanup.

---

## Session 2: Type Safety — Packages + myK9Show

### Task 2.1: Eliminate `as any` in shared packages (24 casts)

**Files:** All `.ts` files in `packages/` containing `as any`

Find them:

```bash
grep -rn "as any" packages/*/src/ --include="*.ts" --include="*.tsx" -l
```

**Step 1: For each file, replace `as any` with proper types**

Common replacements:

- `as any` on Supabase responses → use the generated DB types from `@myk9/supabase`
- `as any` on event handlers → use `React.ChangeEvent<HTMLInputElement>` etc.
- `as any` on unknown data → use `unknown` + type guard, or specific interface
- `as any` on test mocks → use `as jest.Mock` or proper mock types

**Step 2: Verify after each package**

Run: `pnpm typecheck`

Expected: Zero errors

**Step 3: Commit per package or as batch**

```bash
git commit -m "fix(packages): eliminate as any casts in shared packages"
```

### Task 2.2: Eliminate `as any` in myK9Show

**Files:** All `.ts/.tsx` files in `apps/myk9show/src/` containing `as any`

Find them:

```bash
grep -rn "as any" apps/myk9show/src/ --include="*.ts" --include="*.tsx" -l
```

**Execution:** Use parallel sub-agents. Group files by directory:

- Agent 1: `src/components/` files
- Agent 2: `src/services/` files
- Agent 3: `src/hooks/` + `src/store/` + `src/lib/` files
- Agent 4: `src/types/` + remaining files

Each agent: read file → replace `as any` with proper types → verify types compile.

**Step 1: Run all agents in parallel**

Each agent replaces casts and verifies `pnpm typecheck` passes for its batch.

**Step 2: Merge results and verify**

Run: `pnpm typecheck && pnpm lint`

Expected: Zero errors, zero `as any` warnings

**Step 3: Commit**

```bash
git commit -m "fix(myk9show): eliminate all as any casts"
```

### Task 2.3: Fix all @ts-ignore and @ts-expect-error suppressions

**Files:** Find all suppression comments:

```bash
grep -rn "@ts-ignore\|@ts-expect-error" apps/ packages/ --include="*.ts" --include="*.tsx"
```

18 instances total, all in apps.

**Step 1: For each suppression, fix the underlying type error**

- If the line below has a type mismatch → fix the type
- If it's a missing property → add the property to the interface
- If it's a third-party type issue → use a proper type assertion (`as SpecificType`)

**Step 2: Remove the suppression comment**

**Step 3: Verify**

Run: `pnpm typecheck`

**Step 4: Commit**

```bash
git commit -m "fix: remove all @ts-ignore and @ts-expect-error suppressions"
```

---

## Session 3: Type Safety — myK9Q (~360 casts)

### Task 3.1: Eliminate `as any` in myK9Q — batch 1 (pages/)

**Files:** All `.ts/.tsx` files in `apps/myk9q/src/pages/` containing `as any`

**Execution:** Parallel sub-agents by page directory:

- Agent 1: `src/pages/scoresheets/` files
- Agent 2: `src/pages/EntryList/` + `src/pages/TrialSecretary/` files
- Agent 3: All other page directories

Each agent: read file → replace `as any` → verify typecheck.

**Step 1: Run agents**

**Step 2: Verify**

Run: `pnpm typecheck`

**Step 3: Commit**

```bash
git commit -m "fix(myk9q): eliminate as any casts in pages/"
```

### Task 3.2: Eliminate `as any` in myK9Q — batch 2 (services/ + stores/)

**Files:** All `.ts` files in `apps/myk9q/src/services/` and `apps/myk9q/src/stores/` containing
`as any`

Same parallel agent pattern.

**Step 1: Run agents**

**Step 2: Verify**

Run: `pnpm typecheck`

**Step 3: Commit**

```bash
git commit -m "fix(myk9q): eliminate as any casts in services/ and stores/"
```

### Task 3.3: Eliminate `as any` in myK9Q — batch 3 (remaining)

**Files:** All remaining files in `apps/myk9q/src/` with `as any` (components, hooks, utils, types)

**Step 1: Run agents for remaining directories**

**Step 2: Final verification**

Run: `pnpm typecheck && pnpm lint`

Expected: Zero `as any` casts remaining. Lint passes clean.

**Step 3: Commit**

```bash
git commit -m "fix(myk9q): eliminate remaining as any casts"
```

### Task 3.4: Verify zero `as any` across entire codebase

**Step 1: Search for any remaining casts**

```bash
grep -rn "as any" apps/*/src/ packages/*/src/ --include="*.ts" --include="*.tsx"
```

Expected: Zero results (or only in generated files / documented exceptions)

**Step 2: Run full quality gate**

Run: `pnpm typecheck && pnpm lint && pnpm build`

Expected: All pass

**Step 3: Commit if any stragglers were found**

```bash
git commit -m "fix: zero as any casts across entire codebase"
```

---

## Session 4: Large File Refactoring

### Task 4.1: Triage files over 700 lines

The audit found **~40 files** over 700 lines (excluding generated types). Group them:

**Skip (generated/already evaluated):**

- `apps/myk9show/src/types/supabase.ts` (3,694 lines — generated)
- `packages/supabase/src/types/database.types.ts` (3,639 lines — generated)
- `apps/myk9show/src/services/scoring/OfflineScoringService.ts` (875 lines — single cohesive class,
  previously evaluated)

**Refactor (parallel sub-agents, one per file):**

Priority order (largest first):

1. `apps/myk9show/src/services/deployment/ProductionMonitoringService.ts` (797 lines)
2. `apps/myk9show/src/services/sync/DifferentialSyncService.ts` (791 lines)
3. `apps/myk9show/src/services/performance/RealUserMonitoring.ts` (788 lines)
4. `apps/myk9show/src/services/analytics/UserBehaviorLearning.ts` (784 lines)
5. `apps/myk9show/src/components/shows/RegistrationWorkflow/ConfirmationStep.tsx` (781 lines)
6. `apps/myk9q/src/pages/TrialSecretary/hooks/useScheduleBoard.ts` (781 lines)
7. `apps/myk9show/src/services/sync/conflictResolver.ts` (779 lines)
8. `apps/myk9show/src/services/offline-checkin/OfflineCheckInService.ts` (775 lines)
9. `apps/myk9show/src/services/scoring/PlacementCalculatorService.ts` (774 lines)
10. `apps/myk9show/src/services/sync/BatchProcessor.ts` (765 lines)
11. `apps/myk9show/src/services/competition/presenceService.ts` (766 lines)
12. `apps/myk9show/src/services/database/queries/classQueries.ts` (763 lines)
13. `apps/myk9show/src/services/sync/SyncQueue.ts` (763 lines)
14. `apps/myk9show/src/components/shows/RegistrationWorkflow/RegistrationWorkflow.tsx` (760 lines)
15. `apps/myk9show/src/components/panels/edit/ShowEditPanel.tsx` (755 lines)

Remaining 700-750 line files: address if time permits or when naturally touched.

### Task 4.2: Refactor files — batch 1 (services)

**Pattern for each file:**

1. Read the file, identify extractable sections:
   - Type definitions → `<basename>.types.ts`
   - Helper/utility functions → `<basename>.helpers.ts`
   - Constants → `<basename>.constants.ts`
2. Create the extraction files
3. Update imports in the main file
4. Verify: `pnpm typecheck`
5. Search for external importers and update if needed

**Execution:** 4-5 parallel sub-agents, each handling 2-3 service files.

**Step 1: Run agents**

**Step 2: Verify**

Run: `pnpm typecheck && pnpm lint`

**Step 3: Commit**

```bash
git commit -m "refactor(myk9show): extract types and helpers from large service files"
```

### Task 4.3: Refactor files — batch 2 (components + hooks)

Same pattern for component files. Components may also benefit from extracting sub-components into
sibling files.

**Execution:** 3-4 parallel sub-agents.

**Step 1: Run agents**

**Step 2: Verify**

Run: `pnpm typecheck && pnpm lint`

**Step 3: Commit**

```bash
git commit -m "refactor: extract types and helpers from large components and hooks"
```

### Task 4.4: Verify file size targets

**Step 1: Count remaining files over 500 lines**

```bash
find apps/ packages/ -name "*.ts" -o -name "*.tsx" | \
  grep -v node_modules | grep -v dist | grep -v ".test." | grep -v ".spec." | \
  xargs wc -l | sort -rn | awk '$1 > 500'
```

Expected: Only generated type files and the intentionally-skipped OfflineScoringService remain above
500 lines.

**Step 2: Full quality gate**

Run: `pnpm typecheck && pnpm lint && pnpm build`

**Step 3: Commit any final adjustments**

---

## Session 5: E2E Tests in CI + Final Polish

### Task 5.1: Add Playwright setup to CI

**Files:**

- Modify: `.github/workflows/ci.yml`

**Step 1: Add E2E job for myK9Q**

myK9Q already has `playwright.ci.config.ts`. Add a job after `build`:

```yaml
e2e-myk9q:
  name: E2E myK9Q
  runs-on: ubuntu-latest
  timeout-minutes: 15
  needs: build

  steps:
    - uses: actions/checkout@v4

    - uses: pnpm/action-setup@v4
      with:
        version: 9

    - uses: actions/setup-node@v4
      with:
        node-version: '20'
        cache: 'pnpm'

    - name: Install dependencies
      run: pnpm install --frozen-lockfile

    - name: Build
      run: pnpm build

    - name: Install Playwright browsers
      run: npx playwright install --with-deps chromium

    - name: Run E2E tests
      run: pnpm --filter=@myk9/q test:e2e:ci
      env:
        VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
        VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}

    - name: Upload test results
      if: always()
      uses: actions/upload-artifact@v4
      with:
        name: myk9q-e2e-results
        path: apps/myk9q/playwright-report/
        retention-days: 7
```

**Step 2: Add E2E job for myK9Show**

Similar structure. Check if myk9show has a CI-specific Playwright config. If not, create one that
runs only Chromium.

**Step 3: Verify CI config YAML is valid**

**Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add E2E test jobs for both apps"
```

### Task 5.2: Verify E2E tests work locally

**Step 1: Run myK9Q E2E tests locally**

```bash
cd apps/myk9q && npx playwright test --config=playwright.ci.config.ts
```

Note which tests pass and which fail (some may need a real backend).

**Step 2: Run myK9Show E2E tests locally**

```bash
cd apps/myk9show && npx playwright test --project=chromium
```

Note results.

**Step 3: If tests need backend mocking, add skip annotations**

For tests that require a real Supabase backend, add `test.skip` with a comment explaining they need
a test backend. This keeps CI green while signaling what needs a test environment.

**Step 4: Commit any test adjustments**

```bash
git commit -m "test: annotate E2E tests that need backend access"
```

### Task 5.3: Add Supabase test env vars to GitHub secrets

Guide user to add these secrets in GitHub repo settings:

- `VITE_SUPABASE_URL` — the staging Supabase project URL
- `VITE_SUPABASE_ANON_KEY` — the staging anon key

These are needed for E2E tests that hit the real API. If pure UI tests don't need them, mock them
with dummy values in CI.

### Task 5.4: Raise coverage thresholds

After all type safety cleanup and refactoring, coverage should have improved.

**Step 1: Re-measure coverage**

Run: `cd apps/myk9show && pnpm test -- --run --coverage`
Run: `cd apps/myk9q && pnpm test -- --run --coverage`

**Step 2: Update thresholds to new baseline - 2%**

**Step 3: Commit**

```bash
git commit -m "chore: raise coverage thresholds after quality sprint"
```

### Task 5.5: Update tracking documents

**Files:**

- Modify: `TO-DOS.md`
- Modify: Memory files (`MEMORY.md`)

**Step 1: Update TO-DOS.md**

Mark all quality sprint items complete. Add any remaining items discovered during the sprint.

**Step 2: Update MEMORY.md**

Add entry for the completed quality sprint with key metrics (before/after).

**Step 3: Commit**

```bash
git commit -m "docs: update tracking docs after code quality sprint"
```

### Task 5.6: Final verification — full quality gate

**Step 1: Run everything**

```bash
pnpm typecheck && pnpm lint && pnpm build
```

**Step 2: Verify zero `as any` casts**

```bash
grep -rn "as any" apps/*/src/ packages/*/src/ --include="*.ts" --include="*.tsx" | wc -l
```

Expected: 0 (or documented exceptions only)

**Step 3: Verify file sizes**

```bash
find apps/ packages/ -name "*.ts" -o -name "*.tsx" | \
  grep -v node_modules | grep -v dist | grep -v ".test." | grep -v ".spec." | \
  grep -v "supabase.ts" | grep -v "database.types.ts" | \
  xargs wc -l | sort -rn | head -20
```

Expected: No source files over 500 lines (except OfflineScoringService, documented exception)

**Step 4: Push and verify CI passes**

```bash
git push
```

Check GitHub Actions — all jobs should pass including the new coverage gates and E2E tests.
