# Daily commit review — 2026-10-16

source: codex. **Partial review: 11 contiguous commits completed; 102 remain.** Two actionable product findings were confirmed: one new residual under MYK9-1212 and one previously unfiled display defect now MYK9-1225. No application code changed.

## Boundary and coverage

- Shared primary cursor read first: `15a52455eced03c95fea864b1e31ca1d977db9a2`, window end `2026-10-13T16:33:12Z`, stamped by Codex October 15. Automation memory agreed. No initial temporal coverage gap and no 24-hour fallback.
- Current-main verification baseline: fetched `c2f831e0763f708c7bca4cf5e20c78f6cdf630b8`; 113 commits after the cursor. Primary checkout remained at `5347069ab`; its preexisting audit-document changes were preserved.
- Completed contiguous window: `(15a52455e, edc7a69168a7a8358375814d07c683af7c5e6416]`, ending `2026-10-13T22:39:55Z`; 11 commits / 91 changed files. Stamp only this endpoint, `codex-daily-commit-review`, run date October 16.
- **Uncovered remainder:** `(edc7a6916, c2f831e07]`, 102 commits. This is unfinished source coverage, not a test/environment blocker. Resume from the shared cursor, not the newer verification baseline. MYK9-1196 owns the outstanding review prerequisite.
- Separate migration review covered all ten changed migrations and fourteen changed SQL tests through the baseline. Later registration/replication and email implementations were inspected for reconciliation. Those targeted reads do not establish full coverage of their surrounding commits.

Completed inventory:

| Commit    | Change                                       |
| --------- | -------------------------------------------- |
| 1f0545d8f | #2958 secretary person editing permissions   |
| 82dc329ce | #2959 Quick Create phone layout              |
| 835a4f60e | #2960 wizard pinned chrome/focus             |
| f82b0e531 | #2961 queued registration add/delete         |
| 198ee46e7 | #2962 registration return focus              |
| a0015b5eb | Landing lifecycle plan                       |
| 4afa09f55 | Offline record plan archive                  |
| 9aaeea14f | #2964 squash merge-base lesson               |
| 864a03e76 | Landing plan additions                       |
| c42b2f201 | #2965 reset clean-row test flag              |
| edc7a6916 | #2966 optimistic offline registration delete |

## Lifecycle counts and Linear writes

Exclusive counts: **new 2, unchanged 1, resolved 6, duplicate 0, rejected 0, blocked 3**. New includes a newly confirmed residual in an existing issue and reconciliation of a historical unfiled defect. Resolved means newly reconciled this run, not issues closed by this automation. No new P0/P1 defect was confirmed.

