---
name: opsx-orchestrate
description: Use when the user invokes /opsx-orchestrate, asks to orchestrate an OpenSpec change, requests sub-agent implementation with the main agent as reviewer, or wants an implementation/review loop for an OpenSpec remediation.
---

# OPSX Orchestrate

## Overview

Run `opsx-ship` with a strict role split: the root agent owns judgment and gates; bounded implementation batches go to sub-agents. Trust reviewed diffs and verification, not reports.

**REQUIRED SUB-SKILL:** Use `opsx-ship` for the phase order and shipping rules.

For `openspec/changes/<change-id>/` only. Use `ship-it` for `docs/plan-*.md`.

## Codex Capability Contract

- Codex `spawn_agent` does not select a model tier. Never invent `model: "sonnet"` or `model: "opus"`.
- If the user explicitly requires cheaper-model routing, explain that routing cannot be guaranteed and ask whether platform-assigned sub-agents are acceptable.
- Translate Claude `Agent`/`SendMessage` concepts to `spawn_agent`, `followup_task`, `send_message`, and `wait_agent`.
- Without collaboration tools, continue inline and preserve the gates.

## Phase Ownership

| OPSX phase | Owner |
|---|---|
| Branch safety, proposal, design/spec/tasks, artifact validation | Root agent |
| Apply independent task batches | Implementation sub-agents |
| Diff review and acceptance per batch | Root agent |
| Implementation verification and adversarial review | Root agent; may dispatch read-only reviewers |
| PR, merge, archive, cleanup | Root agent |

The root agent MUST NOT delegate proposal/design judgment.

## Dispatch Contract

Dispatch only independent, bounded batches.

Use `spawn_agent({ task_name, message, fork_turns: "all" })`. Each prompt includes:

1. Worktree absolute path and exact `tasks.md` checkbox text.
2. Proposal, design, delta specs, `docs/INTENT.md`, and relevant `// INTENT:` pointers.
3. Constraints: TypeScript, files under 500 lines, replication-backed core reads, shadcn/ui, TDD, assertion-first value checks.
4. Scope fence: no opportunistic refactors, task-checkbox edits, migrations, deployment, commits, or pushes unless explicitly assigned.
5. Required report:

```text
FILES: <paths touched>
APPROACH: <2-4 sentences>
TESTS: <commands and pass/fail counts>
TYPECHECK: <pass/fail/not run>
CONCERNS: <specific concerns or none>
```

For migrations, dispatch a fresh read-only `migration_auditor` before acceptance. Check existing rows, idempotency, recovery, RLS/auth, and schema compatibility.

## Review Loop

For every returned batch, the root agent:

1. Reads the actual diff and affected surrounding code.
2. Checks task/spec compliance, scope, intent, consolidation, offline reads, file size, tests, and types.
3. Re-runs value-sensitive tests and the final required typecheck.
4. Sends numbered defects with `followup_task`; then re-reviews the new diff.
5. Stops after three failed review rounds. Rewrite the dispatch or implement the batch inline.
6. Updates `tasks.md` only after acceptance and commits an accepted checkpoint.

Reports are not proof. A checked task means root-agent acceptance.

## Finish

Resume `opsx-ship` verification, PR, merge, archive, and cleanup. Preserve approval gates for pushes, merges, database writes, deployments, and external messages.

Report batches, review rounds, migration audits, and root-agent implementation.

## Common Mistakes

- Delegating the proposal because sub-agents are available.
- Claiming a cheaper model was selected.
- Checking tasks from a report without reading the diff.
- Letting an implementation agent edit `tasks.md` or perform shared-system writes.
- Spawning dependent batches in parallel.
