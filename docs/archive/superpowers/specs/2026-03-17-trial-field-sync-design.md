# Trial Field Sync — Design Spec

## Problem

Multiple trial fields edited through the Edit Trial panel do not persist across page refreshes. Three root causes:

1. **Missing DB columns** — 4 form fields have no database column to persist to.
2. **Broken replication mapping** — Fields with DB columns aren't mapped in the replication layer.
3. **Store doesn't propagate to replication** — `trialStore.ts` only sends 5 of ~15 fields to the replication layer on create/update. The rest are set on the local Zustand object but never reach the DB.

**User impact:** After editing a trial (event number, planned start time, display order, etc.), the values appear to save but revert to empty/TBD on the next page load.

## Audit Summary

### Full field mapping (Form → App → Replication → DB)

| Form Field    | App Key            | ReplicatedTrial Key     | DB Column            | DB Type     | Status                                                                                  |
| ------------- | ------------------ | ----------------------- | -------------------- | ----------- | --------------------------------------------------------------------------------------- |
| Trial Name    | `name`             | `name`                  | `name`               | TEXT        | OK                                                                                      |
| Trial Number  | `trialNumber`      | `trialNumber`           | `trial_number`       | TEXT        | OK                                                                                      |
| Trial Date    | `trialDate`        | `date`                  | `date`               | DATE        | OK                                                                                      |
| Status        | `status`           | `status`                | `status`             | TEXT        | OK                                                                                      |
| Trial Type    | `trialType`        | `trialType`             | `trial_type`         | TEXT        | OK (replication maps it, but mergeTrialData incorrectly overwrites DB value with local) |
| Planned Start | `plannedStartTime` | `plannedStartTime`      | `planned_start_time` | TIMESTAMPTZ | Broken: type mismatch, store doesn't propagate to replication                           |
| Time Started  | `timeStarted`      | `actualStartTime` (new) | `actual_start_time`  | TIMESTAMPTZ | Broken: never mapped in replication                                                     |
| Time Ended    | `timeEnded`        | `actualEndTime` (new)   | `actual_end_time`    | TIMESTAMPTZ | Broken: never mapped in replication                                                     |
| Event Number  | `eventNumber`      | `eventNumber` (new)     | —                    | —           | Broken: no DB column                                                                    |
| Display Order | `order`            | `displayOrder` (new)    | —                    | —           | Broken: no DB column                                                                    |
| Category      | `type`             | `category` (new)        | —                    | —           | Broken: no DB column                                                                    |
| Image URL     | `image`            | `imageUrl` (new)        | —                    | —           | Broken: no DB column                                                                    |
| Show ID       | `showId`           | `showId`                | `show_id`            | UUID        | OK                                                                                      |

### Type mismatch: time-of-day stored in TIMESTAMPTZ

`planned_start_time`, `actual_start_time`, and `actual_end_time` are TIMESTAMPTZ but store time-of-day strings like "9:00 AM". The form validates "HH:MM AM/PM" format and no part of the app does timestamp arithmetic on these values. TIMESTAMPTZ adds a spurious date component and timezone-dependent roundtrip behavior.

**myK9Q impact:** These columns also exist on the `classes` table, which myK9Q uses extensively. This migration only alters the `trials` table — the `classes` table is unaffected. myK9Q's `ReplicatedTrialsTable` types these as `string` and passes them through without Date parsing, so the type change is safe.

### Store propagation gap (trialStore.ts)

`trialStore.addTrial` (lines 54-66) and `trialStore.updateTrial` (lines 114-122) only send 5 fields to the replication layer: `showId`, `name`, `date`, `trialNumber`, `status`. All other fields (`plannedStartTime`, `trialType`, `eventNumber`, `order`, `type`, `image`, `timeStarted`, `timeEnded`) are set on the local `SyncableTrial` object but never reach `replicatedTrialsTable.createTrial()` / `updateTrial()`.

## Proposed Changes

### 1. Database Migration

**Add missing columns:**

```sql
ALTER TABLE trials ADD COLUMN IF NOT EXISTS event_number TEXT;
ALTER TABLE trials ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0;
ALTER TABLE trials ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE trials ADD COLUMN IF NOT EXISTS image_url TEXT;
```

**Change time-of-day columns from TIMESTAMPTZ to TEXT:**

