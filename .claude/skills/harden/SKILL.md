---
name: harden
description: Adversarial stress-testing of recently changed code. Three parallel agents try to break your code by finding edge cases, state corruption, and security holes. Scores findings and auto-fixes. Use after /simplify and before /commit.
user-invocable: true
argument-hint: [file-or-directory]
allowed-tools: Read, Grep, Glob, Edit, Write, Bash(git *), Agent
---

# Harden

Adversarial code hardening inspired by GAN-style generator/evaluator separation. Your job is NOT to review code quality or style — `/simplify` handles that. Your job is to **try to break the code** and fix what you find.

**Core principle:** "Do NOT be generous. Your natural inclination will be to praise the work. Resist this. Assume the code has bugs. Find them."

## Input

- `$ARGUMENTS` contains a file or directory path → scope the review to that path
- `$ARGUMENTS` is empty → review all uncommitted changes via `git diff` (staged + unstaged)

## Phase 1: Identify Scope

```bash
# If no arguments, get the diff
git diff HEAD
# Also check for new untracked files
git status --short
```

If there are no changes and no arguments were provided, tell the user there's nothing to harden and stop.

Collect the full list of changed files and their contents. Read each changed file in full — you need complete context, not just the diff hunks.

## Phase 2: Launch Three Adversarial Agents in Parallel

Use the Agent tool to launch all three agents concurrently in a single message. Pass each agent:

- The full diff
- The full content of every changed file
- The file paths involved
- Relevant context from surrounding code (imports, types, interfaces used)

Each agent MUST be given this system framing at the top of its prompt:

> You are an adversarial reviewer. Your job is to BREAK this code — find inputs, states, and sequences that cause failures. Do not praise what works. Do not note "minor" issues politely. If something can fail, it WILL fail in production. Find it.

### Agent 1: Edge Case Attacker

Hunt for inputs and conditions the code doesn't handle:

1. **Null/undefined paths**: What happens when optional data is missing? Follow the chain — if a parent can be null, every child access is suspect.
2. **Empty collections**: Empty arrays, empty strings, empty objects, empty query results. Does the code guard `.length`, `.map()`, array indexing, `.find()` returning undefined?
3. **Boundary values**: Zero, negative numbers, MAX_SAFE_INTEGER, extremely long strings, special characters in user input, dates at epoch/far-future.
4. **Missing database rows**: What if a foreign key references a deleted record? What if a query returns 0 rows when the code assumes at least 1?
5. **Type coercion traps**: Loose equality, falsy values (0, "", false, null) treated as missing, parseInt edge cases.
6. **Concurrent users**: Two users performing the same action simultaneously — does the code handle it or silently corrupt?

For each finding, provide:

- **File and line number**
- **The specific input/state that triggers the bug**
- **What happens** (crash, wrong result, data corruption, silent failure)
- **Severity**: critical (data loss/corruption), high (crash/broken feature), medium (wrong output), low (cosmetic/unlikely)

### Agent 2: State Corruption Hunter

Hunt for state management bugs — these are the hardest to reproduce and debug:

1. **Stale closures**: Event handlers, callbacks, or effects that capture state variables and use stale values. Check useEffect dependencies, setTimeout/setInterval callbacks, Promise `.then()` chains.
2. **Race conditions**: Async operations that can resolve out of order. Component unmounts before async completes. Multiple rapid state updates that interleave.
3. **Zustand store inconsistencies**: Partial updates that leave the store in an invalid intermediate state. Subscribers seeing half-applied changes. Missing cleanup on store reset.
4. **Optimistic update rollback**: If an optimistic update is applied and the server call fails — does the rollback actually restore the correct previous state, or does it clobber concurrent changes?
5. **Subscription leaks**: Supabase realtime subscriptions, event listeners, intervals, or observers that are set up but never cleaned up on unmount/navigation.
6. **Re-render cascades**: State updates that trigger unnecessary re-renders in unrelated components. Zustand selectors that return new object references on every call.
7. **Effect dependency bugs**: Missing dependencies that cause stale data, or overly broad dependencies that cause infinite loops.

For each finding, provide:

- **File and line number**
- **The sequence of events that triggers the bug** (step by step)
- **What happens** (stale UI, infinite loop, memory leak, data corruption)
- **Severity**: critical/high/medium/low

### Agent 3: Security & Data Integrity Attacker

Hunt for security vulnerabilities and data integrity violations:

1. **RLS bypass paths**: Does the code assume RLS will protect it, but the query runs in a context where RLS is bypassed (service role key, edge function without auth check)?
2. **Privilege escalation**: Can a user with role X perform an action intended for role Y? Check that role/permission guards exist on both the UI (hiding buttons) AND the data layer (RLS/RPC).
3. **Input injection**: User-provided strings used in `.eq()`, `.like()`, template literals, `innerHTML`, or URL construction without sanitization.
4. **Unvalidated foreign keys**: Can a user reference another user's data by guessing/manipulating IDs in the request?
5. **Timing attacks**: Operations where checking permission and performing the action are separate calls — can state change between the check and the action?
6. **Data integrity**: Can the code leave the database in an inconsistent state? Missing transactions around multi-table writes. Partial failures that leave orphaned records.
7. **Information leakage**: Error messages that expose internal details (stack traces, table names, query structures). Console.log statements with sensitive data.

For each finding, provide:

- **File and line number**
- **The attack vector** (what a malicious or unlucky user does)
- **What they gain** (unauthorized data, broken invariant, crashed app)
- **Severity**: critical/high/medium/low

## Phase 3: Score and Triage

Wait for all three agents to complete. Aggregate findings into a single table:

```
| # | Severity | Agent | File:Line | Finding | Auto-fixable? |
|---|----------|-------|-----------|---------|---------------|
```

**Pass/fail threshold:**

- Any **critical** finding → FAIL — must fix before proceeding
- 3+ **high** findings → FAIL — must fix before proceeding
- High/medium findings → fix what's auto-fixable, note the rest
- Low findings → note them, don't fix unless trivial

Report the score:

- **PASS** — no critical, fewer than 3 high, all auto-fixable issues addressed
- **FAIL** — critical or 3+ high findings remain after auto-fix

## Phase 4: Auto-Fix

Fix all critical and high findings directly. For medium findings, fix if the fix is straightforward (< 10 lines changed). For low findings, skip unless trivial.

For each fix:

- Make the minimal change that addresses the vulnerability
- Do not refactor surrounding code
- Do not add comments explaining the fix (the code should be self-evident)
- Do not add defensive code for theoretical scenarios that the finding didn't identify

## Phase 5: Summary

Output a brief summary:

```
## Harden Results: [PASS|FAIL]

**Findings:** X critical, Y high, Z medium, W low
**Fixed:** N issues auto-fixed
**Remaining:** List any unfixed high/medium findings that need manual attention

### What was fixed
- [file:line] Brief description of fix
- ...

### Manual attention needed (if any)
- [file:line] Why this needs human judgment
- ...
```

If FAIL, tell the user what needs to be addressed before committing.
