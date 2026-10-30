# Daily commit review — 2026-10-29

source: claude (`claude-daily-commit-review`, manual failover for the stream). **No confirmed
product defect.** Two P3 findings, both cleanup and reference accuracy. Review complete through
`20ada655217f735d8e5e3cdf867fdbd31b9efebf`. Application code unchanged by this run; the only repo
writes are this report and the `daily-commit-review` row in `docs/qa/audit-boundary.md`.

## Coverage

**Prior coverage was verified, not assumed.** The committed `daily-commit-review` row named
`542b6fa47972e01b29e93187d02c47672782a72c`, window end `2026-10-28T07:02:15Z`, run by
`codex-daily-commit-review` on 2026-10-28. That run's report is on `main` as
`docs/qa/codex-daily-commit-review-2026-10-28.md`, and it states its window as exclusive
`e1b2ddecd` through inclusive `542b6fa47` with a six-row coverage table.
`git rev-list --count e1b2ddecd..542b6fa47` returns exactly 6. The row is therefore a real
stamp (row + report + matching count), not a boundary-only stamp, so it was honoured rather than
re-reviewed. `e1b2ddecd` is itself the previous Claude stamp, so the two windows are contiguous.

- **Window reviewed:** exclusive `542b6fa47972e01b29e93187d02c47672782a72c` through inclusive
  `20ada655217f735d8e5e3cdf867fdbd31b9efebf` — **21 commits**, `2026-10-28T10:11:34Z` to
  `2026-10-29T02:34:54Z`.
- **Baseline SHA:** `20ada655217f735d8e5e3cdf867fdbd31b9efebf`.
- **No coverage gap.** This window starts at the commit the previous row stamped.
- **No 24-hour fallback** was needed; the row was not `unset`.
- `origin/main` was re-fetched after the review and had not moved, so the stamp is the tip
  actually reviewed.

Composition: 13 code-bearing commits, 7 of which carry a migration or a behavioural SQL test;
8 docs-only or test-only. Diff across the window: roughly +10,400 / −900 lines.

## Commit inventory

