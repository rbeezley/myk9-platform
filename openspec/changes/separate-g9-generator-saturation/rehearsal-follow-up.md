> **Committed 2026-08-27 as historical evidence. No content below was altered:
> this preamble was added, and the repository's Prettier hook repadded markdown
> table cells. Every recorded value is byte-identical to the working copy.**
>
> This log runs 2026-08-25 to 2026-08-26 and stops before three later results that
> change how parts of it read:
>
> - **Run 33038456110** ran all sixteen shards HEALTHY at 45–70% CPU p95 and still
>   failed 98 of 100 workflows. Generator saturation was real in the runs recorded
>   below and is correctly reported here, but it was not the cause of the workflow
>   failures that motivated the eight-to-sixteen shard change.
> - **Run 33075234998** produced the first valid backend attribution, with complete
>   platform telemetry, and failed on a 9.4 s scoring-write p95.
> - That p95 is an **artifact of the scenario**, not the platform. Fifty-five
>   ringside sessions across eight classes put roughly seven concurrent scorers on
>   every class, serializing on the row-exclusive lock `refresh_class_scoring_state`
>   takes on the class row. A class is scored by one judge, one dog at a time. The
>   workload is remodelled by `openspec/changes/model-realistic-show-day-load/`.
>
> Nothing below is edited to reflect that. The restoration proofs, red/green
> verification and explicit non-claims stand as recorded.

# Approved G9 rerun after PR #1805

User request (verbatim): "Proceed"

Approval context: one protected G9 rerun using the merged harness, with unchanged
100 sessions / 55 ringside sessions across eight runners on the approved prelaunch
Micro target. Includes canonical reseed, scoring/check-in traffic, telemetry, and
mandatory drain/quiet-window/restoration. Does not authorize a compute upgrade,
database restart, bypassing a safety gate, or publishing detailed diagnostics.

Revision: `9a11188202d705924656f9e3e662571bb3aec435`.
Run: https://github.com/rbeezley/myk9-platform/actions/runs/32915776644
Preparation delay: 25 minutes; scenario duration: 10 minutes.
Canonical exhibitor account: `exhibitor@myk9t.com`; passwords remain in secrets.

## Execution and verification

- [x] Confirm the previous rehearsal is complete and main contains PR #1805.
- [x] Read the existing workflow, OpenSpec contract, and local diagnostic plan.
- [x] Dispatch the existing protected workflow with unchanged inputs.
- [x] Record operator approval through the existing protected environment gate.
- [x] Verify preflight/seed success.
- [x] Observe eight synchronized shards; do not weaken timing or workload targets.
- [x] Preserve all shard and aggregate evidence, including safe failure diagnostics.
- [x] Verify zero scoring workers, quiet rollback window, and `514|504|0` restoration.
- [x] Evaluate collected evidence against G9; keep issues open because gates failed.

Local verification of this unchanged revision was already completed before merge:
98 load-unit tests, six shuffled focused runs, app/test/edge typecheck, touched-file
lint, strict OpenSpec validation, and code-quality ratchet. Required PR CI passed,
including 26 E2E smoke tests. These results are not a substitute for load evidence.

Detailed evidence stays local. No Linear completion or OpenSpec archive until all
stated evidence requirements are actually met.

## Monitoring

Task heartbeat `monitor-approved-g9-rehearsal` checks this single run every five
minutes, reports material transitions, and must pause after terminal evidence and
cleanup are reported or an operator-recovery blocker requires input. It does not
authorize another rehearsal or any new shared-system mutation.

Final state: completed / failure. All eight shard jobs succeeded in writing reports;
aggregation correctly produced FAIL, and mandatory restoration succeeded. Monitoring
is paused after recording this terminal result; no second run is authorized.

## Outcome — not a passing G9 rehearsal

- All 100 sessions (55 ringside) prepared and started; 0 workflows completed and
  100 failed. Breakdown: 55 scoring, 15 check-in, 15 exhibitor, 10 run-order, 5 Show
  Desk. Failures were readiness waits for submit controls, dog cards, or headings.
- All shards share start epoch `1787706189000` (01:03:09 UTC), with observed start
  skew at most 1 ms. Shards returned after 148.703–249.502 seconds. The configured
  ten-minute scenario did not sustain ten minutes because every workflow failed;
  successful job exit means evidence produced, not successful workload completion.
- Browser-observed scoring p95: 39,708.788 ms; API p95: 34,994.688 ms.
- 122,418 requests, 69 failed requests; 99.862% reported availability. These HTTP
  summaries do not outweigh zero completed workflows or establish user success.
- Queue max/final: 2/0, no queue telemetry failures. 99 scoring write attempts,
  zero recorded SQLSTATE 40001 failures, 49 retries / 20 successes / 2 exhausted.
- Expected score count 22; observed count unknown. Seven shards (0,1,2,3,4,6,7)
  report transport failure status 0 during final reconciliation. Shard 5 attempted
  no persistence query and reported 0/0. Status 0 is not an HTTP response and does
  not prove a particular transport cause or that scores were lost.
- CPU/IO remain unknown. Resource sampling now explains why: 5 attempts, 3
  successes, 2 timeouts. Peak connections: 36/60; 20 statement deltas preserved.
- The existing generator evaluator marks all eight runners healthy and sets its
  attribution flag true. Reported whole-run CPU p95 spans 51.880–72.727%, browser
  control p95 6.913–14.722 ms, with zero browser-control failures. These summaries
  cover roughly 25–27 minutes including preparation, not only active load. Do not
  treat the flag as proof of a backend root cause or a valid Micro capacity result:
  platform telemetry is incomplete and sustained-workload completion failed.
- The generated report's "Supported ceiling" is the configured scenario label,
  not an established ceiling on a FAIL result. No capacity upgrade conclusion.

## Restoration proof

Cleanup job `98025092876` succeeded. Its log states
`Scoring workers are zero and rollback quiet window passed.` at
`2026-08-26T01:08:57.268Z`. Canonical reseed committed at `01:09:02.244Z`, and the
`Verify restored postcondition` step passed its exact `514|504|0` assertion at
`01:09:02Z`. Workflow completed at `01:09:04Z`. No restart or recovery override.

## Preserved local evidence

Worktree-root `test-results/rehearsal-32915776644/` is gitignored and outside the
Playwright app's automatically cleared output directory. It contains all eight
`load-shard-N/shard-N.json` reports and the aggregate JSON/Markdown under
`myk9-109-g9-evidence/2026-08-26T01-08-00-440Z-normal.*`.

## Remaining diagnosis and verification

The evidence-loss fix is verified under failure, not the underlying app behavior.
Next work should establish a bounded reproduction of readiness/request stalls and
distinguish application requests, database statement latency, and transport/sample
timeouts. Do not rerun full load, tune the DB, or change capacity on this result
alone. Any resulting repair needs assertion-first regression coverage and focused
tests before another separately approved full rehearsal. Both Linear issues and
the overall OpenSpec evidence gate remain open; no external diagnostics were posted.

## Authorized local performance follow-up

User: "Proceed as you think best to solve the issue and improve performance and
the load we can handle". Resume MYK9-126 acceptance criteria; do not reinterpret
this as approval for shared DB changes, deployments, another load run, or publishing
the private diagnostics. Existing workload and thresholds remain unchanged.

Testing and implementation plan:

1. Replay the saved artifacts and run the existing single-session, read-only
   readiness diagnostic. Establish a bounded failing seam before app changes.
2. Add a deterministic virtual-time regression for idle preparation masking
   active generator pressure. Keep preparation headroom separate from active
   measurements; reject legacy/unscoped evidence for capacity attribution.
3. Inspect safe endpoint counts and read-only statement/query-plan evidence to
   distinguish request fan-out, transport delay, and database work. Reproduce
   any app bottleneck with an assertion-first test before fixing it.
4. Run focused regression suites, app/test typechecks, lint/diff checks, and
   strict OpenSpec validation. Preserve offline-first, RBAC, and mutation safety.
5. Report proven improvements separately from remaining hypotheses. Request
   operator approval for any shared-system validation still needed. Full G9 and
   MYK9-126/MYK9-109 remain open until their actual evidence gates pass.

## Local follow-up results — 2026-08-26

Proven regressions and local repairs:

- Visibility fan-out: the original three-trial fixture made 12 reads where the
  assertion required 4. Resolution now batches at most 100 unique classes, reads
  settings afresh, and preserves per-class/trial/show cascades. Failed settings
  reads propagate to the existing best-effort sync handler rather than replacing
  cached restrictions with open/enabled defaults.
- Cached scoresheet readiness: an unresolved network sync kept a fully cached
  sheet loading. Warm opens now render replicated class/entry/trial data without
  awaiting network refresh; active-trial classes and show entries refresh in the
  background without replacing the judge's editing state. Cold loads and explicit
  retries retain foreground hydration. Scoring and permission paths are unchanged.
