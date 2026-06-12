# Code Quality Wave B Consolidations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the first Wave B consolidation by replacing divergent generated Supabase type copies with one package-owned canonical type surface.

**Architecture:** Keep `packages/supabase/src/types/database.types.ts` as the canonical generated file. Convert the other generated copies into compatibility re-exports so existing imports keep working while future generation has one documented destination.

**Tech Stack:** TypeScript, pnpm, Vitest type assertions, Supabase generated types, monorepo package exports.

---

## Scope

This plan implements only Wave B slice 1 from `docs/audits/2026-06-code-quality/03-duplication-clusters.md`: generated Supabase type-file unification. The other confirmed Wave B duplication clusters, including replication read-shape helpers and Magazine/Gazette email helper extraction, remain follow-up Wave B slices.

## File Structure

- Modify `packages/supabase/src/types/database.types.ts`: canonical generated type file, refreshed from the newest app-local generated type surface.
- Modify `packages/supabase/src/index.ts`: export canonical helper aliases and runtime `Constants`.
- Modify `packages/supabase/src/database.types.ts`: compatibility re-export from canonical type file.
- Modify `packages/supabase/src/types.ts`: compatibility re-export from canonical type file.
- Modify `apps/myk9show/src/types/supabase.ts`: compatibility re-export from `@myk9/supabase`.
- Modify `packages/supabase/package.json`: make `generate-types` write to the canonical path.
- Modify `packages/supabase/README.md`: update type generation documentation to point at the canonical path.
- Create `packages/supabase/src/types/database.types.test.ts`: compile-time and runtime checks for canonical exports.
- Modify audit/todo docs as needed after verification to mark this Wave B slice complete without closing all of Wave B.

### Task 1: Add Canonical Export Coverage

**Files:**
- Create: `packages/supabase/src/types/database.types.test.ts`
- Modify: `packages/supabase/src/index.ts`

- [x] **Step 1: Create a compile-time coverage test**

Create `packages/supabase/src/types/database.types.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { Constants } from './database.types';
import type {
  CompositeTypes,
  Database,
  Enums,
  Json,
  Tables,
  TablesInsert,
  TablesUpdate,
} from './database.types';

describe('canonical database type exports', () => {
  it('exports runtime constants for the public schema', () => {
    expect(Constants.public.Enums).toBeDefined();
  });

  it('exposes generated helper aliases used by app consumers', () => {
    const showRow: Pick<Tables<'shows'>, 'id'> = { id: 'show-id' };
    const showInsert: Pick<TablesInsert<'shows'>, 'name'> = { name: 'Test Show' };
    const showUpdate: TablesUpdate<'shows'> = { name: 'Updated Show' };
    const secretaryTask: Partial<Tables<'secretary_tasks'>> = { id: 'task-id' };
    const jsonValue: Json = { ok: true };

    type PublicTables = Database['public']['Tables'];
    type PublicEnums = Enums<never>;
    type PublicCompositeTypes = CompositeTypes<never>;

    expect(showRow.id).toBe('show-id');
    expect(showInsert.name).toBe('Test Show');
    expect(showUpdate.name).toBe('Updated Show');
    expect(secretaryTask.id).toBe('task-id');
    expect(jsonValue).toEqual({ ok: true });

    void (null as unknown as PublicTables);
    void (null as unknown as PublicEnums);
    void (null as unknown as PublicCompositeTypes);
  });
});
```

- [x] **Step 2: Run the focused package test**

Run: `pnpm --filter @myk9/supabase test -- database.types.test.ts`

Result: PASS after widening the package export surface.

- [x] **Step 3: Export all canonical helpers from the package entrypoint**

Update `packages/supabase/src/index.ts` so the database type export includes:

```ts
export type {
  CompositeTypes,
  Database,
  Enums,
  Json,
  Tables,
  TablesInsert,
  TablesUpdate,
} from './types/database.types';
export { Constants } from './types/database.types';
```

Keep the existing Supabase client exports intact.

