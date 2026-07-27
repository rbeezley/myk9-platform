# Isolated Playwright regression

The stateful Playwright regression suite runs only against a disposable local Supabase target. It must not receive the shared staging URL, project ref, or service-role key.

## CI ownership

`.github/workflows/nightly-e2e.yml` runs every Monday at 07:00 UTC and supports manual dispatch. It remains gated by `MYK9SHOW_REGRESSION_CI_ENABLED=true`. The workflow owns the full lifecycle:

1. Start the local Supabase stack with the repository migrations.
2. Create or reset the canonical E2E accounts using the CI-provided passwords.
3. Apply `supabase/seed-demo.sql` and verify the known show, classes, judge assignments, and role grants.
4. Build and run the curated regression suite with one worker and zero retries.
5. Reset and reseed the local stack, then run the same suite a second time.
6. Upload both reports and stop the local stack, even after a failure.

The workflow does not use `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` secrets. The lifecycle writes generated local endpoints and keys to the job environment only. E2E account email and password secrets are still required for auth preflight and browser login.

The weekly schedule is the anti-rot mechanism for the curated stateful suite. The read-only health sweep remains the daily signal; the heavier stateful suite runs twice per job, so weekly execution is proportionate while preserving an on-demand path for release evidence.

## Local lifecycle

With `supabase` CLI, `psql`, and the four E2E password variables available:

```bash
MYK9_PLAYWRIGHT_REGRESSION_ENABLED=true \
MYK9_PLAYWRIGHT_REGRESSION_TARGET=isolated \
MYK9_E2E_APPROVED_PROJECT_REFS=local \
MYK9_E2E_SUPABASE_PROJECT_REF=local \
E2E_SECRETARY_PASSWORD='...' \
E2E_ADMIN_PASSWORD='...' \
E2E_JUDGE_PASSWORD='...' \
E2E_DEMO_EXHIBITOR_PASSWORD='...' \
pnpm qa:isolated-e2e:prepare
```

The preparation command writes generated local values to `GITHUB_ENV` only when that CI variable exists. For an interactive shell, export the values printed by `supabase status -o env` before running the app build and regression command. To repeat the fixture proof in an already-running local stack, use `pnpm qa:isolated-e2e:reset`; stop it with `pnpm qa:isolated-e2e:stop`.

Do not replace `local` with the shared staging project ref. The target resolver fails closed if the project ref, URL, build URL, allowlist, or regression mode is not an approved isolated combination.

## MYK9-107 repair evidence

The last pre-isolation failure was [run 29635653949](https://github.com/rbeezley/myk9-platform/actions/runs/29635653949) on 2026-07-18 at commit `00e0722`. It ran the former staging-backed workflow and reported 6 failed, 47 passed, and 6 skipped. That evidence predates the disposable lifecycle shipped by `f2ef66f`, so each failure was reclassified against the current curated list:

| Historical failure                                                  | Current disposition                                                                                                                                                                             |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `registration/exhibitorSelfRegistration.spec.ts` — checkout handoff | Explicitly excluded from the curated suite until an isolated fixture has an open entry window; retained in the repair queue rather than weakened.                                               |
| `scoring/scoringWorkflow.spec.ts` — split-panel paper result        | Obsolete candidate excluded from the curated suite; current scoring coverage is `show/atShowJudgeScoring.spec.ts` and `show/atShowOfflineScoring.spec.ts`.                                      |
| `scoring/scoringWorkflow.spec.ts` — card-flow NQ reason             | Same obsolete-suite disposition and replacement coverage as the other scoring failure.                                                                                                          |
| `secretary/show-creation-wizard.spec.ts` — cloned dates             | Still curated; must pass in the MYK9-107 isolated dispatch.                                                                                                                                     |
| `show/showManagement.spec.ts` — canonical wizard navigation         | Obsolete all-in-one candidate excluded from the curated suite; current coverage is split across the show wizard, secretary UAT, and entry-management specs.                                     |
| `uat/secretary/disposable-entry.spec.ts` — seeded entry management  | Still curated. Its historical missing `VITE_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` error is closed by the generated `GITHUB_ENV` contract and must pass in the MYK9-107 isolated dispatch. |

Current pre-dispatch evidence:

- `pnpm qa:isolated-e2e:test` → 15 passed.
- Playwright regression discovery → 59 tests in 15 files compile/list successfully.
- All eight E2E credential secret names exist in GitHub Actions.
- `MYK9SHOW_REGRESSION_CI_ENABLED=true` was enabled with operator approval on 2026-07-27.
- [Run 30296081479](https://github.com/rbeezley/myk9-platform/actions/runs/30296081479) reached the disposable-target preparation step but failed before Playwright with an opaque `Supabase start failed`. The lifecycle now excludes optional Studio/analytics/vector/image/mail/metadata/Functions services and emits bounded sanitized startup detail without ignoring required-service health checks.

Successful dispatch: pending.
