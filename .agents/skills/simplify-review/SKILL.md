---
name: simplify-review
description: Find low-risk code simplification, reuse, typing, and maintainability improvements in a diff or recent commit. Use when reviewing committed or uncommitted changes for cleanup opportunities, magic strings, duplicated helpers, stale comments, type tightening, unnecessary assertions, small performance-neutral clarity fixes, or when the user mentions simplify, code cleanup review, or code improvements.
---

# Simplify Review

Review a diff, recent commit, branch, or focused file set for small, behavior-preserving improvements. Default to **review only**. Do not edit files unless the user explicitly asks to apply fixes.

## Quick Start

1. Identify the review target:
   - User-specified commit/range: `git diff <range>`
   - Recent commit: `git show --stat --oneline --find-renames HEAD`
   - Uncommitted work: `git status --short` and `git diff --stat`
2. Read the changed code and nearby definitions. Verify names/types against actual schemas/interfaces.
3. Report findings grouped by confidence and value.

## Review Lens

Look for improvements that reduce complexity without changing behavior:

- Existing utility duplicated inline, especially validation, formatting, date, ID, enum, and normalization helpers.
- Magic strings or repeated defaults that should be shared constants.
- Types that are wider than necessary, such as `string` where a local union type exists.
- Redundant type syntax, such as `field?: T | undefined`.
- Non-null assertions (`!`) that can be replaced with safer control flow or a fallback.
- Stale comments/JSDoc that no longer match the function behavior.
- Narrating comments that repeat obvious code.
- Small cache, mutation, or allocation choices that add complexity without meaningful benefit.
- Local helper names or comments that still describe an older responsibility.
- Repeated option arrays that could be derived from a typed source of truth while preserving order.
- Tests that assert old implementation details instead of current behavior or public contract.

## Guardrails

- Prefer behavior-preserving changes only.
- Do not suggest broad refactors, new abstractions, or architecture moves unless they are clearly smaller than the current code.
- Do not optimize tiny UI arrays or small object copies unless clarity also improves.
- Do not replace clear code with clever code.
- Treat “reuse existing helper” as good only after verifying the helper has the same semantics.
- Preserve domain intent and `// INTENT:` comments.
- If a suggestion risks behavior change, place it under “Needs Human Judgment”.

## Output Format

Use this structure:

```markdown
**Definitely Fix**
- [file:line] Finding. Why it matters. Suggested change.

**Maybe**
- [file:line] Finding. Tradeoff.

**Do Not Bother**
- Suggested item and why it is not worth changing.

**Needs Human Judgment**
- Questionable item and what decision is needed.
```

If there are no meaningful findings, say so and name any residual risk or files not reviewed.

## Apply Mode

Only apply changes when the user asks. In apply mode:

1. Apply only **Definitely Fix** items unless the user selected more.
2. Keep the follow-up commit focused.
3. Add or update tests only when the cleanup touches behavior, type contracts, or previously failing/stale tests.
4. Run the narrowest relevant tests plus typecheck/lint when TypeScript files changed.
5. Report any skipped suggestions and why.

## Examples

- Inline UUID regex but repo has `isValidUUID`: recommend reusing the helper after confirming semantics match.
- `style: string` but `PremiumStyle` exists: recommend tightening the type.
- `style ?? 'monogram'` appears in several files: recommend a `DEFAULT_PREMIUM_STYLE` constant.
- A comment says “official defaults” but the function also normalizes style: recommend updating JSDoc.
- Mapping with object spreads over a tiny list: usually “Do Not Bother” unless it clarifies correctness.
