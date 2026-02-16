# Code Quality Sprint: From 7 to 9

## Context

The myK9 Platform codebase scores ~7/10 on code quality. Strong architecture, good test volume
(308 unit + 83 E2E files), strict TypeScript, automated quality gates. But quality is aspirational
rather than enforced: no coverage thresholds in CI, 384 `as any` casts, 143 files over 500 lines,
inconsistent lint rules between apps, and E2E tests that don't run in CI.

## Approach

Big Bang Sprint — focused push across 5 sessions, tackling prevention (CI gates) and cleanup (type
safety, file sizes) in parallel.

## Current State (Baseline)

| Metric               | Current                     | Target            |
| -------------------- | --------------------------- | ----------------- |
| CI coverage gates    | None                        | Enforced          |
| `as any` casts       | 384 (24 packages, 360 apps) | 0 (or documented) |
| `@ts-ignore/expect`  | 18                          | 0                 |
| Files over 500 lines | 143                         | < 20 (generated)  |
| ESLint `any` rule    | myk9show: error, myk9q: off | Error everywhere  |
| E2E tests in CI      | Not running                 | Chromium smoke    |
| Unit test files      | 308                         | 308+              |
| E2E test files       | 83                          | 83+               |

## Design

### 1. CI Coverage Gates

- Add `coverage.thresholds` to vitest configs in both apps (statements, branches, functions, lines)
- Add `--coverage` flag to CI test commands in `.github/workflows/ci.yml`
- Measure current baseline, set initial thresholds ~2% below to avoid false failures
- Use vitest's built-in text reporter — no external coverage service needed
- Raise thresholds incrementally as cleanup improves numbers

### 2. Unified ESLint + Type Safety Cleanup

**Lint unification:**

- Promote `@typescript-eslint/no-explicit-any: error` to root `eslint.config.js`
- Remove the `off` override in `apps/myk9q/.eslintrc.json`

**`as any` elimination (384 casts):**

- Packages first (24 casts) — smallest scope, cleanest code
- myk9show next — already has the lint rule, just needs cast removal
- myk9q last (360 casts) — largest effort, use parallel sub-agents

**Suppression cleanup (18 instances):**

- Replace all `@ts-ignore` and `@ts-expect-error` with proper type annotations or narrowing

**Execution:** Parallel sub-agents, one per directory or logical group. Each agent replaces casts
with proper types and verifies `pnpm typecheck` passes.

### 3. Large File Refactoring

**Triage:**

- Skip generated files (supabase types at 3,600+ lines — auto-generated)
- Focus on 700+ line files first (~10-15 files, highest impact)
- Files 500-700 lines are lower priority — address when naturally touched

**Pattern (proven in prior sessions):**

- Extract types → `<filename>.types.ts`
- Extract helpers → `<filename>.helpers.ts`
- Extract sub-components → sibling files
- Main file stays as orchestrator

**Scope limit:** Only refactor where the split is clean. Don't force extractions that hurt
readability. OfflineScoringService (875 lines) was already evaluated and skipped — single cohesive
class.

### 4. E2E Tests in CI

- Add `e2e-myk9show` and `e2e-myk9q` jobs to `.github/workflows/ci.yml`
- Run after `build` job completes
- Chromium only in CI (cross-browser stays local)
- Install: `npx playwright install --with-deps chromium`
- myk9q already has `playwright.ci.config.ts` — use it directly
- Environment: needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as CI secrets, or mock
- Evaluate during implementation which tests need real backend vs pure UI

## Sprint Structure

### Session 1: CI Gates + Baseline

- Measure current coverage in both apps
- Add coverage thresholds to vitest configs
- Add `--coverage` to CI test commands
- Unify ESLint: promote `no-explicit-any: error` to root config
- Verify CI passes

### Session 2: Type Safety — Packages + myK9Show

- Eliminate `as any` in all 7 packages (24 casts)
- Eliminate `as any` in myk9show (parallel sub-agents)
- Fix all 18 `@ts-ignore`/`@ts-expect-error` suppressions
- Raise coverage thresholds if improved

### Session 3: Type Safety — myK9Q

- Eliminate `as any` in myk9q (~360 casts, parallel sub-agents)
- Heaviest session — may split if context gets large

### Session 4: Large File Refactoring

- Refactor 700+ line files (parallel sub-agents, one per file)
- Verify all imports, run typecheck
- Raise coverage thresholds

### Session 5: E2E in CI + Final Polish

- Add Playwright jobs to CI
- Evaluate which E2E tests work without backend
- Final coverage threshold bump
- Update TO-DOS.md, MEMORY.md

## Success Criteria

- [ ] Coverage thresholds enforced in CI — builds fail if coverage drops
- [ ] Zero `as any` casts (or near-zero with `// SAFETY:` documented exceptions)
- [ ] Zero `@ts-ignore`/`@ts-expect-error` suppressions
- [ ] `no-explicit-any: error` in all ESLint configs
- [ ] All source files under 500 lines (excluding generated types)
- [ ] E2E smoke tests running in CI (at least Chromium)
- [ ] `pnpm typecheck && pnpm lint && pnpm build` all pass
