# 003 — Bring test files under a typecheck gate

> **Status:** Active
>
> Stage 1 and the full rollout completed 2026-07-12.

## Final rollout — 2026-07-12

The blocking `tsconfig.test.json` now covers every non-E2E Vitest test/spec plus its test helpers. Playwright/E2E, the standalone Playwright performance script, and legacy load harnesses remain explicitly excluded from this gate because they require their own runtime and declarations. `tsconfig.test.all.json` now mirrors the blocking inventory, so `typecheck:tests` and `typecheck:tests:all` must both exit cleanly.

The final pass corrected 1,039 diagnostics across 294 files without changing production behavior. Most fixes aligned stale mocks and fixtures with current schemas, replaced unsafe partial assertions with `@total-typescript/shoehorn`, and updated a small number of stale expectations to the current domain contract. Root `pnpm typecheck` was also verified to fail after a deliberate type error was temporarily added to a non-E2E test, then pass after the error was removed.

The test project deliberately disables `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`, and `exactOptionalPropertyTypes`. Tests import runtime modules that are outside the app project's root file graph; inheriting those four checks surfaces unrelated pre-existing runtime diagnostics, which this test-only rollout is not authorized to change. The normal app typecheck and lint gates remain responsible for runtime source.

> Written against commit `15897d862` (2026-07-11). This plan intentionally starts with a measurement step — if the error backlog exceeds ~150 files, STOP after step 2 and report the count instead of fixing everything.

## Stage 1 rollout — 2026-07-12

The measurement gate fired: the full original config reported 1,350 errors across 374 files. A single cleanup would be unsafe, so the gate now has two explicit modes:

- `tsconfig.test.json` is the blocking allowlist. It currently covers 14 low-coupling test files across config, constants, source-contract probes, branding, template validation, and styles. The app's normal `typecheck` script runs this gate, so root `pnpm typecheck` and the existing CI Quality job enforce it.
- `tsconfig.test.all.json` is the non-blocking backlog inventory invoked with `pnpm typecheck:tests:all`. It includes the app's ambient declarations and excludes every Playwright suite found under `src/`: `src/test/e2e/**` plus the legacy load/performance specs outside that directory. The post-separation baseline is 1,034 errors across 294 files.

Stage 1 corrected test-only drift in sync-scope key iteration, missing template-type imports, and shared template fixtures. It deliberately did not change runtime source. `src/test/lib/classGeneration.test.ts` remains outside the blocking allowlist because it exposed a real source-contract mismatch: `mergeFieldValues` stores the object-valued `defaults.entryFees`, while `CreatedClass.fieldValues` only permits primitive/date/array values. Resolve that contract before admitting the file.

Next slices should add one cohesive directory or explicit file group at a time, run the staged gate red, correct test-side drift against the real interfaces, and only then extend the blocking allowlist. Prefer low-dependency leaf tests before broad component/service suites.

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

Only files matching the staged allowlist are type-gated today. Expand that allowlist whenever a test area is made green; do not silently broaden it past known errors. New tests in an already-green directory must match a directory glob in the allowlist; avoid one-file patterns unless neighboring files are explicitly documented as blocked. Keep the full-inventory config in sync if test layout conventions change.
