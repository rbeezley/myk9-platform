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

Current dispatch evidence:

- `pnpm qa:isolated-e2e:test` → 24 passed.
- Playwright regression discovery → 53 tests in 15 files compile/list successfully.
- All eight E2E credential secret names exist in GitHub Actions.
- `MYK9SHOW_REGRESSION_CI_ENABLED=true` was enabled with operator approval on 2026-07-27.
- [Run 30296081479](https://github.com/rbeezley/myk9-platform/actions/runs/30296081479) reached the disposable-target preparation step but failed before Playwright with an opaque `Supabase start failed`. The lifecycle now excludes optional Studio/analytics/vector/image/mail/metadata/Functions services and emits bounded sanitized startup detail without ignoring required-service health checks.
- [Run 30296477490](https://github.com/rbeezley/myk9-platform/actions/runs/30296477490) proved the minimal stack starts, then exposed a fresh-chain migration ordering defect: migration 020 referenced `is_show_secretary()` before migration 024 defined it. Migration 016 already defines the canonical `is_trial_secretary()` dependency. Migration 020 now creates the compatibility alias before its first policy reference, with a source-contract test guarding that ordering.
- [Run 30296908060](https://github.com/rbeezley/myk9-platform/actions/runs/30296908060) applied through migration 060, then exposed the scoped overload of the same ordering defect: migration 061 called `is_show_secretary(show_id)` before migration 099 defined it. Migration 061 now resolves the show to its owning club and delegates to `is_trial_secretary(club_id)` until migration 099 replaces the overload with the later show-role implementation. The source contract guards both helper arities at their first use.
- [Run 30297186424](https://github.com/rbeezley/myk9-platform/actions/runs/30297186424) applied through the 2026-07-18 migrations, then failed because the Broadcast migration attempted to alter the Supabase-managed `realtime.messages` table before creating its policy. The redundant `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` is removed; the scoped policy remains, matching Supabase's managed Realtime authorization pattern.
- [Run 30297456341](https://github.com/rbeezley/myk9-platform/actions/runs/30297456341) completed the entire migration chain and reached fixture setup. It exposed two final-schema drift assumptions: the demo Stripe row still targeted the superseded `club_id` uniqueness constraint, and PostgREST service-role grants were not a safe dependency for local profile setup. The demo seed now targets `(club_id, livemode)`. The isolated lifecycle creates Auth users in auth-only mode, synchronizes their profiles/roles directly through the generated local DB URL before and after the demo seed, and never broadens hosted table grants.
- [Run 30297987142](https://github.com/rbeezley/myk9-platform/actions/runs/30297987142) proved the auth-only plus direct-SQL account lifecycle, then found that the demo show row still named `chairman`, `secretary`, and `chief_steward` after migration 099 removed those columns. The seed now relies exclusively on its existing `user_roles` official grants, and a final-schema source contract prevents those removed columns from returning.
- [Run 30298324533](https://github.com/rbeezley/myk9-platform/actions/runs/30298324533) seeded the final show, trials, classes, dogs, and ordinary entries, then reached the guarded refunded-entry fixture. Final-schema ACL hardening intentionally removes direct table writes from `service_role`, while the refund trigger intentionally requires that role. The seed now grants only `INSERT` on `entries` inside its transaction, performs the two guarded inserts, and resets and revokes the privilege before continuing.
- [Run 30298718617](https://github.com/rbeezley/myk9-platform/actions/runs/30298718617) proved the guarded role could insert the refunded rows after the scoped grant, then showed that their handler email lookup also needs the final schema's revoked `people` read. The same seed transaction now grants only `people SELECT` alongside `entries INSERT`, then revokes both immediately after the two rows.
- [Run 30299058287](https://github.com/rbeezley/myk9-platform/actions/runs/30299058287) completed preparation, credential preflight, the production build, and a full 59-test browser discovery. The pass produced 25 passed, 22 failed, 2 skipped, and 10 not run. All failures shared one fresh-database ACL cause: local CLI databases do not reproduce the hosted project's historical platform grants, so authenticated and service-role requests received 42501/403 responses despite valid RLS policies. A local-only, table-allowlisted ACL seed now mirrors the linked project's applied grants before fixtures run. This run also proved the wrapper's extra `--` caused Playwright to retain its configured two retries; the wrapper now invokes Playwright directly with one worker and zero retries.
- [Run 30301456403](https://github.com/rbeezley/myk9-platform/actions/runs/30301456403) verified the true one-worker, zero-retry command and reduced the first pass from 21.2 minutes to 7.3 minutes. The initial core-table ACL failures cleared. Six additional app-startup tables still exposed the same local platform-grant gap, and fresh canonical Auth users were correctly redirected through first-run onboarding because their generated exhibitor profiles were incomplete. The allowlist now includes those exact hosted ACLs and the local account seed marks canonical returning users onboarded.
- [Run 30302406873](https://github.com/rbeezley/myk9-platform/actions/runs/30302406873) confirmed the account seed and additional startup grants, then produced 28 passed, 22 failed, 2 skipped, and 7 not run in 6.9 minutes. Fifteen exhibitor failures, entry management, offline scoring, and two secretary UAT failures shared one remaining embedded-read gap: the final-schema `entries` query joins `enrollments`, whose hosted platform grant was absent from the local mirror. The allowlist now includes `enrollments`. The run also isolated two strict-locator failures in the show wizard and a stale dog-workspace lock assertion; those tests now target the unique wizard progress region and the current Premium read-only notice.
- [Run 30303453640](https://github.com/rbeezley/myk9-platform/actions/runs/30303453640) confirmed the embedded grant and reduced the first pass to 5 failed, 45 passed, 2 skipped, and 7 not run in 4.5 minutes. The remaining failures were stale test contracts after intentional consolidation: My Shows now links to the canonical My Dogs page, CSV export lives under Entry Management's More menu, and Entry Management delegates check-in to Show Desk. The obsolete eight-test `entities/entriesUI` table/card suite is replaced in the curated list by the current two-test registration-cockpit suite; the disposable journey now exercises search, focus, armband, and acceptance in that cockpit. Offline scoring now records its isolated RPC through an explicitly opt-in interceptor while retaining shared-host classification tests.
- [Run 30304486494](https://github.com/rbeezley/myk9-platform/actions/runs/30304486494) reached 49 passed, 2 failed, and 2 skipped. Its accessibility snapshots proved the final two stale selectors: registration acceptance is now the focused registration's primary action, and Waitlist is consolidated under Exceptions.
- [Run 30305382788](https://github.com/rbeezley/myk9-platform/actions/runs/30305382788) produced the first zero-failure browser pass at 51 passed and 2 skipped, then exposed that the reset step omitted the explicit regression-intent environment contract required by the fail-closed target guard.
- [Run 30306011031](https://github.com/rbeezley/myk9-platform/actions/runs/30306011031) repeated the 51-passed first pass but was dispatched at the prior branch SHA during push propagation, so it did not contain the reset fix. The next dispatch was held until its head SHA matched the repair commit.
- [Run 30306515857](https://github.com/rbeezley/myk9-platform/actions/runs/30306515857) is the acceptance run at commit `c4ba26c8b`: pass one completed with 51 passed and 2 skipped in 2.9 minutes, reset/reseed succeeded, and pass two completed with 51 passed and 2 skipped in 3.0 minutes. Both passes used one worker, zero retries, and fail-on-flaky-tests.

Successful dispatch: [run 30306515857](https://github.com/rbeezley/myk9-platform/actions/runs/30306515857).

Residual risks: the curated suite retains one documented `fixme` for assigned-judge entry reads and one conditional public-show navigation skip when the isolated fixture exposes no public cards. They are visible as the two skips in each pass and are not retry-masked. Weekly Monday execution remains enabled as the anti-rot cadence; manual dispatch remains available for release evidence.
