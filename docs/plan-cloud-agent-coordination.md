# Cloud agent coordination: GitHub as the shared record, independent review off the Mac

> **Status:** Active

Tracking: no Linear issues yet. Each stage below becomes one issue (see "Linear issues to file").

## Goal

Let either cloud agent (Claude Code or Codex) carry a Linear issue from start to merge with
the owner's Mac closed. GitHub holds the coordination record: branch, PR, checks, review
evidence, test logs and remaining actions. Linear tracks the work and links to that record.
The owner's involvement shrinks to decisions and exceptions: merge authorization, shared-system
writes, and anything the automation refuses to do.

Done means: one small issue implemented by Claude and reviewed by Codex, and one implemented by
Codex and reviewed by Claude, both completed with no step run on the Mac (see "Testing phase").

## Why now: what broke on 2026-10-23/24

A 17-issue performance run from a Claude Code cloud session (PRs #3225 to #3239, then #3248)
hit every gap this plan closes:

- **Independent review required the Mac.** `pnpm qa:codex-review` runs only there. Four PRs at
  the `independent` tier (#3232, #3236, #3238, #3248) merged on the owner's "Merge" with the
  `Review gate` status red, and their Codex audits were owed afterwards.
- **Review evidence could not be written from the cloud.** `scripts/qa/post-review-gate.sh` is
  the only writer of `Review gate:` comments and needs `gh`; the cloud session had only the
  GitHub connector.
- **Handoff state was lost.** The run ledger lived in a temp scratchpad, and three worker
  restarts discarded subagent reports. Recovery depended on reading worktrees and remote
  branches by hand.
- **Tools were missing.** No `gh`, `deno` or `shellcheck`: the two edited push edge functions
  were never Deno-typechecked before merge.
- **A conflicting PR got no CI.** #3235 conflicted with #3225 and produced zero workflow runs.
  #3248 added a `Mergeable with base` status to make this visible.
- **Setup drifted per worktree.** A worktree built against stale package `dist` and a missing
  dependency (`workbox-strategies`) failed the build until `pnpm install` and a package rebuild.
- **Mac paths are hard-coded** in live skills: `.claude/skills/ship-it/SKILL.md`,
  `.claude/skills/ship-pr/SKILL.md`, `.claude/skills/orchestrate/references/linear-issue-run.md`
  all name `/Users/richardbeezley/AI Projects/myk9-platform`.

## Decisions

- **One implementer, the other harness reviews.** Claude Code implements this plan; Codex
  reviews every PR. These changes touch guardrail paths (`.github/`, `scripts/qa/`, `.claude/`,
  `.codex/`, the instruction files), which `scripts/qa/review-tier.ts` puts at `independent`.
- **Bootstrap exception.** Until Stage 2 ships, Codex review still runs from the Mac. The Stage 1
  and Stage 2 PRs are reviewed that way, once, with evidence posted by `post-review-gate.sh`.
- **Keep the existing gate contract.** `scripts/qa/review-gate.ts` stays the judge. The cloud
  review job produces the same evidence line, pinned to the head SHA, posted by the same writer.
  No new evidence format, and no native bot review counted as evidence.
- **Silence is never approval.** A review job that did not run, was interrupted, hit a usage
  limit, or returned unrecognized output leaves the gate red. `scripts/qa/codex-review.sh`
  already exits `2` for these; the cloud job must reuse it, not call the CLI directly.

## Non-goals

- Auto-merge. Merge still needs the owner's authorization and a green gate together.
- Automating shared-system writes: `supabase db push`, `supabase functions deploy`, and the
  Deploy myK9Show workflow stay human-triggered (CLAUDE.md "Auto Mode — shared-system writes").
- Making either platform's native PR review count as gate evidence.
- Changing the review tiers or their floors.

## Stage 1: portable setup and instructions

Outcome: either cloud agent can build and test the repo from a fresh environment.

1. **One setup script for both clouds.** Add `scripts/setup-cloud-env.sh`, called by both
   environments' setup hooks. It installs Node at the `engines` version (`>=22.12.0`; pin
   `22.12.0` to match `deploy-myk9show.yml`), pnpm at `packageManager` (`pnpm@9.15.9`), `gh`,
   `deno` and `shellcheck`, then runs `pnpm install --frozen-lockfile`, builds the shared packages,
   and runs `pnpm qa:dist-fresh`. It refactors the shared steps out of
   `scripts/bootstrap-worktree.sh` so the two stay one implementation.
2. **Detected repository paths.** Replace the hard-coded Mac path in the three live skills with
   `git rev-parse --show-toplevel` (worktree) and the first entry of `git worktree list --porcelain`
   (main checkout). Add a test that fails if any non-archived `.claude/`, `.codex/` or `scripts/`
   file contains `/Users/`.
3. **One rulebook, two thin harness sections.** Shared workflow rules already live in
   `docs/agents/shared-rules.md` and are rendered into `CLAUDE.md` and `AGENTS.md` by
   `pnpm qa:shared-rules:write`. Move the remaining duplicated workflow text into the shared
   block; keep only harness mechanics (tool names, skill/command names) in each file's own section.
4. **Assignment fields on every issue.** Each Linear issue that will produce a PR records:
   acceptance criteria, branch name, implementing harness (`claude` or `codex`), and therefore the
   reviewing harness. Document the field convention in `docs/agents/issue-tracker.md`.

Acceptance: a fresh Claude Code cloud session and a fresh Codex cloud environment each run the
setup script and then `pnpm typecheck`, `pnpm lint` and one shuffled app test file green, with
`gh`, `deno` and `shellcheck` on `PATH`.

## Stage 2: cloud independent review and durable evidence

Outcome: the independent review runs in GitHub Actions and the Mac is no longer needed.

1. **Review workflow.** Add `.github/workflows/independent-review.yml`, triggered on PR open and
   synchronize and on manual dispatch. It reads the PR's implementing harness (from the branch
   prefix or a PR label) and runs the OTHER one: `scripts/qa/codex-review.sh` for Claude-authored
   PRs, `scripts/qa/claude-review.sh` for Codex-authored ones. Both wrappers already share one
   verdict contract and refuse to report a run that did not complete.
