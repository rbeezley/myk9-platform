# Daily commit review — October 8, 2026

source: codex. No new confirmed defect introduced by this window. The changed tests reproduce existing **MYK9-1051**. Existing **MYK9-1050** remains the highest-impact open finding encountered. Two previously specified operational proof gates were restored to In Review; no application code changed.

## Window and accounting

- Start (exclusive): `5c846c8272640a1f01f9258ec7b49878f319950a`, read from the primary checkout's shared `daily-commit-review` row.
- End/baseline (inclusive): **`b69df7cc9879192f20ed41aeb4625069281c0507`**, fetched `origin/main`; second fetch unchanged. The primary local main was behind and was not moved.
- **24 commits / 162 changed files**, covering **2026-10-07T10:04:10Z–2026-10-08T10:07:57Z**. No gap or 24-hour fallback. First new commit at 12:58:53Z is an idle interval after the prior review, not omitted commit coverage.
- Lifecycle: **new 0; unchanged 4; resolved 4; duplicate 2; rejected 0; blocked 4**. Duplicate scope observations refer to MYK9-1045 and MYK9-1036, not new defects. Counts treat the previously filed MYK9-1051 as unchanged, not both unchanged and duplicate.
- Eight unresolved canonical records in this reconciliation: **P1 1, P2 6, P3 1**. No new P0/P1. MYK9-1050 predates this range's relevant source changes; its production evidence was found by the overnight walk, not reproduced live here.
- Linear: **created 0, modified 4** (1050, 1051, 1021, 1023); **closed 0**. 1021/1023 reopened Done → In Review for their existing proof gates. Every actionable item has a canonical Linear record.

All current source references below use the end SHA. All findings are `source: codex`, owner **Richard Beezley**, high confidence in the evidence described. Missing operational proof is not an assertion of a current runtime failure.

## P1 — unresolved

### MYK9-1050 — unchanged: scoring device misses server placements

