# Code Quality Wave C Show Map Helpers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the Wave C Show Map oversized-file slice by extracting render cells and pure action helpers without changing Show Map behavior.

**Architecture:** Keep `ShowMapStructureTable.tsx` responsible for tree orchestration, keyboard focus, reorder mode, and row layout. Move self-contained cell components into a sibling TSX module, and move action eligibility/source-id helpers into a pure TypeScript module consumed by `showMapActions.ts`.

**Tech Stack:** TypeScript, React, Vitest, Testing Library, myK9Show Show Map utilities.

---

### Task 1: Extract Show Map Render Cells

**Files:**
- Create: `apps/myk9show/src/features/show-map/ShowMapStructureCells.tsx`
- Create: `apps/myk9show/src/features/show-map/__tests__/ShowMapStructureCells.test.tsx`
- Modify: `apps/myk9show/src/features/show-map/ShowMapStructureTable.tsx`

- [x] **Step 1: Write the failing cell tests**

Create `ShowMapStructureCells.test.tsx` with tests that import `EntryIdentity`, `DogEntryIdentity`, `StatusCell`, `ProgressCell`, and `ClassPrimaryActionButton` from the new module. Cover:
- entry dog/handler navigation renders as buttons when `onNavigate` exists
- entry identity renders plain text when `onNavigate` is omitted
- dog-entry identity renders class context
- status/progress fallback cells render the same text as before
- class primary mutation action calls `onAction`

- [x] **Step 2: Run the cell test red**

Run:

```bash
cd apps/myk9show && pnpm exec vitest run src/features/show-map/__tests__/ShowMapStructureCells.test.tsx
```

Expected: fail because `../ShowMapStructureCells` does not exist.

- [x] **Step 3: Move the render cells**

Move these implementations out of `ShowMapStructureTable.tsx` into `ShowMapStructureCells.tsx`:
- `ProgressCell`
- `ClassPrimaryActionButton`
- `StatusCell`
- `EntryIdentity`
- `DogEntryIdentity`

Preserve the `// INTENT:` comment above `ClassPrimaryActionButton` and the `onNavigate` intent comment in `EntryIdentity`.

- [x] **Step 4: Wire the table to the new module**

Import the five cells into `ShowMapStructureTable.tsx`. Remove imports that only the moved cells used, such as `Badge`, `Progress`, `ArmbandBadge`, `JudgePresenceDot`, `judgesOnClass`, and `resolveShowMapActionExecution`, unless still needed.

- [x] **Step 5: Run the cell and table tests green**

Run:

```bash
cd apps/myk9show && pnpm exec vitest run \
  src/features/show-map/__tests__/ShowMapStructureCells.test.tsx \
  src/features/show-map/__tests__/ShowMapStructureTable.test.tsx \
  src/features/show-map/__tests__/ShowMapStructureTable.attrs.test.tsx \
  src/features/show-map/__tests__/ShowMapStructureTable.keyboard.test.tsx
```

Expected: all tests pass.

### Task 2: Extract Pure Show Map Action Helpers

**Files:**
- Create: `apps/myk9show/src/features/show-map/showMapActionHelpers.ts`
- Create: `apps/myk9show/src/features/show-map/__tests__/showMapActionHelpers.test.ts`
- Modify: `apps/myk9show/src/features/show-map/showMapActions.ts`

- [x] **Step 1: Write the failing helper tests**

Create `showMapActionHelpers.test.ts` with tests that import from `../showMapActionHelpers`. Cover:
- synthetic display nodes return true for `all-exhibitors`, `dog`, and `more`
- `sourceIdFromNodeId` accepts only matching non-empty prefixes
- `getEntrySourceId` supports both `entry:` and `dog-entry:` ids
- `canMarkClassComplete` allows active empty classes and active complete-progress classes, but rejects incomplete progress
- `canMarkEntryCheckedIn` rejects complete/muted or already checked-in/completed/pulled entries

- [x] **Step 2: Run the helper test red**

Run:

```bash
cd apps/myk9show && pnpm exec vitest run src/features/show-map/__tests__/showMapActionHelpers.test.ts
```

Expected: fail because `../showMapActionHelpers` does not exist.

- [x] **Step 3: Move pure helper functions**

Move these functions/constants from `showMapActions.ts` into `showMapActionHelpers.ts`:
- `SYNTHETIC_DISPLAY_ACTION_NODE_TYPES`
- `isSyntheticDisplayActionNode`
- `isClassReadyToScore`
- `canMarkClassStarted`
- `canMarkClassComplete`
- `canMarkEntryCheckedIn`
- `canMessageEntryHandler`
- `sourceIdFromNodeId`
- `getNodeSourceId`
- `getEntrySourceId`
- `getParentSourceId`
- `getRootShowId`

Keep function behavior byte-for-byte except for export declarations and imports.

- [x] **Step 4: Wire `showMapActions.ts` to the helper module**

Import the moved helpers. Remove the local helper definitions. Keep action ordering, priorities, `// INTENT:` comments, and exported public API unchanged.

- [x] **Step 5: Run helper/action tests green**

Run:

```bash
cd apps/myk9show && pnpm exec vitest run \
  src/features/show-map/__tests__/showMapActionHelpers.test.ts \
  src/features/show-map/__tests__/showMapActions.test.ts \
  src/features/show-map/__tests__/showMapActionGroups.test.ts \
  src/features/show-map/__tests__/ShowMapRowActionsMenu.test.tsx
```

Expected: all tests pass.

### Task 3: Verify and Update Tracking

**Files:**
- Modify: `OPEN-TODOS.md`
- Modify: `docs/audits/2026-06-code-quality/01-oversized-files.md`
- Modify: `docs/audits/2026-06-code-quality/09-phase-2-verification.md`
- Modify: `docs/audits/2026-06-code-quality/SUMMARY.md`

- [x] **Step 1: Run full focused Show Map verification**

Run:

```bash
cd apps/myk9show && pnpm exec vitest run \
  src/features/show-map/__tests__/ShowMapStructureCells.test.tsx \
  src/features/show-map/__tests__/ShowMapStructureTable.test.tsx \
  src/features/show-map/__tests__/ShowMapStructureTable.attrs.test.tsx \
  src/features/show-map/__tests__/ShowMapStructureTable.keyboard.test.tsx \
  src/features/show-map/__tests__/showMapActionHelpers.test.ts \
  src/features/show-map/__tests__/showMapActions.test.ts \
  src/features/show-map/__tests__/showMapActionGroups.test.ts \
  src/features/show-map/__tests__/ShowMapRowActionsMenu.test.tsx
```

- [x] **Step 2: Run app typecheck and diff check**

Run:

```bash
pnpm --filter @myk9/show typecheck
git diff --check
```

- [x] **Step 3: Update tracking docs**

Record Wave C Show Map extraction as implemented. Mention that render cells and pure action helpers were extracted with focused tests. Mark the Wave C oversized-file extraction item complete if no other Wave C items remain.

- [x] **Step 4: Run final validation**

Run:

```bash
pnpm typecheck
pnpm lint
```

Expected: both pass. If lint only reports the known `RefundEntryDialog.tsx` warning, record it as pre-existing.
