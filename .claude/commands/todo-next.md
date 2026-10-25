---
description: List open Linear issues (MyK9-platform) and pick one to work on
---

# Check Todos (Linear)

`OPEN-TODOS.md` was retired on 2026-07-16 — **Linear is the single source of truth.** Workspace `myk9-platform`, team **MyK9-platform**. See [`docs/agents/issue-tracker.md`](docs/agents/issue-tracker.md).

## Instructions

1. **Ensure the Linear MCP tools are loaded.** They may be deferred — discover them with ToolSearch (e.g. query `linear list issues`). You need list-issues, get-issue, and update-issue tools.

2. **Separate new work, resumes and acceptance.** For new work, query **Ready for an agent**, or its exact connector fallback in `docs/agents/issue-tracker.md`; do not broaden it to Backlog, Parked or held work. Query In Progress work and inspect recorded executor/branch/PR for a separate **Resume** list; listing it does not release ownership or resolve holds. Query **Verification needed** for a **Review** list, including its rows without verify labels. Link each full queue and show a few priority-ranked candidates from each; do not report no work merely because Ready is empty.

3. **Display compact numbered Ready, Resume and Review sections** in priority order. For each: number + `MYK9-NN` identifier + bold title + priority; resume/review rows include ownership and the next action/proof. Then prompt: "Reply with the number of the item you'd like to work on." Wait for a number.

4. **Load full context before changing state:** fetch the full issue with relations and latest comments, then apply the shared contract's premise, dependency, approval and ownership checks. Revalidate eligibility after the user's selection; if held, record the shared hold disposition and do not start implementation. Summarize the eligible issue's description.
   - **OpenSpec-backed issues take priority.** If the description references an `openspec/changes/<id>/` path (or names an OpenSpec change), extract `<id>` and route to the pipeline: default `/opsx:ship <id>` (full pipeline), or `/opsx:apply <id>` for implement-only. If the issue names an exact command, prefer it verbatim.
   - Otherwise match the work type to a skill: walk/audit → `qa-feature`; DB migration → `db-push`; browser automation → `playwright-cli`; bug investigation → `debugging-patterns`.

5. **Present action options:**
   - **If Review work**: offer the issue's required verification/closeout action first, using its full criteria and shared session/runbook; do not dispatch implementation solely from an In Review status.
   - **If OpenSpec-backed**: "This is an OpenSpec change (`<id>`). Would you like to:\n\n1. Ship it end-to-end (`/opsx:ship <id>`)\n2. Implement only (`/opsx:apply <id>`)\n3. Work on it directly\n4. Put it back and browse other todos"
   - **Else if a skill matches**: "This looks like [domain] work. Would you like to:\n\n1. Invoke [skill-name] and start\n2. Work on it directly\n3. Brainstorm approach first\n4. Put it back and browse other todos"
   - **If no match**: "Would you like to:\n\n1. Start working on it\n2. Brainstorm approach first\n3. Put it back and browse other todos"
     Wait for the response.

6. **Handle the choice:**
   - **Ship / Implement**: retain root ownership of the issue while invoking the opsx command. Follow the shared **Lifecycle owner** protocol before implementation, on pauses, after merge and after archive; the phase skills do not own implicit Linear updates. Do not assume archive or merge proves every criterion.
   - **Invoke skill / Start working**: move the issue to **In Progress** (update-issue `state`), then begin.
   - **Brainstorm**: leave the issue state unchanged; invoke `/brainstorm` with the issue description as argument.
   - **Put it back**: leave state unchanged; return to step 3 to redisplay the list.

**Completion is tracked in Linear** — fresh-read the full issue and apply the disposition/evidence contract in `docs/agents/issue-tracker.md`. Do not accept merge auto-completion while acceptance evidence remains owed. There is no sprint file to edit.
