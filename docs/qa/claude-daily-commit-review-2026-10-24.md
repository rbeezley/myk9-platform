# Daily commit review — 2026-10-24

source: claude. **24 of 24 commits reviewed; the window is complete.** One P2 and one P3 finding,
both filed. No P0 or P1. Two findings from the previous run are **newly resolved with red-to-green
proof**. A third finding filed by this run (MYK9-1404) was **rejected as a false positive on
2026-10-25** and is corrected below. The window's highest-risk surfaces — a `CREATE OR REPLACE` of
the at-show authorization
RPC plus its new `_at` variant, the replication conflict merge, a check-in value write, the UKC
element clock, a new online-only officials read and a new CI guard workflow — were read against
their implementations and, where the claim was about the database, against the applied database.

`main` is **red at the reviewed tip** from a single flaky test unrelated to this window. That is
this run's P2.

## Boundary and coverage

- Shared cursor read from `docs/qa/audit-boundary.md`. The **committed** row on `origin/main` named
  `a3a371c51fb0e460f5353add498871342b600975` (claude, 2026-10-23, stamped by `0ee3c4192`).
- The primary checkout held an **uncommitted** edit advancing that row to
  `3782929621adb9e5d477260ed45a0d11f862309f` (`codex-daily-commit-review`, 2026-10-24). **That
  stamp is honest and this run honours it.** Its report exists, untracked, at
  `/private/tmp/myk9-ncr-20261024/docs/qa/codex-daily-commit-review-2026-10-24.md` (worktree
  `codex/ncr-review-20261024`), and `git rev-list --count a3a371c51..378292962` returns **3** —
  exactly the three documentation commits (`0ee3c4192`, `3590ee292`, `378292962`) its coverage
  table enumerates. That is the ledger's discriminator for a real review (row + report + matching
  count), so re-reviewing that prefix would have produced the second opinion the prompt forbids.
  The Codex run itself adopted Claude's 104-commit failover coverage rather than re-reviewing it,
  and reviewed only those three docs commits fresh.
- **Window reviewed: `(378292962, afc542b6d]` — 24 commits, 114 changed paths, +4320/−351.**
  Baseline / verification SHA `afc542b6ddbbbac88ae1ed69af15af3a519b6564` (`2026-10-25T00:13:46Z`).
  No gap at either end of the window.
- Isolated worktree `/private/tmp/myk9-ccr-20261024`, detached at `afc542b6d`. No application
  edits survive it (two deliberate mutations were made and restored; `git status --porcelain` is
  empty). No PR, no merge, no deploy, no shared-fixture mutation, no payment action, no browser
  session. Database access was read-only (catalog, one `classes.section` value census).

### Evidence gaps carried forward (not product defects)

1. The 2026-10-20 to 2026-10-24 Codex reports all exist only as **untracked files** in
   `/private/tmp/myk9-ncr-2026102[0-4]`, and the stamp for the newest of them is an uncommitted
   edit. **MYK9-1343** owns this. This run may write only its own report and the boundary row, so
   it could not publish them; the stamp this run writes carries the cursor past all of them, so
   once those worktrees are pruned the Oct 20–24 Codex reports are lost exactly as Oct 18–19
   already are.
2. The primary checkout still holds that uncommitted `docs/qa/audit-boundary.md` edit, and it is
   now **two** runs stale: it aborts every `git pull` touching the file (the session's startup hook
   reported exactly that), and the primary checkout is 27 commits behind `origin/main` as a direct
   result. This run's push supersedes its content; the edit should be discarded with
   `git restore --staged --worktree docs/qa/audit-boundary.md` and the checkout pulled.
3. This workspace has no `p0`/`p1`/`p2`/`p3`/`source:claude`/`audit:commit-review` labels, so the
   task's label contract cannot be met literally. Canonical severity is stated in each issue body
   and `Claude` carries the source, matching MYK9-1377 / MYK9-552 / MYK9-355.