| Commit      | Subject                                                               | Review                                                                                                                                                                                                                                                                                                                                    |
| ----------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `40244ef85` | docs(qa): Codex daily commit review 2026-10-28 and cursor             | The prior stamp itself. Verified its range count against its coverage table (above).                                                                                                                                                                                                                                                      |
| `3b35efc15` | docs(user-guides): My Shows is one column (MYK9-1463)                 | Docs only.                                                                                                                                                                                                                                                                                                                                |
| `c2c0e11fe` | docs(plan): atomic class-judge pick, Option C                         | Plan doc; read as the design contract for the three MYK9-1327 batches below.                                                                                                                                                                                                                                                              |
| `4520f2f89` | docs: recapture stale user-guide screenshots (MYK9-1462)              | 24 image replacements, no prose or code change.                                                                                                                                                                                                                                                                                           |
| `3a3d9c532` | test(e2e): select-all 44px hit area on screen (MYK9-1464)             | Harness rewrite, read in full. It is well-formed: a centre known-answer control, an explicit `offscreen` sentinel, and the outside probe must be neither `offscreen` nor `nothing`, so a vacuous negative fails. Measures in one `evaluate` so nothing moves between measure and probe.                                                   |
| `25787b036` | feat(db): `set_class_judge` RPC, one atomic judge pick (batch 1)      | Read the function line by line. SECURITY INVOKER with the `judge_assignments` write policy restated as an explicit 42501; advisory xact lock per class; idempotent no-op; show-level rows untouched. See "Verified, not a defect" on the policy-vs-check asymmetry.                                                                       |
| `12e910bfc` | fix(db): an API session can no longer clear `clubs.created_by`        | Trigger copied from its latest definition; `auth.uid()` and `current_setting` resolve correctly under `search_path = ''`; service_role and direct postgres keep the supplied value, as INSERT already did.                                                                                                                                |
| `caacf4195` | ci(nightly-health): isolated stack; anonymous production probe        | Read the workflow and the probe job. `MYK9_ALLOW_PROD_E2E` is gone and the production job sets no fixture password and no Supabase env, so it signs nobody in — which is what the removal requires.                                                                                                                                       |
| `f04a2d38c` | test: pin the MYK9-1382 / MYK9-1384 symptoms through real consumers   | Tests only; both run green here.                                                                                                                                                                                                                                                                                                          |
| `5fab91238` | docs(security): audit 2026-10-17                                      | Docs only.                                                                                                                                                                                                                                                                                                                                |
| `39af241f5` | fix(replication): P0002/22023 are permanent (batch 2)                 | The test this commit added asserted the codes were permanent **globally**; batch 3 re-scoped them per RPC and updated that test in the same window. Confirmed the current `mutation-utils.test.ts` pins both halves, including "any error with no mutation given" staying retryable.                                                      |
| `e775bb1e8` | docs(review): record /code-review decisions in PLAYBOOK               | Docs only.                                                                                                                                                                                                                                                                                                                                |
| `f5f8100f0` | feat(classes): every class-judge pick is one RPC (batch 3)            | The largest client change. Read `classJudgePick.ts`, `ReplicatedClassesTable.setClassJudge`, `publishJudges.ts` and `reads.ts`. The discard-then-re-plan order closes the "dependsOn names a discarded pick" hole. One funnel remains (`upsertClassJudgeAssignment`). The set-then-queue gap is MYK9-1471, In Progress.                   |
| `a11fd13bb` | fix(qa): claude-review pins /code-review high (MYK9-1470)             | Guard script. `REVIEW_EFFORT` is pinned and validated, a failed `gh pr view` falls to the conservative branch, and `--post` on a non-`codex/` head exits 2 before posting. Its own test file runs green.                                                                                                                                  |
| `90db9aa1c` | feat(replication): skip the entries results view when nothing changed | Traced the whole skip decision. The probe's ten `EXISTS` arms match the view's ten `GREATEST` inputs one for one; the watermark is server-authoritative (`getRemoteUpdatedAt` present, empty fetch leaves it untouched), `since + bufferMs` reconstructs the raw watermark exactly, and the record happens only after rows are applied.   |
| `fcce8e8c1` | refactor(judges): delete the two-judge paths (MYK9-1466)              | Read the payments, `_shared` and scoring halves. `pickConfirmedAssignment`'s tie-break removal is sound because the partial unique index is applied. Produced `NCR-2026-10-29-01` and part of `-02`.                                                                                                                                      |
| `11a554af9` | fix(replication): transport failures spare the retry budget           | Read `mutation-retry.ts`, `uplink-probe.ts`, `isTransportError`, the runner hook and the `probeServer` wiring. Fail-safe in every direction: no probe, a throwing probe or a reachable server all spend the budget as before; backoff stays capped at `MAX_BACKOFF_MS`.                                                                   |
| `13b6ae21d` | perf(db): evaluate `is_show_exhibitor` once per query                 | Compared the hoisted `exhibitor_shows` CTE against the correlated `EXISTS` it replaces: same filters, and the three UNION ALL arms admit the same set (an entry with no dog row can only match its handler arm). Live `reloptions` is still `security_invoker=false`.                                                                     |
| `fe5ac3fac` | fix(db): permanent show delete only for unused shows (MYK9-1472)      | Read the 400-line function and the client change. The FK manifest is compared with `pg_constraint` in both directions and fails closed; the swept tables are locked from the manifest; `MK615` reaches the admin through a preserved `code`. Verified on the live DB that `authenticated` now holds `arw` on `public.shows` (no DELETE).  |
| `e12b9b7e1` | feat(reports): judge setup cheat sheet for UKC and AKC (MYK9-1078)    | New surface, ~2.2k lines. Reports are registry-gated (`registryId: 'UKC'` / `'AKC'`), the at-show route does not collide with the sibling class routes, print goes through an off-screen frame rather than `window.print()`, and a guard test checks every footer quote against the repo rulebooks. No em dashes in user-visible strings. |
| `20ada6552` | fix(roles): deleting a club deactivates its club roles (MYK9-1388)    | Read the migration and the app half. The guard's two-trigger split genuinely avoids the club→grant / grant→club lock inversion; restore is role-neutral and says so in the UI. The backfill's three affected grants were checked on the live DB (below).                                                                                  |

## Findings

### P0 — none

### P1 — none

### P2 — none

### P3

