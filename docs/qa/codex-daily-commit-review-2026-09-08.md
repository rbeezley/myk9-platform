# Codex daily commit review — 2026-09-08

> **Status:** Reference

## Window and outcome

- Source: codex; automation: `nightly-commit-review`; method: `quality-finding-lifecycle`, with automatic Linear tracking at every severity.
- Shared starting cursor (exclusive): `96edbabdcf81b819842fb236c7130b48b9564c0a`; prior window end `2026-09-07T15:55:45Z`.
- Reviewed all **26 first-parent descendants** through frozen remote main `44857161a1a573e411ef13d86e31a7e04545e93e`. Continuous window: **2026-09-07T15:55:45Z–2026-09-08T10:09:18Z**. No fallback, missing SHA range, or time coverage gap. The initial local checkout lagged by one documentation commit; fetched and reviewed that commit too.
- No newly confirmed actionable regression. Updated **seven canonical Linear descriptions**, created no issues, changed no workflow states, and closed no issues. One existing test defect has passing closure proof; one product defect and five verification prerequisites remain.
- Audit only: no application-code edits or implementation plan. OPSX implementation is not applicable. Test scratch files and dependency symlinks were isolated in an owned detached worktree.

| Lifecycle            | Count |
| -------------------- | ----: |
| New                  |     0 |
| Unchanged            |     1 |
| Resolved             |     1 |
| Blocked verification |     5 |
| Duplicate            |     0 |
| Rejected             |     0 |

Unresolved priorities: **P0 0 / P1 0 / P2 3 / P3 3**. Counts describe this reconciliation scope, not the whole board. Classification: one product convenience defect, five concrete verification prerequisites; one test/harness defect newly resolved. All entries below use the reviewed baseline above and `source: codex`. Confidence is high in source/test evidence and the recorded proof gaps; no fresh hosted behavior is asserted.

## P2 — remaining verification

### MYK9-423 — existing-entry payment completion

