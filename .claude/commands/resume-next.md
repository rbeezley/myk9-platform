---
name: resume-next
description: Resume work from where the last session left off by reading memory and handoff documents
allowed-tools:
  - Read
  - Glob
  - Grep
  - Bash
---

Pick up where the last session left off. Follow these steps:

## 1. Read Memory State

Read `~/.claude/projects/-Users-richardbeezley-AI-Projects-myk9-platform/memory/MEMORY.md` (already loaded in system prompt, but re-read for latest state). Check the "Last Completed Task" and "Next Task" sections.

## 2. Check for Handoff Document

Check if `save-next.md` exists in the project root. If it does:
- Read it thoroughly — it contains detailed context from the previous session
- Use its `work_remaining` section as the primary task list
- Note any `attempted_approaches` to avoid repeating dead ends
- Note any `critical_context` for gotchas or constraints

If it does not exist, fall back to the "Next Task" section in MEMORY.md.

## 3. Check Current State

Run `git log --oneline -5` and `git status` to confirm the repo state matches expectations.

## 4. Present Summary

Present a concise summary to the user:
- **Last session:** What was completed
- **Current state:** Branch, any uncommitted changes
- **Next up:** The proposed next task(s), with brief rationale
- **Blockers:** Any known blockers or dependencies

Ask the user which task they'd like to tackle, or if they have something else in mind.
