# Current Linear Todo implementation plan — 2026-09-05

> **Status:** Active — planning complete; implementation not started by this task.

## Request and scope

Request: “Create and save an actionable implementation plan covering ALL issues currently in the To Do status of Linear team MyK9-platform.” Planning only: this plan does not authorize application fixes, deployment, PR creation, scheduler changes, or Linear writes.

Execution update 2026-09-05: implementation was subsequently authorized in a separate task, along with Linear progress updates and the C1b protected-intent extension. See the [implementation checkpoint](qa/linear-todo-implementation-2026-09-05.md) for completed local work, checks, and unmet delivery gates. This does not broaden deployment or scheduler authorization.

This is a dated supplement to [Linear Backlog Batch Plan](plan-linear-backlog-batches.md), not a replacement backlog. Continue its historical batches and the domain plans/specs referenced below; do not restart completed work. This supplement owns only the eight current Todo issues. The concurrently owned landing-page training-video task is outside this inventory; preserve its files/worktree.

Prioritization follows [fall launch readiness](goals/fall-2026-launch-readiness.md): secretary/show-day completion correctness first, dependable verification next, then operator recovery and maintenance. Finishing this inventory does **not** certify launch readiness or close independent [go-live runbook](operations/go-live-runbook.md) gates.

## Verified inventory

- Snapshot: **2026-09-05, approximately 19:20–19:29 UTC**. Team ID `84ede0ad-2c87-46a8-bef4-b720cc0db5cb`.
- Actual status is **Todo**, ID `e3a49d79-9786-4c83-a22c-5932372fad7c`, type `unstarted`. A literal “To Do” query returned zero; the status-ID query returned **8**, limit 250, `hasNextPage: false`. No additional inventory page was available.
- Read every issue with `get_issue(includeRelations: true)` and all comments with limit 250; all comment responses ended with `hasNextPage: false`. All eight have no recorded `blockedBy`, `blocks`, or `duplicateOf`. Dependencies below are inferred implementation dependencies, not claimed Linear relations.
- Historical checks used direct `get_issue` for known IDs (including Done/archived-capable lookups) and `includeArchived: true` searches for notifier, migration guard, plan status, and remediation. All search responses ended with `hasNextPage: false`. No verified duplicate warrants omitting a current issue.
- Source baseline **`879d4ec2baf1326e73de9403733762d9f7e99339`**; GitHub current main returned the same SHA. Mandatory checks confirmed a clean linked worktree at detached HEAD before writes; git-dir differs from git-common-dir.
- GitHub API confirms the repo is public and PR #2016 merged as `a5d8af4cf88e680eb22fee50507f6559df93f653`. Shell GitHub access could not connect; connector reads succeeded.
- This pass inspected source and reconciled issues; it ran no app tests, browser replay, live SQL, or scheduler mutation. Hosted definitions, current scheduler enablement, and notifier root cause remain unverified here.

