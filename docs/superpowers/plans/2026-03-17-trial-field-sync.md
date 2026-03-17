# Trial Field Sync Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all trial fields so they persist across page refreshes by adding missing DB columns, fixing replication mappings, and propagating all fields through the store→replication→DB chain.

**Architecture:** Database migration adds 4 new columns and converts 3 TIMESTAMPTZ columns to TEXT. Then fix the full sync chain: ReplicatedTrialsTable (interface + mappings) → trialStore (propagate all fields on create/update) → trial-store-helpers (use synced values instead of empty defaults).

**Tech Stack:** PostgreSQL (Supabase), TypeScript, Zustand, @myk9/replication (IndexedDB)

**Spec:** `docs/superpowers/specs/2026-03-17-trial-field-sync-design.md`

---

### Task 1: Database Migration

**Files:**

- Create: `supabase/migrations/073_trial_field_sync.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Migration 073: Trial Field Sync
-- Adds missing columns and converts time-of-day columns from TIMESTAMPTZ to TEXT.
-- See: docs/superpowers/specs/2026-03-17-trial-field-sync-design.md

-- =============================================
-- ADD MISSING COLUMNS
-- =============================================

ALTER TABLE trials ADD COLUMN IF NOT EXISTS event_number TEXT;
ALTER TABLE trials ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0;
ALTER TABLE trials ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE trials ADD COLUMN IF NOT EXISTS image_url TEXT;

-- =============================================
-- CONVERT TIME-OF-DAY COLUMNS: TIMESTAMPTZ → TEXT
-- =============================================
-- These columns store display-format times like "9:00 AM", not points-in-time.
-- Use AT TIME ZONE 'UTC' for deterministic conversion.

ALTER TABLE trials
  ALTER COLUMN planned_start_time TYPE TEXT
  USING CASE
    WHEN planned_start_time IS NOT NULL
    THEN to_char(planned_start_time AT TIME ZONE 'UTC', 'FMHH:MI AM')
    ELSE NULL
  END;

ALTER TABLE trials
  ALTER COLUMN actual_start_time TYPE TEXT
  USING CASE
    WHEN actual_start_time IS NOT NULL
    THEN to_char(actual_start_time AT TIME ZONE 'UTC', 'FMHH:MI AM')
    ELSE NULL
  END;

ALTER TABLE trials
  ALTER COLUMN actual_end_time TYPE TEXT
  USING CASE
    WHEN actual_end_time IS NOT NULL
    THEN to_char(actual_end_time AT TIME ZONE 'UTC', 'FMHH:MI AM')
    ELSE NULL
  END;
```

- [ ] **Step 2: Push migration to Supabase**

```bash
supabase db push
```

Expected: Migration applies successfully. Verify with `supabase migration list`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/073_trial_field_sync.sql
git commit -m "feat(db): add trial columns and convert time fields to TEXT"
```

---

### Task 2: Update Supabase Generated Types

**Files:**

- Modify: `packages/supabase/src/database.types.ts` (trials Row/Insert/Update sections around lines 4178-4237)
- Modify: `packages/supabase/src/types/database.types.ts` (same sections)
- Modify: `apps/myk9show/src/types/supabase.ts` (same sections — this is the copy actually imported by myK9Show code via `@/types/supabase`)

- [ ] **Step 1: Add new columns to the trials Row type**

In all three files, find the `trials` table `Row` type (around line 4178) and add after `actual_end_time`:

```typescript
category: string | null;
display_order: number | null;
event_number: string | null;
image_url: string | null;
```

Note: `planned_start_time`, `actual_start_time`, `actual_end_time` are already typed as `string | null` — no change needed for the TIMESTAMPTZ→TEXT conversion.

- [ ] **Step 2: Add new columns to the trials Insert type**

In all three files, find the `trials` table `Insert` type and add:

```typescript
          category?: string | null
          display_order?: number | null
          event_number?: string | null
          image_url?: string | null
```

- [ ] **Step 3: Add new columns to the trials Update type**

In all three files, find the `trials` table `Update` type and add:

```typescript
          category?: string | null
          display_order?: number | null
          event_number?: string | null
          image_url?: string | null
