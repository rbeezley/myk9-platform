# Codex daily commit review — September 13, 2026

> source: codex · task: nightly-commit-review

Four confirmed application defects already have canonical Linear issues. Six existing descriptions were updated and one tooling defect, MYK9-501, was created; no issues were closed. Seven earlier findings have passing focused or applied closure evidence. Application implementation files were not changed.

## Window and publication

- Shared cursor, exclusive: `c660131f5d091fe5f7e5972edf5493b2af44bc6d`, window end September 11 at 10:12:28 UTC.
- Reviewed endpoint/baseline: **`de90d1b0b3a08c825b9cd014379c600c04911a9f`**. Final fetch matched it.
- Continuous window: **2026-09-11T10:12:28Z–2026-09-13T10:11:03Z**. No fallback or SHA/time coverage gap.
- All **23 first-parent commits** are covered: nine through `69f61d921` by the completed September 12 review, whose report and evidence were recovered, plus fourteen subsequently reviewed here. The shared row remained stale because yesterday's documentation commit was blocked; this was a publication gap, not an unreviewed interval.
- The primary checkout remains at `02843f072` with unrelated application edits. Work used `/private/tmp/myk9-ncr-review-20260913`; no primary edits were included.
- This local batch restored the [September 12 report](codex-daily-commit-review-2026-09-12.md) and registry entries and stamped the shared row. Publication was blocked at the time: all four documents remained staged, with no commit or push, and the remote shared cursor remained `c660131f5`. Any eventual documentation commit is outside the reviewed range.

**Recovery publication — 2026-09-19:** MYK9-501's installed replacement hook passed all eight behavioral checks, including dirty-primary/docs-only, invalid-app, target-worktree, read-only-search, and no-mutation controls. The retained worktree had since been deleted, so the exact staged report blobs were recovered from Git's object database and merged into current `main`. The newer shared cursor at `738a5a6cf` was preserved; no unreviewed commit was stamped.

| Subsequent commit   | Scope reviewed                                                                  |
| ------------------- | ------------------------------------------------------------------------------- |
| `2f99f733f` / #2181 | Published-show and dog visibility on four SELECT policies                       |
| `f3fb00874` / #2182 | Tenant-scoped role predicates and behavioral SQL                                |
| `f6638eceb` / #2184 | Push secret comparison and dormant view write grants                            |
| `7f2e40f86` / #2185 | Vaccination soft-delete boundary                                                |
| `f8f6d9ac2` / #2180 | Shared management-scope state machine, audience, bulk selection and staff reads |
| `01abbb75e` / #2188 | Public judge-name RPC and TV/show readers                                       |
| `c89d5180e` / #2190 | Applied-schema generated types                                                  |
| `38a3aaa4b` / #2189 | Real cross-club E2E proof and positive settle markers                           |
| `22855254c` / #2191 | Retired judge column, views, RPC, readers and wizard assignment writes          |
| `681afb41c` / #2192 | Review convergence documentation                                                |
| `5c7fadd66` / #2193 | Report-only schema-type drift checker and contracts                             |
| `35308052d` / #2194 | Evidence-over-confidence documentation                                          |
| `a752cda22` / #2197 | Regenerated types after the column drop                                         |
| `de90d1b0b`         | Exhibitor walk evidence; canonical MYK9-494–500 already filed                   |

## Counts

| Lifecycle                                       | Count |
| ----------------------------------------------- | ----: |
| New                                             |     1 |
| Unchanged                                       |     2 |
| Resolved                                        |     7 |
| Duplicate candidates, canonical issues retained |     2 |
| Blocked proof/delivery                          |     2 |
| Rejected findings                               |     0 |

Unresolved observations: **P0 0 / P1 1 / P2 6 / P3 0**. The four confirmed application defects are MYK9-495, MYK9-494, MYK9-466 and MYK9-467; the two prerequisites are MYK9-423 and MYK9-479. New MYK9-501 is a tooling defect that blocks publication. Duplicate means a confirmed candidate matched an already-filed issue, not that the defect was rejected. Seven resolutions comprise four P2 and three P3 observations. Prior NCR-2026-09-11-01 resolution is preserved from September 12 and not counted a second time.

## P1 — unresolved

### MYK9-495 / E38 — paid registration masks a pending entry