2. **Trusted posting.** On a clean verdict the job calls `scripts/qa/post-review-gate.sh` with the
   review log, so the evidence comment carries the log's sha256 as today. On findings it posts
   them with `--withdraw` semantics, so a later clean claim cannot sit beside a known defect.
3. **Credentials and the public repo.** The repository is public (see `review-gate.ts`), so:
   - Run the job only for PRs from branches in this repository, opened by an OWNER, MEMBER or
     COLLABORATOR. Never for fork PRs, which must not see model API keys.
   - The job's token gets `pull-requests: write` (comment) and `statuses: write` only. No
     `contents: write`, so a prompt-injected review cannot push or merge.
   - Model keys (`OPENAI_API_KEY` for Codex, `ANTHROPIC_API_KEY` for Claude) live in a GitHub
     environment restricted to this workflow.
4. **Durable handoff evidence.** Each run uploads, as artifacts linked from the evidence comment:
   the full review log, the reviewed base and head SHAs, the test log of the checks it ran, and a
   short `handoff.md` (what was reviewed, findings, remaining actions). Every artifact passes the
   repo's secret scan (`apps/myk9show/scripts/verify-artifact-secrets.ts`) before upload. Local
   `.logs/` files remain a convenience for a running session, never the record.
5. **Head moves invalidate review.** Unchanged behavior of `review-gate.ts`: a push makes the
   recorded SHA stale and the gate red until the job re-reviews the new head.

Acceptance: the four checks in "Testing phase" items 1 to 4 pass on throwaway PRs.

## Stage 3: automatic continuation and Linear reconciliation

