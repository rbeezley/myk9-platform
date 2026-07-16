# Resurrect the e2e suite in CI

## Why

Test-coverage review (2026-07-16, Linear MYK9-36): only 2 of ~115 Playwright specs run on PRs, and the "Nightly suite (20 specs)" referenced in `apps/myk9show/playwright.ci.config.ts` has no workflow file — it never runs. Payment, scoring, offline, and cross-role journeys gate nothing. The `MYK9SHOW_SMOKE_CI_ENABLED` repo variable is already `true` and the smoke-job plumbing (preflight, secrets, preview server) works — the missing pieces are a nightly workflow and a braver PR gate.

## What Changes

1. **Nightly workflow** — new `.github/workflows/nightly-e2e.yml`: scheduled (cron, ~06:00 UTC) + `workflow_dispatch`, mirroring the `e2e-myk9show` job's steps (checkout → pnpm → preflight → build → chromium install → run → upload artifact), running a curated ~20-spec suite via a new `PLAYWRIGHT_NIGHTLY=true` mode.
2. **Playwright CI config** — `playwright.ci.config.ts` gains a nightly mode: `PLAYWRIGHT_NIGHTLY=true` selects the curated spec list (no grep filter); PR-smoke mode expands from 2 to 5 specs, adding `payment/paymentFlow`, `show/atShowOfflineScoring`, and `uat/secretary/critical-path`.
3. **Script** — `test:e2e:nightly` in `apps/myk9show/package.json`.
4. **Verification gate for promotion** — each spec promoted to PR smoke MUST pass locally under `playwright.ci.config.ts` before merge; any spec that fails for environment reasons is dropped from the promotion (kept nightly-only) and reported.
5. **Required checks** — after merge, add `E2E PR Smoke` and the a11y job to the branch ruleset (manual/gh-api step, confirmed separately; documented in tasks).

## Impact

- Affected specs: `testing-e2e-ci` (new)
- Affected code: `.github/workflows/nightly-e2e.yml` (new), `apps/myk9show/playwright.ci.config.ts`, `apps/myk9show/package.json`
- Risk: PR-gate noise if a promoted spec is flaky — mitigated by the local verification gate and `--fail-on-flaky-tests` already in the job
