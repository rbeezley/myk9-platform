# Daily commit review — October 7, 2026

source: codex. No new confirmed defect or P0/P1 finding in the reviewed range. Six canonical issues remain open; five existing findings have passing closure evidence. No application code changed.

## Window and counts

- Shared cursor read before review: `f5eb851806c33a9f01cfbb001b7eaa88f1716375`, exclusive; previous window end **2026-10-06T20:45:49Z**.
- Reviewed through current fetched main **`5c846c8272640a1f01f9258ec7b49878f319950a`**, inclusive: **9 commits, 65 changed files**. A second fetch confirmed the same head.
- Window: **2026-10-06T20:45:49Z–2026-10-07T10:04:10Z**. No gap between audit windows; no 24-hour fallback. The first new commit occurred at 23:08:42Z; the preceding idle interval contains no omitted commits.
- Lifecycle counts: **new 0; unchanged 2; resolved 5; duplicate 1; rejected 0; blocked 4**. Duplicate is the generated-type follow-up already owned by MYK9-1021, not a seventh unresolved issue.
- Unresolved severity: **P2 5, P3 1**. MYK9-1021 also contains a P3 type-freshness subtask. No P0/P1 confirmed. Source labels remain separate below.
- Linear created **0**, modified **0**, closed **0**. All actionable remaining work already has a canonical execution contract. Exact issues and closure comments were read; no duplicate filing or repeated no-change comment was needed.

All references below use the reviewed SHA as the current baseline. First-seen dates preserve the historical finding; last reconciliation is October 7. All entries are `source: codex`, owner Richard Beezley. Proof gaps do not assert a currently broken product.

## P2 — unresolved

### MYK9-992 — unchanged, queue-position display

