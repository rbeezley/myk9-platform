# 003 — Bring test files under a typecheck gate

> Written against commit `15897d862` (2026-07-11). This plan intentionally starts with a measurement step — if the error backlog exceeds ~150 files, STOP after step 2 and report the count instead of fixing everything.

## Why this matters

`apps/myk9show/tsconfig.app.json:38` excludes `src/test/**/*` from typecheck, and colocated `*.test.ts(x)` files across `src/` are likewise outside the `pnpm typecheck` gate (~1,369 test/spec files found under `apps/myk9show/src`). Type errors in tests — wrong mock shapes, stale fixture types after a schema change — surface only when that test file actually executes in a vitest shard, or never. In a consolidation phase with frequent shared-type refactors, this is the largest cheap DX blind spot. (Known project memory: "src/test/** excluded from tsconfig.app.json" — this plan is the fix, not a rediscovery.)

## Current state

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
- Sanity: introduce a deliberate type error in any test file → root `pnpm typecheck` fails; revert it.

## Maintenance note

New test files are now type-gated; schema/type refactors will fail fast here — that's the point. Keep `tsconfig.test.json`'s includes in sync if test layout conventions change.
