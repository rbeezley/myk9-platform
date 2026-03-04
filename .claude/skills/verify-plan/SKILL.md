---
name: verify-plan
description: Use when you've produced an implementation plan and need to verify it covers all requirements, when a plan feels complete, or when asked to check plan alignment before implementation
---

# Verify Plan

## Overview

Plans drift from requirements. Verify coverage systematically with citations before implementing. If you can't point to where a requirement is addressed, it's not covered.

## When to Use

- After producing any implementation plan (3+ steps or multi-file changes)
- Before exiting plan mode
- When plan feels "complete" (that's when gaps hide)
- When user asks "does this cover everything?"

## The Technique

### Step 1: Extract Requirements

Re-read the original request. List each major requirement, including:

- Explicit asks
- Implied constraints
- Success criteria
- Edge cases mentioned

### Step 2: Stress-Test Against Gap Categories

Before auditing, systematically challenge the plan against these categories. For each one, ask: "What happens when this goes wrong?" If the plan doesn't answer that question, it's a gap.

| Category                      | What to look for                                                                          |
| ----------------------------- | ----------------------------------------------------------------------------------------- |
| **Error handling**            | What happens when external calls fail? Network timeouts? Invalid input? Partial failures? |
| **Security**                  | Auth/authz gaps, input validation, secrets management, injection vectors                  |
| **Rollback / recovery**       | Can the change be reverted? What if it fails halfway? Data migration rollback?            |
| **Operational concerns**      | Deployment steps, environment variables, monitoring, alerting, logging                    |
| **Testing strategy**          | Unit, integration, E2E coverage? How do you verify correctness?                           |
| **Edge cases**                | Empty states, concurrent access, race conditions, boundary values                         |
| **Migration / compatibility** | Backwards compatibility, data migration, feature flags, deprecation timeline              |
| **Performance**               | N+1 queries, missing indexes, large payload handling, caching strategy                    |

Not every category applies to every plan. Skip irrelevant ones. But genuinely consider each — don't just scan the list and move on.

### Step 3: Audit with Citations

For each requirement (explicit + those surfaced in Step 2), mark status and cite evidence:

| Requirement   | Status      | Evidence                          |
| ------------- | ----------- | --------------------------------- |
| [requirement] | **Covered** | [section name or quote from plan] |
| [requirement] | **Partial** | [what's covered + what's missing] |
| [requirement] | **Missing** | —                                 |

**Rules:**

- No citation = Partial or Missing (not Covered)
- "Implied" or "will figure out later" = Partial at best
- **"Covered" means the plan addresses both the happy path AND how it fails.** If the plan says "call the API" but doesn't say what happens when the API is down, that's Partial.
- Be honest about gaps

**Calibration check:** If your audit shows 100% coverage with zero Partial or Missing items, pause. No first-draft plan is perfect. Re-read the gap categories from Step 2 and push harder. A 100% score on a first pass almost always means the bar for "Covered" is too low.

### Step 4: Score and Identify Gaps

**Coverage score (0-100):**

- Weight requirements by implementation impact
- Partial = 50% credit
- Missing = 0% credit

**Top gaps:** List missing/partial items, prioritized by:

1. Blocking issues (can't proceed without)
2. High-impact features
3. Edge cases and error handling

### Step 5: Auto-Patch

If coverage < 100%, produce patched plan immediately:

- **Add** sections for missing requirements
- **Expand** sections for partial coverage
- **Preserve** original structure
- **Mark** additions with `[ADDED]` or `[EXPANDED]`

Do not ask permission to patch. Do not rewrite from scratch.

## Output Format

```markdown
## Plan Verification

### Requirements Audit

| Requirement | Status | Evidence |
| ----------- | ------ | -------- |
| ...         | ...    | ...      |

### Coverage: X/100

[1-2 sentence rationale]

### Top Gaps

1. [gap] — [impact]
2. ...

### Patched Plan

[Full plan with additions marked]
```

## Quick Reference

| Step        | Action                                      | Output                 |
| ----------- | ------------------------------------------- | ---------------------- |
| Extract     | List requirements from original request     | Bullet list            |
| Stress-test | Challenge plan against gap categories       | New requirements found |
| Audit       | Mark Covered/Partial/Missing with citations | Table                  |
| Score       | Weight by impact, calculate coverage        | 0-100 + rationale      |
| Patch       | Add/expand sections, preserve structure     | Updated plan           |

## Common Mistakes

| Mistake                       | Fix                                                             |
| ----------------------------- | --------------------------------------------------------------- |
| "Covered" without citation    | Must quote section or text                                      |
| Skipping implied requirements | Re-read request for constraints                                 |
| Rewriting entire plan         | Add/expand only, preserve structure                             |
| Asking "should I patch?"      | Auto-patch, no permission needed                                |
| Scoring before auditing       | Audit first, score derives from audit                           |
| 100% on first pass            | Push harder — check gap categories, raise the bar for "Covered" |
| Only checking happy path      | "Covered" means failure modes are addressed too                 |

## Red Flags — You're Doing It Wrong

- Saying "the plan covers everything" without a table
- Coverage score without per-requirement audit
- Patching by rewriting from scratch
- Marking "Covered" for something you can't quote
- Skipping patch because "gaps are minor"
- Scoring 100/100 on the first pass without pausing to reconsider

All gaps get patched. No exceptions.