```

- [ ] **Step 4: Run typecheck**

```bash
pnpm typecheck
```

Expected: PASS (new columns are optional, so nothing breaks)

- [ ] **Step 5: Commit**

```bash
git add packages/supabase/src/database.types.ts packages/supabase/src/types/database.types.ts apps/myk9show/src/types/supabase.ts
git commit -m "chore(supabase): add trial field sync columns to generated types"
```

---

### Task 3: Update ReplicatedTrialsTable — Interface and Mappings

**Files:**

- Modify: `apps/myk9show/src/services/replication/ReplicatedTrialsTable.ts`

- [ ] **Step 1: Add new fields to ReplicatedTrial interface**

At `ReplicatedTrialsTable.ts:21-45`, add after `plannedStartTime` (line 33):

```typescript
  actualStartTime?: string | undefined;
  actualEndTime?: string | undefined;
  eventNumber?: string | undefined;
  displayOrder?: number | undefined;
  category?: string | undefined;
  imageUrl?: string | undefined;
```

- [ ] **Step 2: Map new columns in rowToTrial**

At `ReplicatedTrialsTable.ts:50-68`, add after `plannedStartTime` mapping (line 63):

```typescript
    actualStartTime: row.actual_start_time ?? undefined,
    actualEndTime: row.actual_end_time ?? undefined,
    eventNumber: row.event_number ?? undefined,
    displayOrder: row.display_order ?? undefined,
    category: row.category ?? undefined,
    imageUrl: row.image_url ?? undefined,
```

- [ ] **Step 3: Map new fields in toSupabaseRow**

At `ReplicatedTrialsTable.ts:104-120`, add after `planned_start_time` mapping (line 117):

```typescript
      actual_start_time: trial.actualStartTime ?? null,
      actual_end_time: trial.actualEndTime ?? null,
      event_number: trial.eventNumber ?? null,
      display_order: trial.displayOrder ?? null,
      category: trial.category ?? null,
      image_url: trial.imageUrl ?? null,
```

- [ ] **Step 4: Run typecheck**

```bash
pnpm typecheck
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/services/replication/ReplicatedTrialsTable.ts
git commit -m "feat(replication): sync all trial fields through ReplicatedTrialsTable"
```

---

### Task 4: Update trial-store-helpers — Use Synced Values

**Files:**

- Modify: `apps/myk9show/src/store/trial-store-helpers.ts`

- [ ] **Step 1: Fix replicatedToTrial to use synced values**

Replace `replicatedToTrial` (lines 65-86) with:

```typescript
export function replicatedToTrial(replicated: ReplicatedTrial): SyncableTrial {
  return {
    id: replicated.id,
    showId: replicated.showId || '',
    showName: '', // Derived from show join, not stored on trials table
    name: replicated.name,
    trialDate: replicated.date,
    trialNumber: replicated.trialNumber || '',
    status: (replicated.status as SyncableTrial['status']) || 'Upcoming',
    eventNumber: replicated.eventNumber || '',
    type: replicated.category || '',
    trialType: replicated.trialType || '',
    plannedStartTime: replicated.plannedStartTime || '',
    timeStarted: replicated.actualStartTime || '',
    timeEnded: replicated.actualEndTime || '',
    order: replicated.displayOrder !== undefined ? String(replicated.displayOrder) : '',
    image: replicated.imageUrl || '',
    // Sync metadata
    _version: replicated._version || 1,
    _lastModified: replicated._lastModified || new Date(),
    _lastModifiedBy: replicated._lastModifiedBy || '',
    _syncStatus: replicated._syncStatus || 'synced',
    _localOnly: replicated._localOnly || false,
  };
}
```

Key mappings: `category` → `type`, `displayOrder` → `order` (number→string), `actualStartTime` → `timeStarted`, `actualEndTime` → `timeEnded`, `imageUrl` → `image`.

- [ ] **Step 2: Simplify mergeTrialData — only showName is truly local**

Replace `mergeTrialData` (lines 92-108) with:

```typescript
export function mergeTrialData(
  replicated: ReplicatedTrial,
  existing: SyncableTrial | undefined
): SyncableTrial {
  const base = replicatedToTrial(replicated);
  if (!existing) return base;

  return {
    ...base,
    // showName is derived from a join, not stored on the trials table
    showName: existing.showName || '',
  };
}
```

- [ ] **Step 3: Run typecheck**

```bash
pnpm typecheck
```

Expected: PASS. If `SyncableTrial` is missing `timeStarted`/`timeEnded`/`image`, check `trial-store-types.ts` — these should already exist via the `Trial` base interface.

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/store/trial-store-helpers.ts
git commit -m "fix(store): use synced values in replicatedToTrial instead of empty defaults"
```

