# Codex daily commit review — September 12, 2026

> source: codex · detecting task: nightly-commit-review

**Publication history:** this run finished on September 12 but its commit was blocked when the global Codex PreToolUse hook ran lint/typecheck in the unrelated dirty primary checkout. No commit or push occurred that day; the hook was not bypassed or modified. The September 13 run recovered this report and its registry entries into its isolated documentation batch and advanced the shared cursor through the subsequently reviewed commits. See the [September 13 report](codex-daily-commit-review-2026-09-13.md) for publication outcome and current finding state.

Two new P2 observations are recorded under existing Linear issues. One prior SQL coverage finding is resolved; one payment-proof item awaits final PR delivery. Linear is the canonical work queue.

## Window and scope

- Shared cursor start, exclusive: `c660131f5d091fe5f7e5972edf5493b2af44bc6d`, stamped September 11 at 10:12:28 UTC.
- Frozen reviewed baseline/end: `69f61d921c21a1fe87a3ced7f147b253e8f4fb5c`.
- Continuous window: **2026-09-11T10:12:28Z–2026-09-12T10:15:37Z**. All nine commits covered; no fallback, SHA gap, or time gap. Final fetch matched the frozen tip.
- Primary checkout is stale and contains unrelated edits. Review and scratch verification used an isolated current-main worktree; primary edits were preserved.
- Audit documentation itself is outside the reviewed boundary and belongs to the next run.

| Commit              | Reviewed change                                                              |
| ------------------- | ---------------------------------------------------------------------------- |
| `17b4fb7a3`         | Previous audit report, registry and cursor                                   |
| `cf05cbb5e` / #2170 | Set-based public result visibility and default inheritance parity            |
| `ec9cfb251` / #2172 | Opposing trial/class presets and actual comparison counts                    |
| `1680cf944` / #2173 | Browse discipline embed, mapper hardening, header/anchor/search/404 behavior |
| `e3e4bb9c1` / #2175 | TV failure and empty states                                                  |
| `e16745bca` / #2177 | Inflight stale-branch inventory and three-day scope                          |
| `bcddfc915` / #2176 | Vitest 5 workspace/config/assertion migration                                |
| `d4cb4941c` / #2178 | Shared offered-classes premium section across eight landing styles           |
| `69f61d921`         | Existing full-surface security audit evidence                                |

## Counts and tracking

| Lifecycle        | Count |
| ---------------- | ----- |
| New observations | 2     |
| Unchanged        | 0     |
| Resolved         | 1     |
| Blocked          | 1     |
| Duplicate        | 0     |
| Rejected         | 0     |

Outstanding reviewed observations: **P0 0 / P1 0 / P2 3 / P3 0**. Newly resolved: P2 1. Classification: two confirmed product/UX data-flow defects, one resolved SQL test-coverage defect, one delivery/verification prerequisite. Existing security audit findings are references, not newly counted discoveries.

Four existing Linear descriptions updated: **MYK9-467, MYK9-466, MYK9-126, MYK9-423**. MYK9-467 reopened Done → Todo; MYK9-466 remains Todo; both tagged Codex. Existing priorities and owners preserved. No issues created or closed; no filing approval or access blocker remains. Archived-inclusive searches, full candidate descriptions, relevant PRs, registry and memory supplied deduplication.

## P2 — unresolved

### MYK9-467 — cached TV content hides refresh failure

