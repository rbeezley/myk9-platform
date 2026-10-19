# Verification: batch 3 scoring and placements

Status: implementation fixes are merged separately. Isolated browser run [39256135312](https://github.com/rbeezley/myk9-platform/actions/runs/39256135312) passed all three cases on source 995fa645f (32.4 seconds, zero retries), including network probes, credential scan and whole-stack teardown. Any later head still requires its own proof, independent review, required CI and merge under task 4.2. See [evidence report](../../../docs/qa/batch3-scoring-verification.md).

## Correctness and coherence

The four delta scenarios map to merged migration `20261017014900_myk9_1230_manual_class_placements.sql` and #3094's behavioral SQL (`placement_soft_delete_ranking_test.sql` section 6 plus lifecycle suites). Its SQL CI passed in run 39028552653. The owner-approved canonical ranking design supersedes this task's earlier all-ranks-missing design; overlapping uncommitted files were removed after private preservation. No duplicate production authority or UI is introduced.

The browser spec asserts SQL, real replica, existing Check Scores/Fix and actual report iframe ordering. Build-stamp identity and disposable target guards protect evidence validity. Rejected-save retention and ties use existing real-caller tests. Final scoped tests and exact-head CI remain required.

## Remaining tasks before archive

- Merged SQL CI and local standard-view coverage are verified (2.1/2.3): 133 local files / 1,113 tests passed, including database contracts, ResultsTab, save failures and print callers. Proof TypeScript compilation passed.
- Browser acceptance tasks 3.1/3.2 record the executed 995fa645f proof; they do not close Linear issues or satisfy a later head's merge gate. Prior integrated judge attempt failed before auth, tracked separately as MYK9-1251.
- Commit validation (4.1) is complete with the owner's explicit exception: final root typecheck/lint/ratchet, proof compilation, 1,113 focused tests, formatting and strict OpenSpec validation pass. No new migration remains. Earlier full shuffle's untouched failure is MYK9-1252 and is not declared green; required CI and all browser cases must pass before merge.
- Obtain independent exact-head review, required CI and merge (4.2).
- Task 4.3 is verified read-only: October 17 build 43b3912ad contained #3077/#3080; October 19 build 67032e1ce also contains them. The installed refresh body still exactly matches #3094, and selected incident rows are unchanged. Another operation deployed these fixes; no new shared write is required by this task.
- Re-read issues and record all criteria before closure (4.4). Original MYK9-1246 response remains unknown; isolated equivalent requires owned acceptance if replacing incident reproduction.

Owned local stack cleanup is complete (4.5), inventory empty. No linked migration or deployment occurred. This change remains active and is not ready to archive.

October 18 redesign approved after the second review: independent class/entry/assignment fixtures, no canonical-entry soft-delete/reset/restore, browser teardown after each test and whole-stack database teardown; actual-network local/public probes; all NQ/ABS placements asserted in both views. The two previous CI browser passes are historical; redesigned-head CI and independent review remain required.
