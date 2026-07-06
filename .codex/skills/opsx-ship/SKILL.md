---
name: opsx-ship
description: Run an OpenSpec change end-to-end for Codex: propose, verify artifacts, apply, verify implementation, ship PR, archive, and cleanup. Supports single-change and Go Live batch mode. Use when the user says /opsx:ship, opsx ship, opsx ship batch, or asks to ship OpenSpec work through the full pipeline.
---

# OPSX Ship

Run the OpenSpec shipping pipeline end-to-end. This is an orchestrator: load and follow the
phase skill for each phase instead of reimplementing that phase from memory.

## Inputs

Accept either:

- an existing OpenSpec change name, such as `security-passcode-throttle`
- a description of new work, such as `add heritage entry confirmations`
- a batch request, such as `opsx:ship batch money path` or `opsx:ship batch go-live phase 1`

Record the user's original request verbatim before creating or editing artifacts. If the input
matches `openspec/changes/<name>/`, resume from the first incomplete phase.

## Modes

### Single-change mode

Use the phase pipeline below for one bounded OpenSpec change. This remains the default for
small, high-risk, or already-scoped work.

### Batch mode

Use batch mode when the user asks to complete multiple Go Live Runbook items, says `batch`,
or asks for overnight/autonomous preparation of related launch-readiness work.

Batch mode optimizes for fewer gates while preserving the OpenSpec paper trail:

1. Read `docs/operations/go-live-runbook.md`, `docs/operations/go-live-opsx-batches.md`
   when present, and `docs/goals/fall-2026-launch-readiness.md`.
2. Select one coherent batch by phase/domain, not one runbook checkbox at a time.
3. Create or resume one OpenSpec change for the whole batch.
4. Keep the OpenSpec `tasks.md` itemized by runbook checkbox or subtask, with owner and
   gate labels when useful.
5. Implement sequentially inside one feature worktree and branch.
6. Update task checkboxes immediately when an item is 100% complete with repo, CI, staging,
   or operator evidence.
7. Open one implementation PR for the batch.
8. Defer archiving until the implementation PR is merged and the batch's required verification
   evidence is recorded.

Prefer these batch boundaries for the Go Live Runbook unless the tracker says otherwise:

- Phase 0 engineering blockers: drift, money path, and remaining scorecard code work.
- Phase 1 platform/deploy setup: CI-gated deploys, auth email, and kill-switch checks.
- Phase 2 data/access verification: judges, seed fixtures, and passcode ringside identity.
- Phase 3 Stripe live cutover: operator-led live-mode steps and agent-prepared checks.
- Phase 4 evidence pass: show-day re-walk, offline rehearsal, print test, real-user testing,
  and scorecard close-out.
- Phase 5 launch-day checks: repeatable morning-of verification and support posture.

Do not combine unrelated high-risk areas when that would make review unsafe. Split batches
when a migration/RLS/payment/auth change deserves its own PR, but keep the OpenSpec change
active across related follow-up PRs if that reduces archive churn.

## Autonomy Boundaries

In unattended or overnight batch mode, proceed without stopping for routine local work:

- create worktrees and branches
- edit code, tests, docs, and OpenSpec artifacts
- run focused tests, lint, typecheck, OpenSpec validation, and dry-run checks
- commit, push feature branches, and open PRs
- mark items complete only when evidence proves they are complete

Still stop for explicit approval before shared-system mutations or irreversible actions:

- real `supabase db push`
- Supabase function deploys, secret changes, Management API PATCHes, or production DB writes
- merging PRs
- force-pushes
- posting to external services or changing production dashboards

When blocked by an approval gate, keep moving on independent items in the same batch where
safe. Leave a clear PR note and tracker entry for each queued approval.

## Phase 0: Branch Safety

1. Run `git branch --show-current` and `git rev-parse --git-dir --git-common-dir`.
2. If on primary `main`, create or enter a feature worktree before writing files.
3. Never run implementation, PR, archive, or cleanup phases directly on primary `main`.

## Phase 1: Propose

Use only when no matching change already exists.

1. Read `../openspec-propose/SKILL.md`.
2. Follow it with the user's request to create `openspec/changes/<name>/`.
3. Ensure the artifacts include proposal, design as needed, delta specs as needed, and tasks.

## Phase 2: Verify Artifacts

1. Load the `verify-plan` skill from the configured skill roots.
2. Treat the OpenSpec artifacts together as the plan under audit.
3. Treat the user's original request plus `openspec/config.yaml` rules as requirements.
4. Patch artifact gaps directly.
5. Run `pnpm openspec validate --change "<name>"` when available.
6. Show the verification table and score.
7. Ask before implementation unless the user explicitly requested unattended/autonomous shipping
   or batch mode.

## Phase 3: Apply

1. Read `../openspec-apply-change/SKILL.md`.
2. Apply the selected change task-by-task.
3. Keep `tasks.md` checkboxes synchronized as work completes.
4. Commit checkpoints after green phases when useful.
5. If a task is ambiguous or blocked, stop and resolve it; do not skip tasks.
6. In batch mode, continue with the next independent task when a shared-system approval gate
   blocks only one task.

## Phase 4: Verify Implementation

1. Read `../openspec-verify-change/SKILL.md`.
2. Verify task completion, spec coverage, requirement correctness, tests, and design coherence.
3. Fix CRITICAL findings, then re-run verification.
4. Fix WARNING findings when straightforward; otherwise document them in the PR test plan.
5. Stop after three rounds on the same failure.

## Phase 5: Ship PR

1. Load the `ship-pr` skill from the configured skill roots.
2. Run the PR pipeline, but skip its cleanup step. This skill owns cleanup after archive.
3. Include `Tracked in openspec change: <name>` in the PR body.
4. For migrations, RLS, payments, auth, RBAC, or shared-system behavior, run the repo's required
   second-opinion/auditor checks before merge.
5. If auto-merge is armed and checks are still pending, stop. Do not archive until the PR is merged.
6. In batch mode, prefer one implementation PR per coherent batch. If multiple PRs are needed,
   keep all of them linked to the same OpenSpec change and archive only after the last required
   PR merges.

## Phase 6: Archive

Only after `gh pr view --json state` proves the PR is `MERGED`.
In batch mode, every required implementation PR for the batch must be merged or explicitly
deferred in the tracker before archive:

1. Read `../openspec-archive-change/SKILL.md`.
2. Archive the change and sync delta specs when required.
3. If archive/sync leaves commits for `main`, confirm before pushing to `main` because this is a
   shared-system write under the repo's Auto Mode rules.

## Phase 7: Cleanup

1. Load the `cleanup` skill from the configured skill roots.
2. Sync `main`, prune refs, delete the local feature branch, and remove the worktree.
3. Worktree removal is the final command; run nothing after it.

## Final Report

Report:

- change name
- artifact verification score
- implementation verification result
- PR URL and merge state
- archive path
- cleanup result
- in batch mode, completed runbook items, blocked approval gates, and remaining batch items

If any phase pauses, report exactly which phase paused and what evidence or decision is needed next.