---

### Task 5: Update trialStore.ts — Propagate All Fields to Replication

**Files:**

- Modify: `apps/myk9show/src/store/trialStore.ts`

- [ ] **Step 1: Fix addTrial — include all fields in replicatedTrial**

At `trialStore.ts:54-66`, replace the `replicatedTrial` object with:

```typescript
const replicatedTrial: ReplicatedTrial = {
  id,
  showId: trialData.showId,
  name: trialData.name,
  date: trialData.trialDate,
  trialNumber: trialData.trialNumber,
  status: trialData.status,
  trialType: trialData.trialType,
  plannedStartTime: trialData.plannedStartTime,
  actualStartTime: trialData.timeStarted,
  actualEndTime: trialData.timeEnded,
  eventNumber: trialData.eventNumber,
  displayOrder: trialData.order ? parseInt(trialData.order, 10) : 0,
  category: trialData.type,
  imageUrl: trialData.image,
  _version: 1,
  _lastModified: new Date(),
  _lastModifiedBy: userId,
  _syncStatus: 'pending',
  _localOnly: true,
};
```

- [ ] **Step 2: Simplify the newTrial creation**

Since `replicatedToTrial` now maps all fields from `ReplicatedTrial`, the local-only overrides at lines 71-79 are no longer needed. Replace with:

```typescript
const savedReplicated = await replicatedTrialsTable.createTrial(replicatedTrial);

const newTrial: SyncableTrial = {
  ...replicatedToTrial(savedReplicated),
  showName: trialData.showName || '',
};
```

- [ ] **Step 3: Fix updateTrial — propagate all fields to replicatedUpdates**

At `trialStore.ts:114-122`, add the missing field propagations after line 122:

```typescript
if (updates.trialType !== undefined) replicatedUpdates.trialType = updates.trialType;
if (updates.plannedStartTime !== undefined)
  replicatedUpdates.plannedStartTime = updates.plannedStartTime;
if (updates.timeStarted !== undefined) replicatedUpdates.actualStartTime = updates.timeStarted;
if (updates.timeEnded !== undefined) replicatedUpdates.actualEndTime = updates.timeEnded;
if (updates.eventNumber !== undefined) replicatedUpdates.eventNumber = updates.eventNumber;
if (updates.order !== undefined)
  replicatedUpdates.displayOrder = updates.order ? parseInt(updates.order, 10) : 0;
if (updates.type !== undefined) replicatedUpdates.category = updates.type;
if (updates.image !== undefined) replicatedUpdates.imageUrl = updates.image;
```

- [ ] **Step 4: Run typecheck**

```bash
pnpm typecheck
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/store/trialStore.ts
git commit -m "fix(store): propagate all trial fields to replication on create and update"
```

---

### Task 6: Update trialMappers.ts — Fix All Mappings

**Files:**

- Modify: `apps/myk9show/src/services/mappers/trialMappers.ts`

- [ ] **Step 1: Fix mapDatabaseToTrial — map new columns**

At `trialMappers.ts:28-46`, replace the `undefined` lines (40-44) with actual DB column mappings:

```typescript
    eventNumber: dbTrial.event_number ?? undefined,
    type: dbTrial.category ?? undefined,
    order: dbTrial.display_order !== undefined && dbTrial.display_order !== null
      ? String(dbTrial.display_order)
      : undefined,
    trialType: dbTrial.trial_type ?? undefined,
    image: dbTrial.image_url ?? undefined,
```

Lines 37-39 (`plannedStartTime`, `timeStarted`, `timeEnded`) already map correctly — no change needed.

- [ ] **Step 2: Fix mapTrialInputToInsert — add new columns**

At `trialMappers.ts:58-70`, add after `trial_type` (line 66):

```typescript
    event_number: trialInput.eventNumber || null,
    display_order: trialInput.order ? parseInt(trialInput.order, 10) : 0,
    category: trialInput.type || null,
    image_url: trialInput.image || null,
    actual_start_time: trialInput.timeStarted || null,
    actual_end_time: trialInput.timeEnded || null,
```

- [ ] **Step 3: Fix mapTrialInputToUpdate — add new columns**