### Task 2: Replace Divergent Generated Copies With Re-Exports

**Files:**
- Modify: `packages/supabase/src/types/database.types.ts`
- Modify: `packages/supabase/src/database.types.ts`
- Modify: `packages/supabase/src/types.ts`
- Modify: `apps/myk9show/src/types/supabase.ts`

- [x] **Step 1: Refresh the canonical package type file**

Copy the newest generated surface from `apps/myk9show/src/types/supabase.ts` into `packages/supabase/src/types/database.types.ts`.

Run:

```bash
cp apps/myk9show/src/types/supabase.ts packages/supabase/src/types/database.types.ts
```

- [x] **Step 2: Replace package-root generated copies with compatibility re-exports**

Replace both `packages/supabase/src/database.types.ts` and `packages/supabase/src/types.ts` with:

```ts
export type {
  CompositeTypes,
  Database,
  Enums,
  Json,
  Tables,
  TablesInsert,
  TablesUpdate,
} from './types/database.types';

export { Constants } from './types/database.types';
```

- [x] **Step 3: Replace the app-local generated copy with package re-exports**

Replace `apps/myk9show/src/types/supabase.ts` with:

```ts
export type {
  CompositeTypes,
  Database,
  Enums,
  Json,
  Tables,
  TablesInsert,
  TablesUpdate,
} from '@myk9/supabase';

export { Constants } from '@myk9/supabase';
```

### Task 3: Align Generation Documentation

**Files:**
- Modify: `packages/supabase/package.json`
- Modify: `packages/supabase/README.md`

- [x] **Step 1: Fix the generation script destination**

Update `packages/supabase/package.json`:

```json
"generate-types": "supabase gen types typescript --project-id $SUPABASE_PROJECT_ID > src/types/database.types.ts"
```

- [x] **Step 2: Update README references**

Replace stale `src/types/database.ts` generation references with `src/types/database.types.ts`. Keep the public API examples pointing at package exports rather than direct generated file imports.

- [x] **Step 3: Check for stale generation paths**

Run: `rg "src/types/database\\.ts|src/database\\.types\\.ts|apps/myk9show/src/types/supabase\\.ts" packages/supabase README.md docs apps packages`

Result: no live package docs/scripts point generation at `src/types/database.ts`; remaining hits are the plan's historical instruction text.

### Task 4: Update Tracking Docs

**Files:**
- Modify: `OPEN-TODOS.md`
- Modify: `docs/audits/2026-06-code-quality/03-duplication-clusters.md`
- Modify: `docs/audits/2026-06-code-quality/09-phase-2-verification.md`
- Modify: `docs/audits/2026-06-code-quality/SUMMARY.md`

- [x] **Step 1: Mark only the type-file unification slice as implemented**

Add concise implementation evidence to the Wave B audit docs. Do not mark all of Wave B complete.

- [x] **Step 2: Keep Wave B follow-ups visible**

Leave the replication read-shape and Magazine/Gazette duplication clusters as remaining Wave B follow-up work.

### Task 5: Verify

**Files:**
- No new files.

- [x] **Step 1: Run package tests**

Run: `pnpm --filter @myk9/supabase test -- database.types.test.ts`

Result: PASS.

- [x] **Step 2: Run package typecheck**

Run: `pnpm --filter @myk9/supabase typecheck`

Result: PASS.

- [x] **Step 3: Build package declarations for app resolution**

Run: `pnpm --filter @myk9/supabase build`

Result: PASS. The app resolves workspace package declarations through `packages/supabase/dist/index.d.ts` during local typecheck.

- [x] **Step 4: Run app typecheck**

Run: `pnpm --filter @myk9/show typecheck`

Result: PASS after rebuilding `@myk9/supabase`.

- [x] **Step 5: Run diff hygiene checks**

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors; only intended Wave B files changed.

Result: PASS. `git diff --check` reported no whitespace errors; stale generation path scan found no live package/app/audit references to `src/types/database.ts`.