- Generator attribution: a virtual-time test reproduced idle preparation hiding
  100% active CPU (reported p95 was 0%). Sampling now starts at the load barrier
  and ends before persistence/platform reconciliation. Legacy unscoped evidence
  is incomplete, not healthy. Short windows cannot synthesize coverage.
- Failed evidence previously advertised the configured workload as a supported
  ceiling. A failing assertion now passes: failed or non-gate-eligible runs report
  `Not established`. No workload, thresholds, compute, or production settings changed.

Request observations are diagnostic, not a controlled capacity benchmark. The
original development-server sign-in plus scoresheet visit counted 126 API calls,
1,638 scripts, and 12 other requests. A guarded production-build visit before app
changes counted 107 API calls; a batching-only visit counted 72. The final five-test
suite counted 92 on its scoresheet visit (128 scripts, 18 other requests). Timing,
auth hydration, and background sync differ between visits; 72 is not a stable
ceiling or a proven percentage improvement. Significant startup/background
fan-out remains. The full G9 generator still uses its unchanged frontend mode.

Final guarded browser results: run order 2.417s, scoresheet 1.865s, Show Desk
2.436s, My Run Schedule 0.973s (navigation readiness measurements). The fifth test
held replicated trials/classes/entries reads and still opened the cached sheet;
all five passed in 18.2s. Service workers were blocked and automatic writes were
intercepted locally. These are not sustained-load or production-PWA measurements.

Read-only database inspection mapped slow-statement IDs to ringside writes,
incremental entry/dog reads, realtime activity, hide-counts and entitlements. A
bounded, secretary-scoped EXPLAIN of the current 514-row entry view executed in
20.511ms (planning 16.999ms); visibility work was memoized over nine calls. This
does not establish behavior under concurrency, nor justify an index/compute change.

Verification completed locally:

- 104 load tests across 21 files passed, including red-to-green CPU-window and
  failed-capacity-label regressions.
- 143 focused app/replication/write-guard tests across six files passed, including
  visibility isolation, transient errors, cached/stalled readiness, cold/retry
  hydration, route changes, scoring and completion behavior.
- Five guarded browser readiness tests passed against a local production build.
- App/test/edge TypeScript checks and touched-file ESLint passed.
- Production build passed; pre-existing CSS/import/chunk warnings remain.
- Code-quality ratchet passed (170 oversized source files, 24 any casts,
  19 TODO markers, 3 direct-core-read bypasses; no new ratchet failure).
- Strict OpenSpec validation and diff checks passed. Local preview server stopped.

## Separate diagnostic side effect — operator repair completed

The original readiness diagnostic did not intercept the scoresheet's automatic
`transitionToInRing` mutation. Its initial visit marked demo entry
`a1090000-0000-0000-0002-000000000002` in-ring and set its ring-entry timestamp.
No score was submitted. Read-only inspection found `is_scored=false`,
`check_in_status='in-ring'`, `is_in_ring=false`, and canonical counts still
`514|504|0`. This happened after the successful G9 cleanup above; it is not a
failure of that cleanup job.

The diagnostic now installs the existing strict shared-staging write guard before
navigation and blocks service workers; all subsequent automatic REST writes were
intercepted. The full scoring load runner remains unguarded by design.

Explicit approval was requested to restore only that unscored entry's seeded
`no-status` and null ring-entry timestamp. The user subsequently approved this
narrow repair. Before writing, fresh reads verified the exact entry still had
version 3 and the diagnostic timestamp, and confirmed live defaults/triggers.

Read-only quiet-window samples at `02:10:22.412473Z`, `02:11:17.731045Z`, and
`02:11:28.547875Z` on 2026-08-26 each showed zero active scoring workers and an
unchanged rollback count of 1,647,073. No local load/readiness test process was
running; unrelated browser sessions were left untouched. The approved GitHub run
remained terminal at the expected revision.

The guarded transaction committed at approximately `02:11:38Z`: exactly one
entry restored to `no-status` with null `ring_entry_time`. Normal version and
updated-at triggers ran (version 3 → 4); a before/after JSON assertion proved all
other entry fields unchanged. Exact row identity, prior version/timestamps,
unscored state, zero scoring workers, and `514|504|0` counts were prerequisites;
failed postconditions would have rolled back the transaction. The local SQL is
`test-results/rehearsal-32915776644/approved-entry-repair.sql` (private, gitignored).

A separate read at `02:11:54.713768Z` confirmed the committed restoration,
`is_scored=false`, `is_in_ring=false`, version 4, exact `514|504|0`, zero active
scoring workers, and unchanged rollback count. No full reseed, restart,
deployment, PR, tracking post, or new load run was performed.

Next gates: PR review/merge approval; then a separately approved unchanged full
G9 with valid active-generator
and complete platform evidence plus mandatory drain/quiet-window/restore. Request
fan-out remains an optimization opportunity, not a reason to weaken G9. Both
MYK9-126 and MYK9-109 remain open and the old heartbeat remains paused.

## Approved publication preparation

The user explicitly approved publishing the branch and opening a PR, not merging,
deploying shared staging or starting a fresh load run. Private rehearsal details
and repair SQL remain excluded from staging/publication.

Independent review found one P2 before publication: the lifetime retry counter
forced every later cached entry through foreground sync after a correction.
A new regression first failed (`loadedEntryId` remained null instead of entry-2
with stalled network). The hook now consumes each explicit refresh request once.
Both affected scoresheet suites then passed all 36 tests; independent re-review
approved the fix with no remaining blockers. Total focused coverage is now 248
tests, counting the additional correction-to-next-entry regression.

Pre-publish checks: monorepo typecheck (26 tasks) and lint (14 tasks) passed;
broad app suite passed 1,865 files / 17,999 tests with one file / nine tests skipped
in 291.92s. The broad run loaded the earlier hook before the narrow review fix;
the final hook/page suites, app/test/edge typechecks, focused ESLint/Prettier and
production build were rerun successfully afterward. Strict OpenSpec validation
and staged diff checks passed. No full-load results or capacity claim added.

Publication completed: commit `59c6807849113b9e02990daf5d7a51dbaff5a40d` pushed to
`codex/myk9-126-g9-rerun`; PR #1806 opened against main:
https://github.com/rbeezley/myk9-platform/pull/1806
Labels `codex` and `codex-automation` applied. Verified remote HEAD matches the
reviewed commit, state OPEN, auto-merge null. CI run `32922313082` started; no
continuous monitoring was scheduled. Existing Vercel integration started normal
PR previews. No merge, direct shared-staging deployment, external tracking post,
new G9 dispatch, or heartbeat resumption. This execution note remains untracked;
the private repair SQL and artifact directory remain gitignored.

## Post-merge diagnostic and remediation plan

Planning only: this section authorizes no merge, shared-system change, publication,
or additional load run. Continue the existing MYK9-126 acceptance contract.

1. Confirm the merged revision and repeat bounded, write-guarded readiness checks.
   Separate cold sign-in/startup, first sheet, next cached sheet, correction and
   background refresh. Use consistent build mode, account, cache state and
   measurement windows so comparisons are meaningful.
2. Attribute remaining request counts to endpoints and initiating sync/query paths.
   Investigate duplicate startup/global sync, visibility/settings/entitlement
   reads and per-entry refreshes; these are candidates, not proven defects.
   Measure request counts, response time and user readiness separately. Preserve
   offline-first reads, authorization, freshness and dirty-row protection.
3. For each confirmed avoidable request or readiness stall, add a failing regression,
   implement the smallest fix, run focused unit/integration tests, types/lint and
   the guarded browser comparison. Batch related fixes for separate review/PR
   approval. Do not promise a numeric request budget before attribution.
4. Verify the generator/platform evidence path is ready before requesting another
   full G9. The earlier development/production build request difference warrants
   a controlled local comparison; it is not permission to change rehearsal mode
   or proof of generator saturation. Missing CPU/IO or invalid generator data
   must remain explicit and fail closed.
5. Request a separately approved unchanged eight-shard, 100-session/55-ringside
   Micro G9 window. Evaluate sustained workflow completion, active generator
   health, API/scoring latency, persistence, CPU/IO, connections, queries, queues
   and retries. Require zero scoring workers, quiet rollback window, and exact
   `514|504|0` restoration after load.
6. Use valid evidence to choose the next layer: client request duplication,
   generator constraints, or measured database/query bottlenecks. Do not tune
   compute or weaken thresholds without the evidence and separate authorization.
   Keep MYK9-126/MYK9-109 open until their actual acceptance gates pass.

## PR #1806 merged — 2026-08-26

User explicitly requested merge. Verified the reviewed head remained
`59c6807849113b9e02990daf5d7a51dbaff5a40d`, current with main, with no unresolved
review comments. Required Quality Checks, Test, A11y smoke and E2E PR Smoke passed;
all other executed CI jobs and both Vercel previews also passed. Four focused
scoresheet/visibility/generator regression files were rerun: 47 tests passed.

