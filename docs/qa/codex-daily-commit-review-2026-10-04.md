# Daily commit review — 2026-10-04

source: codex. Automation: nightly-commit-review. Reviewed baseline: `6a928bbc059179875c3ae3192cc472b130735963`.

## Coverage and counts

- Exclusive start: `e95bb1ea6e3da7d387d60b8111fb2489dac9a9ba`, from the primary checkout's shared `daily-commit-review` row, including its uncommitted prior stamp.
- Inclusive end: `6a928bbc059179875c3ae3192cc472b130735963`, fetched origin/main. A second fetch before filing confirmed no newer main commit. Review ran in `/private/tmp/myk9-ncr-20261004`; primary main was older and was not advanced.
- Window: 2026-10-03T14:03:51Z through 2026-10-04T10:14:51Z. 31 commits, 404 changed files. No coverage gap, skipped commit interval, or 24-hour fallback.
- Reviewed combined final implementations and changed tests: refund claims/approval/settlement and SQL closure, online-entry gates and authorization, role onboarding, show-home/run-order/scoring/counts, armband/results/print paths, public judges/export, AskQ assets, replication/E2E fixture changes, and supporting documentation.
- Method: quality-finding-lifecycle, AGENTS.md, INTENT, scorecard, prior memory/report, targeted QA-registry reconciliation, archived-inclusive Linear searches and exact candidate reads. Linear owns actionable work; this report records evidence and coverage.

| Lifecycle status                                       | Count |
| ------------------------------------------------------ | ----: |
| New                                                    |     1 |
| Unchanged, including new evidence on an existing issue |     2 |
| Newly resolved relative to previous full audit         |     1 |
| Duplicate                                              |     0 |
| Rejected                                               |     0 |
| Blocked on remaining proof                             |     3 |

No new P0/P1 finding. Six canonical items remain unresolved/proof-limited: four P2 and two P3. The resolved P2 was already noted in intervening remediation memory. Existing issues cited during deduplication are not counted as new findings.

## P2

