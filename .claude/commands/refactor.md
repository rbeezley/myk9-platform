---
description: Decompose a large file into modular components using parallel sub-agents
argument-hint: <file-path> (e.g., src/pages/EntryManagementPage.tsx)
---

# Parallel Refactor

Decompose a large React/TypeScript file into modular components using parallel sub-agents. Each agent extracts one logical section and verifies its own TypeScript compilation.

## Input

Target file: $ARGUMENTS

If no argument provided, ask: "Which file would you like to refactor? Provide the path."

## Step 1: Analyze the Target File

Read the target file and identify extractable sections:

- **Types/Interfaces** — type definitions, props interfaces, enums
- **Hooks** — custom hooks, complex useState/useEffect blocks
- **Sub-components** — JSX sections that are self-contained UI blocks
- **Utilities** — helper functions, formatters, validators, constants

For each section, note:
- What it contains (functions, components, types)
- Its dependencies (imports it needs, state it accesses)
- Approximate line range

## Step 2: Plan the Extraction

Present the plan to the user:

```
File: [path] ([X] lines)

Proposed extractions:
1. types.ts — [interfaces, enums] (~N lines)
2. hooks/use[Name].ts — [hook description] (~N lines)
3. components/[Name].tsx — [component description] (~N lines)
4. utils.ts — [helpers] (~N lines)

Main file will become: imports + composition (~N lines, ~X% reduction)

Proceed? (yes/adjust/cancel)
```

Wait for user confirmation before proceeding.

## Step 3: Create Output Directory

Create a subfolder matching the component name:
- `src/pages/EntryManagement/` for `EntryManagementPage.tsx`
- `src/components/AdminDashboard/` for `AdminDashboard.tsx`

## Step 4: Spawn Parallel Sub-Agents

Launch one sub-agent per extraction target using the Task tool. All agents spawn in a **single message** for true parallelism.

Each agent receives:
- The full content of the original file
- Which section to extract (with line ranges)
- The output file path
- Dependencies and imports needed
- Instruction to run `pnpm typecheck` after writing and fix any errors

**Agent prompt template:**
```
You are extracting a module from a React/TypeScript file refactoring.

ORIGINAL FILE: [path]
EXTRACT: [section description with line ranges]
OUTPUT TO: [new file path]
DEPENDENCIES: [imports this section needs]

Instructions:
1. Read the original file at [path]
2. Create the new file at [output path] with:
   - Proper imports
   - Exported functions/components/types
   - No unused imports
3. Run: pnpm typecheck 2>&1 | head -30
4. If errors in your file, fix them
5. Report what you extracted and its export names
```

## Step 5: Rewrite the Main File

After all agents complete:
1. Collect all export names from agent results
2. Rewrite the original file as a thin composition layer:
   - Import from new modules
   - Wire up the composition (passing props, using hooks)
   - Export the main component
3. Add an `index.ts` barrel export if the file was moved into a subfolder

## Step 6: Final Verification

Run the full quality gate:

```bash
pnpm typecheck
pnpm lint
```

Fix any remaining issues (cross-module import errors, missing re-exports).

## Step 7: Report Results

```
Refactoring complete:

[original file] ([before] lines → [after] lines, [X]% reduction)

Extracted:
- [path] — [description] ([lines] lines)
- [path] — [description] ([lines] lines)
- ...

Quality checks: ✓ typecheck | ✓ lint
```

## Rules

- NEVER delete functionality — every line must end up somewhere
- NEVER introduce `any` types — preserve or improve type safety
- ALWAYS verify imports/exports match across all new files
- ALWAYS run typecheck after extraction — don't assume it works
- Prefer named exports over default exports
- Keep the main file as a thin composition layer
- Follow existing project patterns (check nearby refactored files for conventions)