Squash merge completed at `02:40:48Z`, commit
`991cd022d8e5d971907a4dba7d98d3b2282f4704`. Confirmed GitHub state MERGED. Main was
fast-forwarded without disturbing unrelated QA/research changes. Remote branch
auto-deletion was pruned; the local feature branch was removed after detaching
this worktree at the merge commit.

Worktree retained intentionally: it contains the private evidence, repair SQL
and post-merge plan that the user required to stay local. Do not remove it or
publish those files as routine branch cleanup. A future implementation must
create an appropriate feature branch before committing further code.

Read-only Linear verification after merge: MYK9-126 and MYK9-109 both remain In
Progress, with no completedAt. No tracking posts, new load run, DB change, manual
deployment or heartbeat resumption. Normal main-triggered CI/deployment may run;
this merge is not proof of deployment readiness or G9 capacity. Next work follows
the post-merge diagnostic plan above, with the full rehearsal separately gated.

## Post-merge request attribution and scoped upload refresh — 2026-08-26

User said "Proceed" after merge. Local branch
`codex/myk9-126-request-attribution` starts at merged revision
`991cd022d8e5d971907a4dba7d98d3b2282f4704`. No publication, shared DB write,
deployment, settings change, new G9 or heartbeat resumption is authorized by this
diagnostic work. Main's existing Vercel staging commit status was verified success.

The bounded diagnostic uses canonical secretary/exhibitor environment overrides,
fresh Chromium contexts, a local production build, blocked service workers and
the strict shared-staging write guard installed before authentication/navigation.
It separates sign-in, a 3-second startup window, first document navigation, next
cached client-side navigation, cached document reload and their 3-second background
windows. Entries 2 and 10 are successive dogs in the same class. No score is submitted.
CDP records endpoint/method, status, timing and sanitized source frames, plus a
SHA-256 request fingerprint; query values, payloads and credentials are not saved.
OPTIONS preflights are excluded; HEAD requests and locally intercepted writes count.
Client navigation uses BrowserRouter history without a document reload and asserts
the second dog's armband, not merely the presence of an old submit button.

Evidence, all private under worktree-root `test-results/`:

- `request-attribution-baseline/`: initial attempt failed its write-ledger assertion
  because ambient analytics was blocked; its counts included OPTIONS. Preserve it,
  but do not use these counts as the corrected baseline.
- `request-attribution-baseline-v2/`: corrected production-build baseline.
- `request-attribution-source/`: development-only source attribution, NOT a comparable
  production performance sample. Traces identify replicated-table sync calls.
- `request-attribution-after-scoped-upload/`: patched production-build comparison.

Confirmed cause: the automatic in-ring mutation's successful upload dispatched only
table names. The provider responded with its entire global download pass, pulling
unrelated shows, dogs, clubs, armbands and waitlists. The regression first failed
because entries received scope `''` instead of the affected show. Entries actually
skip remote sync with that empty scope, so the broad pass was not even a substitute
for refreshing the affected show after server-side scoring triggers.

Repair: successful-upload events now include only row identity, table, operation
and RPC name, never mutation payloads. Only complete, exclusively
`ringside_update_entry` batches use local IDB context to refresh unique affected
show-entry and trial-class scopes. The RPC's fixed column allowlist cannot move an
entry or change enrollment; its scoring/placement triggers affect entries/classes.
Mixed/generic/legacy uploads or unavailable context retain the full-refresh path.
Normal startup, polling, reconnect, RBAC, remote visibility and dirty-row rules are
unchanged. Uploads arriving during a download are coalesced for a subsequent scoped
pass; a full refresh requested during that scoped pass is retained. A failed scope
cannot be hidden by another successful scope of the same table.

Matching production diagnostic observation (navigation plus following 3 seconds):

| Window                              | Baseline API requests | Patched API requests |
| ----------------------------------- | --------------------: | -------------------: |
| Startup after sign-in               |                    35 |                   35 |
| First sheet document navigation     |                    98 |                   88 |
| Next cached sheet client navigation |                    35 |                   25 |
| Cached sheet document reload        |                    73 |                   62 |

Cached next-sheet readiness was 54 ms before and 52 ms after. Unrelated clubs/dogs/
waitlist reads disappeared from the next-sheet window. First-document readiness
was 7,582 ms before and 5,601 ms after with CDP async stacks enabled; these timings
are not comparable to the lighter readiness diagnostic or proof of a stable latency
improvement. Fixed windows can split in-flight work; these are single-session
observations, not throughput/capacity claims. Duplicate class/entry/visibility reads,
message reads and startup cost remain. The unchanged G9 runner still uses document
navigation, and its frontend mode/workload/thresholds were NOT modified.

The patched browser test passed (20.7 seconds). All three ring-entry RPCs were
answered locally, and one analytics POST was blocked and retained in the ledger.
There were no HTTP >=400 responses; CDP marked 25 HEAD requests failed after status
200 and marked the deliberately blocked analytics POST failed. Preserve these
transport flags rather than reporting a completely failure-free network run.

Verification: 527 replication tests (35 files), 206 focused app tests (10 files),
replication typecheck/build, app/test/edge typechecks and app production build passed.
Focused app and executable replication-file ESLint passed. The broader root ESLint
invocation still flags two pre-existing declarations in replication `types.ts`
(empty extension and `Conflict<T = any>`), verified in HEAD; do not describe that
broad invocation as green. Existing build CSS/import/chunk warnings remain.
Code-quality ratchet is unchanged (170 oversized files, 24 any casts, 19 TODOs,
3 direct-core-read bypasses); strict OpenSpec validation and diff checks passed.
The already-oversized provider is retained; the upload runner remains 499 lines.

Post-diagnostic read-only verification: exact `514|504|0`, zero active scoring
workers; entry 2 remains `no-status`, null ring-entry time, unscored, version 4;
entry 10 remains `no-status`, null ring-entry time, unscored, version 1. No recovery
or reseed was needed. Own local preview/dev servers are stopped before handoff.

Remaining gates: separate review/publication approval for this local patch, then
merge approval and a separately approved unchanged full G9. Scope the next local
investigation to overlapping class/entry refresh owners and startup work with
freshness/OCC regression coverage; do not suppress post-upload refreshes with a TTL.
MYK9-126 and MYK9-109 remain open, and Micro capacity remains unestablished.

## Scoped refresh PR publication — 2026-08-26

User approved opening the PR. Used ship-pr, simplify-review and commit workflows,
without extending approval to merge, auto-merge, load testing or shared-system
recovery. Fresh fetch confirmed the branch base still matches main at
`991cd022d8e5d971907a4dba7d98d3b2282f4704`. Read-only MYK9-126 verification found
the issue In Progress and its full evidence gates still incomplete.

Pre-publication verification: full repository typecheck passed (26 tasks), full
repository lint passed (14 tasks), full app suite passed (18,015 tests, 1,866 files;
9 existing benchmark skips in one file). The earlier separate root-ESLint findings
are still disclosed, not silently presented as fixed. Independent subagent review
approved the upload/scope/overlap/auth/diagnostic paths with no blocking findings.
No extra simplification was needed. Strict OpenSpec and staged diff checks passed.

Committed only 14 intended code/test/task files as
`500f55696042962f9e8f3e69e96e45b12cc9e49e` and pushed
`codex/myk9-126-request-attribution`. Opened
https://github.com/rbeezley/myk9-platform/pull/1807
with `codex` and `codex-automation` labels. Remote HEAD and file list were verified;
state OPEN, auto-merge null. CI run `32925238277` started. Normal PR integration
started Vercel previews; no manual deployment or settings change was performed.

This note remains untracked and all diagnostic artifacts/repair SQL remain
gitignored and excluded from the PR. No external tracking post or new G9 run was
made. The branch/worktree are intentionally retained for the open PR and private
evidence. Merge and full rehearsal need separate approval.

## PR #1807 merged — 2026-08-26

User explicitly requested merge. Fresh fetch confirmed current main was still the
reviewed base, HEAD remained `500f55696042962f9e8f3e69e96e45b12cc9e49e`, and
there were no unresolved review threads. The prior independent APPROVED review
still applied. Re-ran provider scope/overlap/status and cached scoresheet tests:
34 passed across four files.

Enabled squash auto-merge for that exact HEAD from the primary repository, without
admin bypass. Watched CI run `32925238277` through completion: Quality Checks,
aggregate Test, three app shards, package tests, SQL tests, coverage gate, Build,
Smoke build, A11y smoke and E2E PR Smoke passed. Both Vercel previews passed.
The separate non-PR coverage job was intentionally skipped; its PR coverage gate
passed. No failing check was ignored or rerun.

GitHub confirmed state MERGED at `2026-08-26T03:27:00Z`, squash commit
`a9d44d47c5435c1b4692f8d41d9833938a379078`.
Main was fast-forwarded to that commit, preserving unrelated QA/research changes.
The auto-deleted remote feature branch was pruned; after detaching this evidence
worktree at the merge commit, local `codex/myk9-126-request-attribution` was deleted
using GitHub's exact-branch squash-merge proof. The worktree, this untracked note,
and private artifacts remain intentionally retained.

