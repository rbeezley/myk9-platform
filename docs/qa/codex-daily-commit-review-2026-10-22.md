# Codex daily commit review — 2026-10-22

Partial review; **20 of 151 commits reviewed, 131 remain**. No new actionable defect was confirmed in the completed range. This is not a clean verdict on all current main.

## Boundary and scope

- Source: codex. Run: 2026-10-22; recorded at 10:12 UTC.
- Starting shared boundary (exclusive): `a21694dd70a551c0d93e8b51cdfa74fdd7da47ea`, window end 2026-10-15T23:49:14Z.
- Completed boundary (inclusive): `85659c3d0bb49debf25484ba29546918e35046a0`, window end 2026-10-16T20:20:51Z.
- Current local main / verification baseline: `f908934912e01b02716c97ab4bea26da8dd01087`. No remote fetch; this report does not certify a newer remote main.
- No gap was skipped at the start: the range starts immediately after the shared SHA. The 131-commit suffix `(85659c3d0, f90893491]` is explicitly unreviewed and remains behind the shared cursor.
- Read full relevant implementations, schemas, product intent, subsequent fixes, QA ledger, prior automation memory, and canonical Linear issues/comments. Source review is historical; focused tests ran on the frozen current-main baseline.
- No application edits, commits, pushes, deployments, shared fixture mutations, live payment operations, or browser sessions in this run.

## Unresolved findings — P2 / Medium

### MYK9-639 — payment readback defects and remaining settlement proof

