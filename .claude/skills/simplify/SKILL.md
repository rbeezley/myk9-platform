---
name: simplify
description: Constructive cleanup pass on recently changed code. Three parallel agents review for efficiency, quality, and reuse. Auto-fixes safe wins (unused imports, dead code, trivial dupes); flags judgment calls. Use after implementation and before /harden or /commit.
user-invocable: true
argument-hint: [file-or-directory]
allowed-tools: Read, Grep, Glob, Edit, Write, Bash(git *), Bash(rg *), Agent
---

# Simplify

Constructive code review inspired by the original Claude Code built-in `/simplify` command. Your job is NOT to find bugs (`/harden` does that) — your job is to make the code **smaller, clearer, and more reusable** without changing behavior.

**Core principle:** "The diff should land at the size and complexity the task requires — no more. If a line, file, helper, or abstraction doesn't earn its keep, remove or inline it. When in doubt, propose rather than apply."

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

If there are no changes and no arguments were provided, tell the user there's nothing to simplify and stop.

Collect the full list of changed files and their contents. Read each changed file in full — duplication and reuse opportunities only surface when you see whole modules, not hunks.

Also gather **context for the reuse agent**: skim sibling files in the same feature directory and any shared utility directories the changed files import from (`packages/*/src`, `apps/*/src/utils`, `apps/*/src/features/*/hooks`, etc.).

## Phase 2: Launch Three Constructive Agents in Parallel

Use the Agent tool to launch all three agents concurrently in a single message. Pass each agent:

- The full diff
- The full content of every changed file
- The file paths involved
- For Agent 3: a list of candidate shared utility/helper paths to grep

Each agent MUST be given this system framing at the top of its prompt:

> You are a constructive reviewer. Your job is to make this diff smaller, clearer, and more reusable WITHOUT changing behavior. Do not propose bug fixes — `/harden` covers that. Do not propose stylistic preferences with no concrete payoff. Every finding must name a specific reduction: lines removed, complexity dropped, or duplication eliminated. If a finding is a judgment call, mark it `propose-only` so the user decides.

### Agent 1: Efficiency Auditor

Hunt for wasted work and unnecessary cost the diff added:

1. **Redundant computation**: Same expression computed multiple times in one render/function where a local const would do. Repeated `.filter().map()` chains that could be one pass.
2. **Unnecessary re-renders (React)**: Inline object/array literals or arrow functions passed as props or to dependency arrays. Selectors returning new references on every call. Missing `useMemo`/`useCallback` ONLY where there's measurable cost (not as a reflex).
3. **N+1 queries**: A `.map()` over rows that does a Supabase call per row. A `useQuery` inside a `.map()`.
4. **Sequential awaits that could be parallel**: `await a(); await b();` where `a` and `b` don't depend on each other → `Promise.all`.
5. **Over-fetching**: `select('*')` where only 2 columns are read. Realtime subscriptions on tables where polling would do.
6. **Unbounded loops/effects**: `useEffect` with no dependency array. Recursive setState inside render. Loops over user-controlled data with no size cap.
7. **Bundle bloat**: Importing the entire library when a single function is needed (`import _ from 'lodash'` vs `import debounce from 'lodash/debounce'`). New heavy deps added for trivial use cases.

For each finding, provide:

- **File and line number**
- **Concrete cost** (extra renders, extra DB round-trips, extra KB shipped, extra ms blocked)
- **Suggested fix** with the exact code change
- **Severity**: critical (perf regression on hot path), high (clear waste), medium (cleanup), low (micro-opt)
- **Auto-fixable?**: yes for mechanical changes (parallel awaits, dead imports), no for changes that need codebase-wide testing (selector refactors, query restructuring)

### Agent 2: Quality Critic

Hunt for clarity and maintainability debt the diff added:

1. **Dead code**: Unused imports, exports, variables, props, parameters. Functions defined but never called. Branches the diff orphaned (e.g., `if (oldFlag)` after `oldFlag` removal).
2. **Stale conditionals**: `if (x)` where `x` is now always truthy/falsy after this branch's changes. Defensive checks for cases the type system rules out.
3. **File size**: Any changed file now exceeding 500 lines (per CLAUDE.md). Identify natural extraction boundaries (types, constants, sub-components, hooks).
4. **Naming**: Variables/functions named for their type (`data`, `result`, `obj`) instead of their meaning. Boolean props phrased as questions on the call site (`isOpen` good, `open` ambiguous).
5. **Comment debt**: WHAT-comments that restate code. Stale comments that no longer match the code below. TODO/FIXME without a ticket reference. Multi-line docstrings on internal helpers.
6. **Scope creep**: Edits in the diff that are not required by the current task (reformatted unrelated code, opportunistic renames, unrelated bug fixes). Flag for the user to decide: split into separate PR or revert.
7. **Type laziness**: New `any` usage. `as` casts that hide real type mismatches. Optional chaining where the value is provably non-null.
8. **Test gaps**: New pure functions / hooks / utilities with no corresponding test file added in the diff.

For each finding, provide:

- **File and line number**
- **What's wrong** (concise — one sentence)
- **Suggested fix** with the exact code change OR the natural extraction boundary
- **Severity**: critical (broken convention, e.g., `any` in shared code), high (active confusion), medium (cleanup), low (taste)
- **Auto-fixable?**: yes for dead-code removal and stale-conditional simplification; no for naming, file splits, scope-creep reverts, test additions

### Agent 3: Reuse Spotter

Hunt for duplication and missed reuse opportunities. This is the highest-judgment agent — be ruthless about flagging `propose-only`:

1. **Duplication within the diff**: Same 4+ line block appearing 2+ times across the changed files. Same regex, same error message, same default object literal.
2. **Duplication with existing code**: Grep the codebase (especially `packages/*`, `apps/*/src/utils`, `apps/*/src/features/*/hooks`, `apps/*/src/components/ui`) for similar logic. If a helper, hook, or component already exists that does ~80% of what the new code does, flag it.
3. **Premature abstraction**: A helper added "for future use" with exactly one caller in the diff and no obvious second caller. Inline it.
4. **Wrong abstraction level**: A 200-line component doing data fetching + transform + render. A hook returning 8 unrelated values. A utility function taking 6 boolean flags.
5. **Pattern violations**: Direct `supabase.from()` calls in `apps/myk9q` (should use `@myk9/replication`). Raw `useState` for shared UI state that already has a Zustand store. New `fetch()` instead of React Query.
6. **shadcn/ui reuse (myK9Show)**: Custom button/dialog/dropdown built from scratch instead of `apps/myk9show/src/components/ui/*`. Custom date picker instead of the registry one.

For each finding, provide:

- **File and line number** (of the new code)
- **Existing helper/pattern** (with file path) if duplication is with existing code
- **Suggested action** (extract a new helper, replace with existing helper, inline the helper, split the abstraction)
- **Severity**: critical (violates offline-first / RLS / architecture rule), high (clear dupe of existing utility), medium (within-diff dupe worth extracting), low (taste)
- **Auto-fixable?**: **default to NO**. Only mark `yes` for in-file extraction of identical blocks where behavior preservation is mechanically verifiable. Cross-file moves, replacing with existing helpers, and splitting abstractions are all `propose-only` — they need human review for subtle behavior differences.

## Phase 3: Score and Triage

Wait for all three agents to complete. Aggregate findings into a single table grouped by file:

```
| # | Severity | Agent | File:Line | Finding | Auto-fix? | Action |
|---|----------|-------|-----------|---------|-----------|--------|
```

**Pass/fail threshold:**

- Any **critical** finding → FAIL — must address before proceeding (auto-fix or propose to user)
- 3+ **high** findings → WARN — strongly recommend addressing before commit
- Otherwise → PASS — apply auto-fixable wins, propose the rest

Report the score:

- **PASS** — no critical, fewer than 3 high, ready to commit
- **WARN** — multiple high findings, recommend cleanup
- **FAIL** — critical findings remain

## Phase 4: Auto-Fix (narrow scope)

Apply ONLY findings marked `Auto-fixable? yes`. Specifically safe:

- Removing unused imports
- Removing unused local variables (verify with grep before deleting exports)
- Simplifying always-true/always-false conditionals
- Converting sequential independent awaits to `Promise.all`
- Replacing whole-library imports with named imports (`import { foo } from 'lib'`)
- Extracting an identical 4+ line block appearing 2+ times **in the same file** to a local helper

Specifically NOT auto-fixed (propose only):

- Cross-file extraction or moves
- Replacing custom code with existing codebase helpers (might miss subtle differences)
- Renaming for clarity
- Splitting files over 500 lines
- Reverting scope creep (user decides what's in scope)
- Adding missing tests
- Performance refactors that need benchmarks (memoization, query restructuring)

For each auto-fix:

- Read the file before editing
- Make the minimal change
- Do not refactor surrounding code
- Do not add explanatory comments

After auto-fixes land, re-run `pnpm typecheck` on changed packages. If a "removed unused import" turned out to be used in a type position you missed, undo that specific deletion.

## Phase 5: Summary

Output a brief summary:

```
## Simplify Results: [PASS|WARN|FAIL]

**Findings:** X critical, Y high, Z medium, W low
**Auto-fixed:** N (list below)
**Proposed (not applied):** M (list below)

### Auto-fixed
- [file:line] Brief description (e.g., "removed 3 unused imports")
- ...

### Proposed — needs your call
- [severity] [file:line] Finding → suggested action
- ...

### Scope-creep flags (if any)
- [file:line] Edit unrelated to the current task: <what>
  Options: keep / revert / split into separate PR
```

If any `propose-only` findings remain, end with: "Reply with which proposals to apply, or 'apply all high' / 'skip all medium' / 'commit as-is'."

If `FAIL`, do not encourage proceeding to `/commit` until critical findings are addressed.

---

## Relationship to other skills

- **Runs BEFORE `/harden`**: `/simplify` removes code; `/harden` stress-tests what remains. Doing it in this order means `/harden` has less surface to attack.
- **Runs BEFORE `/commit`**: `/commit` runs typecheck + lint + tests; it doesn't review for shape.
- **Distinct from `improve-codebase-architecture`**: that skill restructures the whole codebase; `/simplify` is scoped to the current diff.