Both issues were In Progress before merge, but the post-merge read-only Linear
check found MYK9-126 marked Done at `2026-08-26T03:27:02.074Z` and MYK9-109
marked Done at `2026-08-26T03:27:02.255Z`, apparently by the merge integration.
Their full G9 evidence gates remain unmet; these Done states do not represent
acceptance. Reopening both requires operator approval under the existing external
tracking-write restriction. No agent tracking write, new load run, DB mutation,
manual deployment or settings change was performed. Normal main-triggered
deployment may follow the merge; merge success is not deployment or Micro capacity
proof.

## Approved tracking correction — 2026-08-26

The user approved reopening both issues after the merge integration closed them.
Changed only the state of MYK9-126 and MYK9-109 to In Progress. Read-back verified
both statuses and `completedAt: null`. Acceptance criteria remain unchanged and
unmet; no diagnostic comment was published and no new rehearsal was dispatched.

## Post-merge verification and next-run gate — 2026-08-26

User request: "Proceed". Resumed the existing OPSX verification, without treating
that instruction as authorization to reseed or dispatch another shared-target run.

GitHub recorded a successful myK9Show main deployment for
`a9d44d47c5435c1b4692f8d41d9833938a379078` at `2026-08-26T03:30:41Z`
(deployment `6096518441`). This is deployment evidence, not runtime capacity proof;
G9 itself still runs the checked-out frontend locally on each GitHub runner.
The latest five G9 workflow runs are terminal; the latest remains failed run
`32915776644`. No new run was dispatched.

Fresh local checks: all 105 load unit/contract tests passed across 21 files in
2.19 seconds; `pnpm test:load:playwright --list` discovered exactly one normal G9
test without executing load; strict OpenSpec validation passed. The skill's
suggested `validate --change` flag is unsupported by this installed CLI; validation
was rerun successfully using its documented positional change name.

Verification summary: 23/26 tasks checked. The three unchecked items (4.3, 5.6,
6.4) still require remote evidence/approval, so archive and issue closure remain
blocked. Reviewed workflow and source retain eight shards, 100 sessions with 55
ringside, Micro, 25-minute default preparation, 10-minute load, CPU/IO preflight,
active-load generator measurement and unconditional drain/quiet/restore gates.
No full new requirement-to-code audit or capacity conclusion is claimed here.

Found this retained worktree's ignored `.env.local` still overriding the exhibitor
email with the obsolete account. Corrected that one value to the user's specified
`exhibitor@myk9t.com`; no password or shared secret was changed. The workflow uses
the opaque GitHub `E2E_DEMO_EXHIBITOR_EMAIL` secret, whose current value cannot be
verified by reading GitHub APIs. Confirm its canonical value before dispatch;
do not assume this local correction changed CI credentials.

Next verification plan (separately operator-gated):

1. Obtain approval for one unchanged G9 run on the merged revision, including the
   canonical reseed and protected environment gate; confirm CI exhibitor identity.
2. Recheck the selected remote revision and absence of another active rehearsal.
3. Execute only that approved run with unchanged workload, thresholds and settings.
4. Inspect all eight shard artifacts, aggregate evidence, generator validity and
   platform CPU/IO/connection/query/queue/retry evidence. Keep failures explicit.
5. Require zero scoring workers, the quiet rollback window and exact `514|504|0`
   restoration. A cleanup failure requires operator recovery, not automatic repair.
6. Use valid evidence to select further request deduplication/backend fixes with
   assertion-first regressions. Keep MYK9-126 and MYK9-109 open until all gates pass.

## Approved run awaiting CI identity confirmation — 2026-08-26

User replied "Yes" to one unchanged G9 run including canonical reseeding, once
the CI account is confirmed. Remote main is still
`a9d44d47c5435c1b4692f8d41d9833938a379078`; the latest five rehearsals are terminal.
Repository secret `E2E_DEMO_EXHIBITOR_EMAIL` exists and was last updated at
`2026-08-24T19:38:43Z`. The `load-rehearsal` environment has no secrets, and shard
jobs use the repository secret. GitHub metadata does not prove its value.

No run dispatched and no secret changed. Request permission to set that one email
secret to the known canonical `exhibitor@myk9t.com`, leaving passwords and all other
settings untouched, then execute the already-approved run. The existing monitor
has not been reactivated against the old terminal run.

## Approved post-PR #1807 rehearsal launched — 2026-08-26

User request (verbatim): "Yes", approving setting only the CI exhibitor email and
then launching the already-approved single unchanged G9 run. Updated repository
secret `E2E_DEMO_EXHIBITOR_EMAIL` to `exhibitor@myk9t.com`; GitHub acknowledged the
write and metadata timestamp `2026-08-26T03:39:18Z`. Passwords and other secrets
were not changed. Remote main matched the reviewed merge SHA and no non-terminal
G9 workflow runs were present before dispatch.

Dispatched exactly once with `confirmation=sojmvhhwsjxmfistvzbe` and
`start_delay_minutes=25`:
https://github.com/rbeezley/myk9-platform/actions/runs/32927274194

GitHub confirmed run creation at `2026-08-26T03:39:34Z` and exact revision
`a9d44d47c5435c1b4692f8d41d9833938a379078`. The prepare job initially waited on the
existing `load-rehearsal` environment. Recorded the user's explicit approval via
the normal pending-deployment review endpoint, environment `18961269706`, producing
deployment `6096610661`. No gate bypass or environment setting change was used.

Reactivated the existing five-minute heartbeat `monitor-approved-g9-rehearsal`
against ONLY run `32927274194`, replacing its old terminal-run target. It may read
status, collect all eight artifacts/aggregate evidence and verify cleanup, but may
not dispatch/retry, recover, change settings or publish private diagnostics.
It must pause after terminal evidence/cleanup reporting or an operator blocker.

Approval tasks 5.6 and 6.4 are now checked locally (25/26 tasks complete); remote
evidence task 4.3 remains pending. MYK9-126/MYK9-109 remain open. The earlier 105
load-test passes and successful main deployment are not substitutes for this run's
complete evidence or proof of Micro capacity. No additional rehearsal is approved.

### Monitoring — 2026-08-26 03:45 UTC

Read-only status confirms the approved revision unchanged. Prepare/preflight/seed
job succeeded at `03:41:04Z`; all eight shard jobs are in progress in their
`Run synchronized 12/13-session shard with generator telemetry` step. This step
includes browser preparation and the barrier, so it does not yet prove active
load or prepared-session counts. With the approved 25-minute delay, synchronized
load is expected around `04:06Z` (estimate, not a sampled start timestamp).
Aggregate evidence and final drain/quiet-window/restoration remain pending.

### Monitoring — 2026-08-26 04:10 UTC

Approved revision unchanged. Shard jobs 4 and 5 have completed with successful
job exits; the other six remain in their synchronized-run step. These early job
completions do not establish successful workflows or a sustained ten-minute load.
Artifact inspection, aggregate decision and mandatory cleanup proof remain pending.
No run or settings changes were made; heartbeat remains active for this run only.

## Terminal evidence — run 32927274194, 2026-08-26

Run completed with FAILURE at `04:19:56Z`, at the approved revision
`a9d44d47c5435c1b4692f8d41d9833938a379078`. All eight shard jobs produced reports
and exited successfully; aggregate job `98059419590` correctly failed G9. This is
not a passing workload. No retry, recovery, deployment, settings change or external
tracking post was performed during monitoring.

Downloaded and inspected all eight shard JSON artifacts and the aggregate JSON/MD
in `test-results/rehearsal-32927274194/`. Full aggregate and cleanup logs are also
preserved there as `aggregate.log` and `cleanup.log`. This directory is gitignored;
none of these diagnostics are published by this task.

### Workload and evidence validity

- All reports belong to `32927274194-1`, with unique shard indices 0–7 and exactly
  100 unique global assignment sequences 0–99. Only shard 0 supplies platform data.
- Common barrier `1787717163000` (`04:06:03Z`); observed starts are 2–101 ms late.
- Configured/prepared/started/completed/failed sessions: `100/100/100/0/100`;
  ringside: `55/55/55/0/55`. Peak active workflows 86; peak ringside workflows 55.
- All workflows failed readiness waits: 55 scoring submit controls, 15 check-in
  dog cards, 15 exhibitor My run schedule headings, 10 run-order dog-card waits,
  and 5 Show Desk headings. Some score attempts occurred before workflows failed;
  zero completed workflows does not mean zero writes were attempted.
- Active-load generator CPU p95 is saturated on every runner. The evaluator now
  correctly sets `generatorAttributionValid: false`, unlike the old diluted
  whole-run sampling. Host/browser-attempt coverage is at least 99.471%/98.413%.
  All eight have explicit active-load provenance, but none has valid headroom.