Outcome: CI failures and review findings drive the next step without the owner relaying them.

1. **Findings return to the implementer.** A red required check, or a findings comment from the
   review job, wakes the implementing harness on that PR (Claude Code PR auto-fix, or a Codex task
   started from the PR). The implementer fixes and pushes; the push re-runs CI and the review.
2. **Loop cap.** Enforce the repo's convergence rule (CLAUDE.md "Gates, in order", step 3): stop
   at the second finding on the same path across rounds, or when a finding is about code the
   previous fix introduced. The automation then posts the restructure proposal and hands the PR
   to the owner instead of patching again.
3. **Merge stays a decision.** When CI and the gate are both green, the automation comments that
   the PR is ready and waits for the owner's merge authorization.
4. **Accurate Linear close-out.** After merge, a job reads the issue with `get_issue` (full
   description; list results truncate acceptance criteria) and comments which criteria the PR
   met, which need production evidence, and what remains. It moves the issue to Done only when
   every criterion is met and none needs a deploy. Issues owed a migration push, function deploy
   or frontend deploy stay In Progress with the owed step named.
5. **Visible failure.** A Linear transition that is refused (permission or approval) is reported
   on the PR and the issue, never dropped.

Acceptance: "Testing phase" item 5.

## Testing phase

Each item is a throwaway PR or a real small issue. A stage is not complete until its items pass.

1. **Clean review, both directions.** A Claude-authored PR gets a Codex review from the cloud job,
   a `Review gate:` evidence comment with a log hash, and a green gate. Then the same for a
   Codex-authored PR reviewed by Claude.
2. **Interrupted review stays red.** Point the job at a stub reviewer that prints the usage-limit
   abort and exits 0. The wrapper must exit `2`, nothing is posted, and the gate stays red.
3. **Stale review turns red.** Push one commit after a clean review. The gate goes red on the new
   head, and the job re-reviews it.
4. **Untrusted PRs get nothing.** A fork PR, or a PR from a non-collaborator, does not run the job
   and never receives model keys (verify from the run list and the job's environment).
5. **End-to-end with the Mac closed.** One small Todo issue implemented by Claude and reviewed by
   Codex, and one implemented by Codex and reviewed by Claude, each taken from Linear to an
   authorized merge and an accurate Linear close-out, with no step run on the Mac. Record the PR
   numbers, review evidence links and close-out comments in this plan before marking it Complete.

Unit tests ship with each stage: the path-detection test (Stage 1), the harness-selection and
trust-filter logic (Stage 2), and the close-out criteria parser (Stage 3), each run shuffled.

## Risks

- **Prompt injection through PR content.** A review model reads attacker-controllable diff text.
  Mitigated by the trust filter and a token that cannot push or merge.
- **Cost and quota.** Every push re-runs a model review. A usage-limit abort leaves the gate red
  (correctly) but stalls the PR. Track review run counts in the first two weeks.
- **Two platforms' cloud features may change.** Codex cloud environments and review, and Claude
  Code's PR auto-fix, were not verified against current documentation when this plan was written.
  Confirm each before building on it in Stage 2 and Stage 3.
- **Secrets in artifacts.** Test logs can contain credentials; the upload step scans first.

## Linear issues to file

1. Stage 1: portable cloud setup script, detected repo paths, shared rulebook cleanup, issue
   assignment fields.
2. Stage 2: cloud independent review workflow and durable handoff evidence.
3. Stage 3: automatic continuation and Linear close-out.

## Open questions for the owner

- Where does a PR declare its implementing harness: branch prefix (`claude/`, `codex/`), a PR
  label, or a field in the Linear issue? The branch prefix needs no new input but is easy to get
  wrong by hand.
- Should the review job run on every push, or only when the PR is marked ready for review? Every
  push is safer for the gate; ready-only is cheaper.
- Which GitHub environment and secret names should hold the two model API keys?