| Issue | Linear priority | Verified disposition | Primary slice |
| --- | --- | --- | --- |
| [MYK9-356](https://linear.app/myk9-platform/issue/MYK9-356) — absent-entry completion parity | Medium / P2 | Merged source fix; SQL behavior/mutation and applied-state proof remain | A1 |
| [MYK9-412](https://linear.app/myk9-platform/issue/MYK9-412) — notifier test flake | Medium / P2 | Diagnostic gap confirmed; root cause unconfirmed | B1 |
| [MYK9-405](https://linear.app/myk9-platform/issue/MYK9-405) — migration guard false positives | Medium / P2 | Guard still rejects inherited/applied history | B2 |
| [MYK9-407](https://linear.app/myk9-platform/issue/MYK9-407) — ACL cadence omission | Low / P3 | Emitted check key missing from cadence table | C1a |
| [MYK9-409](https://linear.app/myk9-platform/issue/MYK9-409) — external remediation targets | Low / P3 | Target/accessibility contract missing; claimed malformed URL needs reproduction | C1b |
| [MYK9-358](https://linear.app/myk9-platform/issue/MYK9-358) — migration provenance | Low / P3 | Header correction never landed; SQL bodies still identical | D1 |
| [MYK9-406](https://linear.app/myk9-platform/issue/MYK9-406) — plan metadata | Low / P3 | 24 of 77 top-level plans lack canonical status marker | E1 |
| [MYK9-408](https://linear.app/myk9-platform/issue/MYK9-408) — audit failover | Low / P3 | Disablement recorded complete; stale prompts remain | F1 |

## Order, dependencies, and workflow

Default: **A1 → B1 → B2 → C1 → D1 → E1 → F1**, one repo slice at a time. Six batches, seven repo slices: B1/B2 use separate PRs because shell-test reliability and migration safety have different failure modes. C1a/C1b may share one health-contract PR but retain separate issue closure gates. F1 is a docs slice plus separately authorized prompt installation; docs-only execution may follow the repository's direct-to-main convention. Do not create PRs or push from this planning task.

- **B2 → D1 is a hard delivery dependency:** the guard can reject harmless applied-migration header edits. Prepare D1 locally earlier if useful; never bypass the guard to ship it.
- A1 requires a disposable fully migrated SQL environment or existing CI harness. If local containers are unavailable, prepare tests and arrange CI proof, then continue B1 while that gate waits.
- B1 improves later CI reliability but does not block preparing A1. Attribute a flake honestly rather than blaming another slice's product code.
- C1's UI can ship before its runner deploy; MYK9-407 remains open while hosted cadence proof is missing.
- F1 has subsequent-day evidence. Move its prompt preparation earlier during an external wait once implementation is authorized; do not wait idle for tomorrow or create an unrequested reminder.
- After E1 lands, use its checker for remaining/new plans. Do not regenerate the old historical inventory to satisfy metadata enforcement.

Use [OPSX shipping](../.codex/skills/opsx-ship/SKILL.md) for C1's non-trivial contract extension and any expanded work discovered in A/B. Read delegated propose/apply/verify/ship skills at execution time. This planning pass intentionally creates no umbrella OpenSpec change: the contracts are unrelated and some fixes already exist. Verification-only A1, narrow B fixes, the D header correction, and bounded E/F maintenance may use the lightweight workflow, with this rationale in their handoff. C1 continues [admin-system-health](../openspec/specs/admin-system-health/spec.md), adding only a residual delta if needed.

The assigned implementing agent owns each repo slice; Richard owns hosted access/deployment, scheduler changes, and acceptance of unmet proof gates. Existing Linear assignments remain unchanged. Re-read current issue comments and main before each slice because other tasks remain active.

## Batch A — Prove show-day completion parity

### A1 — MYK9-356

**Reconciliation:** the September 5 issue addendum supersedes the original `isExpectedEntry(absent) = true` proposal. PR #2016 chose a server-side fix: lifecycle absent is excluded; active lifecycle with result-status absent is accounted. Current [entryAccounting.ts](../apps/myk9show/src/features/_shared/entryAccounting.ts) and [migration 20260904160000](../supabase/migrations/20260904160000_exclude_absent_entries_from_class_rollup.sql) agree. Do not restore the mismatch to satisfy stale text. [September 3 research](research/2026-09-03-absent-entry-accounting-mismatch.md) describes the old state. MYK9-330 and MYK9-118 are Done and own distinct earlier fixes; Done parent MYK9-355 does not close this child's proof gate.

**Steps:**

1. Extend [class_status_auto_derivation_test.sql](../supabase/tests/class_status_auto_derivation_test.sql), preserving its transaction/rollback and real automatic derivation path. Existing coverage exercises `result_status='absent'`, not lifecycle absent.
2. Create a class with one qualified scored entry and one `entry_status='absent'` entry with default pending result and `is_scored=false`. Assert expected population 1, completed class, and scored entry placement 1. Assert actual `tv_class_entry_counts` and `tv_board_entries` outputs using their real signatures/columns and release/access prerequisites.
3. Retain active-lifecycle/result-absent coverage. Cover active-pending → lifecycle-absent transition and excluded-only class behavior (no fabricated completion). Preserve manual overrides, pulled/soft-deleted filtering, and moved/not-accepted coverage.
4. Pin equivalent replication-shaped rows in [entryAccounting tests](../apps/myk9show/src/features/_shared/__tests__/entryAccounting.test.ts) and the [at-show completion](../apps/myk9show/src/features/at-show/atShowClassCompletion.ts) consumer. Do not introduce direct Supabase app reads or a second accounting predicate.
5. The existing SQL test is registered. If a new file is necessary, register it in both `scripts/qa/run-behavioral-sql-tests.sh` and its `.test.ts` contract.

**Testing/closure:** run focused client/contract tests and fully migrated SQL harness. In a disposable database only, remove lifecycle absent from the authoritative expected-set SQL predicate, confirm the mutated function definition actually installed, and prove the same test fails. Restore and prove green. Mutate trigger/TV copies separately if claiming coverage of those predicates. The existing [classPlacementContract.test.ts](../apps/myk9show/src/test/database/classPlacementContract.test.ts) string checks are supplementary, not behavioral proof.

Record read-only hosted migration inventory and `pg_get_functiondef` for `refresh_class_scoring_state`, `handle_entry_scoring_state_change`, `tv_class_entry_counts`, and `tv_board_entries`. A version row alone is insufficient after the earlier collision incident. If missing, Richard owns the deployment gate; do not deploy during verification or close on merge alone. No new migration is expected unless tests find a residual defect.

**Acceptance:** merged contract recorded; lifecycle-absent completion/placement/TV parity passes; active result-absent remains accounted; installed SQL mutation fails and restore passes; applied definitions verified or deployment explicitly remains open/owned. **Non-goals:** changing lifecycle policy, rewriting historical SQL, new scoring UI, or reopening completed qualification/RBAC fixes.

## Batch B — Dependable verification

### B1 — MYK9-412

**Evidence:** [scheduledFailureNotifier.behaviour.test.ts](../apps/myk9show/src/test/ci/scheduledFailureNotifier.behaviour.test.ts) executes shell extracted from [report-scheduled-failure/action.yml](../.github/actions/report-scheduled-failure/action.yml) with stub `gh`. Child-process errors lack enriched diagnostics; temp directory/log is shared within the file. The issue records [run 33983235988](https://github.com/rbeezley/myk9-platform/actions/runs/33983235988), job 101352089623, on docs-only #2060 and a passing rerun. No particular race or pipeline cause is proven.

**Steps:**

1. Add a failing stub scenario first; assert the harness reports exit status, stderr, and useful script context. Preserve the failure, never hide it with retries or blanket `|| true`.
2. Catch typed child-process errors at the harness boundary, including status/signal and bounded stderr/stdout. Add test-only shell line tracing/error context when stderr is empty. Use fixture env values and stubbed `gh`, never real tokens in traces.
3. Attempt the low-priority/coverage/shuffle reproduction before selecting a fix. Inspect pipeline exits, including early-consuming `head`, and log ownership. If eliminating shared-fixture interference, give each invocation isolated state and clean up only its own temp directory. Do not call a candidate the root cause without evidence.
4. Keep all real behaviors pinned: first-failure create, repeat-failure edit without comments, recovery close, stable survivor, and closing every duplicate including a final line without newline. Test that actual stub-command failures still propagate.
5. Record root cause or evidence-backed robustness reasoning in the header. Change the production action only for a demonstrated shell defect; otherwise keep the patch in the harness.

**Testing/closure:** from `apps/myk9show`, attempt `taskpolicy -b pnpm vitest run src/test/ci/scheduledFailureNotifier.behaviour.test.ts --coverage --sequence.shuffle` on macOS. This path is app-relative; the issue's root-relative path must not be repeated from the app directory. If `taskpolicy` is unavailable, record the limitation. Run behavior and wiring tests, then **six complete full-app shuffled passes** using `pnpm vitest run --sequence.shuffle`, recording run/seed and CI results. Stop a runner stuck >60 seconds without useful output; do not retry a hang in a loop. A blocked full-suite gate stays open unless explicitly accepted otherwise. Mutation: dropping the last-duplicate guard fails the duplicate test; reverting diagnostic reporting fails the new test.

**Acceptance:** stderr/exit diagnostics; root cause or robust treatment documented; reproduction attempted/documented; six complete shuffled green runs. **Non-goals:** weakened assertions, timeout increases without cause, or real GitHub notifications during tests.

### B2 — MYK9-405

**Evidence:** [migration-version-guard.ts](../scripts/qa/migration-version-guard.ts) checks every modified migration; it skips current branch names/exact HEAD refs but rejects other inherited refs and any deployed version. [Tests](../scripts/qa/migration-version-guard.test.ts) cover helpers only. This is residual work after #1996/#2016; Done MYK9-340's incident is not reopened.

**Steps:**

1. Add tests invoking actual `runGuard`, mocking only git/psql boundaries. Inherited identical history and deployed-current-main reruns must pass; distinct unmerged SQL claiming the same version must fail and name file/ref/version.
2. Classify version claims against the actual PR merge base or push-before tree: existing path/version with unchanged executable body versus new version. Explicitly handle other SHAs, merge refs, renamed/deleted paths, and duplicate versions in the candidate tree.
3. Allow supported header-only changes without permitting applied SQL rewrites. Inspect competing ref path/content/history rather than treating every containing ref as a conflict or skipping entire inherited branches indiscriminately.
4. Allow a deployed version only when identity is established as the accepted main migration. Mere version existence must continue to reject distinct unmerged claims. Keep DB checks read-only and fail clearly if required provenance/credentials are unavailable; missing DB is not a pass for new claims.
5. Add disposable-git fixtures exercising real git-command composition alongside mocked decision cases. Keep TypeScript and existing `qa:migrations:guard` CI entry point; no shared DB or timestamp rewrites.

**Testing/closure:** `pnpm qa:migrations:guard:test`; cover header edits, inherited refs at different SHAs, accepted deployed reruns, different-SQL collisions, new unapplied versions, same-branch refs and missing evidence. Revert each allow/reject decision and prove the corresponding test fails. Record a real migration PR's green Quality Checks and an isolated deliberate-collision failing CI run (or explicitly owned equivalent CI harness evidence). D1 can provide harmless-header PR evidence after B2 merges. Never manufacture the collision in a shared DB.

**Acceptance:** positive cases allowed; distinct conflicts rejected with diagnostics; behavioral/mutation/CI evidence. **Non-goals:** remote migration repair, bypassing anti-collision protection, or deployment policy redesign.

## Batch C — Existing operator health contract

Continue the [cadence plan](archive/plan-myk9-157-continuous-health-checks.md), [admin dashboard contract](plan-admin-dashboard-data-contract.md), [support/health plan](archive/plan-site-admin-support-health-remediation.md), and [admin-system-health spec](../openspec/specs/admin-system-health/spec.md). MYK9-157/161/394 are Done; these residual gaps are distinct from their cadence, ACL-verdict, and owner-routing work.

**Duplication question:** Does this duplicate an existing page? **No.** Repair `/admin/health` and `/admin/dashboard`, linking the existing operator runbook. No docs portal, second health dashboard, ACL editor, or copied recovery workflow. Preserve stable check-key ownership, unknown fallback, site-admin access, and [admin role intent](INTENT.md).

### C1a — MYK9-407

1. Add `public_schema_create_acl: 24 * 60 * 60 * 1000` beside sibling ACL entries in [healthCheckCadence.ts](../apps/myk9show/src/features/admin-system-health/healthCheckCadence.ts).
2. Test that all three ACL stale windows are **48h**, each defined coverage-registry `checkKey` has cadence metadata, and genuinely legacy/unknown keys retain **26h**. [Coverage surfaces](../apps/myk9show/src/features/admin-system-health/healthCoverage.ts) without `checkKey` are not invented scheduled checks.
3. Keep ACL checks outside continuous measurement. Exercise full snapshots and continuous carry-forward in [_shared/systemHealthChecks.test.ts](../apps/myk9show/supabase/functions/_shared/systemHealthChecks.test.ts), preserving timestamps/verdicts and asserting persisted `stale_after_ms` is 48h.
4. Run selector/coverage tests, app and edge-test typechecks, relevant lint, and inspect widened `HealthCheckKey` consumers.

**Deployment detail:** `_shared/systemHealthChecks.ts` imports the shared app module and persists cadence; deployed `cron-health-check` therefore needs the dependency update too. Prepare source/bundle comparison and approved deploy procedure. After separately authorized deploy, verify a new/carry-forward snapshot advertises 48h and UI freshness agrees. No historical snapshot rewrites or full-run invocation under planning authorization.

**Acceptance/testing:** identical 48h windows; registry completeness assertion; legacy 26h; removing the new entry fails registry/window tests. Keep hosted gate open until proved. **Non-goals:** cron schedule, verdict, grant, or broad freshness-policy changes.

### C1b — MYK9-409

**Evidence:** [healthCheckRemediationMap.ts](../apps/myk9show/src/features/admin-system-health/healthCheckRemediationMap.ts) exposes string `href`; [triageSelectors.ts](../apps/myk9show/src/features/admin-overview/triageSelectors.ts) copies it into `TriageItem.action`; [NeedsALookSection](../apps/myk9show/src/pages/admin/AdminDashboard/NeedsALookSection.tsx) renders Router Link; [HealthCheckRow](../apps/myk9show/src/pages/admin/SystemHealth/HealthCheckRow.tsx) renders an anchor. ACL action self-links to health and only names the runbook in prose.

1. First render both actual consumers with an external fixture using the installed router. The app declares `react-router-dom ^7.18.3`; do not assume Link mangles absolute URLs. Record whether `/https:/…` reproduces. If not, correct the causal claim in the eventual issue report while retaining the missing explicit/accessibility contract.
2. Introduce route/external target metadata carried end-to-end through remediation and triage. A discriminated union with arbitrary string `path` is insufficient: validate route construction or test rejection of absolute/protocol-relative values in the route arm. External targets should be approved HTTPS URLs.
3. Reuse one small renderer if it simplifies both consumers: routes use Router Link; external targets use anchor, `target="_blank"`, `rel="noreferrer"`, and accessible “opens in a new tab” indication. Keep navigation labels honest; a link does not run a health check.
4. Link ACL actions to `https://github.com/rbeezley/myk9-platform/blob/main/docs/operations/START-HERE.md`. Repo visibility was verified public; do not publish operator content to the public help site or change repository visibility.
5. Update route-only remediation/triage test expectations without weakening stable ownership/unknown fallback. Cover actual consumers, not merely an unused helper.

**Intent gate:** the map has an explicit `INTENT` comment restricting targets to existing internal routes. Obtain explicit owner approval to extend that protected behavior/comment before C1b implementation, unless the implementation session already authorizes it. This planning task leaves the comment unchanged.

**Testing/closure:** exact absolute href, `rel`, accessible indication and internal navigation assertions on rendered dashboard and expanded health row. Reverting mapping/renderer correction must fail consumer proof. Replay both admin surfaces as site admin at 1440×900 and 768×1024, following internal/external links with keyboard. Use controlled local health data, not shared ACL mutations. Record routes, role, viewports, SHA, assertions, and inspected evidence.

**Acceptance:** external targets work on both surfaces; internal navigation avoids reload; `noreferrer` and accessible external indication; invalid target mixing rejected; revert fails proof. **Non-goals:** permission changes, new admin pages, docs publication, or unrelated typography cleanup.

## Batch D — Accurate migration provenance

### D1 — MYK9-358, after B2

Independently compared [20260902170000](../supabase/migrations/20260902170000_replace_judge_qualifications.sql) and [20260902180000](../supabase/migrations/20260902180000_fix_judge_qualification_authorization.sql): **byte-identical after their first two header lines**. The latter still falsely claims a role-consolidation correction. PR #2016's description claims this fixed, but source does not.

1. Capture body hash and read-only `supabase migration list` for the linked environment.
2. Correct only the second migration's header to describe a no-op re-emission. Preserve version and all executable bytes. MYK9-354's later secretary/RPC authorization policy remains completed and unchanged.
3. Compare before/after body bytes and both migration bodies. Capture a second read-only applied inventory; distinguish unrelated concurrent additions from this comment edit.

**Acceptance/testing/closure:** accurate header; body byte equality; no history mutation; B2 guard passes the harmless edit; required PR checks green; before/after applied inventory recorded. No bespoke app test needed. SQL files are outside docs-only direct-to-main scope, so use a PR. **Non-goals:** deletion, renumbering, executable SQL/ACL rewrites, `db push`, or migration repair.

## Batch E — Discoverable plans with enforcement

### E1 — MYK9-406

Follow [docs conventions](README.md), [workflow-process consolidation](plan-workflow-process-consolidation.md), and [active-docs triage](plan-active-docs-triage-2026-06-14.md), not a new lifecycle. `scripts/check-doc-staleness.js` checks routes/guides, not plan metadata. Independently reproduced **24 missing canonical markers among 77 root plans**.

1. Re-inventory `docs/plan-*.md`; save each missing marker/index entry with evidence and Active/Complete/Abandoned disposition. MYK9-354/366/369 are currently Done and their plans contain implementation evidence; verify #1994/#2005/#2004 closure before archiving. Never default every plan to Active.
2. Backfill all 24 below as one bounded pass. Archive completed plans with mirrored paths, repair inbound links and README rows, and retain active plans. Ambiguous history gets an explicit owner/evidence gap, not invented completion.
3. Add a TypeScript metadata checker with injectable fixture root and structured diagnostics. Preserve the existing JavaScript route checker. Wire a dedicated package command into Quality Checks beside strict doc checking.
4. Initial scope: non-archived top-level `docs/plan-*.md`, covering new/edited files with known baseline backfilled to zero. Document scope; nested OpenSpec/superpowers artifacts do not silently acquire a new format requirement. Resolve relative README links rather than accepting arbitrary substring mentions; archived plans stay valid.
5. Temp-fixture tests: missing status, missing index, valid active plan, completed/archived plan, and unaffected route-doc checking. Independently delete marker and link, prove red, restore and prove green.

**Missing-marker inventory at baseline (24):**

```text
plan-admin-users-ux-fixes-2026-08-18.md
plan-data-access-module-drift.md
plan-exhibitor-elderly-ux-remediation.md
plan-exhibitor-onboarding-remediation.md
plan-fix-nightly-review-2026-07-20.md
plan-myk9-10-auth-identity-revocation.md
plan-myk9-125-premium-account-quota.md
plan-myk9-133-offline-scoring-queue-warning.md
plan-myk9-157-continuous-health-checks.md
plan-myk9-165-dirty-form-route-guard.md
plan-myk9-166.md
plan-myk9-169-policy-boundaries.md
plan-myk9-17-role-journey-visual-qa.md
plan-myk9-22-turnstile.md
plan-myk9-289.md
plan-myk9-354-qualification-contract.md
plan-myk9-366.md
plan-myk9-369.md
plan-myk9-65-class-entry-count-consistency.md
plan-result-reveal-share-card.md
plan-secretary-entry-trust-remediation.md
plan-sidebar-account-footer.md
plan-site-admin-support-health-remediation.md
plan-ux-journey-audit.md
```

**Acceptance/closure:** saved reconciled inventory; all 24 honestly dispositioned; correct index/status/archive state; new omissions fail CI; both omission mutations red and restore green; archived plans valid. Run checker/unit tests, existing doc-staleness tests, and whitespace/link checks. Checker/package/workflow changes require a PR; Markdown-only backfill needs no app tests. **Non-goals:** implementing planned product changes or relabeling the historical backlog.

## Batch F — Complete audit failover reconciliation

### F1 — MYK9-408

**Correction:** September 5 13:02 UTC comment records owner choice to stop Claude, not Codex, and scheduler evidence `enabled:false` with no `nextRunAt`. Do not ask the owner to choose again or blindly repeat disablement. The deployed prompt was read during planning and still says “which is paused for token budget. Assume Codex has not run.” [Source doc](operations/scheduled-audits-claude.md) still claims all three tasks paused and contains the “Assume” premise.

1. Read fresh state of both daily streams through their owning scheduler tools, preserving the recorded decision unless new instructions change it. Current live enablement was not independently rechecked here.
2. Replace the all-paused claim with the scheduler as the source of current state. Replace fixed live/dark assumptions with checking [audit boundary](qa/audit-boundary.md), stamp commit/report, reviewed range, and coverage count. Preserve manual failover and single-owner invariant; no new scheduler.
3. Prepare exact replacement prompt/diff for `~/.claude/scheduled-tasks/claude-daily-commit-review/SKILL.md`. Install only through the owning mechanism under separate authorization; it is outside this worktree. Preserve frontmatter and document deliberate wrapper differences. Compare the executable prompt block byte-for-byte against its source after installation.
4. Retain required subsequent-day evidence: exactly one daily-commit-review stamp with a real matching report. The comment questions its strength but does not explicitly waive it. Richard owns recording that day; do not claim it early or schedule unrequested monitoring.

**Acceptance/testing/closure:** current enablement matches docs and owner choice; deployed/source prompt parity; no fixed assertion of counterpart live/dark state; subsequent-day single genuine stamp. Use text/parity checks, not app tests. Repo doc correction and deployed prompt change are distinct operations; repo-only work is partial. **Non-goals:** changing security-audit schedule, turning off Codex, or restamping reviewed commits.

## Shared testing and evidence phase

No slice is complete until its tests and issue-specific gates pass. Start narrow, then run required CI. Source-text coverage is not deployed or SQL behavioral proof.

| Slice | Focused verification | Additional gate |
| --- | --- | --- |
| A1 | entryAccounting/at-show, classPlacementContract; `pnpm qa:sql:behavioral:test`; local SQL harness | Installed SQL mutation red/restored green; hosted definitions |
| B1 | Notifier behavior/wiring; coverage/shuffle reproduction | Six full-app shuffled green passes; retained duplicate proof |
| B2 | `pnpm qa:migrations:guard:test`, disposable git fixtures | Allow/reject mutations; green migration PR and isolated collision red |
| C1 | Coverage/cadence, runner, remediation, triage and rendered consumers; app/edge typechecks | Two-surface browser replay; protected-intent approval; hosted cadence |
| D1 | Header/body diff, fixed guard | Before/after read-only migration inventory; PR checks |
| E1 | New checker fixtures and existing doc-staleness tests | 24-file disposition; two omission mutations; CI wiring |
| F1 | Text and byte-level prompt parity | Scheduler readouts and subsequent-day single report/stamp |

- New components/hooks/utilities need meaningful unit tests. Use `src/test/utils/testUtils.tsx` for rendered app components. For boundary values, write exact assertions first, run red, then fix.
- Use pnpm and TypeScript for new tooling; verify schemas and actual field names. Keep new source modules under 500 lines and avoid implementation-mirroring tests.
- SQL harness accepts only its exact local loopback `MYK9_BEHAVIORAL_SQL_DATABASE_URL`; never substitute staging. If containers are unavailable, CI is the execution environment, not an excuse to weaken proof.
- Stop stuck runners after >60 seconds without useful output. Continue independent preparation; keep unmet gates open. B1's six-run requirement is not waived by generic focused-test policy.
- Browser sessions must be uniquely task-owned and cleaned up without touching other tasks. Record role, route, viewport, timestamp, SHA/deployment, observed assertions and inspected private artifacts. Filename alone is not visual evidence.
- On authorized implementation completion, follow current `ship-pr`, including required independent review and production verification where applicable. Record changes, tests, PR/head, risks and AC result on the issue. Done requires the evidence gate, not just merge. Keep relevant findings/debt/plan rows consistent, without changing unrelated history.

## Risks, decisions and resume gates

| Gate | Owner / resolution |
| --- | --- |
| MYK9-356 stale original AC | Resolved by September 5 addendum: lifecycle absent excluded. No new product decision. |
| MYK9-408 scheduler choice | Resolved: Claude off. Fresh state proof remains. |
| MYK9-409 internal-route INTENT | Richard explicitly approves the extension before implementation unless already authorized in that session. |
| MYK9-409 malformed URL hypothesis | Implementer reproduces with installed router; narrow causal claim if not reproducible. |
| MYK9-405 applied identity | Document how main/base/path/body prove identity; fail closed on uncertain new claims. |
| SQL environment/applied absent fix | Agent prepares CI/local proof; Richard provides read access or owns deployment approval. |
| Health runner dependency deploy | Separate authorized bundle deployment and snapshot proof; no implied ACL/DB change. |
| B1 full-suite hangs/unrelated failures | Keep issue open with specific blocker; explicit owned acceptance required to change gate. |
| Deployed Claude prompt outside repo | Richard/owning tool installs prepared diff under authorization; repo-only correction is partial. |
| Historical plan state unclear | Record owner/evidence gap per file, never fictitious completion. |

Source changes can be reverted by their PR. Evidence/header work requires no DB rollback. Health-runner rollback is the previously recorded bundle/SHA; prompt rollback is the saved prior prompt while retaining Claude's disabled state. Never silently re-enable duplicate audits.

## Plan verification

Before handoff: verify all eight unique inventory IDs have one primary slice and concrete steps/testing/acceptance/non-goals; check local links; refresh the exact status-ID query; inspect only this plan plus its index/cross-link changes. Planning checks cover Markdown and issue coverage only, not implementation behavior.

Verified at handoff on 2026-09-05: refreshed Linear inventory still contains the same eight Todo IDs with `hasNextPage:false`; eight unique coverage rows match exactly; every local Markdown link resolves; canonical status/index entry present; `git diff --check` passes. Only this plan, `docs/README.md`, and the historical batch plan's supplement link changed. Application tests were intentionally not run for planning-only Markdown edits.