| Shard | Sessions/ringside | CPU p95 % | Active sample seconds | Final queue | Expected/observed scores |
| ----- | ----------------- | --------- | --------------------- | ----------- | ------------------------ |
| 0     | 13/7              | 99.497    | 562.920               | 46          | 30/unknown               |
| 1     | 13/7              | 95.970    | 482.839               | 27          | 20/unknown               |
| 2     | 13/7              | 99.000    | 419.249               | 13          | 15/unknown               |
| 3     | 13/7              | 99.246    | 323.726               | 1           | 10/unknown               |
| 4     | 12/7              | 99.500    | 189.063               | 0           | 5/unknown                |
| 5     | 12/7              | 94.924    | 144.961               | 0           | 0/0 (no query)           |
| 6     | 12/7              | 98.241    | 694.257               | 70          | 35/unknown               |
| 7     | 12/6              | 97.519    | 624.850               | 59          | 30/unknown               |

Configured duration remains ten minutes; early failures and long tails mean these
artifacts do not demonstrate sustained successful ten-minute workload coverage.
Shard elapsed time including reconciliation ranges 145.110–709.385 seconds.

### Failures retained, not interpreted as Micro capacity

- Browser-observed scoring/API p95: `147344.723/130376.691 ms`; page p95
  `5749.496446 ms`. Generator saturation invalidates backend attribution from these
  numbers and prevents defensible before/after capacity conclusions.
- Requests/failed requests/workflow failures: `233245/1145/100`; reported throughput
  `328.798889 rps`, availability `99.466455%`. These are harness observations, not
  demonstrated successful user throughput.
- Scoring attempts 265; SQLSTATE 40001 count 0. Retries attempted/succeeded/exhausted
  `124/33/36`. Recorded max queue field 15, summed final queues 216, queue telemetry
  failures 0. Preserve both queue fields as reported; do not treat 15 as a global
  all-times queue maximum or claim the client queues drained.
- Expected persisted scores 145; observed unknown. Seven shards report transport
  failure with status 0 in reconciliation. This is missing persistence evidence,
  not proof of lost scores or a specific HTTP/server cause.
- Required platform CPU, IO and peak connections are null. Resource sampler made
  11 attempts: 2 succeeded, 9 timed out. Twenty statement deltas remain available,
  but neither partial deltas nor preflight success replace missing runtime metrics.
- Aggregate FAIL reasons: scoring/API latency, availability, non-drained queues,
  failed persistence reconciliation, missing platform telemetry and all eight
  saturated generators. Supported ceiling explicitly says `Not established`.

### Mandatory cleanup verified

Cleanup job `98059559416` succeeded. At `04:19:43.893Z` its drain log states:
`Scoring workers are zero and rollback quiet window passed.` Canonical reseed
committed at `04:19:51.622Z`. The final postcondition step ran a fail-closed exact
`514|504|0` assertion and completed successfully at `04:19:52Z`. Job/run completed
at `04:19:56Z`. Thus the server drain/quiet-window and canonical restoration are
proven even though client queues and persistence reconciliation failed beforehand.
No database restart or operator recovery was needed for this cleanup.

### Handoff

G9 and Micro capacity remain unproven; MYK9-126 and MYK9-109 must remain open.
The monitoring heartbeat was paused after terminal evidence/cleanup reporting.
No further load run is approved. Any subsequent work should distinguish the
confirmed generator saturation from app/readiness defects and missing platform
sampling evidence before another capacity claim; this monitoring turn made no fix.

## Proposed next diagnostic sequence — 2026-08-26

User asked: "What now?" This is a recommendation, not authorization for another
rehearsal, source changes, CI settings changes or shared-target writes.

1. Establish a trustworthy frontend/generator comparison first. The checked-in
   Playwright load config starts `pnpm run dev` on each runner alongside Chromium.
   Compare that arrangement with the same revision's built production assets in
   a bounded local diagnostic, retaining equivalent routes/data and recording
   browser versus server process CPU and request categories. Development-server
   overhead is a hypothesis, not a proven root cause; the host CPU figures do not
   isolate which process saturated. Do not silently change the official G9 baseline.
2. Reproduce one failing workflow at a time, starting with scoring, using guarded
   writes or isolated fixtures. Attribute duplicate API reads and readiness stalls
   to concrete callers. Separately trace the resource sampler's nine timeouts in
   eleven attempts, distinguishing sampler contention from remote latency. Do not
   relax its fail-closed telemetry rules to make the report pass.
3. Testing phase: establish deterministic failing regressions before any repair;
   verify freshness/OCC, offline behavior, RBAC, queue draining, telemetry timeout
   reporting and unchanged cleanup/workload contracts. Repeat the same bounded
   diagnostic after each minimal repair. Guarded navigation cannot prove actual
   score persistence; that needs isolated integration evidence or approved writes.
4. Only after representative workflows succeed and generator headroom/telemetry
   are demonstrated, request one full G9 run with unchanged 100/55 workload and
   thresholds. Any frontend-serving or topology change requires an explicit
   comparison and approval, not an apples-to-apples claim against a different setup.

Do not upgrade Micro on this evidence, claim that the application is healthy, or
repeat the same full run without an evidence-backed change. Both issues stay open.

## Local diagnostic authorized — 2026-08-26

User request: "proceed", following the testing-versus-app diagnosis and saved
bounded diagnostic sequence. Scope: local dev/build comparison with existing strict
write guard, one browser context at a time; reproduction and regression-backed
local fixes only if supported. No new full load, shared data writes, deployments,
secrets/settings changes or external publication. Existing evidence stays retained.

Testing plan: run the existing guarded request-phase spec first, add equivalent
per-phase frontend request/browser work measurements if needed, compare development
and built frontend on the same revision, then reproduce a concrete defect with a
failing test before any implementation fix. Keep official G9 topology/configuration
unchanged. A passing bounded diagnostic is not score-persistence or capacity proof.

## Bounded generator diagnostic results — 2026-08-26

Local branch: `codex/myk9-126-generator-comparison`, based on merged revision
`a9d44d47c5435c1b4692f8d41d9833938a379078`. No commit, push, PR, deployment or full
G9 was performed. This private note and raw artifacts are not publication scope.

### Confirmed defect and minimal local repair

`apps/myk9show/vite.config.ts` forced `usePolling: true` at a 100 ms interval.
The diagnosis-first loop isolated its idle CPU cost before changing the source:

| Same local dev server, no browser traffic                | CPU time in approximately 8 seconds |
| -------------------------------------------------------- | ----------------------------------: |
| Original forced polling (8,005 ms wall)                  |                            2,870 ms |
| Only `CHOKIDAR_USEPOLLING=false` changed (8,011 ms wall) |                               10 ms |
| Source fix, no environment override (8,009 ms wall)      |  0 ms at `ps` accounting resolution |

The original consumed about 35.85% of one local CPU core while idle. The private
TypeScript probe uses process CPU time from `ps` and an eight-second wall window;
its 1,000 ms CPU budget failed before and passed after. This is local macOS
evidence, not proof of the Linux runner contribution or of total G9 root cause.

The config regression was observed red (`expected true to be undefined`) before
removing the forced watch settings, then green after. Native file events are now
the default; environments requiring polling retain the existing
`CHOKIDAR_USEPOLLING=true` opt-in. HMR is retained. A second regression creates an
isolated temporary source file, starts Vite with the actual config, verifies the
watch registration and change event, then closes the server and removes only its
own temporary fixture. The sandbox missed the native event; the identical test
outside the sandbox passed. Final focused suite outside the sandbox: 107 tests,
22 files, all passing in 2.27 seconds.

### Development versus production assets, not a capacity comparison

The same single-context guarded request-phase diagnostic ran against local dev
port 5186 and a local production build preview on port 5187. Both use Chromium,
blocked service workers, CDP debugger/async stacks and the same routes and data.
These instrumentation choices affect timings and caching; this is not a normal
end-user benchmark. The first baseline overlapped a build and is excluded from
timing comparisons. Dev was repeated; production was one measured pass.

| First scoresheet document navigation         | Dev measured | Production measured |
| -------------------------------------------- | -----------: | ------------------: |
| Same-origin frontend resources               |          831 |                  71 |
| Script resources                             |          829 |                  67 |
| Completed encoded bytes                      |   26,256,485 |           1,807,401 |
| API requests, navigation plus next 3 seconds |           87 |                  87 |
| Time until visible submit control            |     1,899 ms |            5,518 ms |

Next cached client navigation requested zero frontend assets in both and had 24
API requests including the next three seconds in both. Its observed times were
44 ms (dev) and 92 ms (production). Cached document reload plus background had
61/62 API requests. Therefore the build comparison demonstrates less frontend
resource work, but **not** lower API demand or a reliable latency improvement.
Do not substitute production preview into official G9 without explicit approval.

The source-fixed dev pass also completed: 831 frontend resources, 88 API requests
for first-sheet navigation plus background; 27 for next-sheet navigation plus
background; 62 for cached-document navigation plus background. API traffic remains
substantial and variable. This patch does not claim to optimize it. It changes no
application business logic, replication, RBAC, scoring or persistence behavior.

