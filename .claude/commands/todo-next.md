---
description: List open Linear issues (MyK9-platform) and pick one to work on
---

# Check Todos (Linear)

`OPEN-TODOS.md` was retired on 2026-07-16 — **Linear is the single source of truth.** Workspace `myk9-platform`, team **MyK9-platform**. See [`docs/agents/issue-tracker.md`](docs/agents/issue-tracker.md).

## Instructions

1. **Ensure the Linear MCP tools are loaded.** They may be deferred — discover them with ToolSearch (e.g. query `linear list issues`). Load list-custom-views, list-issues, get-issue, comment-reading and issue-update tools as needed by the shared contract.

2. **Separate new work from resumes.** Query **Ready for an agent**, or its exact connector fallback in `docs/agents/issue-tracker.md`; do not broaden it to Backlog, Parked or held work. Query In Progress work and inspect recorded executor/branch/PR for a separate **Resume** list; listing it does not release ownership or resolve holds. Link the existing [Verification needed](https://linear.app/myk9-platform/view/316a2fa9-78c5-4cb5-9ba5-71332adb4bf7) queue for acceptance/closeout, including its no-verify rows. If Ready and Resume are empty, say so specifically and still offer that queue link.

3. **Display compact numbered Ready and Resume sections** in priority order. For each: number + `MYK9-NN` identifier + bold title + priority; resume rows include ownership and the next hold/handoff action. Show the Verification needed link separately. Prompt for a numbered implementation/resume item, or let the user open the existing acceptance queue.

4. **Load full context before changing state:** fetch the full issue with relations and latest comments, then apply the shared contract's premise, dependency, approval and ownership checks. Revalidate eligibility after the user's selection; if held, record the shared hold disposition and do not start implementation. Summarize the eligible issue's description.
   - If the user instead names merged work awaiting acceptance, route directly to its full criteria/shared verification session. Do not pass it through the implementation Start-working action below; acceptance work stays under the shared disposition contract.
   - **OpenSpec-backed issues take priority.** If the description references an `openspec/changes/<id>/` path (or names an OpenSpec change), extract `<id>` and route to the pipeline: default `/opsx:ship <id>` (full pipeline), or `/opsx:apply <id>` for implement-only. If the issue names an exact command, prefer it verbatim.
   - Otherwise match the work type to a skill: walk/audit → `qa-feature`; DB migration → `db-push`; browser automation → `playwright-cli`; bug investigation → `debugging-patterns`.

5. **Present action options:**
   - **If OpenSpec-backed**: "This is an OpenSpec change (`<id>`). Would you like to:\n\n1. Ship it end-to-end (`/opsx:ship <id>`)\n2. Implement only (`/opsx:apply <id>`)\n3. Work on it directly\n4. Put it back and browse other todos"
   - **Else if a skill matches**: "This looks like [domain] work. Would you like to:\n\n1. Invoke [skill-name] and start\n2. Work on it directly\n3. Brainstorm approach first\n4. Put it back and browse other todos"
   - **If no match**: "Would you like to:\n\n1. Start working on it\n2. Brainstorm approach first\n3. Put it back and browse other todos"
     Wait for the response.

6. **Handle the choice:**
   - **Ship / Implement**: retain root ownership of the issue while invoking the opsx command. Follow the shared **Lifecycle owner** protocol before implementation, on pauses, after merge and after archive; the phase skills do not own implicit Linear updates. Do not assume archive or merge proves every criterion.
   - **Invoke skill / Start working**: move the issue to **In Progress** (update-issue `state`), then begin.
   - **Brainstorm**: leave the issue state unchanged; invoke `/brainstorm` with the issue description as argument.
   - **Put it back**: leave state unchanged; return to step 3 to redisplay the list.

**Completion is tracked in Linear** — fresh-read the full issue and apply the disposition/evidence contract in `docs/agents/issue-tracker.md`. An automated status is not acceptance proof; reconcile the actual state and pending criteria. There is no sprint file to edit.