```sql
-- Use AT TIME ZONE 'UTC' for deterministic conversion regardless of session timezone
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

### 2. Supabase generated types

Update `packages/supabase/src/database.types.ts` and `packages/supabase/src/types/database.types.ts` to reflect the new columns and changed types. Manual update is acceptable since regenerating requires DB access.

### 3. ReplicatedTrialsTable.ts — sync all fields

**`ReplicatedTrial` interface** — add: `eventNumber`, `displayOrder`, `category`, `imageUrl`, `actualStartTime`, `actualEndTime`. (`plannedStartTime` was already added in a prior fix.)

**`rowToTrial`** — map all new DB columns to `ReplicatedTrial` fields.

**`toSupabaseRow`** — map all new `ReplicatedTrial` fields to DB columns. Note: `displayOrder` (number) stored as INTEGER in DB; `order` in app is string — convert with `parseInt`/`String()` at the boundary.

### 4. trialStore.ts — propagate all fields to replication

**`addTrial`** — include `trialType`, `plannedStartTime`, `eventNumber`, `displayOrder`, `category`, `imageUrl`, `actualStartTime`, `actualEndTime` in the `replicatedTrial` object passed to `createTrial()`.

**`updateTrial`** — add the same fields to `replicatedUpdates` (lines 114-122) so they flow through to `replicatedTrialsTable.updateTrial()`.

### 5. trial-store-helpers.ts — use synced values

**`replicatedToTrial`** — replace all `'', // Local-only` defaults with actual values from `replicated.*`. Remove the "Local-only" comments. This includes `trialType` and `plannedStartTime` which were already in `ReplicatedTrial` but ignored.

**`mergeTrialData`** — remove the override list for fields that now come from DB. Only `showName` remains truly local (derived from show join, not stored on trials table).

### 6. trial-store-types.ts

`SyncableTrial` already has all needed fields via its `Trial` base interface. No changes needed here — the work is in the mapping functions.

### 7. trialMappers.ts — fix all mappings

- Map `timeStarted` ↔ `actual_start_time` and `timeEnded` ↔ `actual_end_time` in both `mapDatabaseToTrial` and `mapTrialInputToUpdate`.
- Add mappings for `eventNumber` ↔ `event_number`, `order` ↔ `display_order`, `type` ↔ `category`, `image` ↔ `image_url`.
- Handle `order` string↔INTEGER conversion: `parseInt(order, 10)` when writing, `String(display_order)` when reading.

### 8. TrialEditPanel.tsx — no structural changes needed

The form field names stay the same. The mapping happens in `trialMappers.ts` and `ReplicatedTrialsTable.ts`. The `formDataToTrial` / `trialToFormData` functions use app-level names which are unchanged.

### 9. formatStartTime — keep defensive fallbacks

Once time columns are TEXT, the primary path is the "already in display format" regex. Keep the ISO timestamp and "HH:MM:SS" fallback paths for the transition period while IndexedDB caches may still hold old TIMESTAMPTZ strings.

### 10. Schedule timeline

The `useScheduleTimeline` hook fetches `planned_start_time` directly from Supabase. Once the column is TEXT, the value flows through cleanly to `formatStartTime` with no changes needed.

### 11. Trial detail display

Three components (`TrialDetailsMain`, `TrialHeader`, `TrialInfo`) were updated in a prior fix to use `formatStartTime()`. Once the column is TEXT, the formatter passes the value through as-is. `TrialInfo.tsx` also displays `timeStarted`/`timeEnded` — these will start showing real values once the sync chain is fixed.

## Files Changed

| File                                                              | Changes                                                         |
| ----------------------------------------------------------------- | --------------------------------------------------------------- |
| `supabase/migrations/0XX_trial_field_sync.sql`                    | New migration: add 4 columns, alter 3 time columns to TEXT      |
| `packages/supabase/src/database.types.ts`                         | Update types for new/changed columns                            |
| `packages/supabase/src/types/database.types.ts`                   | Same                                                            |
| `apps/myk9show/src/services/replication/ReplicatedTrialsTable.ts` | Add 6 fields to interface, rowToTrial, toSupabaseRow            |
| `apps/myk9show/src/store/trialStore.ts`                           | Propagate all fields in addTrial and updateTrial to replication |
| `apps/myk9show/src/store/trial-store-helpers.ts`                  | Use synced values in replicatedToTrial, clean up mergeTrialData |
| `apps/myk9show/src/services/mappers/trialMappers.ts`              | Add mappings for all new fields, fix actual time mappings       |

## Testing

- Edit a trial, set ALL fields (name, number, date, status, event number, display order, category, image, planned start, time started, time ended, trial type), save, refresh — all values persist
- Create a new trial with all fields filled — values persist after refresh
- Schedule shows planned start time next to trial label
- Trial detail pages show correct planned start, time started, time ended
- myK9Q staging still works (smoke test — schedule board, class cards)

## Out of Scope

- Entry limit fields (`max_entries_per_dog`, etc.) — not in the edit form, not user-facing yet
- `allow_self_checkin` — myK9Q feature, not needed in myK9Show edit panel
- `pipeline_stage` — managed by pipeline dashboard, not the trial edit form
- `sport_type` — used by sport template system, not directly editable; `trial_type` is the active field
- `classes` table time columns — these remain TIMESTAMPTZ (used by myK9Q for actual timing)
