---
name: "OPSX: Ship"
description: End-to-end OpenSpec pipeline - propose, verify artifacts, implement, verify implementation, PR, review, merge, archive (Experimental)
category: Workflow
tags: [workflow, artifacts, experimental, orchestrator]
---

Run a full OpenSpec change end-to-end: propose → verify plan → apply → verify implementation → ship PR → archive.

Two distinct verification gates, on purpose:

- **Phase 2 (`verify-plan`)**: audits the artifacts against the user's requirements _before_ any code is written.
- **Phase 4 (`opsx:verify`)**: audits the implementation against the artifacts _after_ coding — task completion, spec coverage, design adherence.

This is an **orchestrator**. Each phase delegates to an existing skill via the Skill tool — do NOT reimplement their steps here. If a delegated skill pauses (ambiguity, blocker, failed check), the pipeline pauses with it; resolve, then continue from that phase.

**Input**: A description of what to build (e.g., `/opsx:ship add heritage entry confirmations`) OR the name of an existing change (e.g., `/opsx:ship security-passcode-throttle`). If the name matches a directory in `openspec/changes/`, skip Phase 1 and resume from the first incomplete phase (check artifact status, then task checkboxes, then PR state).

**Record the user's original request verbatim** before Phase 1 — Phase 2 verifies artifacts against it.

## Phase 0: Branch safety

Verify you are on a feature branch in a worktree (`git branch --show-current`). If on `main`, create a worktree/feature branch first (`git checkout -b <change-name>` in a new worktree). Never run this pipeline on `main`.

## Phase 1: Propose

Invoke the **Skill tool** with `skill: opsx:propose` and the user's description as args. This creates `openspec/changes/<name>/` with proposal.md, design.md, specs, and tasks.md.

## Phase 2: Verify artifacts

Invoke the **Skill tool** with `skill: verify-plan`. Adapt it to OpenSpec:

- **The "plan" under audit** = the change's artifacts combined (proposal.md + design.md + delta specs + tasks.md).
- **The requirements** = the user's original request (recorded above) plus the constraints in `openspec/config.yaml` (`context` and `rules` blocks — e.g., testing tasks present, duplication question answered, offline-first impact noted).
- Run the full audit → score → auto-patch loop. Patch the **artifact files** directly, preserving structure.
- **Skip verify-plan Step 6 (plan hygiene)** — the OpenSpec change IS the plan (CLAUDE.md carve-out); no `docs/plan-*.md`, no docs/README.md row. Instead confirm: tasks.md has a testing phase, and the final task is the PR/CI/merge gate (per config.yaml task rules).

After patching, re-run `pnpm openspec validate --change "<name>"` if available; fix any structural complaints.

**Checkpoint**: Show the verification table and coverage score, then use **AskUserQuestion**: "Proceed to implementation?" with options "Implement now" / "Pause — I want to review the artifacts". Skip this checkpoint only if the user's invocation said to run unattended (e.g., "no gates", "fully autonomous").

## Phase 3: Apply

Invoke the **Skill tool** with `skill: opsx:apply` and the change name as args. Work through every task; keep task checkboxes in sync. If apply pauses on a blocker, resolve with the user and re-invoke — do not skip tasks.

Commit checkpoints after each green phase of work (worktree convention).

## Phase 4: Verify implementation

Invoke the **Skill tool** with `skill: opsx:verify` and the change name as args. It checks completeness (all tasks done, all delta-spec requirements implemented), correctness (implementation matches requirement intent, scenarios covered by tests), and coherence (design decisions followed).

- **CRITICAL issues** → fix them (loop back to Phase 3 for the affected tasks), then re-verify. Max 3 rounds; escalate to the user if still failing.
- **WARNINGs** → fix if straightforward, otherwise surface them in the PR body's Test Plan section.
- All clear → proceed.

## Phase 5: Ship the PR

Invoke the **Skill tool** with `skill: ship-pr`. It handles simplify → commit → PR creation → self-review loop (code-reviewer subagent, max 5 rounds) → squash-merge from the main repo → branch/worktree cleanup.

Extras for OpenSpec changes:

- The PR body's Summary should cite the change: `Tracked in openspec change: <name>`.
- If the diff touches RLS, migrations, payments, auth, or RBAC seed data, also run the Codex second opinion per CLAUDE.md (companion script, `node .../codex-companion.mjs review --base main --scope branch`) before merging.
- If ship-pr arms auto-merge (checks pending) and stops, **stop the pipeline too**. Tell the user: "Auto-merge armed — run `/opsx:ship <name>` again (or `/opsx:archive <name>`) after the merge lands to archive." Do not archive before merge.

## Phase 6: Archive

Only after the PR is confirmed MERGED (`gh pr view --json state`):

1. Invoke the **Skill tool** with `skill: opsx:archive` and the change name as args. It re-checks the merge gate, offers delta-spec sync, and moves the change to `openspec/changes/archive/YYYY-MM-DD-<name>/`. Include the PR URL in the archive summary.
2. The archive move leaves uncommitted changes on `main`. Commit them as `chore(openspec): archive <name>` and push. This is a push to `main` — confirm with the user first per the Auto Mode rule (one confirmation covers sync + archive commits in the same run). If linked worktrees exist, the pre-commit hook requires `MYK9_ALLOW_PRIMARY_COMMIT=1`.

## Final report

```
## Shipped: <change-name>

- Artifacts: proposal, design, specs, tasks (plan verified, coverage N/100)
- Implementation: N/N tasks complete (opsx:verify: all checks passed)
- PR: #<number> <url> — merged
- Specs: synced / no delta specs
- Archived: openspec/changes/archive/YYYY-MM-DD-<name>/
```

## Guardrails

- Delegate, don't duplicate — every phase runs its existing skill via the Skill tool.
- Never start Phase 3 before Phase 2's checkpoint clears (unless unattended mode).
- Never archive before the PR is merged. Auto-merge armed ≠ merged.
- If any phase fails twice on the same error, stop and report — don't loop.
- Resume is idempotent: re-invoking with an existing change name continues from the first incomplete phase; never re-create artifacts that already exist.
