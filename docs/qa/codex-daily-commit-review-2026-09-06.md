# Codex daily commit review — 2026-09-06

> **Status:** Complete review; one new product regression and two existing operational gates remain.

## Window and outcome

- Source: codex; automation: `nightly-commit-review`; methodology: `quality-finding-lifecycle` with the user's all-severity automatic Linear filing policy.
- Shared boundary read: `351e0db04b5d23798ded3c96f0e95c2c2f354789`, window end `2026-09-05T10:18:41Z`, stamped by `claude-daily-commit-review`.
- Reviewed all **51 first-parent descendant commits**, exclusive start through **`8facd0017ccd4de5f9a28ae99ef1c58e2f89f910`** inclusive, equal to fetched `origin/main` at review start.
- Continuous window: **2026-09-05T10:18:41Z–2026-09-06T10:15:59Z**. No SHA or time coverage gap; the first descendant at 12:12:03Z represents idle time after the preceding boundary. No fallback window used.
- Created **MYK9-424**; reopened **MYK9-407** and **MYK9-408** for their remaining original gates; appended exact passing evidence to **MYK9-356** and **MYK9-405**, leaving their existing Done states unchanged. Five Linear records created/updated; no issues closed by this review.
- No application code changes, shared DB writes, function deployments, payment attempts, scheduler mutations, or installed prompt edits. Temporary IO-mocked TypeScript probes ran in a dedicated review worktree.

| Lifecycle | Count | Scope                                                                |
| --------- | ----: | -------------------------------------------------------------------- |
| New       |     1 | MYK9-424, P1 product/offline report regression                       |
| Unchanged |     1 | MYK9-408, P3 installed prompt drift                                  |
| Resolved  |     7 | MYK9-294, MYK9-381, MYK9-289, MYK9-356, MYK9-405, MYK9-358, MYK9-406 |
| Duplicate |     0 | Existing canonical references reused; no duplicate filings           |
| Rejected  |     0 | No separate reportable rejected finding                              |
| Blocked   |     1 | MYK9-407, P3 deployment/verification prerequisite                    |

Outstanding canonical priorities: **P0 0, P1 1, P2 0, P3 2**. The P3 blocked item is an explicit operational proof prerequisite, not a newly confirmed runtime defect. Classification counts for outstanding work: product 1, automation configuration 1, deployment verification 1. Resolved items comprise product 2, harness 2, SQL verification 1, migration documentation 1, and plan metadata 1. These counts cover this review's reconciliation scope, not the entire Linear backlog.

## P1 — must fix before launch

### NCR-2026-09-06-01 / MYK9-424 — cached trial reports lose scores or hang

