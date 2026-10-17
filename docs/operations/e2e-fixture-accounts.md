# E2E fixture accounts on shared staging (MYK9-1243)

CI suites that run against shared staging sign in with real accounts. If someone changes one of
those accounts by hand (for example giving `exhibitor@myk9t.com` a secretary role), specs fail in
ways that look like product bugs: the account skips onboarding and gets the staff sidebar. On
2026-10-16 that failed E2E PR Smoke, a required check, on `main` and on every open PR.

## Accounts CI signs in with (do not change by hand)

Resolved through `apps/myk9show/src/test/e2e/helpers/testUsers.ts` and
`src/test/e2e-helpers/e2eAuthPreflight.ts`. Passwords come from the `E2E_*` GitHub secrets.

| Preflight role | Default address       | Must hold              | Must NOT hold                                                               |
| -------------- | --------------------- | ---------------------- | --------------------------------------------------------------------------- |
| `exhibitor`    | `exhibitor@myk9t.com` | `exhibitor`            | `secretary`, `club_admin`, `steward`, `judge`, `site_admin`, `chairman`     |
| `secretary`    | `secretary@myk9t.com` | `secretary`, `steward` | `site_admin`, `judge`                                                       |
| `admin`        | `testadmin@myk9t.com` | `site_admin`           | (nothing)                                                                   |
| `judge`        | `judge@myk9t.com`     | `judge`                | `exhibitor`, `secretary`, `club_admin`, `site_admin`, `steward`, `chairman` |

Any other role is tolerated: staging accrues harmless grants through normal use (for example
`club_admin` on clubs the secretary account created). The rules live in
`src/test/e2e-helpers/fixtureRoles.ts` (`FIXTURE_ROLE_RULES`).

## The preflight

The `Verify E2E auth credentials` step in `ci.yml` (the `a11y` and `e2e-myk9show` jobs, and both `nightly-health.yml` jobs) runs
`scripts/verify-e2e-auth-preflight.ts --check-roles <roles>` before Playwright starts. It signs
in with each account's CI password using the anon key, reads that user's own roles through the
`get_user_roles` RPC (the same read the app does after sign-in), and checks them against the table
above. It never uses a service-role key and writes nothing. On mismatch the run fails at that step with:

```
E2E fixture account drifted: <email> is missing [..] and/or has forbidden [..]
This is a staging data problem, not a product failure ...
```

That failure means staging data was changed, not that the PR is wrong. Restore the roles (or
re-run the staging reseed, see [`staging-reseed.md`](staging-reseed.md)) and re-run the job.
`--check-roles` is for shared staging only; the isolated-database seed grants fewer roles.

## Pending: dedicated CI-only accounts

Today CI shares the accounts above with people doing manual testing, so
`exhibitor@myk9t.com` is NOT yet safe to change by hand. That changes once the owner creates
dedicated CI-only accounts on staging and points the `E2E_*_EMAIL` / `E2E_*_PASSWORD` secrets at
them (the preflight and `testUsers.ts` follow the secrets, no code change). After that,
`exhibitor@myk9t.com` becomes safe to change by hand and this page should be updated to say so.