[Canonical contract](https://linear.app/myk9-platform/issue/MYK9-423). **Blocked; source High; owner Richard Beezley.** First seen September 6; last checked September 8; three daily observations.

The original source repair remains present. Current-range cart changes are formatting only. Exact issue and all comments still contain no replay from the unpaid fee-card CTA through recovered cart and successful checkout to the **same entry IDs paid and both balances clear**, nor the specified real CTA-to-cart integration proof. Relevant scope: `apps/myk9show/src/store/cartStore.recovery.ts`, `cartStore.ts`, and `apps/myk9show/supabase/functions/stripe-webhook/index.ts`; original repair [#2082](https://github.com/rbeezley/myk9-platform/pull/2082).

Next/closure: attach existing evidence first; otherwise verify deployed schema/functions read-only and perform the separately authorized owned sandbox replay described in Linear. Generic passing CI is not this payment-path proof. This is an incomplete original acceptance gate, not a new financial defect.

### NCR-2026-09-07-01 / MYK9-435 — bookmarked-month keyboard replay

[Canonical contract](https://linear.app/myk9-platform/issue/MYK9-435). **Blocked; source Medium; unassigned UI owner.** First seen September 7; last checked September 8; two daily observations.

[#2124](https://github.com/rbeezley/myk9-platform/pull/2124) repairs the source defect. `MonthScrubber.tsx:44-66` and `monthScrubber.helpers.ts:119-137` now retain an out-of-window selected tile and a keyboard entry point. Real-component tests pass for January 2026 and January 2028, including arrow selection, focus, one tab stop, and URL changes. The implementation comment expressly leaves browser keyboard replay outstanding.

Next/closure: on the existing `/shows?month=YYYY-MM` surface, record Tab → arrows → selected month and matching filtered results for old/future links. Preserve the implemented fix; no new surface is needed.

### SHD-2026-08-31-01 / MYK9-438 — current advisor export proof

[Canonical contract](https://linear.app/myk9-platform/issue/MYK9-438). **Blocked; source Medium; owner Richard Beezley.** First seen August 31; last checked September 8; recurrence count not normalized across source audits.

#2124 repairs `scripts/qa/db-drift/advisor-inventory.ts:93-162`: bare arrays retain their lint; malformed records and mixed envelopes fail visibly. Focused inventory tests and the complete DB-drift suite pass. No current raw Security/Performance export with raw/normalized/classified counts was attached in the inspected issue or PR; its implementation comment explicitly retains this gate.

Next/closure: feed permitted current exports through the fixed parser and record shape and all three counts. No Supabase connector is available in this session, and no fresh export was claimed. Source repair is complete; operational proof remains.

## P3 — one defect and two verification gates

### MYK9-427 — signed-in location fallback

[Canonical residual contract](https://linear.app/myk9-platform/issue/MYK9-427). **Unchanged; source Low; owner Richard Beezley.** First seen September 7; last checked September 8; two daily observations.

`apps/myk9show/src/features/location/useViewerLocation.ts:63-69` still enables the IP query only when `!databaseUserId && remembered === null`. A signed-in account whose profile has no usable location therefore cannot reach the promised approximate-location fallback. Yesterday's actual-hook proof (empty profile, zero IP calls, Anywhere result) remains applicable: the only change here is verified formatting. Location/helper tests pass but do not cover that orchestration.

Impact: no default miles, nearest-first sorting, or distance filter until the visitor chooses a location. Next/closure: implement the existing fallback criterion while preserving explicit Anywhere/remembered overrides, then pass empty/failed/valid-profile real-hook tests and signed-in browser proof. Completed redesign/map scope remains complete.

### NCR-2026-09-07-02 / MYK9-436 — actual control measurements

[Canonical contract](https://linear.app/myk9-platform/issue/MYK9-436). **Blocked; source Low; unassigned UI owner.** First seen September 7; last checked September 8; two daily observations.

#2124 fixes `MonthScrubber.tsx:104-127` to use `text-xs`, and `OperatorAlertDetail.tsx:26` to use `min-h-11`. Current component tests pass, asserting classes. They do not measure computed font sizes or actual button bounds. The original phone/tablet/desktop × theme sizing, clipping, panel, and keyboard proof is still absent.

Next/closure: measure the actual components at the original viewport/theme matrix, verifying captions ≥14px, detail toggle ≥44px, and no new clipping or interaction regression. Preserve the code repair; no new size defect is claimed.

### SHD-2026-09-07-02 / MYK9-439 — applied FK indexes

[Canonical contract](https://linear.app/myk9-platform/issue/MYK9-439). **Blocked; source Low; owner Richard Beezley.** First seen August 31 for calendar-feed scope, September 7 for show-official scope; last checked September 8; recurrence count not normalized.

#2124 adds `supabase/migrations/20260907150000_add_missing_fk_leading_indexes.sql:11-110`. Review caught two additional gaps, so it now covers **five** columns: calendar-feed show ID, email-log show ID, cart-item entry ID, and both show-official person references. Transaction-local timeouts, relation-size guard, exact FK identity and valid/ready/live leading-index checks were inspected. Source contracts, DB-drift tests and hosted main SQL CI pass.

The implementation explicitly did not apply the migration. Next/closure: separately authorized deployment if still needed, followed by the required live catalog proof for all five and zero uncovered public FKs. CI is not linked-database application evidence. No current database outage or measured slowdown is asserted.

## Newly resolved P3

### NCR-2026-09-06-02 / MYK9-437 — host-dependent reset test

[Canonical contract](https://linear.app/myk9-platform/issue/MYK9-437). **Resolved in this audit ledger; source Low; unassigned test owner.** First seen September 6; last checked September 8; three dated observations. Linear remains Todo because this audit did not close issues.

#2124 converts the fragile reset test to controlled timers. Current `appApiRequestTracker.test.ts` passes **10/10 twice**, including shuffled seed `1788723296711`. Two isolated Vite pre-transform negative controls prove the assertions still detect real breakage without modifying application files:

- Remove `tracker.pending.clear()` in `appApiRequestTracker.ts`: exactly the reset-success assertion at test line 194 fails, retaining the stranded URL; exit 1.
- Remove the reset's first `tracker.lastActivityAt = Date.now()`: exactly the stale-idle assertion at test line 244 fails, resolving too early; exit 1.
- Unmodified suite: exit 0. Main CI also passes all app shards and coverage.

Closure proof is satisfied for this test defect. Production timeout semantics were unchanged. Reopen only on a reproduced regression.

## Review coverage, checks and limits

Reviewed behavior changes include header/appearance consolidation, dependency pins, guest and role-landing E2E assertions, per-main-SHA CI concurrency, trace capture, scheduled mutation runner, shared-rule synchronization, review/verdict/poster wrappers and trusted fallback, and all #2124 changes. No additional product/security/intent regression or concrete missing high-risk test was confirmed.

For the large formatting commit `d6e775f9d`, replayed the installed Prettier with repository configuration on all **1,732 modified parseable files**: **1,727 exactly match** the committed output. Inspected five exceptions: three intentional hook/CI/package changes plus harmless line-layout differences in the payment mock test and vacation plan. The check establishes formatter attribution, not exhaustive runtime/browser equivalence. The newly added formatting script, ignore rules, and workflow changes were reviewed separately.

Existing mid-PR fixes were checked on final main: all five FK indexes, transaction-local timeouts, selected-month year labels, scroll dependencies, deterministic positive settlement test, malformed/mixed advisor envelopes, measurement reset wiring, SIGPIPE-safe verdict recognition, and pre-detach head check. No obsolete intermediate finding was filed again.

The last documentation commit records existing [MYK9-444–448](https://linear.app/myk9-platform/issue/MYK9-444) and MYK9-322 work. Those earlier-source findings remain with their canonical audit; they are not new executable regressions from this range. Existing MYK9-443 owns the documented panel-focus race; the unchanged failing E2E assertion was deliberately retained. No new duplicates or speculative report hypotheses were filed.

Local verification:

- Seven QA/wrapper/inventory files: **193 tests passed**.
- Eight focused app files (month component/helpers, URL filters, alert sizing, request tracker, FK contract, header and location helper): **49 tests passed**.
- `pnpm qa:db-drift:test`: **34 passed**, including 19 inventory tests already counted above.
- Repeated shuffled unmodified request tracker: **10 passed**.
- Total **286 passing test executions / 257 distinct tests across 17 files**; two intentional negative-control runs each fail exactly one assertion as described above.
- `pnpm exec tsc --noEmit -p tsconfig.app.json`: passed. Shared-rules check: passed. E2E map: **129 specs**, passed.
- Reviewed-range `git diff --check`: exit **2**, one trailing space inside a pre-existing multiline JSX class literal in `EntryConflictResolutionWizard.tsx:336`. The exact trailing space exists before the formatting commit at line 234; reflow makes it appear as a newly added line. This has no confirmed behavior effect and is not filed as a defect. Report/cursor document edits pass their own diff check.

Hosted evidence: [main CI 34182549266](https://github.com/rbeezley/myk9-platform/actions/runs/34182549266) on `9965adb4d` completed successfully, including six app shards, full coverage, SQL, packages, quality, builds, A11y and E2E PR Smoke. [Frozen-tip CI 34205986181](https://github.com/rbeezley/myk9-platform/actions/runs/34205986181) also succeeded. Dormant staging workflows being skipped is expected and not a failure. This audit did not equate CI or merging with deployment.

Limits: no full local app suite, package rebuild, local production build, browser/E2E replay, current Supabase export/catalog replay, deployment, payment, shared-fixture mutation, physical-device test or generated load. Used existing dependencies/built packages in an isolated detached worktree. Sandbox GitHub DNS initially failed; read-only escalated fetch/PR/CI access succeeded. No Linear filing blocker.

## Reviewed commit inventory

In chronological first-parent order:

`9cce163df`, `f2751c1b3` (#2111), `427e57069` (#2110), `261734e17` (#2112), `c11c409e1` and `5750562b5` (#2114), `c92a37c0a`, `13dc986a0` (#2117), `0c590755d` (#2116), `b8b279f1d` (#2118), `bb0ed47e7` (#2119), `e3ca44d1d`, `0c0c83678` (#2115), `4d7d9d0e5` (#2120), `7820e6c45` (#2122), `d6e775f9d` (#2121), `ed4b359b6`, `70ea6783b` (#2123), `fae3d5aa8` (#2125), `cdf030c77` (#2126), `00b03a42b`, `d86cfa612` (#2127), `42943ef5c` (#2130), `9c975d4ae` (#2128), `9965adb4d` (#2124), `44857161a`.

Boundary stamped only through `44857161a`; this report commit remains for the next run. Seven canonical Linear descriptions hold the current evidence, next actions and exact closure proof; Markdown and automation memory retain audit history only.