**New — [MYK9-991](https://linear.app/myk9-platform/issue/MYK9-991), NCR-2026-10-04-01: unread refund queue reports empty.** Classification product UX/state truthfulness; source Medium; source: codex. Owner Richard Beezley. First/last seen October4; one occurrence; baseline above. Introduced by b39ba82cc / PR2689. Site admin → `/admin/health` → Refunds awaiting approval.

[RefundRequestsSection.tsx:114](https://github.com/rbeezley/myk9-platform/blob/6a928bbc059179875c3ae3192cc472b130735963/apps/myk9show/src/pages/admin/RefundRequestsSection.tsx#L114) reads only data/isLoading/error and falls through to a green “No refunds waiting.” at138 when the real query is pending/paused with no data. Its [hook:35](https://github.com/rbeezley/myk9-platform/blob/6a928bbc059179875c3ae3192cc472b130735963/apps/myk9show/src/features/admin-system-health/useRefundRequests.ts#L35) is online-only.

Focused proof rendered the unchanged component and real hook with a real QueryClient, repository custom render wrapper, fresh cache, and offline onlineManager. Query state was pending/paused/data undefined; Supabase.from was never called; the false-empty DOM assertion passed. This models an **offline transition in an already-running app followed by first navigation to the board**, not cold startup. ADR-010 explicitly distinguishes them. Confidence high for component/query behavior; no authenticated browser or actual refund operation claimed.

Expected: unknown/offline feedback until a successful read; reconnect recovers the queue. Impact: admin may overlook unread refund work; no money loss or authorization bypass established. Next action: handle paused/unsettled state locally, preserve online-only reads and ADR-010. Closure: real-query lifecycle tests for pending/paused, success empty/nonempty, failure and cached refetch; record real-component or authenticated offline→reconnect behavior at the fix SHA. Full contract is in Linear.

Deduplication included archived-inclusive component/workflow/symptom/cause searches and full MYK9-876,981,365,223 reads. The completed approval conversion, existing closure issue, global offline decision and older health headline fix do not own this new card's false-empty state. Latest main and merged PR2689 contain no subsequent fix.

**Unchanged — [MYK9-834](https://linear.app/myk9-platform/issue/MYK9-834): offline ringside identity proof.** Verification prerequisite; source Medium; source: codex. Owner Richard. First seen September26, specific reaffirmation regression October2; last reconciled October4; baseline above. [useRehydrateRingsideGrant.ts:120](https://github.com/rbeezley/myk9-platform/blob/6a928bbc059179875c3ae3192cc472b130735963/apps/myk9show/src/features/at-show/useRehydrateRingsideGrant.ts#L120). Existing PR2672 implementation/focused proof remains distinct from the missing deployed journey. Closure remains refocus → expired-token offline reload → durable local score → reconnect queued upload, with identity/revocation controls. Latest full issue/comments retain this gate. No newly observed score loss; no deployment/shared session operation repeated.

**Blocked — [MYK9-639](https://linear.app/myk9-platform/issue/MYK9-639): moved-entry settlement operational proof.** Verification prerequisite; current P2/source Medium, historical P1 money defect kept separate; source: codex. Owner Richard. First seen September19–20; last reconciled October4; baseline above. [paymentReconciliationLoader.ts:254](https://github.com/rbeezley/myk9-platform/blob/6a928bbc059179875c3ae3192cc472b130735963/apps/myk9show/supabase/functions/stripe-webhook/paymentReconciliationLoader.ts#L254). Owner explicitly defers controlled Stripe TEST replay until after October10. Both cart and payment-link callers, one/two-hop roots, exactly-once payment, authoritative/replica/report readback and negative controls remain required. No payment or database write performed; no new financial defect inferred.

**Blocked — [MYK9-947](https://linear.app/myk9-platform/issue/MYK9-947): watcher operational proof.** Test/harness verification prerequisite; source Medium; source: codex. Owner Richard. First seen October2; last reconciled October4; baseline above. [watch-pr-checks.sh:108](https://github.com/rbeezley/myk9-platform/blob/6a928bbc059179875c3ae3192cc472b130735963/scripts/qa/watch-pr-checks.sh#L108). PR2680's ordering fix remains; latest comment still requires an actual no-merge draft→ready/rerun walk. No such GitHub mutation was authorized or executed in this review. Prior fixture success is not this closure proof.

**Resolved — [MYK9-965](https://linear.app/myk9-platform/issue/MYK9-965), NCR-2026-10-03-01: tablet pending-link target.** UX/accessibility; source Medium; source: codex. Owner Richard. First seen October3; last reconciled October4; baseline above. PR2700 /1d296f42 changes [ClassEntryBreakdownLine.tsx:35](https://github.com/rbeezley/myk9-platform/blob/6a928bbc059179875c3ae3192cc472b130735963/apps/myk9show/src/components/schedule/ClassEntryBreakdownLine.tsx#L35) from `sm:min-h-6` to `sm:min-h-12`. Recorded October3 real manager-schedule components/router/app-CSS proof measured44/48/48/48px at375/768/1024/1440, correct filtered destination through edge clicks and Enter, zero parent activation and no overflow. Twenty-six focused tests and CI passed in the remediation run; schedule tests also pass in this audit's workflow batch. Full Linear description/comments read; already Done before this run. Resolution rests on measured focused proof, not merge alone. Synthetic schedule data, not an authenticated Entries-page walk; no production deployment claimed.

## P3

**Unchanged with new residual evidence — [MYK9-981](https://linear.app/myk9-platform/issue/MYK9-981): manual refund resolution leaves a stale alert on the board.** UX/recovery; source Low; source: codex. Owner Richard. Original issue first seen October3; this client symptom first/last seen October4; baseline above. Existing In Progress state preserved.

[useRefundRequests.ts:72](https://github.com/rbeezley/myk9-platform/blob/6a928bbc059179875c3ae3192cc472b130735963/apps/myk9show/src/features/admin-system-health/useRefundRequests.ts#L72) invalidates only the refund list after Resolve without refund. Approve at89 invalidates both lists. The [closure trigger:76](https://github.com/rbeezley/myk9-platform/blob/6a928bbc059179875c3ae3192cc472b130735963/supabase/migrations/20261004031700_myk9_981_closed_refund_request_releases_cart.sql#L76) closes the matching operator alert in both terminal states; [useOperatorAlerts.ts:35](https://github.com/rbeezley/myk9-platform/blob/6a928bbc059179875c3ae3192cc472b130735963/apps/myk9show/src/features/admin-system-health/useOperatorAlerts.ts#L35) otherwise polls every60 seconds.

Reproduced using unchanged real resolution/alert hooks and QueryClient, fresh cached alert, and only a successful edge transport stub. After mutateAsync the same alert remained, isInvalidated=false, and no alert read occurred. Confidence high. Once the closure migration is applied, the board may temporarily retain completed work until polling; this is not a permanently unresolved DB alert or failed refund. Next action: refresh both affected lists after manual resolution. Closure: real-cache integration proof and board action remove only the matching closed alert without waiting/reload; refusal does not invent resolution. Existing owner-approved migration/backfill proof remains separately required. Full contract appended to the existing issue; no duplicate created.

**Blocked — [MYK9-950](https://linear.app/myk9-platform/issue/MYK9-950): full generated-types drift classification.** Harness verification prerequisite; source Low; source: codex. Owner Richard. First seen October2; last reconciled October4; baseline above. [supabase-types-drift.sh:141](https://github.com/rbeezley/myk9-platform/blob/6a928bbc059179875c3ae3192cc472b130735963/scripts/qa/supabase-types-drift.sh#L141). PR2684/2688 normalization fixes stand. Prior actual CI sample showed0 missing/extra objects and160 changed lines, but only80 were printed. Latest owner comment retains actual full comparison showing only substantive generator changes. This run did not obtain a complete CI-generated artifact; no new closure claim or duplicate issue.

## Subsequent fixes and existing references

- Assessing the final window avoided re-reporting Clear Cart's lost-session handling (#2702), refund cart/alert database closure (#2717), client-only move-up/re-entry gates later backed by SQL (#2724), and overwritten show status (#2709).
- MYK9-981's migration is merged but its latest owner comment explicitly says applied backfill proof is pending; the review neither applied it nor called it resolved.
- MYK9-990 already owns preset/hand-order population alignment and unused reorder-hook cleanup. MYK9-963/964/966 own documented refund-queue scope and fee follow-ups; these were not newly filed or labeled new regressions here.
- Linear created: MYK9-991. Updated: MYK9-981 (description evidence and Codex label). No issues closed or other states changed.

## Verification and limits

| Executed batch                                                                          | Files | Tests | Result                   |
| --------------------------------------------------------------------------------------- | ----: | ----: | ------------------------ |
| Refund approval/queue/routing/resolution/online gate/payment-link helpers               |     7 |   123 | pass                     |
| Show-map/workbench, online switch, cart, onboarding, AskQ, landing and export workflows |   142 |  1283 | pass                     |
| Armband/results/print, mapper/replication, public gate and re-entry controls            |    15 |   165 | pass                     |
| Replication lock/refetch and by-show index controls                                     |     2 |    16 | pass                     |
| Secretary AKC format/outcome controls                                                   |     2 |   102 | pass                     |
| Behavioral SQL registration contract                                                    |     1 |     8 | pass                     |
| Isolated refund-board diagnostics, real hooks/query cache/component                     |     1 |     2 | reproduced both findings |

1697 existing test executions plus2 diagnostic assertions; counts describe executed batches, not full-suite coverage. Logs retained in the audit worktree `.logs`; diagnostic TypeScript/config in `apps/myk9show/.logs` are ignored evidence, not application changes.

An initial diagnostic config merged its include list with the app config and unintentionally started broader collection. It was interrupted; no full-suite pass or product failure inferred. The explicitly filtered two-test run then completed in991ms. Other completed batches took at most23.4s. jsdom media/navigation limitations are not browser proof.

Reviewed six new migrations and confirmed their behavioral files are registered. No SQL behavioral execution, shared DB/fixture mutation, Stripe action, frontend/edge deploy, authenticated browser walkthrough, load generation, PR, push or commit occurred. The bootstrap rebuilt package dependencies; restricted network install failed initially and approved bootstrap succeeded. A later read-only GitHub approval review timed out once; the permitted narrower retry succeeded. Neither is a product finding or remaining blocker.

Report/cursor remain local and uncommitted. Shared primary cursor and retained worktree cursor receive the same reviewed endpoint; unrelated primary edits are preserved. Memory carries the same boundary and canonical ledger.

## Reviewed commits

- 92301b329 — AskQ document freshness (#2694)
- be2c5f0a4 — demo names (#2695)
- c5031dd7f — Tera animations/dock (#2696)
- b39ba82cc — refund approval and durable claims (#2689)
- 2a824d0d6 — show-home scrolling/card layout (#2698)
- 0174f29a2 — secretary guide (#2699)
- 1d296f42e — tablet pending-link target (#2700)
- 866a89112 — role onboarding (#2697)
- cc58b11b7 — Clear Cart session preservation (#2702)
- f0c0e73b2 — active-club E2E fixture (#2706)
- d11d15fab — replication lock-event test (#2705)
- 20b5b5f7c — withdrawn run lists/armbands/counts (#2704)
- 6616b4fd8 — pending move-up UI gate (#2708)
- 8bdd53b85 — show status mapping (#2709)
- d74535313 — show-home settings/counts (#2703)
- 48f6ec020 — actual class scoring times (#2701)
- d6acb243b — accepted expected scored counts (#2712)
- e2227f033 — real secretary class header (#2710)
- 5b919f400 — assigned public judges (#2711)
- 2bb4cd3c9 — real class table data (#2713)
- 4ba33cc42 — online-entry switch and publish gates (#2707)
- 88c085f05 — closeout removal categories (#2714)
- ce2850f54 — null armbands (#2715)
- 7794a04e5 — by-show spy timer isolation (#2718)
- db2bc77b4 — refund closure trigger (#2717)
- 7e68db163 — client re-entry restrictions (#2716)
- f895a5065 — leave-class copy (#2719)
- e14b4a5f6 — show-index spy timer isolation (#2721)
- d85e01d2f — hand run-order placement (#2720)
- 5c9096975 — guest CSV exports (#2723)
- 6a928bbc0 — server move-up/re-entry guards (#2724)
