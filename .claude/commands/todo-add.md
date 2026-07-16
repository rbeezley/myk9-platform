---
description: Create a Linear issue (MyK9-platform) with context from the conversation
argument-hint: <todo-description> (optional - infers from conversation if omitted)
---

# Add Todo (Linear)

`OPEN-TODOS.md` / `TO-DOS.md` were retired on 2026-07-16 — **Linear is the single source of truth.** Workspace `myk9-platform`, team **MyK9-platform**, issue prefix `MYK9-*`. See [`docs/agents/issue-tracker.md`](docs/agents/issue-tracker.md).

## Instructions

1. **Ensure the Linear MCP tools are loaded.** They may be deferred — discover them with ToolSearch (e.g. query `linear issue`). You need a create/update-issue tool and a list-issues tool for the MyK9-platform team.

2. **Extract the todo content:**
   - **With $ARGUMENTS**: use as the title/focus.
   - **Without $ARGUMENTS**: analyze the recent conversation for the specific task, relevant file paths, line numbers, error messages, and root cause if identified.

3. **Check for duplicates:** list open issues in the MyK9-platform team (states `Backlog` / `Todo` / `In Progress`) and search titles + descriptions for overlapping scope. If a near-duplicate exists, ask the user:
   "A similar issue already exists: [identifier] [title]. Would you like to:\n\n1. Skip (keep existing)\n2. Update the existing issue\n3. Create anyway as a separate issue\n\nReply with the number of your choice."
   Wait for the response.

4. **Create the issue** in team **MyK9-platform** with a self-contained description (assume the reader has none of this conversation's context):
   - **Title**: `[Action verb] [Component] — [concise summary]`
   - **Description** (Markdown): `## Problem` (what's wrong / why needed) · `## Scope / Files` (paths with line numbers like `path/to/file.ts:123-145`) · `## Done when` (acceptance criteria).
   - **Priority**: `1` Urgent / `2` High / `3` Medium / `4` Low by launch-relevance (default `3`).
   - **State**: `Backlog` unless the work is clearly active now.
   - **Label**: `Bug` or `Improvement` as appropriate.

5. **Confirm and offer to continue:** report the created issue's identifier + URL ("✓ Created MYK9-NN — <url>"), then ask whether to continue with the original work.