Created [MYK9-1225](https://linear.app/myk9-platform/issue/MYK9-1225). Updated [MYK9-1212](https://linear.app/myk9-platform/issue/MYK9-1212), [MYK9-1196](https://linear.app/myk9-platform/issue/MYK9-1196), and [MYK9-834](https://linear.app/myk9-platform/issue/MYK9-834). No issue state changed or issue closed. Every actionable finding has a canonical Linear contract; archived-inclusive searches and exact candidate reads preceded filing. No findings remain report-only awaiting approval.

All entries below are source: codex, reconciled at baseline `c2f831e0763f708c7bca4cf5e20c78f6cdf630b8`, last seen October 16. Historical proof is explicitly distinguished from freshly executed checks.

## P0

**MYK9-1128 — resolved exposure; source High; first seen October 13; owner Richard.** The October 13 owner confirmation records password rotation, 369 leaking artifacts deleted, a real HTML-report red-first regression, and clean real-CI artifact verification after #2945 / `fe57ce773`. Resolution rests on recorded operational proof plus owner rotation confirmation, not the code merge. Replacement-password CI sign-in was not checked in that comment and was not independently revalidated here; no present authentication failure is alleged. No credential values or leaking artifacts were retrieved. [Canonical evidence](https://linear.app/myk9-platform/issue/MYK9-1128).

## P2

**MYK9-1212 — new residual product/concurrency defect; source Medium; first seen October 16; owner Richard; high confidence.** A recovered failed/stale-ready registration reminder is sent without a fresh in-flight lease. If the owner's address changes while its provider call is pending, a second request supersedes it and sends a replacement with a different provider key. Both sends complete. Expected: an active recovery cannot be mistaken for an abandoned send; crash recovery and serial changed-address replacement must still work.

[Migration at baseline](https://github.com/rbeezley/myk9-platform/blob/c2f831e0763f708c7bca4cf5e20c78f6cdf630b8/supabase/migrations/20261016003900_myk9_1212_claim_registration_number_needed_job.sql#L265): recovery lines 265–268 and own-job replay 218–219 leave status/age unchanged; freshness guard 247–259 then permits supersession at 271–274. [Actual handler](https://github.com/rbeezley/myk9-platform/blob/c2f831e0763f708c7bca4cf5e20c78f6cdf630b8/supabase/functions/send-lifecycle-email/lifecycle-email-handler.ts#L540) fetches at 540–549 and sends at 617–631. Introduced by #3062 / `e4f66d318`; no later fix at baseline.

Fresh diagnostic imports the actual handler and repository stateful Supabase/claim fixtures, pauses the provider, changes the synthetic owner address, dispatches the second request, then releases the first. Output: first job still `failed`; replacement returns `sent` before first finishes; first then returns `sent, recovered:true`. Two addresses and distinct provider keys are recorded. Command `node --experimental-transform-types .logs/recovered-email-race.ts`, exit 0 confirming reproduction. This is handler execution with the repository's SQL decision-table model, not real concurrent PostgreSQL proof. No emails were sent.

Impact: duplicate held-entry reminders, including an obsolete address of the same owner; no cross-owner disclosure or production incident asserted. Reused [MYK9-1212](https://linear.app/myk9-platform/issue/MYK9-1212), preserving historical serial retry fixes and pending edge deployment. Next action follows convergence stop: reassess claim/send lease design before patching branches. Closure requires red-to-green handler barrier cases for failed/stale-ready recovery, real SQL lease/replacement/crash-recovery proof, preserved request ties/idempotency, and separately authorized delivery gates. Deployment alone is insufficient.

**MYK9-1196 — unchanged verification prerequisite; source Medium; first seen October 15; owner Richard.** Earlier RUN-only silence is not a confirmed hang. The October 16 diagnostic completed supported app/replication selections and attributed quiet output to buffering; this run also completed all selected tests. Remaining closure criterion is source-review coverage, including the 102 commits above. No harness bug or continuing environment blocker is asserted. [Canonical contract and this run's commands](https://linear.app/myk9-platform/issue/MYK9-1196).

**MYK9-834 — audit proof blocked; source Medium; first seen September 26; owner Richard.** Linear is Done following the owner's “Completed…” comment; preserved. Historical real session/store controls and implementation proof stand. The later explicit refocus → offline expired-token reload → local score → reconnect-upload rehearsal is not evidenced in available comments. Batch2 proof explicitly excludes cold boot/passcode adoption. Next action is to link completed evidence or record the owner's explicit acceptance/replacement of that gate. No recurrence or broken current behavior alleged; no new implementation issue created. [Canonical reconciliation](https://linear.app/myk9-platform/issue/MYK9-834).

**MYK9-1011 — blocked verification prerequisite; source Medium; first seen October 4; owner Richard.** Statistics/editor/AskQ code fixes and deployment remain established. Outstanding proof: browser DQ/reason persist/reload and chart, live AskQ known-DQ filter, authoritative AKC electronic DQ mapping plus generated fixture. No new wrong-export hypothesis or production writes. Closure must meet that existing exact contract. [Canonical evidence](https://linear.app/myk9-platform/issue/MYK9-1011).

**MYK9-639 — blocked verification prerequisite; current source Medium, historical money defect High; first seen September 17; owner Richard.** Deployed implementation and unit proof stand. Controlled Stripe TEST one-/two-hop replays through both callers, exactly-once root payment, no unintended refund, matching financial surfaces and negative controls remain owner-gated. No current money defect reproduced; no payment operation performed. [Canonical closure contract](https://linear.app/myk9-platform/issue/MYK9-639).

Newly resolved P2 items, all owner Richard, high confidence in the recorded criterion-specific evidence:

| Canonical ID                                                  | First seen / source label | Proof supporting resolution                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [MYK9-1111](https://linear.app/myk9-platform/issue/MYK9-1111) | Oct12 / Medium            | Oct13 signed-in secretary walkthrough: Quick Create and Exhibitor Only reuse original person, zero POST, database count remains one; online/offline dependency tests. Fresh prefix tests also pass.                                                                                                             |
| [MYK9-1112](https://linear.app/myk9-platform/issue/MYK9-1112) | Oct12 / Medium            | Oct13 live #2958 RPC200 same person ID/version2; dog same-ID edit proof, cancel/failure selection tests and no duplicate creation. Fresh host tests pass.                                                                                                                                                       |
| [MYK9-1116](https://linear.app/myk9-platform/issue/MYK9-1116) | Oct12 / Medium            | #2962 red-first focus regressions; recorded onboarding walks at 320/375/768/1440 with Back/Escape focus and single panel, plus prior host matrix. Fresh focus tests pass.                                                                                                                                       |
| [MYK9-1129](https://linear.app/myk9-platform/issue/MYK9-1129) | Oct13 / Medium            | #2961 deletion fence and #2979 rail/section fallback/coalesced refresh; recorded rendered offline/reconnect proof, mutation checks and 204-file/2001-test runs. Fresh registration race/read controls pass. Sibling-loss scope is separate MYK9-1151, subsequently fixed by #3046.                              |
| [MYK9-992](https://linear.app/myk9-platform/issue/MYK9-992)   | Oct4 / Medium             | Owner explicitly substituted isolated Chromium proof for deployed fixture gate. Run38815521555 at source58ae5c5fc passed actual null/gapped31/101 and terminal-state secretary/judge/cold-exhibitor comparisons with SQL/IndexedDB readback and cleanup; #3049 merged. No fresh browser execution claimed here. |

## P3

**QA-TIME-DISPLAY-001 / MYK9-1225 — new tracking of a historical product-display defect; source Low / historical Claude P3; first seen October 15; owner unassigned; high confidence.** [SecretaryRunSheet/types.ts:33–37](https://github.com/rbeezley/myk9-platform/blob/c2f831e0763f708c7bca4cf5e20c78f6cdf630b8/apps/myk9show/src/pages/ClassDetailsPage/SecretaryRunSheet/types.ts#L33) truncates a binary fractional value: `formatSearchTime(61.23)` returns `1:01.22`, expected `1:01.23`. Actual consumer is `buildRunSheetEntries.ts:73`.

Fresh import of the actual formatter reproduced the mismatch; controls 60→1:00.00, 61.25→1:01.25 and 59.99→0:59.99 passed. Diagnostic exits 1 because the target assertion fails, not because of a runner fault. Historical isolated browser run38815521555 independently shows SQL61.23, judge01:01.23, secretary1:01.22. Exhibitor61.2s is intentional. No stored-score or ranking corruption alleged; the discrepancy undermines secretary score checking.

Archived-inclusive searches by formatter, centiseconds, truncation, run sheet time and61.23 plus exact related issue reads found no canonical formatter issue. Created [MYK9-1225](https://linear.app/myk9-platform/issue/MYK9-1225) with the full execution contract; registry/report-only wording corrected. Closure: assertion-first 61.23 plus minute-boundary controls, actual run-sheet rendering compared with SQL/judge, preserving exhibitor precision. This predates the reviewed commits and is reconciliation, not an attributed new regression.

## Subsequent fixes and verification limits

Later fixes were checked before retaining candidates: #2974 restores a delete whose queue write fails and waits for refused inserts; #2979 handles section fallback/coalescing; #3046 preserves sibling registrations when dog creation merges; #3028 makes account-stamp settlement atomic with row ownership. Their old mechanisms were not filed as new findings. Prior resolved MYK9-1130/1125/1126 are not re-reported.

Executed on current baseline, from package directories:

- Bootstrap succeeded (12 package builds cached).
- App changed-prefix selection: `pnpm vitest run --sequence.shuffle --sequence.seed=20261016 --maxWorkers=4 <selected files>` — **27 files / 265 tests pass**, 9.64s.
- Replication changed-test selection across the fetched range, same flags — **11 files / 122 tests pass**, 566ms. Passing tests do not imply full later-source review.
- Actual formatter proof: expected failing assertion, controls pass.
- Actual handler concurrency diagnostic: exit0, race reproduced against modeled SQL.
- Completed-prefix `git diff --check` passed.

Exact selections/logs are retained in `/private/tmp/myk9-ncr-20261016/.logs/` (`prefix-test-paths.txt`, `prefix-tests.log`, `replication-test-paths.txt`, `replication-tests.log`, `time-display-proof.log`, `recovered-email-race.ts`, `recovered-email-race.log`). No fresh full app suite, broad typecheck/lint, browser walkthrough, live database/SQL behavioral tests or production proof ran. No commits, pushes, PRs, deployments, migrations, fixtures, payments or notifications were performed. Review branch/worktree retained for evidence; audit documents and automation memory only were written. The requested full range is not complete.