- **Status/classification:** duplicate of existing open balance/data-flow defect. Canonical P1; source P1/Urgent retained. First/last seen September 13; one Codex reproduction plus two recorded Claude browser reproductions. Owner unassigned; confidence high for the masking mechanism.
- **Proof:** production `mapEntryRowToBalanceSource` → `summarizeEntryBalances`, one submitted/pending $30 online entry in a future open show. With no registration override the amount due is **3000 cents**; adding only `registration.payment_status='paid'` changes it to **0**. The expected 3000 assertion fails. [entryBalanceSummary.ts:128](https://github.com/rbeezley/myk9-platform/blob/de90d1b0b3a08c825b9cd014379c600c04911a9f/apps/myk9show/src/features/payments/entryBalanceSummary.ts#L128).
- **Impact:** payable debt loses its normal discovery and payment action. No duplicate charge or loss was demonstrated. The coalesce predates this commit range; encountered through the in-range walk report, not introduced by its documentation commit.
- **Closure:** trace the real pending-entry/paid-order lifecycle; prove exact per-entry balances and mixed-order controls in the actual fee card, payments and card badge; record same-entry browser readback and consistent cart behavior before any separately authorized financial action.
- **Canonical contract:** [MYK9-495](https://linear.app/myk9-platform/issue/MYK9-495), updated with the focused proof and historical-scope distinction. The new entry ending 4566 differs from MYK9-423's original 053/054/057; prior successful checkout evidence remains valid.

## P2 — unresolved

### NCR-2026-09-13-01 / MYK9-501 — commit hook validates another checkout

- **New/open tooling defect**, P2/Medium; owner unassigned, local Codex configuration maintainer needed. Source codex; first September 12, last September 13, two consecutive runs. High confidence. This local hook predates the current review; no in-range repository introduction is claimed.
- **Proof:** `/Users/richardbeezley/.codex/hooks.json:9` reads event `.cwd` and triggers full checks on raw command text. The attempted docs-only commit explicitly targeted `/private/tmp/myk9-ncr-review-20260913`, but PreToolUse reported lint and typecheck failures in `/Users/richardbeezley/AI Projects/myk9-platform/apps/myk9show`, the unrelated dirty primary. HEAD stayed at `de90d1b0b`; all four documents remain staged. A read-only search for the literal commit phrase also triggered the same checks. No hook bypass or edit was attempted.
- **Impact/expected:** completed review reports and the shared cursor cannot publish because validation runs in another checkout. The hook should classify the operation and validate the actual worktree/staged scope, without pulling/rebasing unrelated work or treating a text search as a commit.
- **Closure:** actual installed-hook proof with a dirty unrelated primary and valid linked-worktree docs batch; invalid app-commit negative control in its own tree; read-only phrase-search control. Then publish the retained batch and verify remote reports/cursor without stamping unreviewed commits. [MYK9-501](https://linear.app/myk9-platform/issue/MYK9-501) contains the full sanitized reproduction and acceptance contract. Archived-inclusive dedup and full MYK9-408/410/461/492 reads found different mechanisms.

### MYK9-494 / E39 — exhibitor schedule loses assigned judge names

- **Status/classification:** duplicate of existing open schedule/data-flow regression; canonical P2 for demonstrated missing information, source P1/Urgent preserved and Linear priority unchanged. First/last seen September 13; owner unassigned; one Codex composition replay plus two recorded Claude browser reproductions. Confidence high.
- **Cause:** #2191 removes the name-column fallback. App `ReplicatedClassesTable` still fetches an inner `people` embed that ordinary exhibitors cannot read for other people. Empty embedded assignments produce undefined name fields; a successful replica read never invokes fallback. Both timeline PostgREST fallbacks use that same restricted embed.
- **Correction to the earlier diagnosis:** the app's ReplicatedClass does define judgeName/first/last fields; the problem is population for this role, not an absent interface in `packages/`. The replacement RPC is named `get_show_judges`.
- **Proof:** real `rowToClass` with visible embedded Synthetic Judge returns that name. The restricted empty embed produces no name; real `getShowScheduleTimelineRows` returns one valid row, error=null, judgeFirstName=null and judgeLastName=null. The expected name assertion fails. [mapper:195](https://github.com/rbeezley/myk9-platform/blob/de90d1b0b3a08c825b9cd014379c600c04911a9f/apps/myk9show/src/services/replication/ReplicatedClassesTable.ts#L195), [sync:537](https://github.com/rbeezley/myk9-platform/blob/de90d1b0b3a08c825b9cd014379c600c04911a9f/apps/myk9show/src/services/replication/ReplicatedClassesTable.ts#L537), [timeline:95](https://github.com/rbeezley/myk9-platform/blob/de90d1b0b3a08c825b9cd014379c600c04911a9f/apps/myk9show/src/services/database/trials/timeline.ts#L95).
- **Closure:** actual exhibitor transport shape through warm/cold read-to-render coverage, confirmed/unassigned controls, browser proof for the five assigned classes in the existing report, and warm offline preservation. Do not broaden people RLS or merely force the existing fallback.
- **Canonical contract:** [MYK9-494](https://linear.app/myk9-platform/issue/MYK9-494), updated. Source migration retirement remains separately tracked under MYK9-479.

### MYK9-467 — populated TV board hides failed refresh

- **Unchanged/open**, UI recovery; P2/Medium; Richard Beezley; first September 12, last September 13, two consecutive daily reproductions; high confidence.
- Real TVDisplay/React Query success → failed refetch in both actual layouts retains the card and **Live • 1 class active**, with no unavailable notice. Both expected-notice assertions fail again. [TVGrid.tsx:14](https://github.com/rbeezley/myk9-platform/blob/de90d1b0b3a08c825b9cd014379c600c04911a9f/apps/myk9show/src/pages/TVDisplay/TVGrid.tsx#L14), [TVMobileList.tsx:20](https://github.com/rbeezley/myk9-platform/blob/de90d1b0b3a08c825b9cd014379c600c04911a9f/apps/myk9show/src/pages/TVDisplay/TVMobileList.tsx#L20).
- Closure remains active/results failure/recovery tests and owned browser proof in both layouts, preserving cached content with honest refresh status. The original podium-disappearance trigger remains unproven. [MYK9-467](https://linear.app/myk9-platform/issue/MYK9-467) updated; Todo preserved.

### MYK9-466 — preview omits uncached trials

- **Unchanged/in-progress**, discovery/data-flow; P2/Medium, broader High priority preserved; Richard Beezley now owns it. First September 12, last September 13, two consecutive daily reproductions; high confidence.
- Real show read → mapper → offered preview still returns no trials with an empty local cache, or Saturday only with a partial cache, despite two successful remote trials. Both exact-identity assertions fail; seven original fallback tests pass. [reads.ts:170](https://github.com/rbeezley/myk9-platform/blob/de90d1b0b3a08c825b9cd014379c600c04911a9f/apps/myk9show/src/services/database/shows/reads.ts#L170).
- Closure remains complete remote-trial reconciliation, warm local-edit/offline controls and cold/partial-cache browser proof. [#2195](https://github.com/rbeezley/myk9-platform/pull/2195) is open at `f4d9eb207`; no resolution from proposed code. [MYK9-466](https://linear.app/myk9-platform/issue/MYK9-466) updated; separate access-policy decisions preserved.

### MYK9-423 — final payment-proof delivery

- **Blocked prerequisite**, P2/High historical; Richard Beezley; first September 6, last September 13, seventh detailed daily observation. High confidence for the delivery state, no new payment replay.
- [#2179](https://github.com/rbeezley/myk9-platform/pull/2179) is open at `52480bbbb0dbeb6e65904616d752da8445dfd21e`. September 9/11 same-three-entry checkout and both-balance proof remain accepted. Today's distinct pending entry and masking defect belong to MYK9-495.
- Closure: finish final-head checks, review, evidence transcription and merge of the real CTA-to-hydration regression; reconcile original criteria and the distinct balance issue. No repeat payment solely for this audit. [MYK9-423](https://linear.app/myk9-platform/issue/MYK9-423) updated; In Progress preserved.

### MYK9-479 — overview and printed-paperwork proof

- **Blocked prerequisite**, P2/Medium; Richard Beezley; first September 12, last September 13. Existing Done status preserved, no closure operation.
- Applied column drop, grants, view properties and deployments are recorded and accepted. The latest completion comment explicitly says the original overview and printed-run-order spot checks were not performed. Current focused mapper, TV, check-in and AskQ tests do not establish that exact rendering proof. [Migration](https://github.com/rbeezley/myk9-platform/blob/de90d1b0b3a08c825b9cd014379c600c04911a9f/supabase/migrations/20260912234500_drop_classes_judge_name.sql).
- Closure: attach existing output, or render the actual overview and printed run order with a confirmed name and unassigned control after the drop; record role/data path and exact output. The separate timeline defect stays under MYK9-494. [MYK9-479](https://linear.app/myk9-platform/issue/MYK9-479) updated with the remaining original proof gate.

## Newly resolved, with proof

All rows use the endpoint baseline above, source codex, owner Richard Beezley, high confidence; Linear statuses were already Done and were not changed. First seen September 12 except MYK9-464 (September 10); last reconciled September 13. These are the first reconciliations of their completed evidence in this daily review.

| Severity/source | Canonical issue                                             | Proof and scope                                                                                                                                                                                                                                                    |
| --------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P2 / Medium     | [MYK9-469](https://linear.app/myk9-platform/issue/MYK9-469) | Applied split-role policies, cold anon draft returns zero/published positive control, named current-main SQL role matrix passes.                                                                                                                                   |
| P2 / Medium     | [MYK9-470](https://linear.app/myk9-platform/issue/MYK9-470) | Applied scoped helper/policies and two-club SQL read/write matrix; role inventory and show-scoped negative controls pass. Deliberate shared-directory/catalog boundaries retained.                                                                                 |
| P2 / Medium     | [MYK9-474](https://linear.app/myk9-platform/issue/MYK9-474) | Applied public judge RPC returns names for published show, denies draft/direct-people/email access; named SQL proof plus current TV mapping tests. This resolves the RPC/TV missing-name path, not the newly discovered schedule path.                             |
| P2 / Medium     | [MYK9-464](https://linear.app/myk9-platform/issue/MYK9-464) | Current scope/route/audience tests pass; recorded real cross-club secretary walk with positive and mutation controls. Owner explicitly accepted the unmet club-admin browser half on September 13; retain that exception, do not claim those skipped tests passed. |
| P3 / Low        | [MYK9-471](https://linear.app/myk9-platform/issue/MYK9-471) | Recorded deployed v54 extracted function calls timingSafeEqual; current two-tree secret-comparison contract passes, historical negative controls recorded.                                                                                                         |
| P3 / Low        | [MYK9-472](https://linear.app/myk9-platform/issue/MYK9-472) | Applied ACL denies three view writes, retains SELECT; named SQL test pins owner-run/non-updatable properties and read positive controls.                                                                                                                           |
| P3 / Low        | [MYK9-475](https://linear.app/myk9-platform/issue/MYK9-475) | Applied dog soft-delete gate; current named SQL positive/live and negative/deleted cases for both owner and secretary pass.                                                                                                                                        |

Current SQL evidence: [run 34731389234, SQL job 103654708051](https://github.com/rbeezley/myk9-platform/actions/runs/34731389234/job/103654708051). Its log explicitly prints PASS for MYK9-469, MYK9-470/475, MYK9-472 and MYK9-474. Prior NCR-2026-09-11-01 remains resolved: 180 combinations / 1,080 comparisons, six no-settings cases and absolute default assertions still pass.

## Verification and limits

- **1,089 existing tests in 130 files passed:** 193/14 app feature tests, 862/112 database/related app contracts, 21/2 root audit-tool tests, 13/2 edge-function tests. Explicit app `tsc --noEmit --project tsconfig.app.json` exited 0. Frozen dependency install and all 12 cached package builds passed.
- Six intentional failing expectations reproduce four existing findings: two TV layouts, two trial-cache shapes, one judge timeline, one balance. Seven unchanged fallback cases also pass in the scratch packet; they are not additional unique suite tests above.
- Source review includes the new SQL policies, helper grants, rewritten views/emergency RPC, class wizard mutation path, scope state machine, caller interfaces, changed tests, generated types and report-only CI wiring. `git diff --check` passes across the complete reviewed range.
- Read-only CI at `a752cda22` is green for SQL, six app shards, packages, quality, build, coverage, E2E and A11y; final docs tip CI is also successful. This is recorded remote evidence, not a locally executed full suite.
- Invocation corrections: initial log directory missing (no tests ran); root-project invocation excluded the two edge files (rerun from app, 13 pass); initial judge scratch mock omitted logQuery (corrected before the product failure). No product findings are inferred from these harness-authoring errors. Initial sandbox DNS blocked bootstrap/inflight; authorized retries succeeded.
- No fresh browser walk, full local app suite, live SQL/role replay, load run, payment, deployment, backup or shared-fixture operation. Club-admin browser proof remains explicitly accepted/unmet under MYK9-464. No application implementation edits or shipped tests.
- Same-PR defects already fixed before merge were excluded: unsafe anon role-helper evaluation, partial soft-delete guard, widened club-admin operational access, and non-confirmed judge-name selection in the new RPC consumers. MYK9-473's accepted/canceled grant decision was preserved. Other walk findings already have MYK9-497–500; no duplicate queue created.

Full execution contracts and recurrence updates are saved and re-read in MYK9-494, MYK9-495, MYK9-479, MYK9-423, MYK9-466 and MYK9-467; new MYK9-501 was also re-read. No Linear filing blocker. Focus next on the hidden debt and the three missing/stale-information paths, then complete the existing proof gates and repair audit publication.

Documentation preflight: the in-flight check returned three overlaps, all with this automation's retained September 12 worktree. This run explicitly took over that report/registry/cursor batch and preserved its evidence; there was no other actionable overlap. Six In Progress Linear issues concern product/load work, not these audit documents. Formatting and the code-quality ratchet pass. The staged batch contains only the two reports, registry and boundary; scratch probes remain in local .logs/probes. Both September 12 and September 13 worktrees are retained because the PreToolUse hook blocked publication. This is a hook rejection, not an automatic approval-review rejection. The hook and unrelated primary application files remain unchanged.