- **Classification/status:** confirmed show-day feedback defect; new observation / registry open. Canonical P2; source Medium; source codex.
- **Scope:** exhibitor, secretary and venue viewers; `/tv/:showId`; both mobile and desktop. Baseline above; first/last seen September 12, one deterministic run with two viewport branches. The parent issue's original observation dates to September 10.
- **Owner/confidence:** Richard Beezley; high for actual-query component replay, fresh browser incidence unmeasured.
- **Cause:** [TVGrid.tsx:14](https://github.com/rbeezley/myk9-platform/blob/69f61d921c21a1fe87a3ced7f147b253e8f4fb5c/apps/myk9show/src/pages/TVDisplay/TVGrid.tsx#L14) and [TVMobileList.tsx:20](https://github.com/rbeezley/myk9-platform/blob/69f61d921c21a1fe87a3ced7f147b253e8f4fb5c/apps/myk9show/src/pages/TVDisplay/TVMobileList.tsx#L20) show errors only with empty arrays. #2175 now propagates service failures, so React Query retains cached data while these guards suppress the error. [index.tsx:165](https://github.com/rbeezley/myk9-platform/blob/69f61d921c21a1fe87a3ced7f147b253e8f4fb5c/apps/myk9show/src/pages/TVDisplay/index.tsx#L165) derives Live from the realtime connection.
- **Proof:** real TVDisplay, useTVData/useTVResults, layouts and QueryClient; mock only service/identity/realtime boundaries. Load a synthetic Interior Advanced class (3/10), reject the service with an injected 503, invalidate the actual classes query, wait for query status error. Both layouts retain the card and display `Live • 1 class active`; neither displays failure text. Two expected error-notice assertions fail.
- **Expected/impact:** retain cached content with a calm stale/refresh-failure notice. A connected realtime channel does not establish freshness of the failed board read; viewers otherwise trust stale progress.
- **Closure:** test success → failed active/results refetch → recovery across both layouts, preserving cached content and clearing the notice after recovery. Record owned mobile/desktop browser interception proof. Separately establish the parent's original podium-to-empty trigger; this replay does not prove that trigger.
- **Canonical contract:** [MYK9-467](https://linear.app/myk9-platform/issue/MYK9-467), [PR #2175](https://github.com/rbeezley/myk9-platform/pull/2175). Empty-state improvements remain valid.

### MYK9-466 — offered classes omit uncached trials

- **Classification/status:** confirmed exhibitor discovery/data-flow defect in the replacement public preview; new observation / registry open. Canonical P2; source Medium; source codex. Broader parent High priority preserved.
- **Scope:** prospective/signed-out exhibitors, show premium and See classes first anchor across all eight styles. Baseline above; first/last seen September 12; one run covering empty and partial trial caches; not viewport-specific.
- **Owner/confidence:** unassigned; show-read/landing ownership gap. High for production-function replay, fresh browser incidence unmeasured.
- **Cause:** [reads.ts:170](https://github.com/rbeezley/myk9-platform/blob/69f61d921c21a1fe87a3ced7f147b253e8f4fb5c/apps/myk9show/src/services/database/shows/reads.ts#L170) maps only existing local trial identities, discarding successful remote trials absent locally. The new [publicClassesHref.ts:18](https://github.com/rbeezley/myk9-platform/blob/69f61d921c21a1fe87a3ced7f147b253e8f4fb5c/apps/myk9show/src/features/_shared/publicClassesHref.ts#L18) and OfferedClassesSection consume show.trials; previously the link used independently resolved allTrials. Existing landingTrials are passed separately rather than merged into show.trials.
- **Proof:** real getShowById → mapDatabaseToShow → buildOfferedClasses/publicClassesHref, with existing replicated-table/PostgREST fixture boundaries. Remote returns two trials: Saturday Interior Novice and Sunday Vehicle Advanced. Empty local trials produce `offered=[]; href=null`; Saturday-only local cache produces `offered=[trial-1]`. Expected both trial identities in each case. Both new assertions fail; seven original fallback tests still pass.
- **Expected/impact:** reconcile successful remote trial identities before deriving the preview, preserving warm local edits and offline behavior. Exhibitors can otherwise conclude their day or element is unavailable.
- **Closure:** exact empty/partial-cache trial and element assertions pass; warm-cache/local-edit/network-failure cases remain green; owned browser cold/partial-cache replay renders the complete preview and working anchor without reload. Reuse the existing preview; no additional page or grant changes.
- **Canonical contract:** [MYK9-466](https://linear.app/myk9-platform/issue/MYK9-466), [PR #2178](https://github.com/rbeezley/myk9-platform/pull/2178). Separate anonymous-access decisions remain open.

### MYK9-423 — payment evidence present, final delivery pending

- **Classification/status:** delivery/verification prerequisite; blocked / registry in-progress. Canonical P2; source High historical; source codex. No present payment defect asserted.
- **Scope/owner:** fee-card Finish Payment → recovered cart → same-entry payment → both balances; Richard Beezley. First seen September 6, last reconciled September 12; sixth detailed daily observation (September 10 did not reconcile).
- **Evidence:** the [exact #2179 verification report](https://github.com/rbeezley/myk9-platform/blob/0f42676e1d4d24852df8c4f4a68733d6c3de5fd9/openspec/changes/myk9-423-payment-proof/verification-report.md) records September 11 19:14–19:18 UTC hosted CTA → three recovered entries → approved test payment → entries Paid in full and payments $0. Real CTA/router/store/recovery/SDK coverage and the failing empty-hydration control are recorded, with nine focused tests passing.
- **Transition:** supersedes missing-hosted-proof and mocked-loader-only statements. No repeat payment needed. The PR-body identifier transcription discrepancy already has independent review feedback; use the exact report, no duplicate issue.
- **Remaining closure:** [#2179](https://github.com/rbeezley/myk9-platform/pull/2179) is open at inspected head `0f42676e1`; finish final-head checks, independent review, evidence correction and merge. Its reported 20,039-test shuffled pass is from an earlier tree. Reconcile each original criterion against the completed hosted/composition proof before closing.
- **Confidence/reference:** high for inspected durable evidence and open delivery state, not a fresh payment replay. [MYK9-423](https://linear.app/myk9-platform/issue/MYK9-423) remains In Progress.

## P2 — newly resolved

### NCR-2026-09-11-01 / MYK9-126 — SQL inheritance coverage

- **Classification/status:** SQL test-coverage defect; resolved / registry fixed. Canonical P2; source Medium; source codex. Owner Richard Beezley. First seen September 11; last verified September 12; two daily observations.
- **Scope:** secretary result-release configuration and public result visibility, `supabase/tests/myk9_126_class_result_visibility_parity_test.sql`; current baseline above.
- **Proof:** #2170 supplies missing/default/partial cases; #2172 supplies competing presets and counts actual compared rows. Recorded PostgreSQL 18.3 negative controls fail named assertions for wrong qualification default, removed class-preset expansion and omitted comparison row (exit 3); restored real view passes 1,080 comparisons.
- **Independent corroboration:** fully migrated [main SQL CI](https://github.com/rbeezley/myk9-platform/actions/runs/34655978299/job/103448360674) reports `180 combinations, 1080 class comparisons, 6 with no show settings, all agree`, plus `pass 5 ok: unconfigured defaults pinned absolutely`.
- **Resolution:** original negative-control plus restored/migrated-green contract satisfied; high confidence. No present security defect claimed. [MYK9-126](https://linear.app/myk9-platform/issue/MYK9-126) remains In Progress for its broader G9 criteria; this audit does not close that parent or approve a load run.

## Verification and limits

**920 unique existing tests in 82 files pass**, plus seven repeated fallback assertions in the temporary proof. Four added, intentional failure assertions reproduce the two defects.

| Check                                                                                     | Result                                           |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------ |
| App focused shared UI, show reads/mappers, TV, browse filters/page and query-client tests | 35 files / 285 pass                              |
| Root inflight tests                                                                       | 1 file / 58 pass                                 |
| Root behavioral SQL runner tests                                                          | 1 file / 8 pass                                  |
| scoring-ui suite                                                                          | 17 files / 198 pass                              |
| ringside suite                                                                            | 28 files / 371 pass                              |
| App `tsc --noEmit --project tsconfig.app.json`                                            | Exit 0                                           |
| Locked dependency installation and 12 package builds                                      | Pass; builds cached                              |
| TV populated-refetch probes                                                               | Two intended failures                            |
| Empty/partial trial-cache probes                                                          | Two intended failures; seven existing cases pass |
| Reviewed-range `git diff --check`                                                         | Pass                                             |

Commands: app `pnpm vitest run src/features/_shared src/services/database/shows src/test/mappers src/pages/TVDisplay src/services/database/tv-display src/hooks/useBrowseShowsFilters.test.ts src/test/pages/BrowseShowsPage.test.tsx src/App.queryClient.test.tsx`; root `pnpm vitest run --project root scripts/qa/inflight.test.ts` and `pnpm vitest run --project root scripts/qa/run-behavioral-sql-tests.test.ts`; `pnpm vitest run` in each named package. Temporary probe commands from the app: `pnpm vitest run scripts/ncr-20260912-tv.test.ts` and `pnpm vitest run scripts/ncr-20260912-classes.test.ts`.

A mistaken initial SQL-runner filename collected only inflight tests; the correct runner file subsequently passed. An initial solution-style TypeScript invocation checked no app files; the explicit app project subsequently passed. Initial temporary trial-case parameterization was corrected before the product reproduction. These authoring/invocation mistakes are not product findings. Initial sandbox DNS restrictions blocked install/GitHub queries; authorized network retries succeeded.

Read-only [main CI 34655978299](https://github.com/rbeezley/myk9-platform/actions/runs/34655978299) confirms success for six app shards, coverage/gate, SQL, packages, build, quality, smoke and accessibility. This is recorded CI evidence, not a locally rerun full suite. Scratch TypeScript probes and logs are retained locally at `/private/tmp/ncr-20260912-evidence/`; they are excluded from the documentation commit.

No full local app suite, fresh browser/E2E, live SQL/database reads or mutations, payments, deployment, load generation or shared-fixture changes. No application implementation files changed. Missing-show `.single()` concerns were already corrected to `.maybeSingle()` in final #2175 and excluded; intermediate comparison-count weaknesses were corrected in final #2172. Existing security report MYK9-469–473 under MYK9-468 is a separate current-state audit, not new defects introduced by the documentation commit. No duplicate filing or unrelated closure.

## Next focus

Documentation checks: formatting and diff-check pass; inflight reports no actionable overlaps (stale inventory only); all five current In Progress issues have no conflicting audit-document scope. The code-quality ratchet passes through `pnpm exec node --import tsx scripts/qa/code-quality-ratchet.ts`; the normal tsx launcher was blocked by sandbox IPC permissions. No quality baseline changed.

Repair the two narrowly reproduced P2 paths, then collect their specified recovery/browser proof. Finish #2179's existing delivery gates. SQL parity coverage requires no further action under this finding; broader G9 work retains its original controls.