[Canonical issue](https://linear.app/myk9-platform/issue/MYK9-1050), product replication/recovery, source High. First/last seen October 8; first daily reconciliation.

The overnight production readback recorded authoritative placements 1/2 while the scoring device's synced replica retained undefined placement fields. Current `apps/myk9show/src/services/replication/ReplicatedEntriesTable.ts:510–514` keeps a local row carrying `_syncStatus: pending`; `updateEntry` stamps it at :689, while `packages/replication/src/mutation-row-sync.ts:46–48` clears the wrapper status without clearing that data flag. Expected: an acknowledged, non-dirty row takes authoritative computed placements. Impact: secretary class/results/print surfaces can lack placements and require a workaround; no score-loss/corruption claim.

Existing [PR #2827](https://github.com/rbeezley/myk9-platform/pull/2827) remains OPEN. Added current source corroboration and full lifecycle/closure contract to the issue. Next/closure: real update → upload acknowledgement → server recalculation → pull test, dirty-row protection, then authorized deployed scoring-device class/print readback at the repaired build. This audit performed no live score write or fresh SQL readback.

## P2 — unresolved

### MYK9-1051 — unchanged: shuffled toolbar test leaks viewport

[Canonical issue](https://linear.app/myk9-platform/issue/MYK9-1051), test/harness, source High retained separately; normalized current priority to Medium/P2. First/last seen October 8; first daily reconciliation.

Fresh isolated changed-test run, seed **1791453756269**, exits 1: **617 passed, one failed**, 48 files passed/one failed. `apps/myk9show/src/components/entries/management/__tests__/EntryManagementViewToolbar.filters.test.tsx:93` cannot find the desktop search textbox; the DOM has the collapsed search button. Tests at :67–75 replace matchMedia with 768/1440px; the desktop assertion at :83 establishes no viewport and there is no per-test restoration. Expected independent test state; impact intermittent CI failure, not broken product search.

Introduced by #2822, already tracked; [PR #2828](https://github.com/rbeezley/myk9-platform/pull/2828) remains OPEN. Added exact seed, counts, source and proof to Linear. Next/closure: finish that repair, original ten shuffled runs plus coverage, this seed and required full shuffled validation; merged correction. Log: `.logs/changed-tests.log` in the retained audit worktree.

### MYK9-992 — unchanged: checked-in waiting dog has no queue-position explanation

[Canonical issue](https://linear.app/myk9-platform/issue/MYK9-992), UX/recovery, source Medium. First September 28 under MYK9-868; last October 8; fourth daily reconciliation of this scope.

`apps/myk9show/src/features/at-show/myAtShowEntryDetails.helpers.ts:169–173` still returns view-class for a checked-in unscored dog before the pending-order branch. Existing real-render proof remains applicable; #2815 assigns late-entry run order but does not repair this display branch. Expected canonical place in line or truthful pending wording, with completed/in-ring/pulled state-only controls. [PR #2824](https://github.com/rbeezley/myk9-platform/pull/2824) is the existing follow-up, not merged in the reviewed range. Close with the canonical surface/print sweep, focused null/gapped-order renders and authorized cross-role readback. No duplicate filing.

### MYK9-834 — unchanged: expired-token offline identity rehearsal

[Canonical issue](https://linear.app/myk9-platform/issue/MYK9-834), verification prerequisite, source Medium. First September 26; last October 8; carried forward since the October 2 remediation review.

Same-user identity fix at `apps/myk9show/src/hooks/useAuth.ts:175–186` and `features/at-show/useRehydrateRingsideGrant.ts:142–175` remains; no auth source change in this window. The previously specified refocus → token expiry → full offline reload → durable score → reconnect upload/identity-control rehearsal is still unrecorded. Normal offline save proof cannot substitute. Next/closure: the exact authorized deployed passcode replay with build, local/server evidence and revocation controls. No new auth defect alleged.

### MYK9-1021 — blocked: deployed secretary notice/dedupe proof

[Canonical issue](https://linear.app/myk9-platform/issue/MYK9-1021), verification prerequisite, source Medium. First October 6; last October 8; third daily reconciliation.

Reopened **Done → In Review**. Full issue/comments, archived-inclusive searches and #2797 discussion still explicitly require a notification-safe deployed mail-in-head scenario. Its Done transition immediately followed child MYK9-1041 closure, whose passing proof explicitly says the parent's human notice/dedupe gate remains separate. No replacement evidence or owner waiver found. Generated types are resolved and are not reopened.

Source: `apps/myk9show/supabase/functions/cron-waitlist-expiration/offerStep.ts:64`; migration `20261007012700_myk9_1021_mail_in_waitlist_head_notice.sql:26`. Implementation/applied migration/CI evidence stands. Next/closure: authorized test-account free spot + mail-in head + online dog behind produces exactly one actionable secretary notice; repeated evaluation creates none and does not skip to the online dog. Record build/row states/counts and exact cleanup. No notifications, cron calls or fixture writes by this audit.

### MYK9-1023 — blocked: deployed offline save/readback proof

[Canonical issue](https://linear.app/myk9-platform/issue/MYK9-1023), verification prerequisite after UX fix; source High preserved. First October 6; last October 8; third daily reconciliation.

Reopened **Done → In Review** for the existing deployed proof, not code regression. #2816 adds clearer offline wording and a queued-to-acknowledged toast while the confirmation panel is mounted. Fresh save-state tests pass. `apps/myk9show/src/features/at-show/quickAdvancePanel.tsx:112–174` checks queue/server matching; :221–231 handles the toast. Full issue/comments and #2798/#2816 records give automated evidence but leave the deployed offline SQL/readback requirement unrecorded; merge coincides with Done and is not that proof.

Next/closure: authorized deployed offline changed-score save shows local/pending while SQL remains old; reconnect acknowledges only after matching authoritative score/details. Record build, sanitized versions and cleanup. Global/off-panel toast is an intentional non-goal. No lost score alleged or live score written.

### MYK9-639 — blocked: owner-deferred Stripe TEST replay

[Canonical issue](https://linear.app/myk9-platform/issue/MYK9-639), verification prerequisite P2/source Medium, historical High retained. First September 17 (audit September 19/20); last October 8; carried forward.

`apps/myk9show/supabase/functions/stripe-webhook/paymentReconciliationLoader.ts:161–207` unchanged; prior loader proof stands. October 2 owner decision explicitly defers controlled TEST replay until after October 10. Next/closure: approved one-/two-hop checkout and payment-link settlement, root paid once, ledger/report/offline readback and negative controls. No payment/refund operation performed; no new financial defect alleged.

## P3 — unresolved

### MYK9-981 — blocked: initiating admin-board refresh proof

[Canonical issue](https://linear.app/myk9-platform/issue/MYK9-981), verification prerequisite after UX/recovery fix, source Low. First October 3; client residual October 4; last October 8, fifth client daily reconciliation.

`apps/myk9show/src/features/admin-system-health/useRefundRequests.ts:73–75` invalidates both lists; source unchanged. Prior real-query-cache proof and applied closure/backfill checks stand. Latest issue comments still leave the deployed initiating board action/readback open. Next/closure: authorized resolve-without-refund makes both affected lists refresh immediately, preserves unrelated alerts and refusal behavior. No refund/admin mutation performed.

## Newly resolved in this review window

No issues were closed by this audit. These transitions are supported by focused proof, not merge alone.

| Canonical ID                                                  | Severity/source         | First/last seen | Closure evidence                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------- | ----------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [MYK9-1042](https://linear.app/myk9-platform/issue/MYK9-1042) | P2/Medium, test harness | Oct 7/Oct 8     | #2803 fixes accessible-option readiness; both recorded seeds and full shuffled run passed in prior follow-up. Current ResultsBulkBar tests also pass in this run.                                                                                                   |
| [MYK9-1043](https://linear.app/myk9-platform/issue/MYK9-1043) | P2/Medium, test clock   | Oct 7/Oct 8     | #2803 pins Date, before/at/after expiry and paid precedence; prior full shuffled proof plus current offers tests pass.                                                                                                                                              |
| [MYK9-1017](https://linear.app/myk9-platform/issue/MYK9-1017) | P2/Medium, settings     | Oct 5/Oct 8     | #2804 removes unsupported Deadline, preserves legacy recovery. Current settings tests pass; prior local browser proof and actual SQL CI job112918904476 passed all16 reserve/release/actor assertions. No production-deployment claim.                              |
| [MYK9-1041](https://linear.app/myk9-platform/issue/MYK9-1041) | P3/Low, schema types    | Oct 7/Oct 8     | #2807 contains all five RPC types. Recorded Oct8 01:04Z fresh whole-file live generator comparison EXIT0, SHA256 e1b2ce7f46cdd293408f91c674f84ff98f83b1ff26632a1855eff392e46185ee, package build/typecheck and exact-head CI proof. Not rerun against live DB here. |

## Subsequent fixes and duplicate scope

- #2813 repairs offline mutation pausing across Show Map and staff check-in; sign-off already uses always-networkMode. Current real-query-client offline tests pass.
- #2825 corrects the sign-off action label and full class labels in View results after #2807/#2810. No remaining label defect reported.
- Results verification/replay design is explicitly deferred to [MYK9-1045](https://linear.app/myk9-platform/issue/MYK9-1045); judge-day catalog convenience is explicitly split to [MYK9-1036](https://linear.app/myk9-platform/issue/MYK9-1036). Full issues and MYK9-1030 closure comment read. Count two duplicate scope observations; do not reopen completed sign-off scope for either.
- No new source defect, high-risk coverage omission, security regression or intent violation confirmed beyond the canonical items above.

## Checks and limits

- Isolated `/private/tmp/myk9-ncr-20261008`, branch `codex/ncr-review-20261008`; no source edits. Bootstrap/build of 12 packages and `qa:dist-fresh` passed.
- All **49 changed app unit-test files** ran shuffled: **617 passed / 1 failed**, 13.53s, exit1, seed1791453756269. Sole failure MYK9-1051. Retained full log and exact file list in `.logs/`.
- Changed scoring-package test: **1 file / 11 passed**, exit0. SQL harness registration: **1 file / 8 passed**, exit0. Combined **51 files / 636 passing tests / 1 failing test**.
- `git diff --check` passed. Read the migration/actor assertions and changed source paths, role intent, scorecard, QA registry, prior report/memory and canonical Linear records. Inspected the committed logo comparison image.
- Behavioral SQL was reviewed, **not executed locally**. Historical SQL/type-generation/browser proof above is explicitly attributed to recorded evidence. No full app suite, fresh browser walk, production SQL, payment, deployment, or fixture mutation.
- Initial sandbox dependency install failed DNS; approved network bootstrap succeeded. Initial test-list shell construction supplied one combined argument and found no tests; corrected invocation ran all49 files. These resolved audit setup errors are not product/harness findings.
- Primary audit cursor/report history preserved except the requested stream stamp. Review artifacts are uncommitted; no PR, push, merge or deployment.

## Commit inventory (oldest first)

- `010a755b2` — MYK9-1020: Count in-ring entries in judge day summary (#2799)
- `0e67aae18` — fix(brand): smooth logo curves and use density-aware PNGs (#2802)
- `276accae3` — test(secretary): stabilize preset and offer timing (#2803)
- `c887416e4` — fix(waitlist): remove unsupported deadline reservation (#2804)
- `e078a415b` — fix(search): restore dog results and search clubs (#2805)
- `fadc16f09` — fix(ringside): Mute timer lives in the scoresheet header; typed-time clear button is 44px (#2808)
- `6ba1b2a28` — fix(show-day): record the judge's end-of-day sign-off and the results check (MYK9-1030) (#2790)
- `cbe99874e` — docs: plan the Entries filter button (searchable multi-select, applied-filter sentences)
- `e490c1ad7` — feat(results): View results link per class on the Results tab (MYK9-1031 interim) (#2810)
- `035ec932a` — feat(show-day): judge sign-off and results-check UI (MYK9-1030, part 2) (#2807)
- `329d12590` — docs(exhibitor): add Phase E, show-day order across dogs (MYK9-1046)
- `7fbd8b926` — feat(list-toolkit): multi-select filter field and helpers (filter button phase 1) (#2809)
- `825585196` — docs: correct three plan inaccuracies found in the filter-model review
- `126ea551b` — feat(list-toolkit): ListFilterMenu, searchable multi-select Filter button (phase 2) (#2811)
- `375e2e4a2` — fix(show-day): Show Map class actions save offline (#2813)
- `c0fbdd8db` — chore(qa): ignore stray .logs-* files; give every checkout .logs/ (#2812)
- `e5a4ef0d5` — fix(at-show): offline scores say saved on this device, and confirm when sent (MYK9-1023) (#2816)
- `1edd1b59c` — fix(show-day): a day-of mail-in entry gets a run order (MYK9-868 recurrence) (#2815)
- `f51c60c59` — feat(list-toolkit): applied filters, quiet search and layout slot (filter button phase 3) (#2817)
- `3b11825ca` — fix(show-day): Overview and Reports agree on what has been printed (#2814)
- `65c039a3a` — feat(entries): Filter button, applied filters, quiet search and checkable queues (filter button phase 4) (#2822)
- `0853f75d0` — docs: filter-button plan progress, Entries phases merged
- `9f8494c36` — fix(shortcuts): keyboard shortcuts stay off while a dialog or popover is open (#2826)
- `b69df7cc9` — fix(show-day): initials action label, full class label on View results (MYK9-1049) (#2825)