The request-phase spec now records frontend request/script counts and completed
encoded bytes separately from API requests. It also records raw current-document
cumulative renderer counters (task/script/layout/style seconds and heap bytes).
Those reset on document navigation; they are not whole-browser or host CPU.

Important report interpretation: `LoadMetrics.requestCount` increments for all
browser responses/failures; `/rest/v1/` filtering is used for API timing, not the
total request counter. The failed G9's 233,245 requests are **not** 233,245 API
calls. The separate request-phase API counts above retain the `/rest/v1/` filter.
Neither count is successful score throughput; guarded/intercepted requests are
included in these diagnostic observations.

### Safety and verification

- The guarded browser diagnostic passed for dev baseline, measured dev,
  production, repeated dev, native-watcher environment override and final fixed
  source. Each retained ledger records three intercepted ring-entry RPC writes
  and one blocked analytics POST; no other blocked writes. Scores were not
  submitted. This cannot establish real persistence or concurrency correctness.
- `pnpm build` passed, including the PWA build. Existing CSS and chunk/import
  warnings remain. This build preceded the dev-only watcher config edit; no app
  runtime implementation changed afterward.
- `pnpm exec vitest run src/test/load src/test/config/devServerWatch.test.ts`:
  107 tests / 22 files passed, including real native watcher events outside the
  sandbox. The prior sandbox watcher failure is retained, not treated as a pass.
- `pnpm typecheck:tests` passed. An additional focused `tsc --noEmit` config in
  the private diagnostic directory explicitly includes the otherwise-excluded
  E2E diagnostic, new watcher test and app type declarations; it passed.
- Prettier check and ESLint passed for the Vite config and both changed test files.
- Strict OpenSpec validation and `git diff --check` passed.
- All browser runs ended and both temporary local servers were stopped. The
  native watcher test removes only its generated temporary fixtures. All private
  request evidence remains in `test-results/generator-comparison/`.

### Remaining work and approval gate

No remaining application readiness defect was reproduced by these single-session
navigations. That is not a clean bill of health: the full run's failed scoring,
queues, reconciliation and missing platform telemetry remain unresolved.
Read-only sampler inspection found two-second connection probes with
`PGCONNECT_TIMEOUT=10` but no child/query deadline, and resource requests every
60 seconds with a 15-second timeout. Probe overlap is a hypothesis, not a proven
explanation for the nine resource timeouts; no telemetry code was changed.

Continue from the existing diagnostic sequence, not a new full-load loop:
regression-backed sampler timeout/concurrency investigation and attribution of
remaining API reads are still needed, with focused tests before any repair and
guarded/isolated workflow verification afterward. Persistence proof or any shared
writes require separate approval. Only representative passing workflows plus
valid generator and platform evidence can justify asking for full G9 validation.

The local patch is ready for publication review; opening/pushing a PR and merging
require approval. Another full G9 remains separately gated. The monitor stays
paused; MYK9-126 and MYK9-109 remain open. No external tracking posts were made.

## Publication approved — 2026-08-26

User approved publishing this patch as a PR. Authorization covers the feature
branch push, PR creation and normal PR metadata only, not merge, a new G9,
shared-system settings or detailed diagnostic/tracking publication.

Fresh pre-push verification passed: full app/test/edge-test typechecks, app lint,
107 focused tests across 22 files, the additional diagnostic TypeScript check,
formatting, strict OpenSpec validation and diff checks. Refreshed `origin/main`
still matches the patch base. Only the Vite config, native-watcher regression,
request-phase diagnostic source and OpenSpec checklist are publication scope.
This execution note and `test-results/generator-comparison/` remain excluded.
Independent source review is required by the ship-pr workflow before handoff.

