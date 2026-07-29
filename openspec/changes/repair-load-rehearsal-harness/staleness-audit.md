# MYK9-109 load-harness staleness audit

Date: 2026-07-28

## Current entry points

| Asset                  | Executes today?                    | Finding                                                                                                                                                                                                                                                              |
| ---------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test:load:playwright` | No                                 | Inherits `testDir: ./src/test/e2e`; the load spec is excluded.                                                                                                                                                                                                       |
| `test:load:quick`      | No                                 | Same config error; the grep cannot match an undiscovered spec.                                                                                                                                                                                                       |
| `test:load:full`       | Launcher executes                  | Propagates the shell/batch exit code, but delegates to stale commands.                                                                                                                                                                                               |
| `test:load:database`   | Test file is discoverable          | Uses the deleted singular `show` table, fake generated shapes, anon fallback key, and destructive CRUD without target preflight.                                                                                                                                     |
| `test:load:framework`  | Not a real test                    | `LoadTestFramework.ts` contains no Vitest tests; the script can exit without asserting a scenario.                                                                                                                                                                   |
| Playwright load spec   | Excluded; stale if forced          | Uses `/register`, `/shows/browse`, `/entries/create`, generic test IDs, fake accounts, and independent hand-built flows.                                                                                                                                             |
| `LoadTestRunner.ts`    | Compiles only in broad test config | Authenticates nonexistent `${role}@test.com` accounts, generates fake IDs not in the database, calls generic `/api/*` routes, uses a nonexistent EventSource path, chooses workflows without role binding, and swallows worker rejections with `Promise.allSettled`. |
| `LoadTestFramework.ts` | Imported by tests                  | Normal has only 10% judges and browse-heavy workflows; weights total 85; scenario objects are mutated by the spec; report grading hardcodes the Normal error budget for every scenario.                                                                              |
| k6                     | Optional/manual                    | Uses fake tokens, `/health`, legacy `/api/*` routes, an external remote reporter import, and a flat 100 RPS threshold; it does not model replication queues.                                                                                                         |
| Artillery              | Optional/manual                    | Uses fake payload CSV/accounts, legacy `/api/*` routes, 50 normal users, a flat threshold, and CommonJS processor code; `test-data.csv` is absent.                                                                                                                   |
| README                 | Documentation only                 | Uses npm instead of pnpm, advertises dead entry/registration flows, and presents the blanket 100 RPS target without scenario-specific G9 rules.                                                                                                                      |
| Scheduled workflow     | Missing                            | No workflow invokes any `test:load:*` entry point, so discovery and scenario drift are undetected.                                                                                                                                                                   |

## Canonical current show-day paths

| Workflow                 | Current route/surface                               | Established data path                                                                                                                         |
| ------------------------ | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Ringside class/run order | `/at-show/:showId/class/:classId`                   | Replication-backed class/entry reads and `replicatedRunQueue`; run-order writes route through `ringside_update_entry`.                        |
| Ringside scoring         | `/at-show/:showId/class/:classId/score/:entryId`    | `useAtShowScoresheet` → replicated entry mutation → `ringside_update_entry`; the isolated E2E test proves queue and persisted-score behavior. |
| Staff check-in           | At-show entry list / canonical Check-in desk        | `useAtShowEntryListActions` with the replicated writer; entry management delegates day-of check-in rather than duplicating it.                |
| Exhibitor self check-in  | `/at-show/:showId` → `AtShowMyEntriesToday`         | `useCheckInMutation({ writer: 'self-checkin-rpc' })` → `self_checkin_entry`, intentionally online-only, followed by a replicated show sync.   |
| Exhibitor reads          | `/at-show/:showId`, `/my-entries`, released results | Existing replicated/show-scoped query hooks; no new read endpoint is required.                                                                |
| Dogs ahead               | At-show class list/entry list                       | Derived from replicated run queue and current in-ring/check-in state.                                                                         |

## Safe target status

The owner confirmed on 2026-07-28 that `sojmvhhwsjxmfistvzbe` is the sole remote prelaunch
Supabase project, has no external users, and is approved for the MYK9-109 reset/smoke/rehearsal
window. The dashboard and live database identify the tier as Micro with `max_connections = 60`.
There is no local Supabase or Docker workflow in actual use. Remote smoke and full rehearsal
therefore remain explicit operator-approved operations; routine CI is limited to compile,
contracts, and discovery and sends no shared-target writes.
