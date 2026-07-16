# Tasks

## 1. Playwright CI config

- [x] 1.1 Add nightly mode to `apps/myk9show/playwright.ci.config.ts`: `PLAYWRIGHT_NIGHTLY=true` → testMatch = curated ~20-spec list (existing files only, verified with ls), no grep filter, retries 2, workers 1
- [x] 1.2 Expand PR-smoke testMatch+grep from 2 to 5 specs: add `payment/paymentFlow.spec.ts`, `show/atShowOfflineScoring.spec.ts`, `uat/secretary/critical-path.spec.ts`
- [x] 1.3 Add `test:e2e:nightly` script (`cross-env PLAYWRIGHT_NIGHTLY=true npx playwright test --config=playwright.ci.config.ts`) to `apps/myk9show/package.json`

## 2. Nightly workflow

- [x] 2.1 Create `.github/workflows/nightly-e2e.yml`: `schedule` cron `0 6 * * *` + `workflow_dispatch`; single job mirroring `e2e-myk9show` steps from `ci.yml` but running `pnpm test:e2e:nightly`; timeout 45m; upload playwright report artifact; gated on `vars.MYK9SHOW_SMOKE_CI_ENABLED == 'true'`

## 3. Verification

- [x] 3.1 Run the expanded PR-smoke suite locally under `playwright.ci.config.ts`; drop any promoted spec that fails for environment/stability reasons (keep nightly-only) and record the result
- [ ] 3.2 Validate the nightly workflow YAML (actionlint or `gh workflow view` after push) and confirm the nightly spec list matches real files
- [x] 3.3 `pnpm typecheck` clean

## 4. Post-merge (manual, confirm separately)

- [ ] 4.1 Add `E2E PR Smoke` + a11y to the branch ruleset required checks
- [ ] 4.2 Trigger `workflow_dispatch` of nightly-e2e once and confirm it goes green
