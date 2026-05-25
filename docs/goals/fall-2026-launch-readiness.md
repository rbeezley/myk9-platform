# Fall 2026 Launch Readiness Goal

## Ultimate Goal

Make myK9 launch-ready for fall 2026, with secretary/show-day reliability as the highest priority.

## North Star

Technology should disappear behind the task for elderly and non-technical dog-sport volunteers and exhibitors.

The product should feel calm, guided, reliable, and hard to mess up. Every improvement should reduce cognitive load during real show operations, especially for secretaries working under time pressure.

## Primary Priority

Show-day secretary workflows come first when prioritization is unclear.

Prefer work that improves:

- scoring correctness
- offline-first reliability
- replication and sync behavior
- class status and completion accuracy
- run order and ring workflow clarity
- secretary next-action guidance
- launch-blocking UX confusion

## Task Source

Use `OPEN-TODOS.md` as the default backlog. Prefer existing plan documents when present, and update tracking documents as work is completed.

Do not invent a new backlog unless the current one is insufficient or stale. When the backlog and this goal disagree, use this goal as the prioritization frame and update the backlog honestly.

## Execution Style

Work one small PR at a time unless explicitly asked to parallelize.

For each slice:

1. Start from the current backlog or an existing plan.
2. Keep scope narrow and releasable.
3. Use a separate worktree for feature work when appropriate.
4. Preserve offline-first data paths.
5. Preserve role intent from `docs/INTENT.md` for UX-facing changes.
6. Run focused tests and typecheck for the touched area.
7. Update the relevant tracking document.

## Quality Gates

Before considering a slice complete:

- focused tests pass, or a test limitation is clearly reported
- relevant typecheck passes
- broader checks run when risk warrants it
- database migrations are pushed only after explicit confirmation
- source control and shared systems are not left drifting from each other

## Default Codex Goal Prompt

Use this with `/goals` when setting up Codex for long-running development:

```text
Ultimate goal:
Make myK9 launch-ready for fall 2026, with secretary/show-day reliability as the highest priority.

North star:
Technology should disappear behind the task for elderly/non-technical dog-sport volunteers and exhibitors.

Primary priority:
Show-day secretary workflows must feel calm, guided, reliable, offline-tolerant, and hard to mess up.

Task source:
Use OPEN-TODOS.md as the backlog. Prefer existing plan docs when present. Do not invent a new backlog unless the current one is insufficient.

Execution style:
Work one small PR at a time unless explicitly asked to parallelize. Use separate worktrees for feature branches. Update tracking docs after each completed slice.

Quality gates:
Run focused tests, relevant typecheck, and broader checks when risk warrants it. For DB/shared-system writes, ask for explicit confirmation.

Prioritization:
Prefer tasks that improve show-day reliability, scoring correctness, replication/offline behavior, secretary next-action guidance, and launch-blocking UX clarity.
```
