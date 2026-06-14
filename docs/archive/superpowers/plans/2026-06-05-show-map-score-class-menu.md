# Show Map Score Class Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a secondary class-level `Score Class` menu action for not-started classes and fix class-started status persistence after refresh.

**Architecture:** Reuse the existing Show Map action contract and existing scoring route. Keep the class primary action lifecycle-driven while allowing the row menu to deep-link directly to scoring. Fix status persistence by normalizing database class status strings when mapping back into app status values.

**Tech Stack:** TypeScript, React, Vitest, myK9Show Show Map action utilities, offline-first replicated class mutations.

---

### Task 1: Add Failing Action Coverage

**Files:**

- Modify: `apps/myk9show/src/features/show-map/__tests__/showMapActions.test.ts`

- [x] **Step 1: Write the failing test**

Add a test that builds a neutral class node with `scoreHref` and expects both `mark-class-started` and `score-class` in the class actions. Assert that `score-class` uses `/scoring/classes/class-future/entries?mode=split` and is not recommended.

- [x] **Step 2: Run the focused test**

Run: `cd apps/myk9show && npx vitest run src/features/show-map/__tests__/showMapActions.test.ts -t "not-started class"`

Expected: the new assertion fails because `score-class` is currently only returned for active classes.

### Task 2: Add Failing Status Persistence Coverage

**Files:**

- Modify: `apps/myk9show/src/services/mappers/__tests__/classMappers.test.ts`

- [x] **Step 1: Write the failing test**

Add a regression test for `mapDatabaseToClass` with a database class row containing `status: 'in_progress'`. Expect the mapped class status to be `In Progress`.

- [x] **Step 2: Run the focused test**

Run: `cd apps/myk9show && npx vitest run src/services/mappers/__tests__/classMappers.test.ts -t "in_progress"`

Expected: the new assertion fails because the mapper currently falls back to `Scheduled`.

### Task 3: Implement Menu Action

**Files:**

- Modify: `apps/myk9show/src/features/show-map/showMapActions.ts`

- [x] **Step 1: Add class scoring route import**

Import `getPaperScoringClassHref` from `@/pages/scoring/scoringRoutes`.

- [x] **Step 2: Add secondary score action for neutral classes**

When a class node is neutral and has a class id, add a `score-class` action with `href: node.scoreHref ?? getPaperScoringClassHref(classId)`, `priority` below `mark-class-started`, and no `recommended` flag.

- [x] **Step 3: Run action tests**

Run: `cd apps/myk9show && npx vitest run src/features/show-map/__tests__/showMapActions.test.ts`

Expected: pass.

### Task 4: Implement Status Normalization Fix

**Files:**

- Modify: `apps/myk9show/src/services/mappers/classMappers.ts`

- [x] **Step 1: Normalize database statuses**

Update `mapClassStatus` so `in_progress`, `completed`, `cancelled`, `upcoming`, and `scheduled` map to the matching UI status strings.

- [x] **Step 2: Run mapper tests**

Run: `cd apps/myk9show && npx vitest run src/services/mappers/__tests__/classMappers.test.ts`

Expected: pass.

### Task 5: Verify and Ship

**Files:**

- Verify changed files only.

- [x] **Step 1: Run focused test suite**

Run: `cd apps/myk9show && npx vitest run src/features/show-map/__tests__/showMapActions.test.ts src/services/mappers/__tests__/classMappers.test.ts`

Expected: pass.

- [x] **Step 2: Check git diff**

Run: `git diff -- apps/myk9show/src/features/show-map/showMapActions.ts apps/myk9show/src/features/show-map/__tests__/showMapActions.test.ts apps/myk9show/src/services/mappers/classMappers.ts apps/myk9show/src/services/mappers/__tests__/classMappers.test.ts docs/superpowers/specs/2026-06-05-show-map-score-class-menu-design.md docs/superpowers/plans/2026-06-05-show-map-score-class-menu.md`

Expected: only the scoped action, mapper, test, and doc changes appear.

- [ ] **Step 3: Commit and PR**

Commit the scoped changes and open a ready PR.