Published commit `b2c098a803bfab7881f0daf487fa7a995973866e` and opened
[PR #1808](https://github.com/rbeezley/myk9-platform/pull/1808). The independent
reviewer approved the commit and then verified the remote PR diff matches the
same four files, excluding all private evidence. GitHub reports the PR open,
with auto-merge unset and CI in progress at handoff. Local HEAD and its remote
branch match. The retained execution note is the only non-ignored local change;
no issue comments/status mutations or detailed diagnostic publication were made.
No merge, new full load, explicit deployment or shared-data mutation was run.

## Merge authorized — 2026-08-26

User requested "merge it" for PR #1808. Main still matched the reviewed base,
the PR head remained `b2c098a803bfab7881f0daf487fa7a995973866e`, and review comments
contained no blocking finding. The prior independent approval applies to this
unchanged diff. Focused verification passed again: 107 tests / 22 files.
Squash auto-merge was enabled from the primary repo with the exact head guard,
pending required Quality Checks. No new load run or explicit deployment was
authorized. Retain this worktree and private evidence after merge; preserve the
unrelated documentation changes in the primary checkout.

CI run `32973267307` failed only the new native-watcher regression in app shard
1: the event arrived with the expected path plus optional `Stats`, so exact
one-argument `toHaveBeenCalledWith(probe)` was an incorrect portability assumption.
The other 5,893 tests in that shard passed, as did shards 2 and 3. The merge stayed
blocked; no bypass or blind rerun was used.

Reproduction: parameterize the real watcher test over `alwaysStat=false/true`.
The true case reproduced the identical extra-argument assertion failure locally
before changing the assertion. Fix: assert the exact path in recorded first
arguments, independent of optional metadata. Keep both cases, real events, the
same timeout and cleanup. Focused suite then passed 108 tests / 22 files; focused
TypeScript, ESLint, formatting, diff and strict OpenSpec checks passed. Independent
review approved this narrow follow-up. Production config/app logic were unchanged.
The generic PR description records this CI correction; private raw diagnostics
and this execution note remain excluded. Fresh CI must pass before merge.

### Merge and scoped cleanup completed

The correction was published as `d197be44a9d94d5b07e9d680eed3d76c684eb166`.
Fresh CI run `32974589367` passed all app shards (including the Linux watcher
regression), package/SQL tests, quality checks, coverage gate, build, smoke build,
accessibility smoke and browser smoke. GitHub confirms PR #1808 squash-merged at
`2026-08-26T13:50:03Z` as `7b7b8c10167176e64d9e1d7debff3a677e7d9cf1`.
No safety gate was bypassed.

Main was fast-forwarded to the merge and the remote branch pruned. The retained
diagnostic worktree was detached at the merge commit, preserving its private
note/artifacts, and the confirmed merged local feature branch was deleted.
The four merged files exactly match the reviewed head. The three unrelated
primary-checkout documentation files retain their pre-sync content hashes.

The merge integration automatically closed MYK9-126 and MYK9-109 at
13:50:05–06Z despite their unmet acceptance requirements. Their statuses were
restored to In Progress, consistent with the instruction to keep both open;
no comment or detailed diagnostics were posted. Full G9, persistence, complete
platform telemetry and a defensible capacity conclusion remain outstanding.
No new G9 or explicit deployment was dispatched. The old G9 heartbeat remains
paused, and no worktree/evidence removal was performed.

## Persistent G9 goal authorized — 2026-08-26

User request, verbatim: "can you proceed and treat this as a goal and keep working
until the G9 load test passes?"

An active goal now tracks a genuinely passing unchanged G9, with valid generator
and platform observations, real scoring/persistence/queue evidence, and verified
zero scoring workers, quiet rollback window and exact `514|504|0` restoration.
Local implementation resumes on `codex/myk9-126-telemetry-reliability` from merged
`7b7b8c101`. The user requested persistence, not weaker thresholds or bypassed
gates. Publication, merge, shared-target load/reseed, configuration/deployment and
external diagnostic publication retain their applicable explicit approval gates.
No recurring load tests are scheduled. The existing G9 heartbeat stays paused
until a specific next run is approved and dispatched.

First slice: locally reproduce telemetry deadline/concurrency/shutdown defects
with fake clocks and mocked transports, apply only regression-backed repairs,
then verify all load contracts and unchanged fail-closed interpretation. Next,
continue the existing bounded workflow/API attribution plan; do not mistake the
sampler repair for proof of the cause of the previous remote resource timeouts.

### Telemetry slice: local red/green and review evidence

- Initial baseline: 7 sampler tests passed. Three new regressions then failed:
  absent query/process deadlines, four overlapping connection probes after six
  seconds, and duplicated final observations/results on concurrent stop calls.
- Added fail-path cases exposed four further invalid-count failures: empty,
  whitespace, negative and fractional output appeared usable. Reject non-decimal
  or unsafe-integer counts; retain NaN/missing evidence on any lost connection probe.
- Fixes: one in-flight connection probe, skipped scheduled observations invalidate
  the peak, one shared stop promise, and a 15-second SIGKILL deadline for each
  telemetry-owned psql child. No workload, HTTP resource deadline/cadence,
  global database setting or cleanup predicate changed.
- Independent review found the initial PGOPTIONS approach incompatible with the
  pooler contract. Reproduced the missing explicit SQL setting/order with two red
  tests, then changed each invocation to quiet-mode SET statement_timeout=10000
  followed by its SELECT on the same session, with existing ON_ERROR_STOP=1.
  Preserve existing caller PGOPTIONS and keep passwords out of argv/errors.
  Reviewer round 2: APPROVED; no remaining blocking findings.
- Compatibility basis: the workflow uses session-mode port 5432. Supabase documents
  [session timeout settings](https://supabase.com/docs/guides/database/postgres/timeouts);
  upstream [startup-option handling](https://raw.githubusercontent.com/supabase/supavisor/main/lib/supavisor/client_handler/protocol_helpers.ex)
  cannot be relied upon to forward statement_timeout. This is source/documentation
  verification, not a test of the hosted pooler's deployed version.
- Final focused verification: 123 load tests across 21 files passed (2.21 seconds),
  test typecheck passed, focused ESLint passed, load discovery still lists exactly
  G9 and bounded smoke, and strict OpenSpec validation passed. Runtime cases cover
  startup/active/final errors, skipped probes, simulated timeouts, shared shutdown,
  zero remaining fake timers, redaction and required process options. These mock
  boundaries; they do not prove actual hosted query cancellation or live capacity.
- Simplification review: no useful extra abstraction or production-code change
  warranted. Sampler and runtime test files remain below the 500-line limit.

### Implementation verification: separate-g9-generator-saturation

| Dimension    | Evidence/status                                                                                                                                       |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Completeness | 34/41 tasks complete; telemetry local tasks 8.1–8.4 complete                                                                                          |
| Correctness  | Added lifecycle requirement maps to sampler, runtime tests and missing-evidence evaluator tests; existing safety/topology/load contracts remain green |
| Coherence    | Same sampler seam, unchanged workload/thresholds/cleanup; explicit session-local SQL timeout addresses review finding                                 |

Critical before full acceptance/archive: task 4.3 (passing approved G9), 8.5
(publication/merge/CI approval), and 9.1–9.5 (continued attribution, representative
real persistence, approved run, all-shard evidence and final acceptance). They
remain unchecked. No archive, issue closure, remote load or external publication.

Read-only reinspection of the retained dev-fixed request trace found six identical
show_message_threads GET fingerprints in the next-sheet background window. The
captured stacks point through replication listeners, but current built-file line
numbers have moved; this is an attribution lead, not a reproduced redundant-read
defect or permission to bypass offline reads. No app repair was made from counts
alone. The failed full G9 remains invalid for backend attribution; a fresh approved
run is needed to assess the merged native watcher fix and repaired telemetry.

Next approval gate: publish the reviewed telemetry slice (excluding this note and
all test-results), merge only after required CI, then one unchanged full G9 on the
existing approved target with 8 shards, 100/55 sessions, Micro, 25-minute preparation,
10-minute load, canonical reseed, mandatory drain/quiet window and exact 514|504|0.
Do not dispatch until explicitly approved. The persistent goal remains active.

### Message subscription churn: regression-backed follow-up

Continued local work while publication/merge/new-G9 approval remains outstanding.
The trace's repeated thread reads were reproduced at the hook and real-store
transport boundary: initial mount plus five identical replica updates made six
subscribe calls and six `show_message_threads` reads (expected one). Identical
auth-object refreshes also reproduced six subscriptions. These are mocked HTTP
boundaries, not a hosted API-count or capacity measurement.

The hook now keys its existing show union by a sorted unique ID set and compares
the full auth snapshot by value. Identity, permissions, roles, scope and membership
changes still refresh; logout and unmount release subscriptions. No new message
surface, query shape, RLS decision or offline source was introduced.

Independent review exposed two related reliability gaps before shipping:

- Pending A-to-B changes were dropped by the old busy flag, and an unmounted hook's
  pending fetch could install a stale channel. Both cases were red first. The
  extracted subscription action now owns work by generation: latest membership
  starts immediately, duplicate pending membership shares one promise, and obsolete
  thread/participant/message responses and realtime callbacks cannot write state
  or install channels. An old completion cannot clear a newer request's busy state.
- Stable dependencies would remove incidental retries after initial hydration
  failed. Two fail-first recovery tests were red. Hydration now reports success
  without changing direct callers' non-throwing behavior; failed reads remain
  visible while realtime channels remain available. Replica/auth refresh and
  browser reconnect retry only incomplete hydration, preserving the current
  store scope and deduplicating in-flight events. Healthy subscriptions do not
  refetch or restart. No polling timer or unbounded automatic retry was added.

The new store helper and request-boundary tests remain under 500 lines; extracting
subscription ownership reduced the pre-existing 522-line message store below the
limit. Tests cover live inserts/updates as well as obsolete callbacks. No changes
to scoring writes, queue semantics, test roles, fixture, workload or thresholds.

Current local verification: 184 tests across 27 files pass (61 message/notification
tests and 123 load tests). Load discovery still lists exactly G9 and bounded smoke;
strict OpenSpec validation and diff checks pass. Full repository types/lint passed
again after the recovery delta (26 typecheck/build tasks and 14 lint/build tasks;
unchanged dependencies used the worktree-shared Turbo cache).
Final independent review after concurrency and recovery fixes: APPROVED.

Broad app run: `pnpm run test --maxWorkers=4 --reporter=dot` completed in 356.69
seconds with 18,053 passing, two failing and nine skipped tests; 1,867 passing,
one failing and one skipped test files. The only failures were the unchanged
`devServerWatch.test.ts` native-change cases (`alwaysStat: false/true`), which
received no change event under the sandbox. An approved out-of-sandbox focused
rerun passed all three watcher tests in 807 ms without changing the tests, Vite
configuration or polling settings. This supports a sandbox restriction rather
than a watcher-code defect; the original failed broad result is preserved, not
relabeled green. The recovery delta landed during the broad run and was separately
covered by the final 184-test focused run and fresh full types/lint. No suite hung
or was retried in a loop.

### Combined local implementation verification

| Dimension    | Evidence/status                                                                                                                                               |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Completeness | 36/43 tasks complete; 9.1a–9.1b locally complete, seven operator/live-evidence tasks remain                                                                   |
| Correctness  | All nine spec requirements have implementation/contract coverage; new subscription lifecycle/recovery cases pass at the real-store, mocked-transport boundary |
| Coherence    | Existing hook/store and sampler seams; no query shape, RLS, offline-source, workload, threshold or cleanup-predicate changes; independent review approved     |

Critical before acceptance/archive: finish 4.3 (passing approved rehearsal), 8.5
(publication/merge/CI), 9.1 (remaining attribution from live evidence), 9.2 (real
scoring/persistence and complete telemetry), 9.3 (next run approval), 9.4 (all-shard
and cleanup inspection) and 9.5 (all acceptance gates). Broad-test environment
warning and mock-only transport limitation remain recorded above. Do not archive
or mark either Linear issue Done from this local verification.

Plan validation escalated from focused/app to full due to shared message-store
concurrency. OpenSpec verification still has operator/evidence gates: no passing
full G9, no new PR/CI, no representative scoring persistence proof on this revision,
and no defensible Micro capacity conclusion. No publication, shared target write,
load dispatch, issue closure or heartbeat resumption occurred in this follow-up.
The approval request now covers publishing/merging the combined reviewed telemetry
and message-lifecycle slice after CI, then one unchanged G9 with mandatory cleanup.

### Approval-blocked goal audit — 2026-08-26

The publication/merge/new-rehearsal approval gate has now persisted across three
consecutive goal turns, including the original goal request and automatic
continuations. No explicit operator approval followed either request. Automatic
goal continuation is not approval for shared-system actions.

Fresh checks confirm the prepared changes remain on the linked telemetry-reliability
worktree, diff checks pass, and GitHub has no PR for this branch. Local regression
repairs, required verification and independent review are complete. Further
acceptance evidence requires publication/CI/merge and an approved real G9; more
mock-only tests or unrelated code edits cannot substitute for those gates.

Mark the persistent goal blocked pending operator approval, not complete. Preserve
the worktree and private artifacts, keep the old heartbeat paused, and do not
publish, merge, dispatch a run, change shared settings, or close either issue.
Resume upon explicit approval to publish the combined fix, merge after CI, and
execute one unchanged G9 with canonical reseed and mandatory drain/quiet-window/
exact `514|504|0` restoration. Additional runs or recovery remain separately gated.

### Approval received — 2026-08-26

User answered "yes" to: "May I publish the fixes, merge after CI passes, then run
one unchanged G9 with mandatory drain, quiet-window, and exact 514|504|0 restoration
checks?" This authorizes the combined reviewed branch publication, CI-gated merge
and one unchanged rehearsal on the merged revision, including the existing
protected environment approval. It does not authorize further retries, changed
workload/thresholds/settings, DB recovery/restart, secrets changes, or publication
of private diagnostics. Resume the existing plan; preserve all acceptance gates.

Fresh pre-publish verification: 184 focused tests pass, full repository types/lint
pass from matching Turbo cache, and native watcher tests are rerun outside the
sandbox. The prior broad-suite result and environment limitation remain recorded.
Simplification review of the final source diff found no necessary additional
abstraction or behavioral change. No PR template exists under .github.

Published `2987862f7ac9a4327b23725594a7432e7d6e689a` as
[PR #1810](https://github.com/rbeezley/myk9-platform/pull/1810). Only the twelve
reviewed implementation/test/OpenSpec files are committed. This execution note,
the private PR body staging file and raw test-results remain excluded. Fresh
native watcher verification passed all three tests outside the sandbox in 890 ms.
Both linked Linear issues were read and remain In Progress before publication;
no tracking comment or detailed external diagnostics were posted.

Published-diff review: APPROVED. CI is run `32983789820` on exact head
`2987862f7ac9a4327b23725594a7432e7d6e689a`. Wait for the entire CI run (including
app/package/SQL and downstream build/smoke gates) before the approved merge.
GitHub's required-check query initially exposes only Quality Checks while later
jobs have not materialized; this is not permission to merge early. The latest
three G9 workflow runs are terminal. No new load run has been dispatched yet.

### Approved sequence handed to the existing monitor

Reactivated `monitor-approved-g9-rehearsal` at its existing five-minute cadence
to finish PR #1810's CI-gated merge and dispatch exactly one unchanged G9. At
handoff, Quality Checks, package tests and SQL tests are green; the three app
shards are still running in CI `32983789820`. No G9 dispatch has occurred under
this approval. The monitor must verify full CI and merge state, check for any
already-consumed approval/active rehearsal, record the new run ID immediately,
and then narrow itself to read-only monitoring of that run through cleanup.
It must not dispatch twice or treat uncertain dispatch responses as failed writes.

The exhibitor-email secret's metadata still reports `2026-08-26T03:39:18Z`, the
explicitly approved canonical-email update. The protected environment remains
`load-rehearsal` / `18961269706` with required reviewer rbeezley; use its normal
approval endpoint only after identifying the specific new run. No secrets,
environment settings or shared database state were changed during publication.

### Monitor — 2026-08-26 15:15 UTC

CI `32983789820` now has all three app shards, merged coverage gate, Test,
Quality Checks, package tests and SQL tests passing. Build is in progress; the
whole run is not yet terminal, and downstream smoke gates still need verification.
PR #1810 remains OPEN/BLOCKED on the same approved head. No merge or new G9
dispatch performed. Keep the existing monitor active and wait for full CI.

### CI-gated merge and one-run preflight — 2026-08-26 15:32 UTC

CI `32983789820` completed successfully on the approved `2987862` head, including
all app shards, coverage gate, packages, SQL, Build, Smoke build, A11y smoke and
E2E PR Smoke. No unresolved review findings or unexpected main changes were found.
PR #1810 was squash-merged from the primary repository at `2026-08-26T15:31:22Z`:
`64ea3c4504d99ed13e2e517b6c33196bb84af760`. The merge tree exactly matches the
reviewed head. Main is fast-forwarded; unrelated primary documentation files have
identical before/after SHA-256 hashes. The retained diagnostic worktree is detached
at the merge revision; the confirmed merged local branch is removed and its
auto-deleted remote tracking ref pruned. All private evidence is preserved.

The integration auto-closed MYK9-126 and MYK9-109 at merge. Both were restored to
In Progress through status-only updates; no diagnostic comments were posted.
G9 acceptance and archive remain incomplete. Publication/merge/CI evidence for
task 8.5 is now complete; live-evidence tasks remain outstanding.

Pre-dispatch history contains no new or active G9: latest is terminal failed
`32927274194`. This approval has not yet been consumed. Remote main is exactly
the merge revision. Exhibitor-email secret metadata remains unchanged at
`2026-08-26T03:39:18Z`; no passwords or secrets were changed. Existing protected
environment remains `load-rehearsal` / `18961269706` with its required reviewer.
Dispatch exactly once with target confirmation and a 25-minute preparation window;
record the returned run and remove dispatch authority from the heartbeat immediately.

### Single approved G9 dispatched — 2026-08-26 15:32:54 UTC

The dispatch succeeded once and returned run
[`32985449474`](https://github.com/rbeezley/myk9-platform/actions/runs/32985449474).
Run history confirms exact reviewed merge revision
`64ea3c4504d99ed13e2e517b6c33196bb84af760`, initially queued. Inputs are confirmation
`sojmvhhwsjxmfistvzbe` and `start_delay_minutes=25`; workflow/workload unchanged.
The one-run approval is consumed. No further dispatch or retry is authorized.
Narrow the existing heartbeat to this run only; use normal protected-environment
review under the user's already explicit consent. Acceptance is not yet established.

The existing heartbeat is now restricted to run `32985449474`, with no dispatch
authority remaining. Initial status is queued with no jobs or pending environment
review exposed yet; the monitor may approve only this run's existing gate when
it appears. No approval endpoint was called prematurely, and no settings changed.

### Local delayed-response diagnosis plan — 2026-08-26

User request: "what can we be doing while we wait? can you keep investigating
possible issues with our code?" Follow-up: "proceed" after the recommendation
to prioritize delayed-response regression tests for retry timing and timeout
cancellation. Scope is local diagnosis and regression evidence, not publication,
app implementation, a replacement rehearsal, or shared-system changes.

The initial read-only investigation ran 323 existing tests across 14 files:
queue ordering/retry/startup/identity/stress, mutation manager/OCC/sync engine,
ringside routing/entry mapping and post-upload scope. All passed. No production
code changed. The queued G9 still has no jobs and no exposed environment gate.
GitHub separately reports an Actions outage overlapping dispatch; this is the
likely scheduling cause, not evidence about app capacity.

Proposed public test seams (TDD skill requires confirmation before new tests):
`MutationManager.queueMutation/uploadPendingMutations/getPendingCount` and the
existing mutation execution API using the installed real Supabase client with
an injected fake fetch transport. Use real in-memory IndexedDB through the
existing test helper; stub only time, browser globals, auth and external I/O.
Never contact the shared target. User confirmation of these seams is pending.

Testing phases, one diagnostic case at a time:

1. Reproduce delayed RS429 and OCC responses using deterministic time. Assert the
   requested pause/backoff starts when the rejection arrives, not at upload-pass
   start. Observe actual outbound request times and public queue state.
2. Reproduce a request that remains pending beyond the 15-second application
   timeout. Observe transport cancellation and whether a subsequent upload can
   overlap the unresolved attempt. Include a promptly successful control and
   late-response cleanup; local abort does not prove remote SQL cancellation.
3. Re-run each discriminating case, check test TypeScript and focused lint, and
   run the existing neighboring suites. Retain failing diagnostic results;
   never describe the regression suite as green before a separately scoped fix.
4. Report confirmed behavior separately from live G9 attribution. Propose only
   the minimal demonstrated repair; no scope/count/threshold/fixture changes.

Ranked predictions: (a) pass-start `now` shortens containment/OCC delays after
slow preceding work; (b) Promise.race timeout without AbortSignal leaves transport
alive, permitting later overlap; (c) queue behavior may instead reflect SDK retry
handling. Installed postgrest-js currently restricts retries to idempotent methods,
so automatic RPC POST retries are not supported by its source; test the real SDK
boundary instead of relying on stale audit comments. Exact-count-before-fetch
overhead is a separate optimization lead, not part of this diagnostic slice.

### Local delayed-response diagnosis and repair — 2026-08-26

The user confirmed the proposed public seams. Tests use
`MutationManager.queueMutation/uploadPendingMutations/getPendingMutationsForRow`
with the installed Supabase client and an injected fake fetch transport. IndexedDB
is real in-memory storage; no shared database, secret, deployment or external
tracking write is involved.

All three predictions in the scoped slice were tested red-to-green:

1. A controlled RS429 response arriving ten seconds after the upload pass began
   initially left about 50 seconds of a requested 60-second containment window.
   `MutationUploadRunner` now creates the deadline from `Date.now()` when the
   response is handled, preserving the full server-requested pause.
2. A controlled 40001 response arriving ten seconds late initially left about
   20 seconds of a deterministic 30-second OCC backoff. The OCC handler now
   receives response-time `Date.now()`, preserving the full backoff interval.
3. A real Supabase RPC that crossed the 15-second application timeout initially
   had no AbortSignal and remained active. `withTimeout` now attaches an
   AbortController to thenables exposing Supabase's public `abortSignal` seam,
   rejects with the existing TimeoutError, and aborts the transport before the
   next retry. A prompt second attempt succeeds without overlapping the first.

Local verification:

- New delayed-response regression file: 3/3 passed.
- Focused mutation/OCC/timeout neighborhood: 134/134 passed.
- Full `@myk9/replication` suite: 530/530 passed across 36 files.
- `@myk9/replication` TypeScript check passed.
- `git diff --check` passed.

These fixes remove two client-side retry-amplification paths but do not establish
that either caused a prior G9 failure, and a local fetch abort does not prove that
remote SQL was cancelled after the server received it. Publication, PR/merge and
another rehearsal remain separate shared-system actions. The currently approved
G9 run remains governed by its one-run monitor and must not be replaced or retried.