## P2 — filed

### MYK9-1402 / NCR-2026-10-24-01 — `main` is red at the reviewed tip from a flaky premium test

Canonical **P2**, source Medium, confidence **medium**. Status **new**, first/last seen 2026-10-24,
1 run. Affected role/workflow: none at runtime — a release-pipeline blocker.

CI run 40145876074 at `afc542b6d` failed on one test in shard `Test myK9Show (6/6)`:
`GeneratePremiumPanel — PDF error toast deduplication > fires twice for two distinct error messages
(null → err1 → err2)`, `expected "vi.fn()" to be called 1 times, but got 0 times`. Every other job
in the run is green (`Quality Checks`, `Build`, `Test packages`, `SQL tests`, `E2E PR Smoke`,
`A11y smoke`, both smoke jobs); the five sibling shards were `cancelled` by fail-fast, so that one
test is the whole of the red.

Nothing in this window touches `src/features/premium/`, so this is not a regression from the
reviewed commits — but a red tip blocks the **Deploy myK9Show** workflow, which builds the newest
`main` commit _with a green CI run_. This is the ledger's trap 2 exactly: every merged PR was
individually green and `main` is not.

**Reproduction attempted and failed**, which is a verification limit, not an acquittal: 5 plain
local runs green, and 3 under the LESSONS `timeout-class-flake` recipe
(`taskpolicy -b … --coverage --sequence.shuffle`) green as well — those three exited 1 on the
per-file coverage threshold, not on the test. The issue records the ordering hypothesis
(`errorController.step` is whichever `PDFDownloadLink` instance rendered last, driven against a
5 ms wall-clock `Harness` interval, inside a 1000 ms `waitFor`) and the closure proof required.

## P3 — filed

### MYK9-1403 / NCR-2026-10-24-02 — the publish gate's ordering test was deleted while its branch is still live

