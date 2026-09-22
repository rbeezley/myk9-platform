# Codex daily commit review — September 20, 2026

> source: codex · automation: nightly-commit-review

Two new actionable findings: a move-up payment integration mismatch, added to canonical
[MYK9-639](https://linear.app/myk9-platform/issue/MYK9-639), and a worktree bootstrap failure,
filed as [MYK9-698](https://linear.app/myk9-platform/issue/MYK9-698). No application code changed.

## Window and coverage

- Shared boundary, exclusive: `71537ced65ef8b6b3d773fe94e9e023f9817e63f`.
- Reviewed main, inclusive / evidence baseline: `780135f11b131878e35ca0b5ad295f2f93b1bb1d`.
- Continuous window: **2026-09-19T13:03:00Z–2026-09-20T10:01:32Z**. Sixteen new commits; no fallback or missing SHA/time interval. Time before the first new commit is idle time within the reviewed range, not omitted coverage.
- Remote cursor was read after fetching. Yesterday's previously network-blocked report/cursor is now on remote main. Final fetch still matched the reviewed tip. This publication commit is outside the reviewed boundary.
- Reviewed the full commit inventory and combined source changes, with complete implementation/caller tracing for candidates: entry/payment roots and webhook settlement, replication pagination/receipt refresh, scoped authorization and migrations, handler identity, access requests/OAuth, reports, dog search, capacity, premium actions, and wizard UI. Tests and schemas were checked against actual types. INTENT.md was read before UI review.
- Primary checkout, its local merge, and its pre-existing untracked patch were left untouched. Work/evidence: `/private/tmp/myk9-ncr-review-20260920`.

## Counts and Linear actions

| Transition          | Count | Detail                                                                |
| ------------------- | ----: | --------------------------------------------------------------------- |
| New                 |     2 | P1 payment integration; P2 development harness                        |
| Unchanged           |     1 | P2 wizard visual-sweep prerequisite                                   |
| Resolved            |     2 | P1 client capacity guard; P2 premium paused/loading/permission states |
| Duplicate           |     0 | Canonical issues reused; no duplicate creation                        |
| Rejected            |     0 | No inconclusive signal promoted to a finding                          |
| Blocked for closure |     4 | Three prior move-up subfindings and premium navigation proof          |

Unresolved observations: **P0 0 / P1 3 / P2 4 / P3 0**. These include four existing findings with
source fixes but incomplete original closure proof; they are not asserted as four still-broken
implementations. Classifications: five product/UX observations (including proof follow-ups), two
test/development-harness observations. One issue created (MYK9-698); three existing issue descriptions
updated (MYK9-639, MYK9-640, MYK9-648), saved updates re-read. No issues closed or reprioritized.
Archived-inclusive searches covered exact paths, workflows, symptoms and causes; full candidate
issues and relevant comments/merged PR evidence were inspected. No Linear filing blocker.

## P1 — unresolved

### NCR-2026-09-20-01 / MYK9-639 — payment recovery targets a row the webhook rejects

**New**, source High; Richard Beezley; first/last September 20, one run. Exhibitor Finish payment
and secretary Request payment after an unpaid move-up. Introduced by the combined #2355/#2357
changes. High confidence from executed current functions and complete consumer tracing.

The fixed balance correctly shows $35 due, but its payment target is the original `moved` root.
The recovery cart now explicitly accepts that status and preserves its entry/class id. The
secretary payment dialog also targets the root. The new webhook loader rejects any requested row
whose status is `moved`, so these normal callers hit the failed/no-service or unresolved-payment
path instead of settling the obligation.

Exact current locations:

- [entryBalanceSummary.ts:257](https://github.com/rbeezley/myk9-platform/blob/780135f11b131878e35ca0b5ad295f2f93b1bb1d/apps/myk9show/src/features/payments/entryBalanceSummary.ts#L257): root payment target.
- [cartStore.recovery.ts:19](https://github.com/rbeezley/myk9-platform/blob/780135f11b131878e35ca0b5ad295f2f93b1bb1d/apps/myk9show/src/store/cartStore.recovery.ts#L19), insertion at 171: moved roots allowed and retained.
- [RequestPaymentDialog.tsx:76](https://github.com/rbeezley/myk9-platform/blob/780135f11b131878e35ca0b5ad295f2f93b1bb1d/apps/myk9show/src/components/entries/management/RequestPaymentDialog.tsx#L76): secretary request targets root too.
- [stripe-webhook/index.ts:1686](https://github.com/rbeezley/myk9-platform/blob/780135f11b131878e35ca0b5ad295f2f93b1bb1d/apps/myk9show/supabase/functions/stripe-webhook/index.ts#L1686): unconditional moved-row rejection; cart consumer at 1290.

**Proof:** synthetic undeleted root=moved/pending/online/$35 and live=confirmed/pending/$0 linked
to root, in a future show. Actual mapper → account balance returns 3500 cents,
`displayEntryIds=['live']`, `entryIds=['root']`. Feed those exact payment ids into the exact
production `loadPaymentReconciliationEntries`, extracted via TypeScript AST with only Supabase
row transport mocked. Expected no blocked ids; **received `['root']`**. Control `load(['live'])`
resolves to root without blocking. One intentional failure, one positive control. The creation
endpoints lack this same moved-row refusal, so this is a reachable contract mismatch.

Expected: one original obligation can settle while the live destination preserves run identity.
Impact: the repaired balance offers an unusable settlement route requiring a workaround. No actual
Stripe charge, refund, financial loss or deployed webhook replay was performed; post-payment
consequences are source-traced. P1 is the lowest supported golden-path impact.

**Next/closure:** unify live-entry versus settlement-root identity across balance, recovery,
payment link, webhook and receipt; composition red→green for both entry points, one root paid,
no duplicate charge, single/multi-hop/reversed/deleted/paid/retry controls, then authorized TEST
checkout/link plus immediate persisted and both-surface readbacks and deployed webhook evidence.
Full execution contract: [MYK9-639](https://linear.app/myk9-platform/issue/MYK9-639).

### NCR-2026-09-19-01 / MYK9-639 — balance fix awaits end-to-end settlement proof

**Blocked for closure**, P1/source High; Richard; first September 19, last September 20, second run.
The original $35→$0 computation is fixed and passing. Its required reachable settlement action is
not satisfied because of NCR-2026-09-20-01. Original online/replica and My Shows/My Payments browser
proof remains required. Historical waiver/count fixes remain valid; no duplicate finding.

### NCR-2026-09-19-03 / MYK9-640 — stale reversal guard awaits applied/concurrent proof

**Blocked for closure**, P1/source High; Richard; first September 19, last September 20, second run.
#2355 guards a moved destination; #2357's latest migration `20260919170000` guards live successors.
Current client tests pass. Exact-main CI SQL explicitly passes stale nonterminal reversal refusal,
positive move/back, check-in and authorization controls. The source omission is fixed.

PRs still defer migration application, and inspected issue/PR evidence does not supply the original
competing-transaction and two-device proof. Preserve [MYK9-640](https://linear.app/myk9-platform/issue/MYK9-640)
Backlog/High. Next: verify latest deployed function and run remaining concurrency/two-device gates;
do not repeat discovery of the already-green isolated SQL case.

## P2 — unresolved

### NCR-2026-09-20-02 / MYK9-698 — bootstrap stops before setup

**New development-harness defect**, source Medium; unassigned ownership gap; first/last September 20,
one run. Pre-existing mechanism encountered during this audit, not attributed to the new commits.

[bootstrap-worktree.sh:9](https://github.com/rbeezley/myk9-platform/blob/780135f11b131878e35ca0b5ad295f2f93b1bb1d/scripts/bootstrap-worktree.sh#L9)
uses `git worktree list --porcelain | head -1 | sed ...` inside an assignment under `set -euo pipefail`.
The real bootstrap exited **141 with no output**. Replaying its read-only pipeline produced the
correct primary path and Bash `PIPESTATUS = 141 0 0`: head exits early, git gets SIGPIPE, and setup
aborts before hook activation/dependency installation. High confidence; no product defect implied.
MYK9-578 (notifier SIGPIPE) and MYK9-461 (inflight ENOBUFS) were read and are distinct.

Next/closure: consume the full inventory while selecting the first worktree, preserving real git
errors. Large/small/path-with-spaces and failure controls plus successful actual disposable-worktree
bootstrap, hooks and fresh builds. Do not delete other worktrees to conceal the failure. Full contract:
[MYK9-698](https://linear.app/myk9-platform/issue/MYK9-698).

### NCR-2026-09-19-02 / MYK9-639 — false multi-hop warning fix awaits rendering proof

**Blocked for closure**, source Medium; Richard; first September 19, last September 20, second run.
Two-hop root attribution now passes with one run and no orphan warning. Required Financial Report
and secretary-summary rendering proof is absent from inspected current evidence. Keep the existing
subfinding under MYK9-639; no claim that the fixed calculation still fails.

### MYK9-648 — premium navigation source fixed, transition proof remains

**Blocked for closure**, source High; unassigned; first September 17, last September 20, second Codex
observation. `usePublishInfo` now opts out of previous-data placeholders and masks disabled management
observers. Its tests pass. #2355 explicitly supplies query-option tests and leaves browser/staging
proof as follow-up. Original real card/header deferred A→B test, failure/loading controls, per-show
query-key audit and controlled browser proof are still required. Updated
[MYK9-648](https://linear.app/myk9-platform/issue/MYK9-648), preserving Backlog/Medium.

### QA-TEST-FLAKE-002 / MYK9-627 — wizard sweep proof unchanged

**Unchanged test/verification gap**, source Low; unassigned; first September 16, last source check
September 20. No commit in this window touches the spec. Serial mode remains at line 5 and raw
Save Draft clicks at 203/229/923. Original unstable/intercepted-click evidence remains; no fresh
runtime recurrence asserted. Existing full [MYK9-627](https://linear.app/myk9-platform/issue/MYK9-627)
contract requires helper/dependency criteria and three consecutive complete green desktop/mobile
sweeps. No redundant issue update or product finding.

## Newly resolved, grouped by severity

- **P1 / MYK9-670**, source High; exhibitor capacity; Richard; first September 18, proof checked September 20. #2374's real workflow helper and named URL-param regression keep the capacity check enabled for exhibitors and preserve organizer behavior. Focused tests pass; original three scoped acceptance criteria are met. Already Done, no closure write. Server enforcement remains MYK9-11, explicitly outside this issue.
- **P2 / MYK9-647**, source High; secretary/exhibitor premium controls; Richard; first September 17, proof checked September 20. #2362 provides distinct paused offline state, visible card/menu reason, and resolved management gating. Actual component/action/query tests pass, including disabled-scope controls. Original focused acceptance criteria are met; no fresh browser claimed or required by that contract. Already Done. This does not close MYK9-648's separate navigation proof.

## Verification and limits

- **631 existing tests / 36 files passed:** financial/account/replication 263/7; registration/access/premium/workflow/webhook helpers 166/13; database contracts/actions/reports 191/13; wizard/phase wiring 11/3.
- Explicit app `tsc --noEmit --project tsconfig.app.json`: exit 0.
- Frozen-lockfile install and all 12 package builds: exit 0. Bootstrap workaround installed/builds in this owned worktree; no borrowed stale outputs. Cached build logs can contain their original worktree paths.
- Additional payment composition probe: one intended failure and one passing control; exact production loader, synthetic transport, not a full deployed webhook test.
- [CI 35484776161](https://github.com/rbeezley/myk9-platform/actions/runs/35484776161) at the exact reviewed SHA succeeded: six app shards, coverage, packages, build, quality, E2E/A11y smoke, SQL. Read SQL job output: 67 behavioral files passed, including founder grant/rollback, handler identity and nonterminal reversal. This is CI proof, not this audit writing a database or proving deployment.
- Initial test log-directory mistake prevented invocation, corrected before running. Three targeted filenames initially did not match and were rerun at their actual paths (11 tests); totals count only executed tests. No test runner hung.
- Initial sandbox git/gh failures succeeded after network approval. Bootstrap is separately filed. `qa:dist-fresh` passes. The network-enabled overlap check returned 1 for seven worktrees carrying yesterday's `69d0447e5` cursor commit; each was inspected and had no staged or unstaged cursor edits. That historical stamp is already incorporated in remote main. This run continues its own audit stream; none of the current In Progress product issues names audit-document work. No overlap check is mislabeled as exit 0.
- No full local app suite/lint, fresh browser, live SQL, payment, deployment, load generation or shared-fixture mutation. No new security exposure or score corruption confirmed. No issue resolved from a merge alone.

## Commit inventory

- `59896f4ac` #2356 — receipt reference follow-ups, account/replication/report reads.
- `f123369ad` — preserve exact-show scope for pinned club admins.
- `22ff40992` #2354 — handler identity clearing across callers.
- `1f27badc3` #2360 — invalid report date ranges.
- `7eac4db7e` #2355 — move-up balances/reversal, premium placeholder isolation, payment webhook rooting.
- `edf853995` #2361 — post-signup club access requests and OAuth role intent.
- `558c570e8` #2357 — move-up follow-up/root-target routing and successor guard.
- `b234b31ab` #2370 — preserve class element order.
- `37cebd850` #2371 — contain revoke-access actions.
- `252e628fc` #2372 — ringside access-code explanation.
- `979bb659c` #2369 — two-month date-range picker.
- `b64ea368e` — founding requester scoped roles/membership.
- `f6841232d` #2368 — Show Details action and scoped management shell.
- `d803208b4` #2364 — stale dog-search result isolation; prior audit report/cursor publication incorporated.
- `9e0a46f31` #2362 — offline premium availability and permission gating.
- `780135f11` #2374 — exhibitor capacity check.

Publication is documentation-only. No OPSX implementation was started because this task is an audit;
all remediation contracts remain in Linear. The shared cursor is stamped only through the reviewed SHA.
