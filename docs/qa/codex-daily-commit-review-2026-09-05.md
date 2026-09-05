# Codex daily commit review — 2026-09-05

> **Status:** Reference — point-in-time evidence. Linear owns execution and closure.

Reviewed all 31 commits after `589b06fcaba3510e8a41316ac7c36e888fe4323e` through
`a25d9967139d1499d657af25d8947e41269dd063`. Four confirmed findings remain, plus three
existing proof gates. Two historical findings now have passing focused closure evidence.
No application code changed.

## Window and method

- Stream: `daily-commit-review`; prior row was stamped by Claude failover, not private Codex memory.
- Start SHA (exclusive): `589b06fcaba3510e8a41316ac7c36e888fe4323e`.
- Baseline / reviewed tip (inclusive): `a25d9967139d1499d657af25d8947e41269dd063`.
- Continuous window: **2026-09-04T12:20:00Z → 2026-09-05T10:14:50Z**.
- **No coverage gap.** The first descendant landed at 12:33:28Z; those 13m28s were idle time
  before the next commit, not an omitted SHA range. No previous-24-hour fallback was used.
- Remote `main` was verified equal to the local tip with `git ls-remote`; the primary checkout
  was clean. Verification used detached worktree `/private/tmp/myk9-ncr-20260905`.
- Read AGENTS.md, role intent, launch scorecard, prior memory, shared findings, prior failover
  report and current implementations. Reviewed diffs, callers, schemas, tests and later commits.
- Linear deduplication included archived issues, workflow/file/symptom searches, a paginated team
  inventory, exact canonical issue reads and closure comments. No new issue duplicates existing work.
- The task is review-only; OPSX implementation/ship phases were not applicable.

## Counts

| Lifecycle status | Count | Meaning |
| --- | ---: | --- |
| New | 0 | No new underlying finding identity; reused existing QA/Linear IDs |
| Unchanged | 4 | MYK9-381, MYK9-405, MYK9-358, MYK9-406; residual evidence reconfirmed |
| Resolved | 2 | MYK9-348 and NCR-2026-09-04-01, with focused proof |
| Duplicate | 0 | Candidates reconciled before filing; no duplicate records created |
| Rejected | 0 | No additional candidate promoted to a finding |
| Blocked | 3 | MYK9-294, MYK9-356, MYK9-289 await specific closure proof |

**Linear writes:** created **MYK9-405** and **MYK9-406** from still-actionable unfiled failover
findings; updated **MYK9-381, MYK9-358, MYK9-356, MYK9-294, MYK9-289**. The first four updated
records were reopened; MYK9-289 remains In Review. No issues closed, no PR created, no app fix,
no payment, no database mutation or deployment performed. All reported records are `source: codex`;
original source labels and historical scope are preserved.

## P0

None confirmed in this review scope. This is not a claim that the broader security backlog is empty.
The separate current security audit already tracks its findings in MYK9-398–404.

## P1

### MYK9-294 — blocked: checkout needs post-deployment proof

