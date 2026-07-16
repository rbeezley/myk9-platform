---
description: List open Linear issues (MyK9-platform) and pick one to work on
---

# Check Todos (Linear)

`OPEN-TODOS.md` was retired on 2026-07-16 — **Linear is the single source of truth.** Workspace `myk9-platform`, team **MyK9-platform**. See [`docs/agents/issue-tracker.md`](docs/agents/issue-tracker.md).

## Instructions

1. **Ensure the Linear MCP tools are loaded.** They may be deferred — discover them with ToolSearch (e.g. query `linear list issues`). You need list-issues, get-issue, and update-issue tools.

2. **List open issues** in team **MyK9-platform** — states `In Progress`, `Todo`, `Backlog` (exclude `Done` / `Canceled`). Order by priority, then most-recently-updated. If nothing is open, say "No outstanding todos" and exit.

3. **Display a compact numbered list**, grouped by state (In Progress first, then Todo, then Backlog). For each: number (for selection) + `MYK9-NN` identifier + bold title + priority. Then prompt: "Reply with the number of the todo you'd like to work on." Wait for a number.

4. **Load full context for the selection:** fetch the issue (get-issue) and summarize its description.
   - **OpenSpec-backed issues take priority.** If the description references an `openspec/changes/<id>/` path (or names an OpenSpec change), extract `<id>` and route to the pipeline: default `/opsx:ship <id>` (full pipeline), or `/opsx:apply <id>` for implement-only. If the issue names an exact command, prefer it verbatim.
   - Otherwise match the work type to a skill: walk/audit → `qa-feature`; DB migration → `db-push`; browser automation → `playwright-cli`; bug investigation → `debugging-patterns`.

5. **Present action options:**
   - **If OpenSpec-backed**: "This is an OpenSpec change (`<id>`). Would you like to:\n\n1. Ship it end-to-end (`/opsx:ship <id>`)\n2. Implement only (`/opsx:apply <id>`)\n3. Work on it directly\n4. Put it back and browse other todos"
   - **Else if a skill matches**: "This looks like [domain] work. Would you like to:\n\n1. Invoke [skill-name] and start\n2. Work on it directly\n3. Brainstorm approach first\n4. Put it back and browse other todos"
   - **If no match**: "Would you like to:\n\n1. Start working on it\n2. Brainstorm approach first\n3. Put it back and browse other todos"
   Wait for the response.

6. **Handle the choice:**
   - **Ship / Implement**: invoke the opsx command. Completion is owned by the pipeline (its archive step moves the issue to Done); do not change the issue state manually here.
   - **Invoke skill / Start working**: move the issue to **In Progress** (update-issue `state`), then begin.
   - **Brainstorm**: leave the issue state unchanged; invoke `/brainstorm` with the issue description as argument.
   - **Put it back**: leave state unchanged; return to step 3 to redisplay the list.

**Completion is tracked in Linear** — move the issue to `Done` when the work merges (a `MYK9-NN` branch/PR auto-completes it on merge). There is no file to edit.