[Canonical issue](https://linear.app/myk9-platform/issue/MYK9-992). Product UX/recovery, source Medium, high confidence. First seen September 28 under MYK9-868; third consecutive daily reconciliation of the current canonical scope.

Current `apps/myk9show/src/features/at-show/myAtShowEntryDetails.helpers.ts:169–173` still returns view-class for checked-in entries before checking run order. The prior real-render proof remains applicable: an unscored checked-in entry with null run order shows time/check-in/View class without canonical place or a pending explanation. No changed code in this window repairs that branch. The owner’s broader canonical-position sweep remains In Progress.

Expected: waiting dogs show canonical place in line, or truthful pending wording when indeterminate; completed/in-ring/pulled dogs show state. Next/closure: the existing issue’s full surface/print sweep, real null/gapped-order renders, and authorized secretary/judge/cold-exhibitor readback. Do not replace this with raw run numbers or reopen historical time/check-in work.

### MYK9-834 — unchanged, expired-token offline rehearsal

[Canonical issue](https://linear.app/myk9-platform/issue/MYK9-834). Verification prerequisite, source Medium, high confidence in missing proof; no newly reproduced access defect. First seen September 26; carried forward, carried forward since the October 2 remediation review.

Source fix remains at `apps/myk9show/src/hooks/useAuth.ts:175–186` and `features/at-show/useRehydrateRingsideGrant.ts:142–175`. Latest issue comments still require the deployed sequence: same-user refocus, expired token, full offline reload, durable score save, reconnect upload, and identity/revocation controls. The normal October 6 offline save is not that sequence. Next/closure: run and record that specifically authorized passcode rehearsal, with tested build and local/server evidence. No auth or shared score mutation performed here.

### MYK9-1023 — blocked on deployed score-confirmation proof

[Canonical issue](https://linear.app/myk9-platform/issue/MYK9-1023). Verification prerequisite following UX fix; canonical P2, original source High. First seen October 6; second daily reconciliation.

PR [#2798](https://github.com/rbeezley/myk9-platform/pull/2798), `cfa530488`, adds durable local/pending, failed-upload, and matching-server-readback states at `features/at-show/quickAdvancePanel.tsx:73–147`; `services/replication/ReplicatedEntriesTable.ts:547–561` supplies queue/readback access. Fresh scoring/replication tests passed, including mismatched area detail, old failed edits, next-entry reset, and reconnect acknowledgement. The latest Linear comment records deployment but explicitly leaves the live write/readback gate open.

Next/closure: authorized deployed offline scoring must show pending while SQL retains the old score, then acknowledge only after matching server readback on reconnect. No lost-score allegation and no merge-only closure.

### MYK9-1021 — blocked on secretary notice/dedupe proof

[Canonical issue](https://linear.app/myk9-platform/issue/MYK9-1021). Verification prerequisite following mail-in notification fix; source Medium, canonical P2. Original issue October 6; first reconciliation in this report.

PR [#2797](https://github.com/rbeezley/myk9-platform/pull/2797), `5d6c3a8ce`, adds `supabase/migrations/20261007012700_myk9_1021_mail_in_waitlist_head_notice.sql:26–148`, cron dispatch at `apps/myk9show/supabase/functions/cron-waitlist-expiration/offerStep.ts:64–81`, and the bell type. Reviewed eligibility/capacity checks, locks, private dedupe markers, service-only RPC grants, recipient policy, and registered behavioral SQL. Local edge/bell tests pass. Linear records applied migration and deployed cron v61; it explicitly leaves the actual notice/repeat-run/online-dog-behind proof open.

Next/closure: authorized deployed scenario produces one secretary notice, no repeat, and no offer to the online dog behind. The same issue already owns **P3/source Low schema freshness**: committed `packages/supabase/src/types/database.types.ts` lacks the new RPC. Archived-inclusive search and the full issue show the follow-up is already filed; counted as one duplicate candidate, no new ticket. Closure of that subtask requires regenerated types, package build/typechecks, merged diff and CI. No live database or notification operation by this review.

### MYK9-639 — blocked, owner-deferred Stripe TEST proof

[Canonical issue](https://linear.app/myk9-platform/issue/MYK9-639). Verification prerequisite P2/source Medium, historical product severity High kept distinct. Original September 17; audit lineage September 19/20; carried forward.

`apps/myk9show/supabase/functions/stripe-webhook/paymentReconciliationLoader.ts:161–207` retains the sole-live-descendant fix. No settlement changes in this window. Owner’s October 2 comment explicitly sequences controlled TEST replay after October 10. Next/closure: authorized one-/two-hop checkout and payment-link settlement plus root paid once, ledger, reporting and offline readbacks, using the existing issue’s negative controls and human refund approval requirements. No Stripe operation performed.

## P3 — unresolved

### MYK9-981 — blocked on deployed board refresh proof

[Canonical issue](https://linear.app/myk9-platform/issue/MYK9-981). Verification prerequisite after client UX fix; source Low. Original October 3, client residual October 4; fourth daily reconciliation.

`apps/myk9show/src/features/admin-system-health/useRefundRequests.ts:73–75` invalidates both lists. Prior real-cache passing proof and applied SQL/backfill evidence remain valid; no changes to these paths in the review window. Latest issue comments still lack the initiating deployed admin-board action showing both lists refresh immediately. Next/closure: authorized resolve-without-refund action/readback, preserving refusal behavior and unrelated alerts. No refund or admin action performed.

## Newly resolved findings

These issues were already Done in Linear. Resolution is based on the proof below, not status or a merge alone; this audit did not close them.

| ID                                                                                | Severity / source | First seen | Passing proof                                                                                                                                                                                                                                                                                                                   |
| --------------------------------------------------------------------------------- | ----------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [MYK9-1024](https://linear.app/myk9-platform/issue/MYK9-1024)                     | P2 / High         | Oct 6      | #2792 plus fresh real routed integration tests. Oct 7 00:40 UTC comment records deployed `b073ee09b`: scored/paid Willow, Delete disabled, recovery link focuses exact entry and visible Pull menu, no status change.                                                                                                           |
| [MYK9-1035](https://linear.app/myk9-platform/issue/MYK9-1035) / NCR-2026-10-06-01 | P2 / Medium       | Oct 6      | #2793 plus fresh real mapping/card/table tests. Oct 7 01:10 UTC comment records secretary and exhibitor states before/after stored timestamp, SQL still offered, no expiry refetch during 35-second observation, exact cleanup.                                                                                                 |
| [MYK9-1027](https://linear.app/myk9-platform/issue/MYK9-1027)                     | P2 / Medium       | Oct 6      | #2801; issue records complete write-path survey. Current secretary mount disables duplicate leave-class UI; unreachable Show Desk dialog deleted. Fresh guard/status tests pass, existing row actions retained. Recorded final review/CI and acceptance check support scoped closure. No deployed claim for this PR.            |
| [MYK9-1026](https://linear.app/myk9-platform/issue/MYK9-1026)                     | P3 / Low          | Oct 6      | #2794 plus fresh helper/real-component tests. Oct 7 01:10 UTC comment records deployed released Q/42.5s row and scored-unreleased row without result. Notification side effect was separately tracked under 1038.                                                                                                               |
| [MYK9-1038](https://linear.app/myk9-platform/issue/MYK9-1038) / NCR-2026-10-06-02 | P3 / Low          | Oct 6      | #2800 recipe plus recorded Oct 7 03:50–03:52 authorized staging execution: released/withheld browser pair, zero audience subscriptions before/after, deployed edge-source comparison, zero payments/waitlist side effects and exact-row cleanup. Notifier retry-completion markers are explicitly not device-delivery receipts. |

## Verification and limits

- Isolated worktree `/private/tmp/myk9-ncr-20261007`, branch `codex/ncr-review-20261007`; source remains unchanged.
- Dependency/bootstrap and all 12 package builds completed; `pnpm qa:dist-fresh` passed.
- Scoring/result/replication: **7 files / 191 tests passed** (`.logs/scoring.log`).
- Entry recovery/removal, waitlist mapping/UI, notification hook and cron: **15 files / 152 tests passed** (`.logs/entries-waitlist.log`). These two runs cover every changed test file.
- SQL harness registration: **1 file / 8 tests passed** (`.logs/sql-registration.log`). Total **23 files / 351 tests**, all exits 0.
- Reviewed the new migration and behavioral SQL assertions; **did not execute behavioral SQL locally**. Registration proof is not SQL runtime proof. Historical CI/application evidence is attributed to issue comments above.
- `git diff --check f5eb8518..HEAD` passed. Inspected the supplied header preview and SVG/icon changes; no fresh multi-device brand/browser audit claimed.
- Initial sandbox bootstrap failed DNS; scoped network-enabled bootstrap succeeded. A process-inspection approval timed out; the original bootstrap subsequently exited 1 and the successful replacement exited 0. No remaining access blocker or test-hang finding.
- No full suite, whole-repository typecheck, fresh browser walk, live SQL, payment, deployment, shared-fixture write or external notification. No new product defect inferred from those unexecuted operations.
- Read prior memory/report, QA registry, INTENT, scorecard, full canonical Linear issues and relevant closure comments. Existing incomplete gates remain tracked rather than relabeled as current product failures.

## Commit inventory (oldest first)

- `66240a297` #2792 — blocked-delete recovery focus
- `044791772` #2793 — mail-in offer deadline/state
- `b073ee09b` #2794 — released result on exhibitor dog row
- `936dd9aba` #2795 — dog logo and icons
- `9c6979d72` #2796 — deterministic replica test clock
- `5d6c3a8ce` #2797 — mail-in-head secretary notice
- `cfa530488` #2798 — local save versus server acknowledgement
- `d31176ded` #2801 — one secretary removal path
- `5c846c827` #2800 — safe staging result-readback recipe

The shared cursor is stamped through `5c846c8272640a1f01f9258ec7b49878f319950a`, window end `2026-10-07T10:04:10Z`, runner `codex-daily-commit-review`, run date `2026-10-07`. Report/cursor retained uncommitted in the review worktree and copied to the requested primary docs; unrelated primary changes preserved. No commit, push or PR.
