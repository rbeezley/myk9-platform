# QA Quality Scorecard

Use this scorecard to track whether quality is improving without pretending one number can describe the whole app. Update it after Nightly runs, discovery batches, or major QA repair waves.

## Current Snapshot

| Metric                          |     Current |           Target | Notes                                                                                                                     |
| ------------------------------- | ----------: | ---------------: | ------------------------------------------------------------------------------------------------------------------------- |
| Trusted Nightly pass rate       |        100% |           >= 95% | 2026-05-15 active Vitest 18/18 and Playwright 46/46 passed.                                                               |
| Open blocker/high findings      |           0 |                0 | Keep this at zero before release decisions.                                                                               |
| Open medium findings            |           0 |                0 | `QA-ROLE-RLS-MISMATCH-002` closed after the show soft-delete RPC and null-club migration proof passed.                    |
| CRUD discovery active pass rate | 6/6 domains |              6/6 | Dog, club, people, trial, class, and show CRUD are included in the active discovery batch.                                |
| Suite-map drift                 |     Passing |          Passing | `pnpm qa:e2e-map:check` should stay green.                                                                                |
| Typecheck/lint health           |     Passing |          Passing | Last repaired by `4e218f45`; rerun before commit.                                                                         |
| Route sweep coverage            |     Partial | Full role groups | Public, secretary, exhibitor, judge, club-admin, and admin route groups were swept on 2026-05-15 with soft warnings only. |

## Scoring Formula

Start at 100 and subtract:

| Condition                                                  | Deduction |
| ---------------------------------------------------------- | --------: |
| Each open blocker finding                                  |       -25 |
| Each open high finding                                     |       -15 |
| Each open medium finding                                   |        -7 |
| Nightly pass rate below 95%                                |       -10 |
| Suite-map drift check failing                              |       -10 |
| Typecheck or lint failing on `main`                        |       -10 |
| CRUD discovery domain failing without a logged finding     |        -5 |
| Route sweep missing a core role group for more than 7 days |        -5 |

Do not score below 0. Treat the score as a trend line, not a release guarantee.

## Current Score

| Date       | Score | Drivers                                                                  |
| ---------- | ----: | ------------------------------------------------------------------------ |
| 2026-05-15 |   100 | `QA-ROLE-RLS-MISMATCH-002` closed; CRUD discovery target is 6/6 domains. |
| 2026-05-15 |    93 | One open medium finding: `QA-ROLE-RLS-MISMATCH-002`.                     |

## Update Checklist

1. Run the trusted Nightly workflow or read the latest `docs/qa/nightly-history.md` entry.
2. Run `pnpm qa:e2e-map:check`.
3. Count open findings by severity in `docs/qa/findings.md`.
4. Run the relevant discovery batch, such as `pnpm qa:discovery:crud`.
5. Update the current snapshot and append a score row with the reason for any change.