| ID                  | Status | Linear                                                        | Summary                                                                                                                                   |
| ------------------- | ------ | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `NCR-2026-10-29-01` | new    | [MYK9-1479](https://linear.app/myk9-platform/issue/MYK9-1479) | The `OfflineScoringService` tree is unreachable; nothing mounts either of its two consumers.                                              |
| `NCR-2026-10-29-02` | new    | [MYK9-1480](https://linear.app/myk9-platform/issue/MYK9-1480) | Three stale references: a unique index name that does not exist (2 files), and an applied migration still described as "not yet applied". |

Parent: [MYK9-1478](https://linear.app/myk9-platform/issue/MYK9-1478)
`Commit review 2026-10-29 — P2/P3 findings`. Both sub-issues carry the full evidence record
(problem, evidence, expected vs actual, impact, approach, acceptance criteria, required proof,
commits and files); it is not duplicated here.

`NCR-2026-10-29-01` is worth one sentence of context beyond the issue: `fcce8e8c1` deleted ~300
lines of multi-judge conflict handling inside that tree and its Codex round 1 added a real
behavioural fix there ("a new judge's score supersedes the previous judge's"). The fix is correct
for the code as written, and no user can reach it. That is the cost the finding names.

## Counts

| Bucket                            | Count |
| --------------------------------- | ----- |
| new                               | 2     |
| unchanged                         | 0     |
| resolved                          | 0     |
| duplicate                         | 0     |
| rejected                          | 0     |
| blocked                           | 0     |
| fixes found in subsequent commits | 1     |
| existing QA / Linear references   | 2     |
| Linear issues created             | 3     |

The fix found in a later commit is `39af241f5`'s global P0002/22023 rule, re-scoped per RPC by
`f5f8100f0` inside the same window — so it is not reported as a finding. The two existing
references are MYK9-1471 and MYK9-1474, both already filed and moving; neither was re-filed.

## Checks run

All in the isolated worktree `/private/tmp/myk9-ncr-20261029` at `20ada6552`, bootstrapped with
`scripts/bootstrap-worktree.sh`.

| Check                                                                                                                                                                                                                 | Result                       |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `packages/replication`: `mutation-retry`, `mutation-utils`, `uplink-probe`, `MutationManager.transportOutage`, `MutationManager`                                                                                      | 5 files / 189 tests passed   |
| app: `changedSince`, `setClassJudge`, `publishJudges`, `reads`, `classJudgeResolution`, `cartCapacityFromJudgeDays`, `cartCapacitySplit`, `DeletedEntitiesTab`, `ClubContextGate`, `showQueries`                      | 10 files / 144 tests passed  |
| app: `classJudgePick`, `permanentDeleteRefusal`, `deleteRestoreClubWarning`, `deleteRecords`, `SetupCheatSheetReport`, `AtShowSetupSheetPage`, `setupRules`, `setupNotes`                                             | 8 files / 86 tests passed    |
| app: `replicatedRunQueue.pullAccept`, `SecretaryCockpitSchedule.wizardJudge`, `features/at-show/__tests__`                                                                                                            | 4 files / 14 tests passed    |
| app: `ReplicationSyncProvider.scopedNudges`, `reportRegistry`, `OfflineScoringService`, `offline-scoring-serialization`, `productionFixtureGuard`, `appApiRequestTracker`                                             | 6 files / 124 tests passed   |
| root: `claude-review.test.ts`, `nightly-health-workflow.test.ts`, `run-behavioral-sql-tests.test.ts`                                                                                                                  | 3 files / 112 tests passed   |
| `CI` on `main` for every code-bearing window commit (GitHub Actions API, 3 pages)                                                                                                                                     | success on all 19 runs found |
| Live-database reads (read-only `execute_sql`): applied migration versions, `pg_class.relacl` on `public.shows`, `judge_assignments` policies and index, `pg_proc.proconfig`, `clubs` FK actions, orphaned club grants | all as the migrations state  |

**Named-file discipline.** Two batches came back with fewer files than arguments (8 of 10, 6 of 7)
because three paths were wrong — vitest silently drops a filter that matches nothing. Each missing
file was located and re-run; every file named above has its own result.

### Verification limits

A skipped check is a coverage gap, not a pass. Not run this time:

- No full app suite, no `pnpm typecheck`, no `pnpm lint`, no `pnpm qa:code-quality-ratchet`.
- No shuffled runs. This run added no tests, so the shuffle arithmetic in `/commit` does not apply
  to it, but it also means no order-dependence evidence for the ~1,600 lines of tests the window
  added.
- No Playwright, no e2e and no browser walk. `3a3d9c532`'s hit-area probe and `caacf4195`'s route
  sweeps were read, not executed; the 44px claim and the anonymous production probe are unverified
  by this run.
- No behavioural SQL tests. The four new ones (`myk9_1327_set_class_judge_test.sql`,
  `myk9_1327_one_judge_per_class_test.sql`, `myk9_1369_entry_results_changed_since_test.sql`,
  `myk9_1472_hard_delete_show_money_guards_test.sql`) and the two new concurrency harnesses run
  only in CI — there is no container runtime on this Mac. Registering one is not running it.
- No write to the live database, and no `hard_delete_show` or `set_class_judge` execution. The
  refusal paths in `fe5ac3fac` are read and reasoned about, not exercised.
- `20261029041300` (MYK9-1388) is not applied, so nothing in this run could exercise the
  club-delete trigger, its guard or its backfill against the real database.
- The AKC and UKC setup-sheet content is rulebook data. The repo's own quote-guard test is the
  evidence; this run did not check the rulebooks independently, and the printed page was not
  rendered.

## Verified, not a defect (do not re-file)

- **`set_class_judge`'s explicit authorization check is not weaker than the policy it restates.**
  The check calls `is_show_office_manager(v_show_id)` with the show derived from
  `classes → trials.show_id`, while `judge_assignments_delete` / `_insert` evaluate
  `is_show_office_manager(judge_assignments.show_id)` — the row's own column. A row whose
  `show_id` disagreed with its class's trial's show would make the INVOKER `DELETE` filter
  silently and the follow-up `INSERT` collide with the new unique index (23505, which
  `isRetryableError` treats as permanent, so the pick would dead-letter). There are no such rows:
  `judge_assignments ja JOIN classes JOIN trials WHERE ja.class_id IS NOT NULL AND ja.show_id IS
DISTINCT FROM t.show_id` returns 0 on the live database, and the `INSERT` writes the derived
  `show_id`, so new rows cannot create one.
- **`hard_delete_show`'s `DROP POLICY shows_delete` + `REVOKE DELETE` does not break the cascade
  from a club.** `shows_club_id_fkey` is `RESTRICT`, and referential actions run with the
  referencing table's owner privileges regardless, so no app path loses a delete it had.
  `authenticated` is now `arw` on `public.shows` on the live database, as intended.
- **Club hard-delete cannot turn a club-scoped grant into a global one.** `user_roles_club_id_fkey`
  is `ON DELETE CASCADE` (not `SET NULL`), so the grants go with the club rather than becoming
  `club_id IS NULL` platform grants.
- **MYK9-1388's backfill does not disturb an e2e fixture.** The three `is_active` club_admin grants
  it will clear all belong to `secretary@myk9t.com` on three already-deleted throwaway clubs
  ("Actions walk … (test, delete me) CLUB", "ZZ Test Club (MYK9-909)", "ZZ Test Club 2
  (MYK9-905)"). The club-admin e2e fixture is `clubadmin@myk9t.com`, whose grant comes from a live
  club, and `supabase/seed-demo.sql` resets its clubs' `deleted_at` to `NULL` rather than inserting
  deleted ones — so neither the seed nor the specs depend on what the backfill switches off.
- **The entries changed-since skip is not account-leaky.** `lastViewRead` is a module-level map
  keyed by show id only, not by account, but `syncReplicatedTable`'s `scopeNotStampedByMe` forces a
  full sync after an account change, and a full sync both sends no probe and records nothing. A
  later incremental pass can only skip when the probe says nothing moved for _that_ caller, in
  which case its own delta is empty too.
- **A newly assigned judge is not locked out of scoring offline.** `f5f8100f0` stopped writing
  `judge_assignments` locally, so the device's assignment replica names the old judge until the
  pick uploads. `useJudgeAssignedToClass` resolves `assigned` on a cold cache, a failed sync or a
  read error, so the pre-flight gate fails open and the offline judge can still score. The class
  row's own judge fields — which is what the UI renders — are written by the pick immediately.
- **The transport-retry path handles Safari.** `isTransportError`'s `TypeError` branch requires
  `message.includes('fetch')`, which Safari's `TypeError: Load failed` does not satisfy; but
  postgrest-js wraps the rejection as a plain object whose `message` is `"TypeError: Load failed"`,
  which the `POSTGREST_TRANSPORT_MESSAGE` branch matches. And `isRetryableError` is fail-open by
  default, so even an unmatched shape keeps retrying rather than dead-lettering.
- **`createDatabaseError` preserves the `code`,** so `hard_delete_show`'s `MK615` reaches
  `permanentDeleteRefusalMessage` and the admin sees the server's own sentence instead of "please
  try again". `hardDeleteShow`'s return shrank from `{ id, name }` to `{ id }`; neither consumer
  (`useHardDeleteShowMutation`, `deletedEntityConfig`) reads `name`.
- **`useWaitListMutations.reassignClass` was already dead** when `f5f8100f0` removed it — a grep
  over `apps/myk9show/src` finds no consumer, so no reassign capability was taken away.

## Observations, not findings

- **A merge is not a deploy.** Six of the window's seven migrations are applied to
  `sojmvhhwsjxmfistvzbe`; `20261029041300_myk9_1388_club_delete_deactivates_club_roles.sql` is not.
  The frontend half of every commit here also waits on the next **Deploy myK9Show** run. Both are
  the documented posture, recorded so the next run does not read the gap as drift.
- **MYK9-1327 and MYK9-1388 each hit three or more Codex convergence stops** inside this window,
  and in each case the response was the owner-approved restructure (delete the overlay; delete the
  restore half; delete the parked-keeps-dirty rule) rather than another patch. That matches the
  convergence rule, and it is why the surviving code reads as small.

## Boundary

`docs/qa/audit-boundary.md`, row `daily-commit-review`, stamped
`20ada655217f735d8e5e3cdf867fdbd31b9efebf`, window end `2026-10-29T02:34:54Z`, run by
`claude-daily-commit-review` on 2026-10-29.
