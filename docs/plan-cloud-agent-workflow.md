# Cloud Agent Workflow Implementation Plan

> **Status:** Active

**Goal:** Let Claude and Codex carry authorized myK9 work across cloud sessions, with durable handoffs, independent review and verified acceptance, without depending on Richard's Mac.

**Architecture:** Linear remains the tracker of record; GitHub PRs, trusted workflow runs and scanned artifacts carry execution evidence. Repository-owned setup and workflow instructions work in either cloud environment. Reviewer, evidence publisher, implementation worker and human-triggered merge have separate authority.

**Tech stack:** TypeScript, existing shell review wrappers, pnpm, GitHub Actions, Linear, Claude Code CLI and Codex CLI.

**Provenance:** This plan merges two drafts written on 2026-10-24: Codex's implementation plan (the base of this document) and Claude's `docs/archive/plan-cloud-agent-coordination.md` (now Abandoned as superseded). From the Claude draft it adds the evidence section, the branch-prefix authorship decision, per-stage kill switches, a two-way transition period, and the ruleset-first merge control.

**Requirements:** Richard approved the three-stage direction and supplied these refinements:

1. Reuse the existing review wrappers; native bot reviews do not replace the independent gate.
2. Restrict review/publication credentials so they cannot push or merge.
3. Install missing tools, including gh, Deno and ShellCheck.
4. Enforce the convergence stop across sessions and review rounds.
5. Keep shared deployments human-triggered; require both human authorization and green gates before merge.
6. Read the full Linear issue before closing it and make denied updates fail visibly.
7. Test interrupted/usage-limited reviews and pushes after clean reviews.
8. Scan all handoff evidence for secrets before publication.
9. Verify cloud product claims against current official documentation.
10. The implementing harness is declared by branch prefix: `claude/` for Claude-authored work, `codex/` for Codex-authored work (decided by Richard, 2026-10-24).

This program supersedes Codex's earlier local-only handoff proposal (`openspec/changes/connect-agent-workflow-handoffs/`, not on `main` as of 2026-10-24). If that folder lands it retains baseline research only. If a stage later uses OPSX, its change owns that stage's detailed tasks and links back here; do not duplicate those tasks in another plan.

**Execution:** Claude Code implements; Codex reviews every PR (these are guardrail paths at the `independent` tier). Each stage produces an independently reviewable PR and passes its tests before the next stage starts. Until Stage 2 ships, Codex review for the Stage 1 and Stage 2 PRs runs from the Mac, once. This document authorizes planning only; credentials, integration configuration, external writes and implementation rollout need the applicable owner authorization.

## Evidence: what broke on 2026-10-23/24