Canonical **P3**, source Low, confidence **high**. `afc542b6d` (MYK9-1387, #3262) greys out
"Publish Show" for an explicitly unauthorized club and removed two `ShowStatusPill.test.tsx` cases
that a click can no longer reach. One of them existed _because a prior review filed it_ (its
deleted comment still reads "Pair unauthorized with Stripe DISABLED so only a real 'authorization
wins' implementation can pass").

The greying is deliberately fail-open — `clubUnauthorized` is
`clubAuthQuery.data != null && clubAuthQuery.data.authorized_at === null`
(`ShowStatusPill.tsx:99`) — so a loading, errored or RLS-hidden club row leaves the item enabled
and `handleTransition`'s MYK9-572 ordering branch (`:143-157`, before the Stripe branch at
`:159-165`) is still reachable. The surviving test that reaches it runs under the describe's
`mockAccount(true)`, i.e. Stripe ready, so it cannot prove ordering either. Behaviour is unchanged
today; the loss is the pin.

## Rejected — corrected 2026-10-25

### MYK9-1404 / NCR-2026-10-24-03 — the `Mergeable with base` sweep passes when it cannot list PRs

**This finding was wrong. It is rejected and the issue is cancelled.** Codex's 2026-10-25 daily run
challenged it; I re-ran the fixtures and Codex is right.

What was filed: `77069227e` (#3248)'s step in `.github/workflows/merge-conflict-status.yml` runs
`set -uo pipefail` with **no `-e`**, so a failure of the first read
(`gh api --paginate .../pulls?state=open > prs.txt`, `:46-48`) would leave `prs.txt` empty, the loop
would never run, `post_failures` would stay 0, and the job would go green.

Why that is wrong: a GitHub Actions `run:` block does not execute under plain `bash`. The default
shell is `bash -e {0}`, so `errexit` is already on, and `set -uo pipefail` only _enables_ the
options it names — it never clears an inherited one. The workflow sets no `shell:`, no `defaults:`
and no `working-directory:`, so that default genuinely applies.

Measured, with the known-answer fixtures this finding's own closure contract demanded. The step body
was extracted verbatim and run against a stub `gh` that fails the `pulls?state=open` call:

```
D (control): does 'set -uo pipefail' clear an inherited -e?
   errexit STILL SET
A: listing FAILS, GHA default shell (bash -e file)  [expect non-zero]
   EXIT=1
B: listing SUCCEEDS with zero open PRs, GHA default shell  [expect 0]
   EXIT=0
C: listing FAILS, plain bash with no -e (the filed assumption)  [expect 0]
   EXIT=0
```

A is the real behaviour: the listing failure **does** fail the step. Both properties the finding
asked for already hold, and C — the silent pass — reproduces only under a shell the step never uses.
No code change is needed.

The transferable lesson: **a script's `set` line is not the whole option set.** Read the invoking
shell before concluding a guard fails open. The control flow was read correctly and the premise was
wrong, which is the failure mode a known-answer fixture catches and a careful read does not.

## Reviewed and cleared — the checks that could have gone the other way

Recorded because each one was a plausible defect that measurement rejected, and the next run should
not spend the budget again.

- **`57f4cde86` (MYK9-1354) show-timezone "today".** The migration claims its body was copied from
  the latest definition; `grep -l` over `supabase/migrations/` confirms `20260908134500` is indeed
  the newest prior definition (LESSONS `replace-function-latest`). The date comparison against
  `shows.start_date`/`end_date` is unchanged in shape from `current_date between …`. Client side,
  `getTrialsByShow` filters soft-deleted trials and sorts by date, matching the RPC's primary-trial
  rule, and `getTrialTimezone` validates and falls back to `America/New_York`, so
  `calendarDateInTimeZone`'s documented `RangeError` cannot escape. **Applied-database checks:**
  version `20261024163700` is present in `supabase_migrations.schema_migrations`,
  `get_account_today_entries_at` exists, and its live ACL is
  `postgres=X/postgres,service_role=X/postgres` — no `anon`, no `authenticated` — while the wrapper
  carries `authenticated=X/postgres`. The new behavioural SQL test **actually ran** in CI job
  121026975783 with 8 `PASS` notices including "get_account_today_entries_at is not
  client-callable" (memory: a registered SQL test has not run until its PASS notices appear).
- **`3870d2648` (MYK9-1384) un-pull clears `check_in_status`.** `REACTIVATING_STATUSES` is
  `{'confirmed','submitted'}` while the per-entry menu writes the _enum_ values `'accepted'` and
  `'pending'` — the apparent mismatch resolves through `mapStatusToDb` (ACCEPTED→`confirmed`,
  PENDING→`submitted`, WAITLIST→`submitted`), so all three reactivating menu targets are covered.
  Three unthreaded paths were traced and all are unreachable or out of scope:
  `bulkUpdateEntryStatus` (bulk never touches a scratched entry — `CLOSED_STATUSES` includes
  `SCRATCHED`), `writes.ts`'s `updateEntryStatusWithAudit` (no callers), and
  `acceptEntry`/`rejectEntry`/`pullEntry`/`transitionEntryLifecycle` (no callers outside
  `lifecycle.ts`). Dead exports, not a surviving branch of the original bug.
- **`af61c6fed` (MYK9-1375) the element clock stops being React state.** The one value-sensitive
  read, Save's element time, uses `getTimeMs()` not `time`
  (`UKCNoseworkLiveScoresheet.tsx:210`). `isStarted` compensates for the non-live `time` by also
  testing `isRunning` (`:221`). `useElementMaxTimeStatus` is fed `elementTimer.time`, which is
  exactly what the new `commitTime` publishes when the 30-second window opens, and its
  `remainingMs` is not rendered anywhere — the countdown ring reads the live clock through
  `StopwatchTime`. No frozen display, no frozen warning.
- **`5bc545b94` (MYK9-1385) Show Catalog names the A/B section.** This is a label rule derived from
  free-text columns, which LESSONS `label-rule-vs-real-columns` says must be measured against real
  values before shipping. Measured: `select section, count(*) from public.classes where deleted_at
is null` returns only `A` (92), `NULL` (59) and `B` (34) — no `'-'` sentinel, so
  `buildFullClassLabel` cannot render "Interior Novice -". The `buildMoveUpClassLabeler` extraction
  is verbatim, and the commit deliberately left the Show Map tree label alone.
- **`e12bf1c0e` (MYK9-1342) judge cards name the show and trial.** The new reads go to
  `replicatedShowsTable` and `replicatedTrialsTable` from an _account_ surface, which memory flags
  as the shape where show-scoped replicas are empty. Both tables are in the app-wide
  `REPLICATED_TABLES` list (`ReplicationSyncProvider.tsx:107-108`) and the trials adapter supports
  an unscoped sync (`if (scope.value)` guards), so the labels will be populated. Reads fail open.
- **`93d8256dd` (MYK9-1386) reports print the officials.** `get_show_officials` returns
  `so.person_id AS user_id` (read from the live `pg_proc` definition), so the hook's
  `people.in('id', personIds)` lookup is correct — not the `people.id ≠ auth.uid()` trap. The
  online-only read matches the documented `useUKCTrialReportContext` precedent and the UKC path is
  a verbatim extraction. `officialsLoading` is wired from `isLoading`, which is false for a
  disabled query, so the download button is not disabled when officials are not needed.
- **`840be6744` (MYK9-1382) wizard seeds the judge.** `allClassData[index]` is index-coupled to
  `classPayloads`, which is a plain 1:1 `.map` of `allClassData` one line above — aligned today.
  Noted as fragile (a future filter would mis-seed silently, and an id lookup would be safer) but
  not filed: it is correct as written.
- **`7dea29706` (MYK9-1383) refused delete links to where a show is cancelled.** Both surfaces that
  can open a show delete dialog pass the new `showStatus` context
  (`ShowManagementShell.tsx:332`, `ShowBulkActionsBar.tsx:283`), so the already-cancelled case
  cannot fall back to the loop. The added copy honours the refunds-are-never-automatic rule.
- **`ad75f21db` (MYK9-1391) badge text token.** The premise "`text-xs` is 14px in
  tailwind.config.js" was checked against the installed config rather than taken on trust:
  `fontSize.xs: ['0.875rem', …]` — 14px, the documented floor.
- **`227a9c006` (MYK9-1341) class start times.** `formatStartTime`'s time-only branch parses
  `1970-01-01T09:00:00` without a zone, i.e. as local wall time, so "09:00:00" renders as 9:00 AM
  with no shift.
- **`37f878d25`'s guard test** asserts the full `mergeNonConflictingServerFields` call-site list
  equals exactly the one wrapper, which fails loud on a third site — the good shape, not a
  comment-satisfies-grep scan. Its roots cover only `packages/replication/src` and
  `apps/myk9show/src`; noted, not filed.

## Counts and reconciliation

| Status         | Count |
| -------------- | ----: |
| New            |     2 |
| Unchanged      |     0 |
| Newly resolved |     2 |
| Duplicate      |     0 |
| Rejected       |     1 |
| Blocked        |     0 |

Corrected 2026-10-25: as filed this run reported 3 new and 0 rejected. MYK9-1404 was rejected the
next day, so the standing counts are 2 new and 1 rejected.

Canonical severity: **P0 0 / P1 0 / P2 1 / P3 1.** Classification: 1 test-reliability defect that
reds `main`, 1 test-coverage regression. No product defect found in the window.

Fixes found in subsequent commits: **2**, both from the previous run's own findings and both
verified by mutation rather than accepted from the diff —

- **MYK9-1378** (`37f878d25`, #3245): mutating `ReplicatedTable.dirtyRowComparePolicy()` to
  `return undefined` reddens `ReplicatedTable.keepLocalPolicy.test.ts` with the exact symptom the
  finding recorded (`judgeLastName: null` instead of `'Judge'`); restored, green.
- **MYK9-1379** (`b1d3418ec`, #3244): mutating the `.finally` back to
  `setHydratedShowId(forShow)` reddens `useAtShowShowHydration.test.ts` ("reports not-pending for
  the current show when an earlier show settles last"); restored, green.

Existing QA / Linear references consulted: MYK9-1343 (report retention), MYK9-1344 (the superseded
82-commit remainder), MYK9-1377 (the previous run's parent), MYK9-1378, MYK9-1379, MYK9-1387,
MYK9-572, MYK9-579. Deduplication searches ran with `includeArchived: true`; `docs/qa/findings.md`
was grepped for `GeneratePremiumPanel`, `ShowStatusPill`, `mergeable with base` and
`merge-conflict-status` with no hits. Prior flake issues MYK9-1316 / MYK9-1185 / MYK9-1051 /
MYK9-978 / MYK9-287 are all Done and none covers the premium file, so MYK9-1402 is not a duplicate.

Linear: created **4** (MYK9-1401 parent + MYK9-1402, MYK9-1403, MYK9-1404), commented on **2**
(MYK9-1378, MYK9-1379 closure proofs), closed/reopened **0**. **No Linear write failed.** On
2026-10-25 MYK9-1404 was **cancelled** as rejected and MYK9-1401's counts were corrected to match
this file.

## Checks run

| Check                                                                                          | Result                                                                                                                                                                               |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 46 touched app test files, in 4 chunks                                                         | 730 tests, all EXIT=0                                                                                                                                                                |
| `@myk9/replication` whole suite, `--sequence.shuffle`                                          | 75 files / 873 tests, EXIT=0                                                                                                                                                         |
| `@myk9/scoring-ui` whole suite, `--sequence.shuffle`                                           | 25 files / 274 tests, EXIT=0                                                                                                                                                         |
| MYK9-1378 mutation check                                                                       | red as predicted, then green restored                                                                                                                                                |
| MYK9-1379 mutation check                                                                       | red as predicted, then green restored                                                                                                                                                |
| `GeneratePremiumPanel.errorHandling` × 5 plain                                                 | green each time                                                                                                                                                                      |
| `GeneratePremiumPanel.errorHandling` × 3 under `taskpolicy -b … --coverage --sequence.shuffle` | tests green each time (EXIT=1 from the coverage threshold)                                                                                                                           |
| Applied-database reads                                                                         | migration `20261024163700` present; `get_account_today_entries_at` exists with no `anon`/`authenticated` EXECUTE; `get_show_officials` returns `person_id`; `classes.section` census |
| New behavioural SQL test                                                                       | ran in CI job 121026975783 with 8 `PASS` notices                                                                                                                                     |
| `main` CI at the baseline                                                                      | run 40145876074 **failure** — this run's P2                                                                                                                                          |

Typecheck and lint were not re-run locally: the baseline's own `Quality Checks` job is green in run
40145876074, which covers both, and nothing in this worktree was left modified.

## Verification limits

- The P2 flake does not reproduce on this Mac, including under the documented flake recipe. Its
  root cause is a reasoned hypothesis, not a measurement.
- No browser walk and no E2E run: this review is diff-and-test based. CI's own `E2E PR Smoke`,
  `A11y smoke` and both smoke jobs are green at the baseline.
- No Docker here, so the behavioural SQL test could not be re-run locally; the CI log's `PASS`
  notices are the evidence.
- The five `Test myK9Show` shards other than 6/6 were `cancelled` by fail-fast in the baseline run,
  so the baseline has no complete whole-suite pass of its own. The 46 touched files and both
  package suites were run here instead.
- The Oct 20–24 Codex reports could not be published by this run (writes limited to this report and
  the boundary row), so MYK9-1343's retention gap is carried, not closed.
