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

### Step 2: Audit with Citations

For each requirement, mark status and cite evidence:

| Requirement | Status | Evidence |
|-------------|--------|----------|
| [requirement] | **Covered** | [section name or quote from plan] |
| [requirement] | **Partial** | [what's covered + what's missing] |
| [requirement] | **Missing** | — |

**Rules:**
- No citation = Partial or Missing (not Covered)
- "Implied" or "will figure out later" = Partial at best
- Be honest about gaps

### Step 3: Score and Identify Gaps

**Coverage score (0-100):**
- Weight requirements by implementation impact
- Partial = 50% credit
- Missing = 0% credit

**Top gaps:** List missing/partial items, prioritized by:
1. Blocking issues (can't proceed without)
2. High-impact features
3. Edge cases and error handling

### Step 4: Auto-Patch

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
|-------------|--------|----------|
| ... | ... | ... |

### Coverage: X/100
[1-2 sentence rationale]

### Top Gaps
1. [gap] — [impact]
2. ...

### Patched Plan
[Full plan with additions marked]
```

## Quick Reference

| Step | Action | Output |
|------|--------|--------|
| Extract | List requirements from original request | Bullet list |
| Audit | Mark Covered/Partial/Missing with citations | Table |
| Score | Weight by impact, calculate coverage | 0-100 + rationale |
| Patch | Add/expand sections, preserve structure | Updated plan |

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| "Covered" without citation | Must quote section or text |
| Skipping implied requirements | Re-read request for constraints |
| Rewriting entire plan | Add/expand only, preserve structure |
| Asking "should I patch?" | Auto-patch, no permission needed |
| Scoring before auditing | Audit first, score derives from audit |

## Red Flags — You're Doing It Wrong

- Saying "the plan covers everything" without a table
- Coverage score without per-requirement audit
- Patching by rewriting from scratch
- Marking "Covered" for something you can't quote
- Skipping patch because "gaps are minor"

All gaps get patched. No exceptions.
