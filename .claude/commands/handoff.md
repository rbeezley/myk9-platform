---
name: handoff
description: Generate a handoff document with resume prompt for continuing work in a fresh session
model: sonnet
allowed-tools:
  - Read
  - Write
  - Glob
  - Grep
  - Bash
---

Generate a comprehensive handoff document so a fresh AI instance can resume this project exactly where we left off — with no guessing, no hallucinating, and no re-discovery.

Write this as if briefing a sharp senior colleague who has never seen this conversation. Be precise. Be concise. Preserve reasoning. Skip filler.

**Do NOT duplicate project-level context** (architecture, tech stack, naming conventions) that already lives in CLAUDE.md or memory files — those are loaded automatically. Focus on **session-specific work**.

## Instructions

Write `handoff.md` to the current working directory using the template below. After writing the file, output the exact absolute file path on a line by itself so the user can immediately locate it.

Adapt detail level to the task type (coding, research, analysis, writing, config) but maintain comprehensive coverage across all sections.

## Output Template

Use this exact structure:

```markdown
# Project Handoff Document

## Generated: [current date and time]

---

### 1. Original Task

[What was initially requested — be precise about scope. Not new scope or side tasks.]

### 2. Work Completed

[Everything accomplished in detail:]

- Artifacts created/modified with **file paths and line numbers**
- Specific changes made (code, content, config) with reasoning
- Commands run, APIs called, tools used
- Key discoveries, insights, or findings
- Decisions made and **why** (include tradeoffs considered)
- Side tasks completed

### 3. Work Remaining

[Specific, actionable steps:]

- Tasks with precise file paths, locations, or references
- Dependencies and ordering requirements
- Validation or verification steps needed
- Expected outcomes for each step

### 4. Attempted Approaches

[Everything tried, including failures:]

- Approaches that didn't work and **why they failed**
- Errors encountered, blockers hit, limitations discovered
- Dead ends to avoid repeating
- Alternative approaches considered but not pursued

### 5. Critical Context & Guardrails

#### Key Decisions & Trade-offs

[Decisions made and the reasoning behind them — this prevents the next session from undoing your work]

#### Do Not Touch

[Explicit list of stable code, systems, or patterns that must NOT be refactored or redesigned without being asked. Include the reason each item is protected.]

#### Known Risks & Edge Cases

[Gotchas, non-obvious behaviors, fragile areas, assumptions that could be wrong]

### 6. Current State

| Deliverable | Status                               | Details                      |
| ----------- | ------------------------------------ | ---------------------------- |
| [item]      | COMPLETE / IN PROGRESS / NOT STARTED | [commit hash, branch, notes] |

- **What's committed/finalized:** [list]
- **What's temporary/draft:** [list]
- **Open questions:** [list]
- **Git state:** [branch, clean/dirty, unpushed commits]

### 7. Confidence Ratings

| Section              | Confidence   | Notes        |
| -------------------- | ------------ | ------------ |
| Original Task        | ✅ / ⚠️ / ❓ | [brief note] |
| Work Completed       | ✅ / ⚠️ / ❓ | [brief note] |
| Work Remaining       | ✅ / ⚠️ / ❓ | [brief note] |
| Attempted Approaches | ✅ / ⚠️ / ❓ | [brief note] |
| Critical Context     | ✅ / ⚠️ / ❓ | [brief note] |
| Current State        | ✅ / ⚠️ / ❓ | [brief note] |

Legend: ✅ HIGH — verified or built this session | ⚠️ MEDIUM — carried forward, not re-verified | ❓ LOW — assumed or inferred, should be validated

### 8. Resume Prompt

Copy-paste the block below into a new conversation to continue this work:
```

After the template sections above, generate a **Resume Prompt** inside a fenced code block (use triple backticks with "text" language tag). The Resume Prompt must be fully self-contained and instruct the next AI to:

1. Read the `handoff.md` file in the current working directory before doing anything
2. Check for a USER DIRECTIVE below
3. Summarize its understanding of the current project state in 3-5 sentences
4. Confirm the next action it will take
5. Ask clarification questions ONLY if something blocks execution
6. Then begin working

End the Resume Prompt with this USER DIRECTIVE section:

```
---
USER DIRECTIVE:
$ARGUMENTS
---
If the USER DIRECTIVE contains instructions, treat that as your immediate first action after confirming understanding.
If the USER DIRECTIVE is empty, analyze the project state, propose the most strategically appropriate next action with brief reasoning, and wait for user confirmation before proceeding.
```

Where `$ARGUMENTS` is replaced with whatever text the user typed after `/handoff`. If the user typed nothing after the command, leave the USER DIRECTIVE line as just `$ARGUMENTS` (the next AI will treat it as empty).