- Status: unchanged; source: codex; canonical priority P2; source label Medium. Owner: Richard Beezley. Canonical issue remains In Progress.
- [Linear contract and evidence](https://linear.app/myk9-platform/issue/MYK9-639). Original scope first seen September 17; residual move-up findings September 19–20; the two current readback symptoms first evidenced October 21, last checked October 22. Baseline `f908934912e01b02716c97ab4bea26da8dd01087`.
- Roles/workflows: exhibitor My Payments and secretary Financial Report after paid one/two-hop move-ups through cart and secretary payment links.
- Existing October 21 controlled Stripe TEST evidence records four successful $37.45 settlements, each against one $35 root, one live run, and zero refunds. This replaces the earlier assumption that all settlement proof was still unexecuted.
- Observed: My Payments shows only two cart orders / $74.90, rather than all four / $149.80. Secretary-link `stripe_orders.customer_id` is null and current customer/admin RLS excludes those orders from the authenticated exhibitor read. The recorded authenticated probe matches the UI.
- Affected read: `apps/myk9show/src/features/payments/useMyPayments.ts:76` (`stripe_orders` select). This is an ownership/RLS readback issue; the select alone is not its entire cause.
- Observed: Financial Report detail shows Pending while the root settlement and aggregate totals are paid/correct. `apps/myk9show/src/components/reports/FinancialReport.tsx:114` renders destination `line.entry.paymentStatus`.
- Expected: authorized exhibitor history includes both payment channels, preserving mixed-link privacy; report detail agrees with the authoritative root settlement.
- Confidence: high for existing recorded reproduction and current code persistence. No new live replay was performed here. Passing current tests does not resolve these defects.
- Next action: finish the separately owned readback fixes and ownership redesign. The local ownership draft failed a mixed-original-link privacy SQL proof; it is not a deployed vulnerability. Do not interfere with `/private/tmp/myk9-639-readback-fixes`.
- Closure proof: focused regression tests plus authenticated least-privilege SQL/API controls, fresh deployed four-settlement browser readback with exact totals/statuses, retry and reversed/deleted controls under human refund approval, and required offline readback evidence. Keep the full issue criteria authoritative.
- Tracking: appended this reconciliation to the existing Linear description on October 22; no duplicate issue created and no issue closed.

### MYK9-834 — offline auth proof remains unrecorded

- Status: blocked (verification prerequisite); source: codex; canonical P2; source label Medium. Owner: Richard Beezley. First seen September 26; last seen October 22. Baseline `f908934912e01b02716c97ab4bea26da8dd01087`.
- [Existing proof contract](https://linear.app/myk9-platform/issue/MYK9-834). Linear remains Done following the owner's October 13 completion statement; this run does not reopen it or assert a new product defect.
- Workflow: judge/show-day session continuity after expiration offline. Scope is the existing issue's auth/refocus and offline upload contract, not a newly localized source defect; no new file/line defect is alleged.
- Evidence: exact deployed same-user refocus → expired offline reload → local score → reconnect upload, with signout/user-switch/revocation controls, is not recorded in the reviewed issue evidence. The separate already-loaded signed-in 61-minute offline test excludes cold boot/passcode fallback and is not equivalent.
- Confidence: high that the reviewed record lacks the specified closure evidence; actual behavior remains unverified.
- Next action / closure proof: attach the exact deployed browser trace and controls, or obtain an explicit owner replacement of that proof gate. A bare completion statement or unrelated passing tests is insufficient for audit resolution.

## Reconciliation and counts

| Status                      | Count |
| --------------------------- | ----: |
| New                         |     0 |
| Unchanged                   |     1 |
| Newly resolved              |     0 |
| Duplicate findings reported |     0 |
| Rejected findings reported  |     0 |
| Blocked proof records       |     1 |

No new P0, P1, or P3 findings. Counts are canonical finding records, not the number of symptoms. Linear: 0 created, 1 modified (MYK9-639), 0 reopened, 0 closed.

Subsequent fixes excluded from new findings:

- Registration-email claims from #3062/#3068: MYK9-1212 already owns the history; later #3112 (`837aa2f88`) adds attempt ownership and #3113 tightens ACLs. Recorded October 19 applied migration, service-only RPC/ACL, deployed edge v17, and focused proof already resolved it in prior reconciliation. Do not count it newly resolved again.
- October 16 judge-walk telemetry harness problem: already MYK9-1255, fixed by #3116 with prior October 19 8/8 browser proof. Not a new product defect.
- AKC DISQ/DQ output: MYK9-1011 already has an explicit owner-accepted substitute proof gate; do not reopen or claim registry certification.
- MYK9-1196's original finite review/proof scope is closed. Do not append this run's remaining 131 commits to completed historical scope.

Archived-inclusive Linear searches covered workflow, symptoms, commit review, daily-commit-review, review backlog, audit-boundary, boundary SHA, and unreviewed commits. Exact canonical issues and relevant comments were read before reconciliation.

## Completed commit inventory

| Commit    | Scope                                        |
| --------- | -------------------------------------------- |
| 01789079c | #3058 registration tones and grouped entries |
| 16edc730e | #3061 archive batch-two proof                |
| e4f66d318 | #3062 atomic registration-email claim        |
| 37e88deed | #3064 class-chip locators                    |
| 5347069ab | #3066 service-worker chunk recovery test     |
| c2f831e07 | October 16 judge-walk report                 |
| ece8d4579 | #3060 container cockpit split                |
| 460c39bcd | #3055 native local SQL harness               |
| 019e7c65d | #3057 per-worktree SQL ports                 |
| 66214d21f | #3068 email claim lease                      |
| 6e045fbd9 | #3067 Entry Forms pane fold                  |
| 3c15b3c88 | Browse plan                                  |
| e88c3ea05 | #3069 acknowledgment rebase                  |
| a4c73f3db | #3070 pull-before-ack                        |
| ec72dc576 | #3063 toast lift                             |
| 589c8e66a | #3071 Browse tabs                            |
| 942f4ad0f | #3073 null/undefined remote comparison       |
| fc1df57f5 | #3074 Clubs split                            |
| e14f05f90 | #3075 provisional AKC DISQ/DQ owner choice   |
| 85659c3d0 | #2928 Supabase 2.117.3 dependency update     |

## Verification and limits

All focused runs used shuffle seed 20261022 and finished with exit 0: **42 test-file executions, 531 tests**.

| Worktree log                       | Files | Tests | Coverage                                                                             |
| ---------------------------------- | ----: | ----: | ------------------------------------------------------------------------------------ |
| `.logs/app-first.log`              |    10 |    62 | Registration/form/save, My Entries, class labels, acknowledgment rebase              |
| `.logs/replication.log`            |     2 |    15 | Mutation-row acknowledgment rebase and pull-before-ack                               |
| `.logs/sql-harness.log`            |     2 |    40 | SQL runner/local harness unit tests                                                  |
| `.logs/app-second.log`             |    18 |   264 | Browse/Rail/MasterDetail, cockpit preservation, fold, toast, current email lifecycle |
| `.logs/app-third.log`              |     7 |    42 | Clubs filters, null/NQ pull, queued RPC, settlement chain, payments, report parity   |
| `.logs/secretary.log`              |     2 |   105 | AKC formatter and entry outcome                                                      |
| `.logs/replication-comparison.log` |     1 |     3 | Remote null/undefined comparison                                                     |

Worktree: `/private/tmp/myk9-ncr-20261022`. Initial restricted/offline dependency install failed on an unavailable SDK tarball; the authorized network install and subsequent bootstrap/package builds succeeded. This was recovered environment setup, not a product finding.

These are focused tests on current main, not a full suite, browser walkthrough, live SQL execution, authenticated remote replay, or production verification. SQL runner unit tests do not establish SQL behavioral correctness. Later-commit exploration was incomplete and deliberately excluded from the stamped range. The remaining 131 commits still require review.
