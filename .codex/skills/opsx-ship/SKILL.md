---
name: opsx-ship
description: Run an OpenSpec change end-to-end for Codex: propose, verify artifacts, apply, verify implementation, ship PR, archive, and cleanup. Use when the user says /opsx:ship, opsx ship, or asks to ship an OpenSpec change through the full pipeline.
---

# OPSX Ship

Run the OpenSpec shipping pipeline end-to-end. This is an orchestrator: load and follow the
phase skill for each phase instead of reimplementing that phase from memory.

## Inputs

Accept either:

- an existing OpenSpec change name, such as `security-passcode-throttle`
- a description of new work, such as `add heritage entry confirmations`

Record the user's original request verbatim before creating or editing artifacts. If the input
matches `openspec/changes/<name>/`, resume from the first incomplete phase.

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
7. Ask before implementation unless the user explicitly requested unattended/autonomous shipping.

## Phase 3: Apply

1. Read `../openspec-apply-change/SKILL.md`.
2. Apply the selected change task-by-task.
3. Keep `tasks.md` checkboxes synchronized as work completes.
4. Commit checkpoints after green phases when useful.
5. If a task is ambiguous or blocked, stop and resolve it; do not skip tasks.

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

## Phase 6: Archive

Only after `gh pr view --json state` proves the PR is `MERGED`:

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

If any phase pauses, report exactly which phase paused and what evidence or decision is needed next.
