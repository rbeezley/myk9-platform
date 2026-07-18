# Isolated Playwright regression

The stateful Playwright regression suite runs only against a disposable local Supabase target. It must not receive the shared staging URL, project ref, or service-role key.

## CI ownership

`.github/workflows/nightly-e2e.yml` is manual-dispatch only and remains gated by `MYK9SHOW_REGRESSION_CI_ENABLED=true`. The workflow owns the full lifecycle:

1. Start the local Supabase stack with the repository migrations.
2. Create or reset the canonical E2E accounts using the CI-provided passwords.
3. Apply `supabase/seed-demo.sql` and verify the known show, classes, judge assignments, and role grants.
4. Build and run the curated regression suite with one worker and zero retries.
5. Reset and reseed the local stack, then run the same suite a second time.
6. Upload both reports and stop the local stack, even after a failure.

The workflow does not use `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` secrets. The lifecycle writes generated local endpoints and keys to the job environment only. E2E account email and password secrets are still required for auth preflight and browser login.

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
