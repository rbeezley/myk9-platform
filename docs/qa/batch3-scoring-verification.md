# Batch 3 scoring and placement verification

Tracking: [MYK9-1246](https://linear.app/myk9-platform/issue/MYK9-1246), [MYK9-1230](https://linear.app/myk9-platform/issue/MYK9-1230), [MYK9-1234](https://linear.app/myk9-platform/issue/MYK9-1234).

## Status and final scope

No issue is closed. No linked migration or production deployment was performed by this task. The owner confirmed secretary paper scoring / Fix for MYK9-1246; its original post-Save response remains unknown. PR [#3096](https://github.com/rbeezley/myk9-platform/pull/3096) carries this pre-merge report; exact-head CI/review outcomes are recorded on the PR and issues after execution.

The fixes are already merged: rejected-save feedback #3077, printed ordering #3080, and manual-class placements #3094 (`f9add37f3a6c722dabb345038baaabfded4c23d8`). This batch adds the isolated three-case browser proof, dedicated disposable CI, and evidence. It does not duplicate those fixes or their ResultsTab/SQL coverage.

On October 17 the owner approved keeping two unrelated verification failures separate, while requiring green CI and all three isolated browser cases before merge. Follow-ups [MYK9-1251](https://linear.app/myk9-platform/issue/MYK9-1251) and [MYK9-1252](https://linear.app/myk9-platform/issue/MYK9-1252) remain open. Neither is declared fixed.

## Placement authority and design reconciliation

Merged migration `20261017014900_myk9_1230_manual_class_placements.sql` extends the existing refresh authority: a manual class with expected entries and every expected entry accounted for is canonically ranked. Status, finalization and class times stay manual. The owner chose this behavior in #3094 because no app path hand-sets placements; corrections must recalculate ranks too.

That supersedes this task's earlier proposed all-ranks-missing guard. Once #3094 merged during this resume, we integrated it and removed our uncommitted migration, source pins, SQL test/registration and duplicate ResultsTab test, preserving private historical copies. No second migration ships here. The other task's held checkout remains untouched.

#3094's final CI run [39028552653](https://github.com/rbeezley/myk9-platform/actions/runs/39028552653) passed SQL tests, six app shards, package tests, typecheck/build/quality, browser smoke and coverage. Its standard-view test uses real replicated rows for two classes. This is evidence for the merged implementation; our final browser job must independently pass on this PR head.

## Isolated browser proof

All fixture/scoring writes target disposable loopback Supabase. Contexts block external HTTP requests and service workers; socket origins are checked. Fresh role contexts use actual SQL/replica reads, with no auth, clock, persistence-RPC or result-response stubs. The served build stamp must equal the requested exact source SHA. Three Playwright tests cover the five scenario rows below: cardinalities and placement classes are loops within their tests.

| Case                      | Assertions                                                                                                           |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Paper, one live entry     | UI saves Q / 62.03 seconds / 1 fault; SQL agrees; reload retains result/time; clean replica and empty mutation queue |
| Paper, two live entries   | Same persistence/reload assertions, without a single-entry special case                                              |
| Judge, one live entry     | UI saves Q / 62.03 seconds / 0 faults to SQL; reload Completed card shows 1st and time                               |
| Manual Container Novice A | Stored ranks 2/1; Check Scores and Fix agree; actual report iframe order 201, 200                                    |
| Manual Vehicle Novice A   | Stored ranks 2/1/NULL/NULL; Check Scores and Fix agree; report order 201, 200, 202 (NQ), 203 (ABS)                   |

Vehicle is a disposable clone using verified domain values Vehicle / Novice / A and synthetic dogs; no shared class was created or changed. Fixture deletion responses are checked. Existing ResultsSheet/print utility tests additionally pin ties, ABS/EX/NQ order and both print callers. Existing PaperScoresheetPage save-failure tests verify visible rejection and retention of entered values.

## Deployed read-only observations — October 16

Served app `fc1df57f5e546d6e8bee4c45f0315f3acd8cd5ea` predates #3077 and #3080 by ancestry. Normal Auth requests and verified read-only RPCs were allowed; application writes, analytics and external fonts were blocked. No Save, check-in, completion, print-confirmation, payment or notification action ran.

| Shared class                                                       | Actual SQL and deployed browser                                                                                                                                                                      |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ABC Container Novice A, `5b80b9b2-23c0-4d17-a71c-7d697adb4745`     | One live entry #100: Q / 62.03 / zero faults / placement 1 stored. Check Scores shows 1; Fix shows 1st / Q / 1:02.03; preview #100. Original score persistence is confirmed without rewriting it.    |
| Darboshea Vehicle Novice A, `b7f1d753-5d96-4fc0-abe4-44b4ae976057` | Currently derived/in-progress, five of six scored, one pending, every placement NULL. Both views correctly withhold ranks. Historical manual/completed state is gone and was recreated only locally. |
| Vehicle print reproduction                                         | Placement-sort preview is **101, 100, 102, 103, 104, 134**; Check Scores lists **100, 101, 102, 103, 104, 134**. This reproduces the deployed print gap read-only.                                   |

Selected class status/source/finalization and selected entries' result/time/faults/placement/version matched before and after the recorded comparison. This is a scoped unchanged-data observation, not a claim about unrelated rows or Auth sessions. Shared screenshots remain private; CI artifacts contain synthetic fixtures.

## Deployed read-only recheck — October 17

Production serves `43b3912ad15a178d449a62e3c1cd2407c0510b59`; ancestry confirms #3077 and #3080. Linked history includes migration `20261017014900`, and the installed refresh function body exactly matches #3094's migration body. Another operation installed these; this task only read them.

The guarded browser re-walk passed (one test covering both incident classes, 14.9 seconds). ABC still shows Q / 1:02.03 / zero faults / 1st after cold navigation. Vehicle remains incomplete and unplaced in both views; its print preview now matches the screen: **100, 101, 102, 103, 104, 134**. Selected before/after SQL snapshots are identical (diff exit 0). Only fonts and analytics writes were blocked. The first invocation lacked loaded credentials and exited before sign-in; the recorded pass loaded the existing account environment.

## Acceptance disposition

| Issue     | Evidence                                                                                                                                                | Remaining gate                                                                                                                                                     |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| MYK9-1246 | Confirmed paper path; original ABC score visible after reload; isolated cardinality/persistence and rejection tests; #3077 deployed                     | Final-head browser proof. Original failed-screen response remains unknown; owned acceptance needed if isolated equivalent replaces original-incident reproduction. |
| MYK9-1230 | Historical deployed root cause; #3094 merged, installed function matches; SQL/replica tests and local two-class parity                                  | Final-head browser proof and full criterion reconciliation; preserve current incomplete shared class.                                                              |
| MYK9-1234 | Deployed wrong print order on October 16 and corrected order on October 17; both sort callers fixed; actual isolated preview and tie/nonqualifier tests | Final-head browser proof and full criterion reconciliation.                                                                                                        |

## Validation history and limits

- Initial three browser cases passed with zero retries in 27.6 s on source `2ecfb502a` plus our then-working SQL/proof. This is historical evidence, not final-head proof.
- After integrating time formatting, DQ labels and scoring layout, rebuilt/stamped `2281cfa3f193e6a3979b776922128462ddb93eda` passed paper and placement/print cases. Judge stopped before authentication in unchanged `helpers/signInFlow.ts:156`: visible/enabled/stable Sign in button, 30 s click timeout during scrolling. No judge assertion ran. Cause unknown; MYK9-1251.
- An exploratory rapid navigation/reload into the saved editor stopped at “Loading scoresheet.” Passing judge evidence verifies class results after reload, not cold editor reopening. No editor-reload pass is claimed.
- Full shuffled app suite on that base: **3,030 files passed, one failed, two skipped; 29,455 tests passed, one failed, 11 skipped, one todo**, exit 1. Untouched `useAtShowScoresheet.completion.test.ts:178` exceeded a 100 ms loading deadline. All seven tests passed alone immediately afterward. Cause unknown; MYK9-1252. This is not a green full-suite result.
- Earlier minimal-reporter and superseded-base suite runs were interrupted, not passed. Vitest 5 defaults to minimal output in agent sessions; explicit verbose reporting established progress.
- Typecheck, lint, ratchet, proof TypeScript compilation, focused save/print tests (102), and focused contracts/replica tests passed before the final #3094 integration.
- After integrating #3094: 133 files / 1,113 tests passed across database contracts, the merged real-replica ResultsTab test, paper save failures, ResultsSheet and both print callers (exit 0). The proof TypeScript graph also passed (exit 0). No Vitest test or production implementation file remains changed by this PR.
- Final root typecheck, lint and code-quality ratchet on integrated #3094 all exited 0. Owner approved the two unrelated failures as separate follow-ups; mandatory final-head CI/browser proof remains the merge gate.
- Superseded proposal only: real installed SQL assertion failed NULL/NULL versus expected 2/1, then passed locally; repeat/backfill/partial-rank guards and pristine full SQL passed. A browser-seeded ACL environment was rejected as unsuitable for full SQL. The linked dry run listed only our removed migration and applied nothing (2.121 hung after plan; installed 2.117 exited 0). These do not prove #3094 deployment.

## Cleanup and next gates

The task-owned native `batch3-proof` stack was verified by worktree/branch identity, destroyed with exit 0, and followed by an empty stack inventory. Playwright runners ended their owned browsers; no other task's browser was closed. Credentials and raw local stack logs stay private.

The dedicated CI job prepares and destroys its own runner stack, blocks public container egress, scrubs artifacts and requires all three cases with no retries. Independent exact-head review, required CI/watcher, merge, original-incident acceptance and final tracker closure remain outstanding. First-review corrections reset/assert class and entry state, create matching extra-dog armbands and assert inserted numbers, retain proof and cleanup errors together, trigger CI on imported helpers, and simplify the artifact condition. Literal nonqualifier-order assertions intentionally pin the acceptance contract.
