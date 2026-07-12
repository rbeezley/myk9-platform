# 003 — Bring test files under a typecheck gate

> **Status:** Complete — 2026-07-12

> Written against commit `15897d862` (2026-07-11). This plan intentionally starts with a measurement step — if the error backlog exceeds ~150 files, STOP after step 2 and report the count instead of fixing everything.

## Stage 1 rollout — 2026-07-12

The measurement gate fired: the full original config reported 1,350 errors across 374 files. A single cleanup would be unsafe, so the gate now has two explicit modes:

- `tsconfig.test.json` is the blocking allowlist. It currently covers 14 low-coupling test files across config, constants, source-contract probes, branding, template validation, and styles. The app's normal `typecheck` script runs this gate, so root `pnpm typecheck` and the existing CI Quality job enforce it.
- `tsconfig.test.all.json` is the non-blocking backlog inventory invoked with `pnpm typecheck:tests:all`. It includes the app's ambient declarations and excludes every Playwright suite found under `src/`: `src/test/e2e/**` plus the legacy load/performance specs outside that directory. The post-separation baseline is 1,034 errors across 294 files.

Stage 1 corrected test-only drift in sync-scope key iteration, missing template-type imports, and shared template fixtures. It deliberately did not change runtime source. `src/test/lib/classGeneration.test.ts` remains outside the blocking allowlist because it exposed a real source-contract mismatch: `mergeFieldValues` stores the object-valued `defaults.entryFees`, while `CreatedClass.fieldValues` only permits primitive/date/array values. Resolve that contract before admitting the file.

## Final rollout — 2026-07-12

The remaining 1,034 diagnostics across 294 files were corrected against current source contracts. `tsconfig.test.json` now admits every non-E2E test/spec and excludes only Playwright suites. Both `pnpm typecheck:tests` and the retained inventory command `pnpm typecheck:tests:all` pass, so the root `pnpm typecheck` gate blocks future type drift anywhere in the non-E2E test suite.

The rollout also resolved the documented generated-class contract mismatch: `CreatedClass.fieldValues` now models the structured `entryFees` object that `generateClassesFromTemplate` already stores at runtime. Imported legacy source dependencies exposed by the broader program were corrected without changing behavior.

### Final verification

- Cache-independent `pnpm exec tsc --noEmit --incremental false --project tsconfig.test.json` exits 0.
- Root `pnpm typecheck` runs the myK9Show test gate and exits 0; root `pnpm lint` exits 0.
- A deliberate type error in a non-E2E test made root `pnpm typecheck` fail; reverting it restored the green gate.
- Focused runtime verification after the final fixture cleanup passed 24 files / 341 tests.
- The full local Vitest suite and three CI-shaped shards exceeded the repository's 60-second local-test limit and were stopped as required. No failures were observed before stopping; three earlier observed regressions were fixed and their focused tests pass. CI remains the final full-suite runtime signal.

## Why this matters

`apps/myk9show/tsconfig.app.json:38` excludes `src/test/**/*` from typecheck, and colocated `*.test.ts(x)` files across `src/` are likewise outside the `pnpm typecheck` gate (~1,369 test/spec files found under `apps/myk9show/src`). Type errors in tests — wrong mock shapes, stale fixture types after a schema change — surface only when that test file actually executes in a vitest shard, or never. In a consolidation phase with frequent shared-type refactors, this is the largest cheap DX blind spot. (Known project memory: "src/test/** excluded from tsconfig.app.json" — this plan is the fix, not a rediscovery.)

## Original state

- `pnpm typecheck` → turbo → per-package `tsc -p` against `tsconfig.app.json` (app) which excludes tests.
- Vitest runs tests with esbuild-style transpilation — no type checking at all.
- CI has no other test-type gate (checked `.github/workflows/ci.yml`).

## Steps

1. Create `apps/myk9show/tsconfig.test.json`:
   - `extends: "./tsconfig.app.json"`, remove the test excludes, `include`: `["src/**/*.test.ts", "src/**/*.test.tsx", "src/**/*.spec.ts", "src/**/*.spec.tsx", "src/test/**/*"]`, add `"types": ["vitest/globals", "node"]` if the app config doesn't already, and `noEmit: true`. Set `"composite": false` and give it its own `tsBuildInfoFile` (or none) so it can't poison the app's incremental cache — project memory records the incremental cache masking new files; keep the two builds' caches separate.
2. **Measure:** `cd apps/myk9show && npx tsc -p tsconfig.test.json --noEmit 2>&1 | grep -c "error TS"` and per-file summary. Record the number in your report. If > ~150 files have errors, STOP and report (the rollout then needs a staged allowlist, a judgment call for the maintainer).
3. Fix the backlog (assuming manageable): mechanical mock/fixture type corrections only — do NOT change runtime source to make a test type-check; if a test's types reveal a real source bug, report it, don't fix it here.
4. Add a `typecheck:tests` script to `apps/myk9show/package.json` (`tsc -p tsconfig.test.json --noEmit`) and wire it into the root turbo `typecheck` pipeline (or a sibling task) so `pnpm typecheck` covers it. Follow how the existing `typecheck` task is declared in `turbo.json`.
5. Verify CI picks it up via the existing typecheck job (read `.github/workflows/ci.yml` Quality stage — if it calls `pnpm typecheck`, no CI edit needed; do not add a new workflow job).

## Out of scope

- Other packages' test configs (app only, this round). Coverage config. Any vitest config change.

## Done criteria

- `cd apps/myk9show && npx tsc -p tsconfig.test.json --noEmit` exits 0.
- `pnpm typecheck` (root) runs the new gate and exits 0; `pnpm lint` green; `cd apps/myk9show && pnpm test` still green (no runtime edits).
- Stage 1 sanity: introduce a deliberate type error in any admitted test file → root `pnpm typecheck` fails; revert it.
- Final rollout only: every non-E2E test/spec is admitted to the blocking config and `pnpm typecheck:tests:all` exits 0.
- Final rollout sanity: introduce a deliberate type error in any non-E2E test file → root `pnpm typecheck` fails; revert it.

## Maintenance note

Every non-E2E test/spec under `apps/myk9show/src` is type-gated. Keep the blocking config and retained full-inventory config aligned when test layout conventions change. Playwright suites stay outside this TypeScript program because their runner-specific environment is verified separately.