At `trialMappers.ts:75-103`, add after the `trialType` block (line 100):

```typescript
if (updates.eventNumber !== undefined) {
  updateData.event_number = updates.eventNumber;
}
if (updates.order !== undefined) {
  updateData.display_order = updates.order ? parseInt(updates.order, 10) : 0;
}
if (updates.type !== undefined) {
  updateData.category = updates.type;
}
if (updates.image !== undefined) {
  updateData.image_url = updates.image;
}
if (updates.timeStarted !== undefined) {
  updateData.actual_start_time = updates.timeStarted;
}
if (updates.timeEnded !== undefined) {
  updateData.actual_end_time = updates.timeEnded;
}
```

- [ ] **Step 4: Fix mapTrialToTrialInput — add missing fields**

At `trialMappers.ts:108-122`, add `image`, `timeStarted`, `timeEnded` to the return object:

```typescript
export const mapTrialToTrialInput = (trial: Trial): TrialInput => {
  return {
    showId: trial.showId,
    showName: trial.showName,
    name: trial.name || '',
    trialDate: trial.trialDate,
    trialNumber: trial.trialNumber,
    status: trial.status,
    eventNumber: trial.eventNumber,
    type: trial.type,
    trialType: trial.trialType,
    plannedStartTime: trial.plannedStartTime,
    order: trial.order,
    image: trial.image,
    timeStarted: trial.timeStarted,
    timeEnded: trial.timeEnded,
  };
};
```

- [ ] **Step 5: Run typecheck and lint**

```bash
pnpm typecheck && pnpm lint
```

Expected: PASS. The new DB columns were added to the generated types in Task 2.

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/services/mappers/trialMappers.ts
git commit -m "fix(mappers): map all trial fields between app and database formats"
```

---

### Task 7: Verify End-to-End

- [ ] **Step 1: Deploy ordering check [ADDED]**

The database migration (Task 1) MUST be applied before Vercel deploys the new code. Otherwise `row.event_number` etc. will be undefined at runtime. Since Vercel auto-deploys from `main`, push the migration and apply it with `supabase db push` BEFORE merging the code changes. Alternatively, commit and push everything together — the new code handles missing columns gracefully (all mappings use `?? undefined` / `?? null`).

- [ ] **Step 2: Run full quality checks**

```bash
pnpm typecheck && pnpm lint
```

- [ ] **Step 3: Run related tests**

```bash
cd apps/myk9show && pnpm vitest run src/hooks/__tests__/useFormValidation.test.ts src/components/panels/edit/__tests__/EditPanelWrapper.test.tsx --reporter=verbose
```

- [ ] **Step 4: Manual verification**

1. Start dev server: `pnpm dev:show`
2. Open a trial → Edit Trial → fill in ALL fields (event number, display order, category, image URL, planned start time, time started, time ended)
3. Save → refresh page → verify all values persist
4. Check the Show Overview → Schedule section → verify planned start time shows next to "TRIAL 1"
5. Create a NEW trial with all fields filled → verify they persist after refresh
6. **[ADDED]** Clear browser IndexedDB (DevTools → Application → IndexedDB → delete myk9show databases), reload, verify trials still load correctly from Supabase with all fields

- [ ] **Step 5: Final commit with all changes**

```bash
git add -A
git commit -m "fix(myk9show): fix trial field persistence across page refreshes

- Add event_number, display_order, category, image_url columns to trials table
- Convert planned_start_time, actual_start_time, actual_end_time from TIMESTAMPTZ to TEXT
- Sync all fields through ReplicatedTrialsTable
- Propagate all fields from trialStore to replication layer on create/update
- Fix replicatedToTrial to use synced values instead of empty defaults
- Fix trialMappers to map all new database columns"
```

---

### [ADDED] Notes

**Rollback strategy:** If the TIMESTAMPTZ→TEXT conversion produces bad data, the columns can be converted back with `ALTER COLUMN planned_start_time TYPE TIMESTAMPTZ USING planned_start_time::timestamptz`. Since the values are display strings like "9:00 AM", PostgreSQL can parse them back. However, verify conversion output on staging before applying to production.

**IndexedDB cache transition:** After migration, clients may have old TIMESTAMPTZ strings cached in IndexedDB. The `formatStartTime` function (updated in a prior commit) handles ISO timestamps as a fallback, so these display correctly. On next replication sync, the cache updates to TEXT format values.