[Canonical Linear execution contract](https://linear.app/myk9-platform/issue/MYK9-424).

- **Lifecycle / registry:** new / open; Linear Todo.
- **Classification:** confirmed secretary/show-day offline report regression; swallowed-error and unbounded optional request.
- **Canonical priority / source severity:** P1 / High. The secretary's print/export golden path requires connectivity or a manual per-class workaround on an otherwise warm device. No persistent score corruption or loss was demonstrated.
- **Source:** codex; **first/last seen:** 2026-09-06 / 2026-09-06; **run count:** 1, with two deterministic failing assertions.
- **Baseline:** `8facd0017ccd4de5f9a28ae99ef1c58e2f89f910`; introduced by [#2044](https://github.com/rbeezley/myk9-platform/pull/2044), `9e29197e0`; still present after #2049 and #2057.
- **Role / workflow:** secretary, existing `/shows/:showId/reports`; trial Results Sheet, trial-only High in Trial, show/trial result catalog. No viewport dependency demonstrated.
- **Exact code:** `apps/myk9show/src/services/database/entries/releasedShowResults.ts:20-44`; shared caller `reads.ts:624-625`; `apps/myk9show/src/hooks/queries/useReportData.ts:96-106`; `apps/myk9show/src/components/reports/ResultsSheet.tsx:27-76`; `apps/myk9show/src/lib/reports/reportUtils.ts:201-240`.
- **Observed:** after a successful cache read, every scored row is masked before a mandatory online results-view request. On error the function returns the masked rows with `error:null`; the real report prints **Qualified Entries: 0**, clearing Q/time/placement. A never-settling request prevents the show read from completing even after 30 seconds of simulated time.
- **Expected:** retain truthful authorized staff report data with bounded loading when optional enrichment is unavailable; if completeness cannot be established safely, communicate that explicitly instead of printing a false zero. Preserve exhibitor release/revocation masking.
- **Impact / intent:** undermines secretary calm control and warm-device show-day resilience. Single-class reads use another path; no claim they strip scores.
- **Confidence:** high from actual-function and rendered-report proof; no hosted browser offline replay performed.
- **Owner:** unassigned; entry-read/report maintainer needed.
- **Deduplication:** archived-inclusive searches by workflow, file/function, cached scores, false qualified count and enrichment; exact MYK9-246, MYK9-283, MYK9-381 read. These completed scopes concern registration hydration, cold class reads and exhibitor result release respectively. This new shared-read secretary regression remains separate.
- **Next action / closure:** implement only the existing read/report contract. Both audit assertions must pass, released/withheld/revoked exhibitor tests must remain green, and a rendered/browser trial-report replay must show correct Q/count/time/placement and bounded loading with a warm authorized cache and unavailable endpoint. Record cache provenance and role. No new page or broadened RBAC.

Sanitized reproduction: mock only IO so the established replication fallback returns one already-authorized cached row (`is_scored:true`, `result_status:'qualified'`, `search_time_seconds:38.5`, `final_placement:1`). Make show sync reject offline and the results view resolve an error. Call the real `getEntriesByShow`, real report mapper, and real ResultsSheet renderer. Success/error-null remains, but expected `Qualified Entries: 1` fails against zero. Independently return a never-settling view promise and advance fake time 30,000ms: expected completion fails. Both expected-behavior assertions failed in 10ms. The complete temporary TypeScript probe is preserved below as review evidence, not committed application test code.

## P3 — existing operational work remains

### MYK9-407 — deployed health cadence proof remains open

[Canonical Linear issue](https://linear.app/myk9-platform/issue/MYK9-407).

- **Lifecycle / registry:** blocked / in-progress; reopened Done → In Progress to preserve the issue's own explicit deployment gate.
- **Classification / priority / source:** concrete deployment/verification prerequisite, P3 / Low, source: codex. No fresh product defect asserted.
- **First/last seen:** 2026-09-05 / 2026-09-06; two dated observations; baseline `8facd0017ccd4de5f9a28ae99ef1c58e2f89f910`; owner Richard Beezley.
- **Affected scope:** admin health monitoring; `apps/myk9show/src/features/admin-system-health/healthCheckCadence.ts`, shared by `cron-health-check`; [source parity evidence](linear-todo-source-parity-2026-09-05.md:3).
- **Subsequent fix:** #2069 corrects the source cadence and focused cadence/selector/remediation tests pass. Do not repeat the historical claim that current source lacks the key.
- **Remaining evidence:** issue comments `691bad93-359d-4b00-90af-9d9bb4b388a1` and `09051abe-9740-44c3-a5fc-76bc9c4c702f` record the September 5 nine-source deployed comparison and explicitly exclude deployment. The old shared cadence was the only difference. No subsequent hosted full/continuous snapshot proof is recorded. This is historical bundle evidence, not a fresh September 6 deployment inspection.
- **Expected / impact:** the deployed runner must emit/carry forward the 48-hour stale window for `public_schema_create_acl`, matching sibling ACL checks; otherwise a narrow false-stale flag can persist. Source correctness alone does not complete the recorded execution-environment gate.
- **Confidence:** high on unmet recorded proof; current hosted state unmeasured.
- **Next action / closure:** approved scoped dependency deployment if still needed, then fresh full and continuous snapshots retaining correct window/timestamps/verdicts, plus existing health UI proof. If already deployed, attach exact evidence instead of redeploying. No shared mutation performed by this audit.

### MYK9-408 / NCR-2026-09-05-01 — installed failover prompt still asserts stale state

[Canonical Linear issue](https://linear.app/myk9-platform/issue/MYK9-408).

- **Lifecycle / registry:** unchanged / in-progress; reopened Done → In Progress for original prompt-parity criteria.
- **Classification / priority / source:** installed automation instruction drift, P3 / Low, source: codex.
- **First/last seen:** 2026-09-05 / 2026-09-06; two observations; baseline `8facd0017ccd4de5f9a28ae99ef1c58e2f89f910`; owner Richard Beezley.
- **Fresh exact evidence:** `/Users/richardbeezley/.claude/scheduled-tasks/claude-daily-commit-review/SKILL.md:10` still says “which is paused for token budget. Assume Codex has not run.” The current repository Task 3 in `docs/operations/scheduled-audits-claude.md` uses boundary/report/range verification. The Codex automation configuration is ACTIVE and this review is executing.
- **Subsequent fix:** #2072 prepares the correct repository prompt. Installation was explicitly excluded; comments `20d7cb6a-46c3-4166-b595-3fcb127bd73f` and `7e179246-22fe-475a-af36-e768cf25af81` retain installation/owner-state/subsequent-day gates.
- **Expected / observed:** installed prompt should match documented instructions apart from explained wrappers; its premise remains stale. Impact is a dormant instruction hazard when re-enabled, not evidence of two active tasks today.
- **Preserved decision:** September 5 scheduler proof in comment `fb86200f-1965-4931-825a-335301f11070` confirms the owner disabled Claude and `nextRunAt` disappeared. This audit does not reassert dual enablement; no fresh owning-Claude-scheduler tool was available.
- **Confidence:** high on installed file mismatch; fresh scheduler behavior unverified.
- **Next action / closure:** separately authorized installation of the prepared prompt, parity diff, fresh state from the owning schedulers preserving Claude-disabled intent, and the required completed subsequent-day single report/stamp. Morning execution alone does not prove the whole day's schedule.

## Newly resolved since the previous Codex reconciliation

All rows are source: codex, verified against baseline `8facd0017ccd4de5f9a28ae99ef1c58e2f89f910`; lifecycle resolved / registry fixed. Existing Linear Done states remain unchanged. Last checked 2026-09-06; historical first-seen dates and aliases are preserved from the prior report/memory. Richard Beezley owns MYK9-294/381/289/356/358; MYK9-405/406 retain their unassigned maintenance ownership. Reopen only upon a new reproducible residual, not merely from old pending comments.

| Priority / source        | Stable ID (first seen; dated checks)                                                                            | Scope and passing closure evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------ | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1 / High                | [MYK9-294](https://linear.app/myk9-platform/issue/MYK9-294) (Sep 1; recurring, historical count not normalized) | Checkout confirmation: deployed sandbox replay recorded in `2df929753` returned a real session ID and automatic success at 10.0s. Prior source token tests and recorded deployed replay together satisfy the payment gate; no payment performed by this audit.                                                                                                                                                                                                                                                                                                                                    |
| P2 / High, historical P1 | [MYK9-381](https://linear.app/myk9-platform/issue/MYK9-381) (Sep 4; 3 checks)                                   | Exhibitor results: #2044 + #2049 preserve canonical released data; current focused result tests pass. Attached deployed screenshot/closure shows Willow 38.50/52.40 and Scout 41.20 with Test Judge. [Recorded deployment proof](../plans/2026-09-05-myk9-381-result-merge.md). New MYK9-424 concerns another consumer.                                                                                                                                                                                                                                                                           |
| P2 / Medium              | [MYK9-289](https://linear.app/myk9-platform/issue/MYK9-289), NCR-2026-09-04-04 (mechanism Sep 4; 3 checks)      | Route attribution/title load: #2018, #2051, #2057. [Nightly 33980080362 Chromium](https://github.com/rbeezley/myk9-platform/actions/runs/33980080362/job/101343635119): public/exhibitor/secretary/judge/admin pass, club-admin skipped, 18 deterministic tests pass. Earlier post-reset runs attribute distinct URLs to originating routes. Five-second budget unchanged; current title/check-in/coalescing tests pass.                                                                                                                                                                          |
| P2 / Medium              | [MYK9-356](https://linear.app/myk9-platform/issue/MYK9-356) (Sep 3; 4 checks)                                   | Lifecycle absent SQL parity: #2066 [SQL job 101404517946](https://github.com/rbeezley/myk9-platform/actions/runs/34002783100/job/101404517946) shows PASS, four individually installed mutations fail as expected, and PASS after each restore: refresh, entry trigger, TV counts, TV board. Read actual log lines 4203–4231. Existing issue comment `6fcdfada-edc2-478a-8e44-4bb010eaf58d` records applied migration `20260904160000` and all four hosted function definitions. Exact CI proof appended to Linear.                                                                               |
| P2 / High historical     | [MYK9-405](https://linear.app/myk9-platform/issue/MYK9-405), NCR-2026-09-04-02 (Sep 4; 3 checks)                | #2068: current 12 guard tests pass. [CI 33993274655 Quality Checks](https://github.com/rbeezley/myk9-platform/actions/runs/33993274655/job/101379186187) runs real disposable-Git positive/negative fixtures, including a distinct competing branch required to fail. This satisfies the contract's explicit equivalent owned CI harness option; no separate red PR claimed. [Real migration #2070 Quality Checks](https://github.com/rbeezley/myk9-platform/actions/runs/34002789270/job/101404535611) logs `Migration version guard passed for 20260902180000`. Exact proof appended to Linear. |
| P3 / Low                 | [MYK9-358](https://linear.app/myk9-platform/issue/MYK9-358) (Sep 3; 4 checks)                                   | #2070 corrects the misleading header; comparison against its parent confirms executable body unchanged, SHA-256 `3b6344da9477d4b0a919d65a34bba773286b432f4d5a091af4c4969c4657a64d`. Real migration guard passes; prior read-only inventory proof recorded in issue. No database history rewrite.                                                                                                                                                                                                                                                                                                  |
| P3 / Low                 | [MYK9-406](https://linear.app/myk9-platform/issue/MYK9-406), NCR-2026-09-04-03 (Sep 4; 3 checks)                | #2071 reconciles living-plan metadata and installs a gate. Current 9 fixture tests pass, including malformed encoded-link handling; `pnpm qa:plans` confirms every living top-level plan has canonical status and index links. Historical unresolved operational gates remain Active, not falsely archived.                                                                                                                                                                                                                                                                                       |

## Focused verification and limits

- **567 existing Vitest tests in 47 files pass:** CI/tooling 163; entry/results/check-in/title/registration 64; admin/secretary/health/security/architecture 267; report hooks/renderers and four additional changed contracts 73.
- **8 Node browser-session lifecycle tests pass**, using fake CLI/process fixtures; no browser session created or shared browser terminated.
- **72/72 Git guardrail self-test fixtures pass.** Total passing assertions/fixtures: 647; this is not the full monorepo suite.
- **2 intentionally failing audit assertions** confirm MYK9-424 at actual read and rendered report boundaries. These are separate from the passing existing suite and were removed from the temporary worktree afterwards.
- `pnpm qa:plans` passes; migration executable-body hash equality passes; targeted doc checks and `git diff --check` pass.
- App test-project TypeScript was attempted but is **blocked by stale local dependencies**: TS2307 cannot resolve `@vercel/analytics/react`. Both app manifest and lockfile declare `@vercel/analytics@2.0.1`; the reused primary node_modules lacks it. This is not filed as a product defect or claimed as a clean typecheck. No application/test TypeScript diagnostic beyond this unresolved dependency appeared. The audit did not mutate shared dependency installations.
- Read relevant complete runtime implementations and later fixes, migrations/security predicates, review/CI/guard scripts, current specs/plans/intent, and archived-inclusive Linear matches. Skill-tree consolidation is covered by structural tests and inspected changed contracts; no claim of re-auditing every copied skill's full methodology.
- No full local E2E, staging/browser replay, live SQL mutation, load test, physical-device exercise, deployment or payment proof was performed. Recorded exact CI/deployed evidence above is distinguished from this run's local tests. Current deployed health runner and Claude scheduler state remain limited as stated.
- The September 6 exhibitor walk at the reviewed tip already tracks its own findings in MYK9-417–423; these were not reminted or misattributed as newly introduced commit regressions.
- Only review report, finding index and boundary docs are updated in the primary checkout under the authorized docs-only exception. Unrelated `.agents/skills/impeccable/` and `docs/research/2026-09-05-worktree-disposition.md` remain untouched.

## Reviewed commit inventory

```text
c159da719 docs(qa): claude daily commit review 2026-09-05 — clean window
2df929753 docs(qa): reconcile verified MYK9-294 checkout closure
0b6714711 fix(admin): four site-admin surface defects — user search, audit counts, payout empty state, health owner (MYK9-394/395/396/397) (#2040)
15377b1e3 fix(secretary): resolve setup, accessibility, and report bugs (#2041)
9e29197e0 fix(exhibitor): preserve released canonical results (#2044)
d2201ffe5 fix(admin): address Codex review findings on #2040 (MYK9-394/395) (#2042)
b4f3d1265 docs: record MYK9-381 merge and remaining evidence gate
368564ad8 docs(claude): two LESSONS from the #2040 review-gate miss (#2043)
d43e4817b docs(qa): queue an unfiled browser-confirmed wizard finding
f856947d8 docs(operations): remove a personal email address from the Stripe runbook
15ad9011c docs(openspec): archive secretary todo batch (#2046)
17d53f9e3 fix(wizard): route edit saves to the show, not the creation overlay (#2047)
d24f067ec ci(qa): add a bulk-PII guard to Quality Checks (#2048)
3bcb171dc fix(entries): refresh incomplete show caches before reading (#2049)
553c3b8bf fix(security): show-branding storage scope, steward email, containment RLS, public-view tombstones (MYK9-398/402/404) (#2045)
a0344fd01 docs: close MYK9-381 with deployed evidence
3169f7725 docs(claude): a Vercel build-rate-limit red is not a merge gate (#2050)
94f815cb7 fix(qa): close two bypasses in the bulk-PII guard (Codex review of #2048) (#2052)
a139cc163 fix(registration): gate card payment by club Stripe readiness (#2038)
d7e96bb13 docs(qa): record the wizard overlay fix as verified deployed
cca3d7f72 fix(exhibitor): bound dog title loading (MYK9-289) (#2051)
0a2020c7a docs(qa): record MYK9-289 merge verification
4db7b8a38 docs(qa): clear the pending-writes queue — MYK9-411 filed
c767a3c54 fix(exhibitor): resolve task walk findings (#2034)
fff04fda2 chore(skills): single-source the shared skill trees and reconcile ship-pr (#2054)
03bf0acfe ci: six unit-test shards and a build chain that no longer waits on them (#2056)
07d3d0534 fix(qa): close owned browser automation sessions (#2055)
6f9b353b5 fix(queries): batch check-in reads and coalesce entry syncs (#2057)
9c7ad4dcd docs(qa): close MYK9-289 with Nightly Chromium evidence
8aa519907 tooling(ci): self-testing PR check watcher, and fix three merge skills that contradicted CLAUDE.md (#2053)
0c3b09691 feat(observability): wire Vercel Web Analytics into myK9Show (#2059)
bede972f9 ci: a Review gate status pinned to the PR head SHA (#2058)
fa464a39e docs(legal): disclose cookieless traffic analytics in the privacy policy (#2060)
b186db4d0 chore(harden): one confirmed high blocks PASS; confirm findings before counting (#2061)
93fbdcd1d chore(qa): turn four CLAUDE.md lessons into executable checks; run 8 edge tests that never ran (#2063)
879d4ec2b docs(plan): record the four process-review PRs under Phase 6
dcc6260be feat(landing): link approved account training video (#2065)
8e6c5a7f9 chore(skills): track 44 unique .agents/skills entries, and fix the defects found reviewing them (#2062)
bd9183a83 chore(skills): symlink the nine local Codex copies to .claude (#2064)
77e904250 fix(qa): codex-review rejected a clean verdict that led with a summary (#2075)
27d0ff167 fix(skills): restore the risk-tagging step #2064 discarded (#2074)
7ee0fc151 fix(scoring): prove absent entry parity (#2066)
c37fc0e8c fix(qa): harden scheduled failure diagnostics (#2067)
89e05b011 fix(qa): enforce migration provenance (#2068)
bd67e9a44 fix(admin): complete health recovery contracts (#2069)
2e589c362 fix(db): correct migration provenance header (#2070)
921b74b8e chore(docs): reconcile living plan metadata (#2071)
331df1832 chore(ops): clarify audit failover boundaries (#2072)
346e29d10 fix(qa): finish MYK9-415 clean verdict safeguards (#2076)
3eb2c56e5 fix(qa): instruct the Codex review verdict contract (#2077)
8facd0017 docs(audit): exhibitor task walk 2026-09-06
```

## Temporary regression probe

Run from `apps/myk9show` with `pnpm exec vitest run src/services/database/entries/ncr-20260906-offline-report.probe.test.tsx`. IO is synthetic; no real identity or shared service is contacted.

```tsx
import { describe, expect, it, vi, afterEach } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createDatabaseError } from '../databaseError';
import { getEntriesByShow } from './reads';
import { mapDbEntryToReportEntry } from '@/lib/reports/reportUtils';
import { ResultsSheet } from '@/components/reports/ResultsSheet';
const mocks = vi.hoisted(() => ({ read: vi.fn(), from: vi.fn() }));
vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: { sync: vi.fn().mockRejectedValue(new Error('offline')) },
}));
vi.mock('../_shared/read-shape', async importOriginal => ({
  ...(await importOriginal<typeof import('../_shared/read-shape')>()),
  readWithReplicationFallback: mocks.read,
}));
vi.mock('../supabaseClient', () => ({
  supabase: { from: mocks.from },
  createDatabaseError,
  logQuery: vi.fn(),
}));
const cached = {
  id: 'fixture-entry',
  show_id: 'fixture-show',
  class_id: 'fixture-class',
  armband: '101',
  run_order: 1,
  check_in_status: 'checked-in',
  section: null,
  is_scored: true,
  result_status: 'qualified',
  search_time_seconds: 38.5,
  final_placement: 1,
  total_faults: 0,
};
function query(result: Promise<unknown>) {
  const q = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnValue(result),
  };
  mocks.from.mockReturnValue(q);
  mocks.read.mockResolvedValue({ data: [cached], error: null });
}
afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});
describe('NCR report cached-score contract', () => {
  it('retains already-authorized cached Q/time/placement for a secretary report when enrichment fails', async () => {
    query(Promise.resolve({ data: null, error: new Error('network unavailable') }));
    const result = await getEntriesByShow('fixture-show');
    expect(result.error).toBeNull();
    const entry = mapDbEntryToReportEntry(
      result.data[0] as typeof cached,
      'Fixture Dog',
      'Breed',
      'Fixture Handler',
      null
    );
    const html = renderToStaticMarkup(
      createElement(ResultsSheet, {
        showName: 'Fixture Show',
        entries: [entry],
        sortOrder: 'placement',
      })
    );
    expect(html).toContain('Qualified Entries: 1');
    expect(entry).toMatchObject({
      resultText: 'qualified',
      searchTimeSeconds: 38.5,
      finalPlacement: 1,
    });
  });
  it('returns cached show data within a bounded wait when result enrichment never settles', async () => {
    vi.useFakeTimers();
    query(new Promise(() => {}));
    let completed = false;
    void getEntriesByShow('fixture-show').then(() => {
      completed = true;
    });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(completed).toBe(true);
  });
});
```
