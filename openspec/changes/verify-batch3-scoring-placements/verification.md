# Verification: batch 3 scoring and placements

Status: implementation fixes are merged separately; this scoped proof is awaiting final validation/review/CI. See [evidence report](../../../docs/qa/batch3-scoring-verification.md).

## Correctness and coherence

The four delta scenarios map to merged migration `20261017014900_myk9_1230_manual_class_placements.sql` and #3094's behavioral SQL (`placement_soft_delete_ranking_test.sql` section 6 plus lifecycle suites). Its SQL CI passed in run 39028552653. The owner-approved canonical ranking design supersedes this task's earlier all-ranks-missing design; overlapping uncommitted files were removed after private preservation. No duplicate production authority or UI is introduced.

The browser spec asserts SQL, real replica, existing Check Scores/Fix and actual report iframe ordering. Build-stamp identity and disposable target guards protect evidence validity. Rejected-save retention and ties use existing real-caller tests. Final scoped tests and exact-head CI remain required.

## Remaining tasks before archive

- Merged SQL CI and local standard-view coverage are verified (2.1/2.3): 133 local files / 1,113 tests passed, including database contracts, ResultsTab, save failures and print callers. Proof TypeScript compilation passed.
- Pass all three browser cases on the exact PR head (3.1). Prior integrated judge attempt failed before auth, tracked separately as MYK9-1251.
- Commit validation (4.1) is complete with the owner's explicit exception: final root typecheck/lint/ratchet, proof compilation, 1,113 focused tests, formatting and strict OpenSpec validation pass. No new migration remains. Earlier full shuffle's untouched failure is MYK9-1252 and is not declared green; required CI and all browser cases must pass before merge.
- Obtain independent exact-head review, required CI and merge (4.2).
- Obtain concrete linked migration/deployment authorization and resulting verification (4.3).
- Re-read issues and record all criteria before closure (4.4). Original MYK9-1246 response remains unknown; isolated equivalent requires owned acceptance if replacing incident reproduction.

Owned local stack cleanup is complete (4.5), inventory empty. No linked migration or deployment occurred. This change remains active and is not ready to archive.