A 17-issue performance run from a Claude Code cloud session (PRs #3225 to #3239, then #3248) hit every gap this plan closes:

- **Independent review required the Mac.** Four PRs at the `independent` tier (#3232, #3236, #3238, #3248) merged on the owner's "Merge" with the `Review gate` status red. The merge API accepted them while `mergeable_state` read `blocked`, so the gate is not enforced at merge today.
- **Evidence could not be written from the cloud.** `scripts/qa/post-review-gate.sh` needs `gh`; the cloud session had only the GitHub connector.
- **Handoff state was lost.** The run ledger lived in a temp scratchpad, and three worker restarts discarded subagent reports. Recovery meant reading worktrees and remote branches by hand.
- **Tools were missing.** No `gh`, `deno` or `shellcheck`; two edited push edge functions were never Deno-typechecked before merge.
- **A conflicting PR got no CI.** #3235 conflicted with #3225 and produced zero workflow runs. #3248 added a `Mergeable with base` status for this.
- **Setup drifted per worktree.** A worktree built against stale package `dist` and a missing dependency (`workbox-strategies`) until a manual `pnpm install` and package rebuild.
- **Mac paths are hard-coded** in live skills: `.claude/skills/ship-it/SKILL.md`, `.claude/skills/ship-pr/SKILL.md` and `.claude/skills/orchestrate/references/linear-issue-run.md` name `/Users/richardbeezley/AI Projects/myk9-platform`.
- **Branch prefixes did not declare authorship.** Claude's branches in that run used `richardbeezley1/`; other sessions used `claude/` and `codex/`.

## Global constraints

- Reuse `scripts/qa/codex-review.sh`, `claude-review.sh`, `review-verdict.sh`, `post-review-gate.sh`, `review-gate.ts` and `watch-pr-checks.sh`. Native bot reviews do not replace the independent gate.
- The other harness performs independent review. Preserve risk tiers, optional-review eligibility and the existing explicit owner-override procedure; automation never selects an override itself.
- **Authorship is the branch prefix, cross-checked.** `claude/` selects Codex as reviewer; `codex/` selects Claude. Because a PR controls its own branch name, the job also checks every commit's `Co-Authored-By:` trailer against the prefix. Any other prefix, a mismatch, or mixed authorship gets no automatic review: the job refuses and asks for human resolution rather than guessing.
- Only the trusted publisher invokes `post-review-gate.sh` to write cloud `Review gate:` evidence. No model-generated or manually typed attestation qualifies.
- A merge requires BOTH a direct human authorization for the PR/head and a current green review gate plus all required CI. Never use `--admin`, a ruleset bypass or authorization alone to merge.
- Linked `supabase db push`, `supabase functions deploy` and Deploy myK9Show remain human-triggered. Implementation/reviewer jobs receive no production deployment credentials.
- Stop automated patching at the second confirmed finding on the same path across review rounds, or a finding introduced by the previous fix. Record the restructure proposal and return control to Richard.
- Read Linear's full issue description before Done; denied or failed updates must be observable and never treated as completed close-out.
- All uploaded handoff/review evidence and published excerpts pass the existing secret scan first. Unknown, cancelled, expired, interrupted and unrecorded outcomes cannot become approval.
- Every new automated entrypoint has a kill switch: a repository variable that, when not `true`, makes the job exit before doing anything (`INDEPENDENT_REVIEW_ENABLED` for Stage 2, `AGENT_CONTINUATION_ENABLED` for Stage 3; the same pattern as `MYK9SHOW_SMOKE_CI_ENABLED`). Turning one off returns that step to the owner without a revert.
- Preserve unrelated edits, single-source skill symlinks, offline-first app behavior and files under 500 lines. No app UI, database schema or new orchestration service is added.

## Verified capabilities and boundaries

Checked against current official documentation on 2026-10-24 (by Codex). Recheck before implementation because capabilities and account availability can change.

| Capability                                                                                   | Verified scope                                                                                                                                                                                                | Consequence for this plan                                                                                                                        |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| [Codex cloud environments](https://learn.chatgpt.com/docs/environments/cloud-environments)   | Prepared environments support repository tools, dependencies and isolated cloud tasks; repository skills are available. Current docs list computer/browser use as unsupported.                                | Test setup in the actual environment. Keep browser evidence in existing Playwright CI or an operator run; do not promise a native cloud browser. |
| [Codex GitHub reviews](https://learn.chatgpt.com/docs/third-party/github)                    | Connected repositories support review requests and automatic reviews. The docs distinguish legacy integration workflows from newer cloud environments.                                                        | Availability does not establish our gate contract or account configuration. Retain the CLI wrapper and explicit verdict checks.                  |
| [Claude cloud sessions and auto-fix](https://code.claude.com/docs/en/claude-code-on-the-web) | Cloud sessions can continue independently of the laptop. Per-PR auto-fix responds to CI failures/review comments; it requires the Claude GitHub App and does not automatically handle base-advance conflicts. | Leave native auto-fix disabled for managed PRs until it can obey the persisted convergence gate; it is not a dependency of this rollout.         |
| [Claude in GitHub Actions](https://code.claude.com/docs/en/github-actions)                   | Claude can run in workflows using configured authentication. The documentation notes that pushes using the default GITHUB_TOKEN do not trigger normal follow-on workflows.                                    | Verify implementation-worker identity and actual CI triggers in the live pilot. Do not assume a pushed fix necessarily starts CI.                |

These are product capabilities, not proof of this account's enabled integrations, credentials, API budget, network access or permissions. Stage 1 records those checks.

Provider-hosted implementation sessions and CLI jobs on GitHub-hosted runners are separate execution modes; either may submit a PR, but neither bypasses the gate.

## Existing implementation and gaps

- `scripts/bootstrap-worktree.sh` already installs dependencies and builds packages, but copies local ignored configuration and assumes a primary checkout. Reuse its package commands without copying private files into cloud setup.
- Shared ship-pr and orchestration instructions embed `/Users/richardbeezley/...`, Keychain and local detached-process assumptions. The cloud path must discover the checkout and use workflow-run identity instead of PIDs.
- Existing review wrappers distinguish clean (0), findings (1), incomplete/unposted (2), and Claude wait-pending (3). A CLI exit of 0 alone is not a verdict.
- `.github/workflows/review-gate.yml` deliberately evaluates metadata from trusted base code. Do not add PR-head execution to that privileged evaluator.
- `review-gate.ts` currently trusts OWNER/MEMBER/COLLABORATOR comment associations. A cloud bot needs verified workflow provenance, not a blanket addition of `github-actions[bot]` to the trusted set.
- `apps/myk9show/scripts/verify-artifact-secrets.ts` scans configured secret values through the existing artifact utilities. Reuse it, explicitly supplying model/GitHub/Linear secrets to the scanner. It is not a guarantee that every unknown secret will be detected.
- Session/temp-folder ledgers and subagent reports are not durable shared state. Local `.logs` becomes a cache, not the only copy of accepted work or review evidence.
- `LINEAR_API_KEY` already exists as a repository secret for `.github/workflows/deferred-reviews.yml`; Stage 3 reuses it through the `agent-closeout` environment.

## Review focus

1. A review starts after an earlier clean review of the SAME head, then aborts: the old evidence must not restore green.
2. PR content tries to alter the wrapper, publisher, instructions or workflow: privileged execution must still use trusted base code.
3. A session restarts or events arrive twice/out of order: reconstruct ownership and convergence history before dispatching another mutation.
4. A secret appears in a review verdict, nested report or console output: block publication and leave a failure without exposing the value.
5. Linear auto-completes on merge, then a status update is denied: report close-out as blocked and identify the incorrect remote state; do not claim the issue is closed correctly.
6. A branch prefix does not match the commits' authorship: no reviewer is selected and no evidence is published.

Each case has an owning task and acceptance check below.

## Stage 1 — Portable setup and durable handoffs

### Task 1.1: One setup and preflight path

**Files:**

- Create `scripts/cloud/setup.sh`.
- Create `scripts/cloud/preflight.ts`.
- Create `scripts/cloud/preflight.test.ts`.
- Add exact tool pins to `scripts/cloud/tool-versions.json`.
- Modify `scripts/bootstrap-worktree.sh` only if extracting shared setup is necessary.
- Replace the hard-coded Mac path in `.claude/skills/ship-it/SKILL.md`, `.claude/skills/ship-pr/SKILL.md` and `.claude/skills/orchestrate/references/linear-issue-run.md` with a discovered checkout (`git rev-parse --show-toplevel`, and the first `git worktree list --porcelain` entry for the main checkout).
- Add a guard test that fails when any non-archived `.claude/`, `.codex/` or `scripts/` file contains `/Users/`.
- Document cloud wiring and the branch-prefix convention in `docs/operations/cloud-agent-workflow.md` and `docs/agents/issue-tracker.md`.

**Interfaces:**

`runPreflight({ root, role, env }): PreflightReport`

Roles: `implementer | reviewer | publisher`.

Results list tool/version, authentication/network capability and missing requirements. A failed prerequisite returns nonzero and names the missing capability without printing secrets.

- [ ] Write failing preflight tests for missing `gh`, `deno` and `shellcheck`, absent authentication, unavailable network, and a non-Mac checkout path.
- [ ] Install Node `22.12.0` and pnpm `9.15.9` to match CI/packageManager; pin tested gh, Deno, ShellCheck and harness CLI versions rather than using floating latest installers. Install git, jq and other dependencies already required by the wrappers. Verify checksums where the installer provides them.
- [ ] Run `pnpm install --frozen-lockfile` and shared-package builds from the discovered repository root, then `pnpm qa:dist-fresh`. Configure each provider's setup using this script; do not copy local `.env` files, credentials, browser profiles or Keychain state. Keep a read-only reviewer profile separate from an implementation build profile.
- [ ] Make Deno verification select the actual changed edge-function entrypoints and dependents of changed `_shared` code. Execute `deno check <entrypoint>` using the repository's actual import/config conventions. Record filenames and results; the two push functions changed by #3238 (`push-trigger-class-status`, `push-trigger-run-proximity`) are not assumed checked merely because Deno is installed.
- [ ] Run ShellCheck on changed shell launchers and prove gh can reach the metadata endpoints required by `post-review-gate.sh` under its intended role. The reviewer preflight must not test write capability by making a real write.
- [ ] Test a clean Linux checkout and real Claude/Codex cloud setups, including full-issue Linear access through an available authorized connector/API. Save versions, commands and results. If a tool, permission or provider feature is unavailable, report that blocker; never record the skipped check as passing.

**Deliverable:** Both environments can build and run the required narrow checks without the Mac. Browser checks remain CI/operator-owned when a provider cannot run them.

### Task 1.2: Durable run events and evidence pointers

**Files:**

- Create `scripts/cloud/handoff.ts`.
- Create `scripts/cloud/handoff.test.ts`.
- Extend existing artifact scanner tests only where new formats need coverage.
- Update ship-pr, both orchestrate variants and OPSX references to discover the shared cloud runbook.

**Interfaces:**

`HandoffEvent` contains:

- `eventId`
- `runId`
- `parentEventId`
- Issue/PR identity
- Branch
- Full base/head SHA
- Author/reviewer harness
- Owning session/run URL
- Phase
- Result
- Evidence pointers
- Unmet criteria
- Next action

`reconcileHandoff(events, liveState)` returns:

`continue | wait | needs-human | complete`

A snapshot is never authorization.

- [ ] Write fixtures where temp folders and agent context disappear, an artifact expires, a PR head changes, and duplicate/stale events arrive. Assert reconstruction from remote evidence, no duplicate mutation and no reuse of a stale clean verdict.
- [ ] Store minimal append-only checkpoint events in one marked PR thread; use scanned immutable Actions artifacts for reports/logs, referenced by run ID, attempt and digest. Before a PR exists, checkpoint under the existing Linear issue with a pointer to the pushed branch; once a PR exists it owns execution events. Do not create a parallel GitHub issue tracker.
- [ ] Persist accepted subagent reports and review-round history before considering a batch accepted. Serialize automated writers per PR with one controller concurrency group and stable event IDs; reread the latest event before appending. Do not overwrite the run ledger from an old session snapshot.
- [ ] Set a documented 30-day retention for sanitized detailed artifacts; retain the minimal receipt, digest and next action in the PR/Linear record. Missing/expired artifacts mean evidence unavailable, not clean; coordinate a replacement attempt before rerunning a reviewer.
- [ ] Scan staging directories with the trusted existing scanner before uploads AND before printing excerpts into public logs/comments. Include configured model keys, GitHub tokens, Linear tokens and test credentials. Scanner errors/skips block publication; no `always()` fallback may upload unscanned evidence. Test a synthetic secret in plain logs, verdict text and supported nested reports; assert the value never appears in diagnostics.
- [ ] Verify a fresh session can read the remote checkpoint and required artifacts with its actual permissions. Preserve the existing reviewer ownership/replacement procedure; no process age, missing local file or expired VM proves another owner's review ended.

**Deliverable:** A restarted session can identify the issue, actual current head, work owner, completed evidence and exact next step from remote records.

**Stage 1 gate:** Focused preflight/handoff/scanner tests, the `/Users/` guard, cloud setup evidence, skill-reference validation, formatting and applicable ratchets pass. Publish and merge this stage only through the existing independently reviewed PR process and owner authorization.

## Stage 2 — Cloud independent review and trusted publication

### Task 2.1: Run the existing wrapper with isolated authority

**Files:**

- Create `.github/workflows/cloud-independent-review.yml`.
- Create `scripts/cloud/review-attempt.ts`.
- Create `scripts/cloud/review-attempt.test.ts`.
- Create `scripts/cloud/review-publication.ts`.
- Create `scripts/cloud/review-publication.test.ts`.
- Create `scripts/cloud/authorship.ts` and `scripts/cloud/authorship.test.ts` (prefix plus trailer cross-check).
- Minimally extend existing wrappers/poster if separating review from publication needs a shared seam.
- Retain `review-verdict.sh` as the shared verdict parser.

**Interfaces:**

`resolveAuthorship({ branch, commits }): { implementer: 'claude' | 'codex', reviewer: 'codex' | 'claude' } | { refused: string }`

`ReviewAttempt` records:

- Repository
- PR
- Requested base/head SHA
- Author/reviewer harness
- Trusted workflow SHA
- Run ID/attempt
- Outcome: `clean | findings | incomplete`
- Wrapper exit
- Log digest

`validateReviewPublication(attempt, githubState)` rejects an untrusted run, a different/newer head or attempt, missing artifact, digest mismatch, or incomplete result.

- [ ] Write executable wrapper fixtures for usage-limit CLI exit 0, interruption, missing verdict, findings and clean output. Run red before changing launch/publication behavior. Preserve existing wrapper semantics and assert which GitHub calls occur, not just YAML strings.
- [ ] Write `resolveAuthorship` tests: `claude/` with Claude trailers selects Codex; `codex/` with Codex trailers selects Claude; any other prefix, a prefix/trailer mismatch, or commits from both harnesses returns `refused` with the reason.
- [ ] Use trusted default-branch workflow/launcher/wrapper versions and explicitly fetch the reviewed base/head. Review the whole branch diff. The authorship check runs from base-branch code against the PR's commit list, which the PR cannot rewrite after the fact without moving the head.
- [ ] Reviewer job: model credential plus read-only repository/PR access, no write token, no Linear/production/deploy credentials, and no persisted git push credential. Restrict egress and execution capabilities; run any PR-code validation in a separate credential-free job. PR diffs/instructions are data, not authority to change the trusted launchers.
- [ ] Triggers: `pull_request_target` on `ready_for_review` and on `synchronize`/`reopened` only when the PR is not a draft, plus `workflow_dispatch`. A draft PR gets no review run and its gate stays red.
- [ ] Credentials: the reviewer job uses the `independent-review` environment (restricted to `main`) for `OPENAI_API_KEY`/`ANTHROPIC_API_KEY`; the publisher job uses no environment secrets.
- [ ] One review per head: a concurrency group keyed on the PR number with `cancel-in-progress: true`, so a quick second push cancels the first review instead of paying for both. A cancelled attempt is incomplete and posts no evidence.
- [ ] Invoke `codex-review.sh` or `claude-review.sh` without `--post`, with explicit worktree-local log paths. Capture stdout/stderr privately until scanned. Cloud jobs use workflow lifecycle and bounded timeouts (job limit above the sum of step limits, per LESSONS `cancelled-may-be-timeout`), not a Mac Keychain or detached PID as durable identity.
- [ ] Publisher job: no model execution and no PR-code execution; trusted checkout only. Give it the minimum comment/status write permissions plus required metadata/artifact reads, with no `contents: write`, push, merge or deployment capability. Do not give the model the publisher token.
- [ ] Validate provenance/current head and scan artifacts before passing the original verified log to `post-review-gate.sh`. Reuse existing findings/withdrawal handling through a shared helper if necessary; do not copy verdict regexes or invent success from silence. The trusted publisher is the only cloud evidence writer.
- [ ] Gate the whole workflow on `INDEPENDENT_REVIEW_ENABLED`; when it is not `true` the job exits before checkout and the Mac route is unaffected.

**Deliverable:** Either author's PR can receive a real other-harness wrapper review with original, scanned, current-head evidence and a traceable trusted publisher.

### Task 2.2: Gate provenance, incomplete attempts and head changes

**Files:**

- Modify `scripts/qa/review-gate.ts` and its existing tests.
- Modify `.github/workflows/review-gate.yml`.
- Update affected poster/wrapper tests.
- Add `scripts/cloud/review-workflow.test.ts` for executable event/permission controls.
- Keep new modules small rather than expanding the already-large evaluator opportunistically.

- [ ] Extend cloud evidence trust using a specific approved publisher identity AND API-verified workflow path/ref, run/attempt, PR, requested SHAs and artifact digest. Never trust all bots, an arbitrary workflow URL, a PR-supplied result or a typed owner comment as cloud-job provenance.
- [ ] Start a new required review attempt by invalidating the previous eligible evidence for that PR/head. The evaluator must consult the latest trusted attempt, so a cancelled/incomplete rerun on the SAME SHA cannot resurrect an earlier clean comment. Terminal usage-limit, interruption, cancellation, publisher failure, timeout or missing output maps to a red failure, never clean. A trusted completion/failure handler covers jobs that die before publication; if GitHub cannot accept the status, report that failure and keep merge blocked rather than invent green.
- [ ] On a failed attempt, post one `Review not completed for <head>` comment naming the cause and retry once after 15 minutes. A second failure stops and hands the PR to the owner (manual re-dispatch, a Mac review, or the documented `owner` override).
- [ ] On `synchronize`, invalidate independent review for the new head and record a red missing-current-review verdict until fresh qualifying evidence exists. A late clean result for the old head may be retained as history but cannot green the new head. Re-read current PR/head immediately before publication and before merge.
- [ ] Preserve default-branch metadata-only evaluation and the existing failure-status fallback. Test comment edit/delete, replay of older clean evidence, newer findings, cancelled jobs, rejected credentials and workflow/publisher crashes.
- [ ] Retain optional-review rules for eligible low-risk changes. Run the negative acceptance cases on independent-tier PRs, including one that had clean evidence before the incomplete rerun.
- [ ] A PR that changes the review machinery itself (this workflow, either wrapper, `post-review-gate.sh`, `review-gate.ts`, `review-tier.ts`, `authorship.ts`) is reviewed by the base-branch job like any other, and additionally needs a Mac review or the documented `owner` override; its changes take effect only after merge.
- [ ] Record the owner's approval/configuration of any required App identity, secrets, environment protection and ruleset changes. Add required contexts only after a real pilot proves both directions; never silently replace or disable the existing gate during rollout.

**Stage 2 gate:** Existing wrapper/poster/review-gate/watcher suites and new provenance/failure/authorship tests pass; both live pilot directions pass; no reviewer/publisher credential can push or merge. Independent review and CI on this stage's final head remain required.

## Stage 3 — Bounded continuation, human merge and accurate Linear close-out

### Task 3.1: Enforce convergence across restarts

**Files:**

- Create `scripts/cloud/continuation.ts`.
- Create `scripts/cloud/continuation.test.ts`.
- Create `.github/workflows/cloud-agent-continuation.yml`.
- Reuse the handoff/event module and existing review wrappers.
- Put provider-specific dispatch wiring in small adapters, not a new service.

**Interfaces:**

`decideContinuation(history, liveState)` returns:

`dispatch-one-fix | wait | needs-human | ready-for-human-merge`

History includes confirmed finding path, review round, head, provenance and whether the previous fix introduced it.

- [ ] Write failing tests: round 1 finding on a path permits one fix; round 2 finding on the same path stops before another patch, even after a restart/head change; a previous-fix regression stops immediately. Multiple findings within one round are not mistaken for multiple review rounds. An ambiguous/unparseable path needs human triage.
- [ ] Enforce the reducer before dispatching each fix and persist the decision first. One bounded implementation attempt per dispatch; no worker spawns its own review/fix loop. Preserve severity/context, the existing review-round cap and a maximum of two CI repair attempts for non-converging required failures.
- [ ] Serialize writes per PR; deduplicate event IDs; stop if the remote head/owner changed. Native provider auto-fix remains off for managed PRs because it could dispatch changes outside this reducer.
- [ ] Initial automatic backend: isolated CLI worker jobs in GitHub Actions with approved branch-write credentials separate from reviewer/publisher credentials. A provider-hosted session adapter is enabled only after its supported trigger/resume and permissions are documented and exercised. Missing provider automation is a recorded blocker, not an invented API.
- [ ] Use an implementation identity that actually triggers CI on its pushes; prove that behavior in the pilot. Preserve the trusted push-hold guard. Missing CI, denied dispatch, usage limits and denied updates stop with a durable next action instead of silently retrying through another credential.
- [ ] Gate the workflow on `AGENT_CONTINUATION_ENABLED`.

**Deliverable:** Continuation can make bounded authorized fixes, but cannot dispatch a third patch after convergence failure or escape the cap by restarting a session.

### Task 3.2: Human-triggered merge and full-issue close-out

**Merge control, ruleset first.** The smallest control that enforces "authorized AND green" is the branch ruleset: make `Review gate` and the CI aggregate required checks on `main`, and remove or audit every bypass actor (the 2026-10-23/24 merges went through with the gate red). With that in place a human merge in the GitHub UI or API cannot land a red PR, and no merge workflow is needed. Build the dispatch merge workflow below only if the ruleset cannot express a needed rule, and record that reason here first.

**Files:**

- Create `scripts/cloud/merge-preflight.ts` and `scripts/cloud/merge-preflight.test.ts` (used by agents before they ask for, or perform, an authorized merge).
- Only if the ruleset is insufficient: create `.github/workflows/cloud-agent-merge.yml`.
- Create `scripts/cloud/linear-closeout.ts`.
- Create `scripts/cloud/linear-closeout.test.ts`.
- Update the existing shared ship-pr and Linear-run reference rather than adding another shipping skill.

**Interfaces:**

`verifyMergeRequest({ pr, expectedHead, humanAuthorization }, liveState)` returns allowed only when authority, exact current head, green Review gate and every required check agree.

`closeOutIssue(issueId, evidence, linearClient)` requires a full issue read and returns:

`done | in-progress | blocked`

Require verified readback and no suppressed API/approval failures.

- [ ] Record Richard's approval of the ruleset change (required contexts, bypass list) before applying it; it is a shared-system setting. Verify afterwards with a test PR that a red gate blocks a normal merge.
- [ ] A direct human merge authorization names the PR and expected head; record its trusted origin. Freshly run `watch-pr-checks.sh`, inspect any non-required failures per existing policy, and require a green independent gate where the floor requires it. Authorization with a red/missing/running gate is refused; green checks without authorization are refused.
- [ ] Keep merge credentials out of implementation/reviewer/publisher jobs. If the dispatch merge workflow is built, it takes the expected full head SHA, runs in a protected approval environment, and uses a short-lived merge identity that cannot bypass the effective required-check ruleset. An owner's native UI/admin-token bypass is a separate emergency path and is not made safe merely by adding a shell preflight. Changes to bypass settings require Richard's explicit approval. Squash merge, refuse head movement, and preserve local main-checkout rules when running locally; the cloud coordinator discovers its checkout instead of using a Mac path.
- [ ] Confirm GitHub `MERGED` before close-out. Fetch the full Linear issue via `get_issue` or its full-description API equivalent, including latest acceptance criteria and relations. List summaries never qualify. A criterion requiring production/browser/operator proof remains unmet until that proof exists.
- [ ] Account for integration auto-Done: restore In Progress when evidence remains, with the exact missing criterion and owner. Prefer non-closing PR references for issues needing post-merge evidence. Read back the full issue after writes; if criteria changed during close-out, reconcile again rather than claim success against the old text.
- [ ] An approval denial, permission failure, rate limit, missing issue or failed readback yields `blocked`; retain the durable checkpoint and report the actual remote state. Do not work around an explicit denial with another identity. Do not mark a failed update, failed comment or unverified Done as successful.
- [ ] Treat DB pushes, function deploys and Deploy myK9Show as operator tasks. Do not expose those secrets or trigger those workflows from this automation. Cleanup follows durable close-out evidence; keep unmerged/merge-pending worktrees, and remove any local worktree last.

**Stage 3 gate:** Continuation, merge-authorization and full-issue/denial tests pass; the ruleset blocks a red-gate merge in a live test; a restarted cloud task resumes without the Mac; repeated-finding and denied-write drills halt visibly; owner executes the live merge pilot only after green review and CI.

## Testing phase and acceptance matrix

Each task includes red-to-green tests. This final phase verifies the integrated story; it does not postpone tests owed by earlier stages.

| Scenario                                                          | Required observable outcome                                                                            |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Claude implements (`claude/` branch); Codex reviews               | Existing Codex wrapper completes; trusted scanned evidence matches exact head; required CI green.      |
| Codex implements (`codex/` branch); Claude reviews                | Existing Claude wrapper completes; identical evidence/permission requirements.                         |
| Branch prefix missing, unknown or contradicted by commit trailers | No reviewer selected; a refusal comment names the reason; no evidence published.                       |
| CLI usage limit or interruption                                   | No clean evidence; required gate is red, including after a previous clean run on the same head.        |
| Push after clean independent review                               | New head's gate becomes red for missing current-head review and old results cannot satisfy it.         |
| Publisher crashes or artifact is unavailable                      | No approval; a bounded failure/blocked receipt identifies the owed action.                             |
| Reviewer/model sees malicious PR instructions                     | Cannot change trusted launchers, obtain publisher/merge credentials, push or merge.                    |
| PR edits a review wrapper to always print clean                   | The job runs `main`'s wrapper; the edit cannot affect the gate result.                                 |
| Kill switch off                                                   | No review or continuation job runs; the gate stays red; turning it back on and re-dispatching resumes. |
| Secret in report, verdict or upload                               | Scan fails; no raw artifact or unsafe excerpt is published; diagnostics omit the value.                |
| Session/temp state lost                                           | Reconstruct accepted reports, ownership, rounds and next action from remote evidence.                  |
| Second confirmed path finding across rounds                       | Stop before another automated patch, record restructure proposal and hand back to Richard.             |
| Human says merge while gate is unmet                              | The ruleset refuses the merge; no automated owner override.                                            |
| Gate green without human authorization                            | Merge is refused.                                                                                      |
| Linear full criteria include production proof                     | Issue stays/restores In Progress until evidence exists.                                                |
| Linear approval/update denied                                     | Close-out fails visibly, preserves pending action and never reports a successful Done.                 |

**Local checks:**

- Run the touched `scripts/cloud/*.test.ts`.
- Run existing review wrapper/poster/gate/watcher suites.
- Run scanner tests from `apps/myk9show`.
- Run skill-tree tests when references change.
- Run script TypeScript checks.
- Run Deno checks for actual affected edge entrypoints.
- Run ShellCheck for changed shell files.
- Use the `/commit` validation ladder and required shuffled runs for added/touched tests.
- Run `pnpm qa:code-quality-ratchet`.
- Run `pnpm qa:plans`.
- Check changed-file formatting.
- Stop/report a test runner stuck beyond 30 seconds.

**Live checks:**

Use two owner-approved, bounded pilot PRs, one per author harness.

Record:

- Environment versions
- Full SHAs
- Reviewer and publisher run IDs
- Artifact digests
- Watcher exits
- Full-issue acceptance/readback

Run negative drills on a disposable approved PR or fixture repository; never deliberately break production. A dry-run or fixture is recorded as such, not as live integration proof.

## Rollout, rollback and completion

1. Before each implementation stage, rerun the path-specific in-flight/Linear checks, create or select its tracking issue with authorization, and verify actual account access and budget. No unresolved primary-checkout or overlapping-work gate is treated as passed.
2. Ship one coherent stage at a time through the repository's review-tier floor, other-harness review for guardrail changes, required CI and separately authorized merge. No preview deployment or production release is required to prove a workflow-only change.
3. Enable cloud publication/continuation only after the corresponding live proof; owner controls App installation, secrets, environment permissions and rulesets. Keep the existing local review route until both directions work.
4. **Transition period.** For two weeks after Stage 2 is enabled, both review routes stay valid: the Mac (`pnpm qa:codex-review --post`) and the cloud job write the same evidence. Compare the two verdicts on at least three PRs reviewed both ways before relying on the cloud job alone, and record the comparison here.
5. Rollback first sets the stage's kill-switch variable to `false`, which stops new runs without a revert, then revokes credentials as appropriate and restores the existing local wrapper route. It does not weaken the required gate or erase handoff history. Missing review remains a blocker until a real review or explicit documented owner override exists. Stage 1 is additive and is undone by reverting its PR.
6. The program is Complete only after all three stages' criteria and both pilot directions pass, failures are recorded, and no acceptance evidence is owed. Then move this plan into `docs/archive/` and remove its index row. Stage-level OPSX changes archive only after their own merge/evidence gates.

## Linear issues to file

1. Stage 1: portable cloud setup, preflight and tool pins; discovered checkout paths with the `/Users/` guard; branch-prefix convention; durable handoff events.
2. Stage 2: cloud independent review, authorship resolution, trusted publisher and gate provenance.
3. Stage 3: bounded continuation, ruleset merge control and full-issue Linear close-out.

## Owner decisions (2026-10-24)

- **Authorship:** branch prefix, `claude/` or `codex/`, cross-checked against commit trailers (see Global constraints).
- **Review trigger:** no review on draft PRs. Marking a PR ready for review starts one, and every later push to a ready PR re-runs it. Manual dispatch stays available. Agents open PRs as drafts while iterating and mark them ready when they want review. Rationale: the gate is pinned to the exact head, so reviewing intermediate draft heads cannot satisfy it and only costs money.
- **Secrets:** a GitHub environment `independent-review` holds `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` (the names the two CLIs read by default; Stage 1 confirms the Codex CLI's), restricted to the `main` branch so only base-branch code can read them. The publisher job gets no model keys and uses only the workflow token with comment and status permissions. A separate `agent-closeout` environment holds the existing `LINEAR_API_KEY` for Stage 3, so review jobs never see Linear credentials.

## Validation Profile

- Risk: high
- Validation: full
- Rationale: implementation changes security-sensitive review provenance, credentials, automatic dispatch and merge/issue decisions. This planning-only edit needs metadata, formatting and plan coverage checks; that does not lower implementation validation or independent review.

## Planning verification

The plan covers:

| Requirement                                           | Covered by                                                                    |
| ----------------------------------------------------- | ----------------------------------------------------------------------------- |
| Existing wrapper and sole evidence writer             | Global constraints; Tasks 2.1–2.2                                             |
| Restricted credentials and malicious PR content       | Task 2.1 role split; malicious-instructions and wrapper-edit acceptance cases |
| gh, Deno, ShellCheck and actual edge checks           | Task 1.1 tool pins, missing-tool fixtures and recorded entrypoint checks      |
| Durable reports/ledger after restart                  | Task 1.2 remote events, report persistence and expiration fixtures            |
| Stop at convergence failure across sessions           | Task 3.1 reducer and repeated-path/previous-fix tests                         |
| Human-only shared deploys; authorized AND green merge | Global constraints; Task 3.2 ruleset-first merge control and operator tasks   |
| Full-issue criteria and denied Linear updates         | Task 3.2 read/write/readback and denial tests                                 |
| Interrupted/limited review red; new push red          | Task 2.2 including same-head rerun and delayed old-head results               |
| Scan every uploaded/published evidence path           | Task 1.2 scanner/error fixtures; Task 2.1 private capture                     |
| Verify cloud product claims and account limitations   | Verified capabilities table; Task 1.1 live setup proof                        |
| Branch-prefix authorship, with mismatch refused       | Global constraints; Task 2.1 `resolveAuthorship` and acceptance row           |
| Kill switches and rollback without revert             | Global constraints; Tasks 2.1, 3.1; Rollout item 5                            |
| Transition with both review routes valid              | Rollout item 4                                                                |
| Retain three-stage order, tests and rollout gates     | Stage deliverables/gates; integrated testing and rollout                      |
| Save/index the plan without duplicate execution plans | Canonical status, docs index row; the Claude draft archived as superseded     |

Important gaps identified during planning and addressed here:

- An interrupted rerun on the same head must invalidate earlier clean evidence.
- Generic bot association does not prove trusted workflow provenance.
- A shell preflight does not protect a separate native/admin merge bypass; the ruleset does.
- A PR-controlled branch prefix is cross-checked against commit trailers before it selects a reviewer.

Planning checks run on the merged plan (2026-10-24): plan metadata and formatting. Implementation and live acceptance tests have not run. Codex's original planning session also recorded that its in-flight check stopped on an unrelated tracked edit in the primary checkout (`docs/qa/audit-boundary.md`), which it preserved.

Before implementing, inspect the current repository state again. Do not assume that the earlier checkout condition or tool availability remains unchanged.
