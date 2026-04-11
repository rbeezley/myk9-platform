---
description: List outstanding todos and select one to work on
allowed-tools:
  - Read
  - Edit
  - Glob
---

# Check Todos

## Instructions

1. Read TO-DOS.md in the working directory (if doesn't exist, say "No outstanding todos" and exit)

2. Parse and display todos grouped by North Star phase:
   - Organize items under their parent `##` section headings (Pre-Work, Phase 0, Phase 1, Phase 2, Phase 3, Housekeeping)
   - Within **Pre-Work** and **Housekeeping**: list each `- **` item individually
   - Within **North Star Phases** (Phase 0–3): list each phase as a single item (the `- [ ] **Phase N…**` line), not the sub-items inside it
   - Within **Testing Findings**: do NOT list individual sub-items — instead show a single line: "Testing Findings (NN items, triage in Phase 1)" where NN is the count of `- **` items in that section
   - Skip the **Strategic Plans** section (it's context, not a todo)
   - If no items remain, say "No outstanding todos" and exit
   - Display compact numbered list showing:
     - Section heading (bold, not numbered)
     - Number (for selection), bold title, and date
   - Prompt: "Reply with the number of the todo you'd like to work on."
   - Wait for user to reply with a number

3. Load full context for selected todo:
   - Display complete line with all fields (Problem, Files, Solution)
   - Display h2 heading (topic + date) for additional context
   - Read and briefly summarize relevant files mentioned

4. Check for established workflows:
   - Read CLAUDE.md (if exists) to understand project-specific workflows and rules
   - Look for `.claude/skills/` directory
   - Match file paths in todo to domain patterns (`plugins/` → plugin workflow, `mcp-servers/` → MCP workflow)
   - Check CLAUDE.md for explicit workflow requirements for this type of work

5. Present action options to user:
   - **If matching skill/workflow found**: "This looks like [domain] work. Would you like to:\n\n1. Invoke [skill-name] skill and start\n2. Work on it directly\n3. Brainstorm approach first\n4. Put it back and browse other todos\n\nReply with the number of your choice."
   - **If no workflow match**: "Would you like to:\n\n1. Start working on it\n2. Brainstorm approach first\n3. Put it back and browse other todos\n\nReply with the number of your choice."
   - Wait for user response

6. Handle user choice:
   - **Option "Invoke skill" or "Start working"**: Remove todo from TO-DOS.md (and h2 heading if section becomes empty), then begin work (invoke skill if applicable, or proceed directly)
   - **Option "Brainstorm approach"**: Keep todo in file, invoke `/brainstorm` with the todo description as argument
   - **Option "Put it back"**: Keep todo in file, return to step 2 to display the full list again

## Display Format

```
Outstanding Todos:

**Pre-Work (execute now)**
1. Phase 2 Reports (16 total) (2026-04-06)
2. Build AKC XML results export (2026-04-09)

**Fall 2026 Stabilization Phases**
3. Phase 0 — Write Down the Truth (2026-04-11)
4. Phase 1 — Quiet the Noise (2026-04-11)
5. Phase 2 — Walk the Golden Paths (2026-04-11)
6. Phase 3 — Real-User Testing (2026-04-11)

**Testing Findings**
   22 items — triage in Phase 1 (do not work individually before Phase 0)

**Pre-Launch Housekeeping**
7. CI-gated Vercel deploys
8. Require PRs to merge into main

Reply with the number of the todo you'd like to work on.
```