[Linear MYK9-294](https://linear.app/myk9-platform/issue/MYK9-294)

- Classification: existing product confirmation defect; deployment/payment verification gate.
  Source High; first seen 2026-09-01, last reviewed 2026-09-05; owner Richard Beezley.
- `apps/myk9show/src/lib/stripe.ts:113-134`: #2036 preserves the literal session-id token and
  encodes real split values. The focused Stripe tests pass.
- The latest recorded payment replay (03:10 UTC) still used the old bundle. **That deployment
  blocker is now historical:** GitHub shows app deployment success at the reviewed SHA, created
  at 08:41:36 UTC. No later successful sandbox payment replay is recorded.
- The issue was Done despite its post-merge comment saying it would remain In Progress. Reopened
  to In Review, keeping the owner. Confidence high on source fix and missing recorded replay;
  this audit did not attempt a payment.
- Closure: current deployed app returns `session_id=cs_test_…` from a sandbox checkout and reaches
  “Entry Submitted Successfully!” without manual correction. Original lookup-RPC proof is distinct.

### MYK9-348 — resolved: cache clear preserves the outbox and coordinates writers

[Linear MYK9-348](https://linear.app/myk9-platform/issue/MYK9-348)

- Source High; first seen 2026-09-02, last verified 2026-09-05; owner Richard Beezley.
- #2016 adds browser shared/exclusive locks and retains write slots across local-write/queue
  pairs. `DataSettings.tsx:31-38,76-115` clears an explicit disposable list and never deletes
  `myK9_Replication`. Unsupported Web Locks fail closed.
- Passing proof: DataSettings pending-count/preserve-database/recheck assertions, cache gate
  writer-drain/exclusive-lock tests, and ReplicatedTable retained-slot/concurrent-write tests.
  This supports closure of the recorded destructive outbox race, not an unperformed hardware replay.
- Linear was already Done and was not closed again. Reopen only with new reproducible queue loss.

### NCR-2026-09-04-01 — resolved: package coverage regression and PR gate hole

- Classification CI/test harness; source High, canonical P1 from the prior report; first/last
  seen 2026-09-04/2026-09-05; owner repository CI maintainers.
- #2015 restores core coverage; #2017 enforces package coverage on PRs as well as pushes.
- This run: **308 core tests pass**, coverage **99.41% statements / 93.18% branches /
  100% functions / 100% lines**, clearing the actual thresholds. CI coverage-gate contract passes.
- No issue filed for resolved historical work. The prior claim that this stopped staging
  promotion was retracted by the earlier reviewer; this report does not revive it.

## P2

### MYK9-381 — unchanged/reopened: canonical results are dropped when local entries exist

[Linear MYK9-381](https://linear.app/myk9-platform/issue/MYK9-381)

- Classification product result-projection defect; source High, **residual P2** because dog career
  remains an alternate read. First/last seen 2026-09-04/2026-09-05; 2 observations; owner Richard Beezley.
- Exact source: `apps/myk9show/src/hooks/useShowEntriesForUser.ts:145-164,194-210,298-306,387-415`.
  #2031 now builds canonical `competitionData`, then `mergeCanonicalEntry` discards it whenever
  `stored` exists: the returned object spreads stored and replaces only lifecycle/check-in/
  registration/updatedAt. Its downstream row reads the retained stored result.
- Deterministic actual-function proof: **2/2 expected-behavior assertions fail**. An unscored
  stored row plus canonical Q/38.50s gives undefined; a stored Q plus a canonically withheld
  result retains Q/38.50s. The existing normalization and hook suites still pass.
- Expected: authoritative results, including absence/withholding, survive the merge. Observed:
  Awaiting results or stale Q/time can persist. Confidence high for merge behavior; no new
  server authorization bypass or measured browser prevalence is claimed.
- No later reviewed commit fixes this. Reopened the canonical issue, preserving judge-mapping
  and empty-store improvements. Closure requires mutation-sensitive merge + rendered hook proof
  with an existing stored row and the issue's named exhibitor browser replay, not generic E2E smoke.

### NCR-2026-09-04-02 → MYK9-405 — unchanged, now filed: migration guard residuals

[Linear MYK9-405](https://linear.app/myk9-platform/issue/MYK9-405)

- Classification CI/test harness; original source High/historical P1; **residual canonical P2**.
  First/last seen 2026-09-04/2026-09-05; 2 observations; ownership gap: CI maintainer unassigned.
- #2016 fixed the current-branch self-collision. `scripts/qa/migration-version-guard.ts:26-39,98-113`
  still rejects other inherited copies and every deployed version, including legitimate reruns.
- Actual `runGuard` proof with only process seams stubbed: **2/2 assertions fail**. An inherited
  branch at another SHA is reported as a collision; deployed current-main count=1 is rejected.
  Existing helper tests pass. No live DB or scratch PR was used.
- Expected: harmless existing-migration header edits and deployed reruns pass; truly different
  unmerged claims fail. High confidence in deterministic logic, not a claim all new migrations fail.
- Reconciled related MYK9-340's completed migration-order incident separately. Full contract now
  in MYK9-405: history-aware checks plus positive/negative executable and CI proof.

### MYK9-356 — blocked: source parity fixed, lifecycle-absent SQL proof missing

[Linear MYK9-356](https://linear.app/myk9-platform/issue/MYK9-356)

- Classification concrete verification prerequisite, not a confirmed remaining source defect.
  Source Medium; first/last seen 2026-09-03/2026-09-05; 3 daily observations; owner Richard Beezley.
- #2016's `supabase/migrations/20260904160000_exclude_absent_entries_from_class_rollup.sql:28-43`
  aligns all four current functions with the client. Existing source contracts pass.
- `supabase/tests/class_status_auto_derivation_test.sql:184-191` tests **result_status** absent,
  not **entry_status** absent. `classPlacementContract.test.ts:188-192` is only a text assertion.
  No focused lifecycle-absent SQL mutation proof or applied definition check is recorded.
- Reopened Todo as owner of that proof gate. Its earlier AC described the alternative client-side
  fix; the issue now explicitly records the merged server-side contract so that stale prose does
  not cause another reversal.
- Closure: disposable class with scored qualifier + unscored lifecycle-absent row; prove completion,
  placement, TV count/client parity; remove the SQL exclusion and see that test fail; restore and
  pass; record applied definition/version verification or retain an explicitly owned deployment gate.

### NCR-2026-09-04-04 → MYK9-289 — blocked: post-fix Nightly integration pending

[Linear MYK9-289](https://linear.app/myk9-platform/issue/MYK9-289)

- Classification harness; source Medium, canonical P2. Mechanism first seen 2026-09-04, last
  reviewed 2026-09-05; 2 mechanism observations; owner Richard Beezley. Registry stays in-progress.
- #2018 resets pending requests and last-activity time before each route. Focused tracker tests pass.
- Latest available Nightly run is still pre-fix **33865556960** at `589b06fc`; no post-fix Nightly
  evidence exists yet. Keep In Review; existing one-time follow-up owns the next scheduled check.
- Closure: inspect route-level attribution on a post-fix Nightly run; no cascade from a prior route.
  Do not infer closure from generic CI or raise the timeout to hide an originating slow request.

## P3

### MYK9-358 — unchanged/reopened: claimed header correction never landed

[Linear MYK9-358](https://linear.app/myk9-platform/issue/MYK9-358)

- Documentation/auditability defect; source Low; first/last seen 2026-09-03/2026-09-05;
  3 daily observations; owner Richard Beezley.
- `supabase/migrations/20260902180000_fix_judge_qualification_authorization.sql:1-2` still claims
  an earlier role-name consolidation fix. Both complete SQL bodies after their two-line headers
  compare byte-identical. #2016's PR body claims this correction but its diff does not contain it.
- Confidence high. Reopened Todo. Closure: accurate no-op re-emit header, unchanged SQL body and
  read-only migration inventory; do not alter applied SQL or reopen later authorization fixes.

### NCR-2026-09-04-03 → MYK9-406 — unchanged, now filed: missing plan lifecycle/index metadata

[Linear MYK9-406](https://linear.app/myk9-platform/issue/MYK9-406)

- Documentation maintenance / CI coverage gap; source Low. First/last seen 2026-09-04/2026-09-05;
  2 observations; ownership gap: documentation/CI maintainer unassigned.
- The named `docs/plan-myk9-354-qualification-contract.md:1`, `docs/plan-myk9-366.md:1`, and
  `docs/plan-myk9-369.md:1` still lack both the required status marker and README index reference.
  Current inventory: **24 of 77** top-level plans lack the marker (supersedes prior 22/78 count).
- The existing strict doc checker covers route/guide changes, not these metadata rules.
  Confidence high; impacts agent/developer reconciliation, not runtime behavior.
- Closure: reconcile actual plan states, backfill/index or archive as appropriate, add CI metadata
  coverage with red/green missing-marker and missing-index proofs. Full contract is in Linear.

## Verification and limits

- **770 existing tests passed in 42 files**: 148 app tests (11 files), 225 app tests (14),
  19 CI/migration helper tests (3), 70 replication tests (1), 308 core coverage tests (13).
- **4 additional audit assertions failed as expected**, reproducing MYK9-381 and MYK9-405.
  These were temporary TypeScript test probes; production implementation was not edited.
- App `tsc --noEmit -p tsconfig.app.json` passed. E2E map check covers 125 specs and agrees with
  CI config. Strict doc staleness command passed but is not plan-metadata verification.
- Range `git diff --check` passed. Final Markdown checks run before publishing this report.
- Current tip CI run **33955927863**: Quality, package tests, SQL, all three app shards, coverage
  gate, Test and Build succeeded. Informational full coverage was cancelled; smoke build/E2E/A11y
  skipped on this docs tip. This is not a failed product test. Prior executable tip `e8a410f6e`
  CI **33942494439** succeeded.
- No full local app suite, browser/E2E re-walk, live Supabase SQL, deployment, payment, load or
  physical-device test was performed. Existing dependency directories were reused read-only for
  focused worktree runs; the directly tested package sources were at the reviewed tip.
- Supabase tools were unavailable for applied-definition proof. No blanket “safe to merge” claim
  substitutes for the named outstanding proof gates.

## Commit coverage

All commits below were reviewed; the documentation stamp/report commit produced by this run will
naturally be a descendant for the next reviewer.

| SHA | Subject |
| --- | --- |
| dc9c899da | docs(qa): claude daily commit review 2026-09-04 |
| 6d7a2db9a | fix(core): restore packages/core coverage above threshold, unblocking main (#2015) |
| f7876cd6a | ci: enforce package coverage thresholds on pull requests (#2017) |
| 68a0bd813 | fix(qa): reset the route-health request tracker between routes (#2018) |
| ad060903c | fix(payments): recover historical payment provenance (#2019) |
| a5d8af4cf | fix(quality): close residual Linear findings (#2016) |
| 791abef73 | ci(deploy): gate staging promotion on CI's jobs, not its rollup conclusion (#2020) |
| 80465c3a4 | docs(qa): retract the staging-promotion impact claim from the 2026-09-04 review |
| 1265654fb | docs(qa): record the Nightly Health harness defect as NCR-2026-09-04-04 |
| cc410fe8c | docs(qa): queue the unfiled Linear corrections instead of losing them |
| caddbd636 | fix(auth): reconcile app permission vocabulary (#2021) |
| c7cf4fc6a | docs(qa): bug audit scope walk — components (non-show-ops), week 36 third pass |
| 42e52143a | docs(qa): apply the queued Linear writes — MYK9-373..377 filed, MYK9-289 reopened |
| afd642a37 | chore(show): remove orphaned dead components (#2024) |
| 2213504bf | fix(judges): preserve qualification calendar dates (#2023) |
| b86fd6a88 | fix(admin): remove fabricated sync monitoring dashboard (#2022) |
| d4f841f01 | fix(secretary): enable class override tabs (#2026) |
| 44c6c153d | fix(admin): resolve component audit findings (#2025) |
| 1d3d21a94 | docs(audits): exhibitor task walk 2026-09-04 |
| 98f4ce668 | fix(ringside): give exhibitors an upcoming-show path and volunteers a passcode path (#2028) |
| c98ad84d3 | fix(titles): seed the AKC Scent Work prerequisite chain (MYK9-378) (#2027) |
| cb4b06fac | fix(shows): accept deterministic UUID-shaped ids (#2029) |
| 6d7dc9057 | fix(exhibitor): clarify pulled check-in status (#2030) |
| 94c99a358 | fix(exhibitor): show released results and judges (#2031) |
| 257b0e321 | fix(payments): remove past-show entry cart actions (#2033) |
| 36ba17858 | fix(seed): make one load club payable so the exhibitor walk can reach checkout (#2032) |
| 2e7116609 | docs(audits): complete the exhibitor payment walk (task 3) |
| 27856c4a5 | fix(exhibitor): three exhibitor-surface defects — calendar dates, dog-card copy, entry counts (MYK9-384/385/387) (#2037) |
| 696235319 | fix(checkout): send Stripe the literal session-id token (MYK9-294) (#2036) |
| e8a410f6e | fix(dates): sweep the date-fns calendar-date family (MYK9-384 follow-up) (#2039) |
| a25d99671 | docs(security): full-surface security audit 2026-09-05 |
