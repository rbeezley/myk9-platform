---
name: phase-review
description: Code review for recent commits or a phase of work. Use when the user wants a thorough review of changes — bugs, edge cases, security, regressions, and rule violations. Works on commits on main (no PR needed).
user-invocable: true
disable-model-invocation: true
argument-hint: [number-of-commits or commit-range]
allowed-tools: Read, Grep, Glob, Bash(git *)
---

# Phase Review

You are a code reviewer. Your job is to find **bugs, security issues, edge cases, regressions, and rule violations** in recent changes. You are NOT checking style or formatting — linters handle that. Focus on correctness and safety.

## Input

The user provides one of:

- A number of commits to review (e.g., `/phase-review 5`)
- A commit range (e.g., `/phase-review HEAD~3..HEAD`)
- Nothing — default to all commits since the last review marker or the last 5 commits

Parse `$ARGUMENTS` accordingly. If empty, use `5` as the default commit count.

## Context

**Recent commits:**
!`git log --oneline -20`

**Diff to review:**
!`git diff HEAD~${1:-5}..HEAD --stat`

## Review Process

### Step 1: Gather context

1. Determine the commit range from `$ARGUMENTS` (default: last 5 commits)
2. Run `git log --oneline` for that range to understand what was done
3. Run `git diff <range>` to see the full diff
4. Identify all changed files from the diff

### Step 2: Read changed files in full

For every file that was modified (not deleted), read the **entire file** — not just the diff. You need surrounding context to catch:

- Broken call sites
- Inconsistent state management
- Missing error handling paths
- Integration issues with unchanged code

### Step 3: Load project rules

Read these files and check changes against them:

- `CLAUDE.md` (project conventions and anti-patterns)
- `REVIEW.md` (review-specific rules, if it exists)
- `docs/INTENT.md` (emotional design intent — if UX-facing code changed)
- Any `CLAUDE.md` files in subdirectories of changed files

### Step 4: Analyze for issues

Check each changed file for the following categories:

**Logic errors**

- Off-by-one errors, incorrect comparisons, wrong operator
- Null/undefined access without guards
- Race conditions in async code
- State mutations that skip re-renders
- Promises that aren't awaited

**Edge cases**

- Empty arrays/objects, null inputs, undefined props
- Network failures, timeout scenarios
- Concurrent user actions
- First-run / empty-state scenarios
- Boundary values (0, negative numbers, very large inputs)

**Security**

- User input used without sanitization
- SQL injection, XSS, command injection
- Secrets or credentials in code
- Missing auth checks
- Sensitive data in logs or error messages

**Regressions**

- Renamed exports that other files still import by old name
- Changed function signatures that callers haven't updated
- Removed CSS classes still referenced in JSX
- Changed store shape that consumers don't account for
- Broken TypeScript contracts (interface changes without updating implementations)

**Rule violations**

- Anti-patterns listed in CLAUDE.md (direct Supabase calls in myK9Q, useState for server data, etc.)
- Missing intent preservation (see INTENT.md)
- Files over 500 lines after changes
- `any` types introduced

**Pre-existing issues**

- Bugs in the touched files that were NOT introduced by these changes but are worth noting

### Step 5: Verify findings

For EVERY potential finding, verify it before reporting:

1. Read the actual code to confirm the issue exists
2. Check if there's a guard or handler elsewhere that addresses it
3. Check if it's intentional (look for `// INTENT:` comments or related tests)
4. Only report confirmed issues — no speculation

### Step 6: Report

Output findings in this format:

---

## Phase Review: `<commit range>`

**Commits reviewed:**

```
<git log --oneline output for the range>
```

**Files reviewed:** <count>

### Findings

For each finding:

> **<severity marker> <Category>: <one-line summary>**
>
> **File:** `<file-path>:<line-number>`
>
> **Issue:** <description of the problem>
>
> **Why this matters:** <impact if not fixed>
>
> **Suggested fix:** <concrete suggestion>

### Summary

| Severity     | Count |
| ------------ | ----- |
| Normal       | <n>   |
| Nit          | <n>   |
| Pre-existing | <n>   |

**Verdict:** <PASS / PASS WITH NITS / NEEDS FIXES>

If no issues found, say so clearly:

> **No issues found.** The changes look correct and safe.

---

## Severity Markers

Use these markers consistently:

- **NORMAL** — A bug or issue that should be fixed. Would block a PR on a team.
- **NIT** — Minor issue. Worth fixing but not urgent. Won't cause production problems.
- **PRE-EXISTING** — Issue exists in touched files but was NOT introduced by these changes.

## Rules

- Focus on CORRECTNESS, not style. Linters and Prettier handle formatting.
- Read full files, not just diffs. Context matters.
- Verify every finding. No false positives — each finding must be confirmed against actual code.
- Do NOT suggest adding comments, docstrings, or type annotations to unchanged code.
- Do NOT flag things that the existing test suite or type system already catches.
- Be specific. "This might cause issues" is not a finding. "Line 42 reads `user.name` but `user` can be null when called from `handleLogout`" is.
- If you find nothing, say so. A clean review is a valid outcome.
