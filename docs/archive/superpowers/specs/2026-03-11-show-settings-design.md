# Show Settings: Results Visibility & Self Check-In

**Date:** 2026-03-11
**Status:** Approved

## Problem

myK9Q has secretary settings for results visibility (per-field timing with presets) and self check-in toggles, with a show-trial-class cascade. myK9Show has no settings UI for either feature despite having some plumbing (`useSelfCheckinEnabled` hook, `results_visible_to_all` DB column). Secretaries managing shows in myK9Show cannot control when exhibitors see results or whether self check-in is enabled.

## Decisions

| Decision          | Choice                                  | Rationale                                             |
| ----------------- | --------------------------------------- | ----------------------------------------------------- |
| Cascade model     | Full show > trial > class               | Matches myK9Q, shares more code                       |
| Settings location | Dedicated page + contextual overrides   | Best of both: quick defaults + granular control       |
| Override behavior | Cascade respects explicit overrides     | Changing show-level only affects inheriting children  |
| Audit trail       | Automatic (authenticated user identity) | myK9Show has real auth, no need for manual name input |
| Shared package    | New `@myk9/secretary`                   | Upcoming kanban board work will reuse the package     |

## Section 1: Shared Package (`@myk9/secretary`)

New workspace package at `packages/secretary/`. Pure TypeScript — no React, no Supabase. Exports types and cascade resolution logic.

### Structure

```
packages/secretary/
├── package.json          # @myk9/secretary
├── tsconfig.json
├── vitest.config.ts
└── src/
    ├── index.ts
    ├── visibility/
    │   ├── visibility-types.ts      # VisibilityPreset, VisibilityTiming, ResultField, VisibilitySettings, VisibleResultFields, PresetInfo
    │   ├── visibility-presets.ts     # PRESET_CONFIGS (open, standard, review) — data only, no UI metadata (icons/descriptions stay in each app)
    │   └── visibility-cascade.ts    # resolveVisibilityCascade(), getVisibleResultFields()
    └── checkin/
        └── checkin-cascade.ts       # resolveCheckinCascade()
```

### Key Types

Field names match myK9Q's existing `VisibilitySettings` (short names without `_timing` suffix). DB columns use `_timing` suffix; the adapter layer in each app maps between them.

```typescript
type VisibilityTiming = 'immediate' | 'class_complete' | 'manual_release';
type VisibilityPreset = 'open' | 'standard' | 'review';
type ResultField = 'placement' | 'qualification' | 'time' | 'faults';

/** Resolved visibility for a class — all fields required (no nulls after cascade). */
interface VisibilitySettings {
  placement: VisibilityTiming;
  qualification: VisibilityTiming;
  time: VisibilityTiming;
  faults: VisibilityTiming;
  inheritedFrom?: 'show' | 'trial' | 'class';
  preset?: VisibilityPreset;
}

/** Computed per-user visibility flags (output of getVisibleResultFields). */
interface VisibleResultFields {
  showPlacement: boolean;
  showQualification: boolean;
  showTime: boolean;
  showFaults: boolean;
}

/** UI metadata for preset cards — each app can extend with icons/styling. */
interface PresetInfo {
  preset: VisibilityPreset;
  title: string;
  description: string;
  details: string;
}
```

### Cascade Resolution

All functions are pure data-in/data-out — they accept settings objects, not IDs. Agnostic to PK type (UUID vs license_key). Each app's adapter layer fetches from its own DB schema and passes the settings objects in.

`resolveVisibilityCascade(show, trial?, class?)` — merges nullable override objects. Each level's non-null fields override the parent. Returns a complete `VisibilitySettings`.

**Preset vs field precedence:** Per-field values take precedence over preset. When a level sets `preset = 'open'` but also has `time = 'manual_release'`, the explicit field wins. Preset is applied first as defaults, then individual field overrides are layered on top. This matches myK9Q's existing behavior.

`resolveCheckinCascade(show, trial?, class?)` — `class.self_checkin_enabled ?? trial.self_checkin_enabled ?? show.self_checkin_enabled ?? true`.

`getVisibleResultFields(settings, classState, userRole)` — combines the resolved `VisibilitySettings` with class completion status (`'in_progress' | 'completed' | 'released'`) and user role (`'judge' | 'admin' | 'secretary' | 'steward' | 'exhibitor'`). Judges and admins always see all fields. Returns `VisibleResultFields` boolean flags.

## Section 2: Database Schema

Migration `060_show_settings.sql` with three tables.

### `show_visibility_settings`

| Column               | Type                                   | Notes                                      |
| -------------------- | -------------------------------------- | ------------------------------------------ |
| show_id              | UUID PK, FK shows                      | One row per show                           |
| preset               | TEXT NOT NULL DEFAULT 'standard'       | 'open', 'standard', 'review'               |
| placement_timing     | TEXT NOT NULL DEFAULT 'class_complete' | Placement only meaningful after completion |
| qualification_timing | TEXT NOT NULL DEFAULT 'immediate'      | Matches 'standard' preset                  |
| time_timing          | TEXT NOT NULL DEFAULT 'class_complete' | Matches 'standard' preset                  |
| faults_timing        | TEXT NOT NULL DEFAULT 'class_complete' | Matches 'standard' preset                  |
| self_checkin_enabled | BOOLEAN NOT NULL DEFAULT true          |                                            |
| updated_by           | UUID FK auth.users                     |                                            |
| updated_at           | TIMESTAMPTZ DEFAULT now()              |                                            |

**Constraint:** `CHECK (placement_timing != 'immediate')` — placement is only meaningful after a class completes, so `immediate` is not a valid option.

### `trial_visibility_overrides`

| Column               | Type                      | Notes                    |
| -------------------- | ------------------------- | ------------------------ |
| trial_id             | UUID PK, FK trials        | One row per trial        |
| preset               | TEXT NULL                 | NULL = inherit from show |
| placement_timing     | TEXT NULL                 |                          |
| qualification_timing | TEXT NULL                 |                          |
| time_timing          | TEXT NULL                 |                          |
| faults_timing        | TEXT NULL                 |                          |
| self_checkin_enabled | BOOLEAN NULL              | NULL = inherit           |
| updated_by           | UUID FK auth.users        |                          |
| updated_at           | TIMESTAMPTZ DEFAULT now() |                          |

**Constraint:** `CHECK (placement_timing IS NULL OR placement_timing != 'immediate')`.

### `class_visibility_overrides`

Same shape as trial overrides but with `class_id` PK. Same placement constraint.

### RLS

All three tables: SELECT/INSERT/UPDATE for users with secretary, admin, or club_admin role on the associated show. No DELETE — rows are upserted, not removed (reset = set columns to NULL).

### Existing Column Deprecation

The `results_visible_to_all` boolean column on the `shows` table (from migration 002) becomes redundant. The migration adds a comment marking it deprecated. It is not dropped — existing queries that read it continue to work. New code uses the `show_visibility_settings` table instead. A future cleanup migration can drop the column once all consumers are migrated.

## Section 3: myK9Show Settings UI

### Dedicated Settings Page (`/secretary/settings`)

Added to secretary sidebar under the "Manage" group as "Settings."

**Results Visibility section:**

- Three preset cards (Open / Standard / Review) with descriptions and field timing summaries
- Selecting a preset auto-fills all four timing fields
- "Advanced" accordion expands to show per-field dropdowns for custom configuration
- Placement dropdown excludes the "Immediate" option (enforced by CHECK constraint)
- Trial override list below: each trial shows inherited or overridden state, with dropdowns to override and a reset button

**Self Check-In section:**

- Show-level toggle (enabled/disabled)
- Trial override list: each trial inherits or overrides, with toggle and reset

### Contextual Overrides

- **TrialDetailsPage**: Small "Settings" card showing inherited visibility + check-in state with override controls
- **ClassDetailsPage**: Same pattern, class-level overrides

### Data Flow

React Query hooks fetch settings from the three tables. Mutations use upsert with optimistic cache updates. Cascade resolution uses `@myk9/secretary` functions client-side for instant preview; server state is source of truth.

### Existing Hook Migration

The existing `useSelfCheckinEnabled` hook (at `apps/myk9show/src/hooks/queries/useSelfCheckinEnabled.ts`) currently queries inline boolean columns on `shows`/`trials`/`classes` tables via RPC. It will be rewritten to query the new settings tables and use `@myk9/secretary`'s `resolveCheckinCascade()`. The existing hook's public API (`useSelfCheckinEnabled(classId)` returning `{ enabled: boolean }`) remains unchanged so consumers are unaffected.

## Section 4: myK9Q Migration

- Delete `apps/myk9q/src/types/visibility.ts` — replaced by `@myk9/secretary` imports
- Update `resultVisibilityService.ts` to delegate cascade resolution to shared `resolveVisibilityCascade()` and `resolveCheckinCascade()`; service becomes a thin Supabase adapter that maps DB column names (`_timing` suffix) to shared type field names (short names)
- Update imports in hooks and any other files that imported from the deleted types file (~5-8 files total, including hooks, service, and any components that reference types directly)
- UI components unchanged — they consume hooks, not types
- myK9Q DB tables unchanged (different PK scheme: `license_key` TEXT vs UUID, same logical types)

## Section 5: Testing Strategy

- **`@myk9/secretary`**: Unit tests for cascade resolution covering all inheritance/override combinations, preset configs, edge cases (all-null = full inherit, partial overrides), `getVisibleResultFields()` role-based bypass, placement constraint validation. Pure functions, easy vitest coverage.
- **Database**: Verify tables, RLS policies, nullable columns, FK constraints, CHECK constraints (placement != immediate) via Supabase local dev.
- **myK9Show UI**: Component tests for preset card selection, toggle interactions, override dropdowns, placement dropdown excluding "Immediate." Hook tests with mocked Supabase responses.
- **myK9Q migration**: Existing test suite passes unchanged (behavior identical, import paths and property access updated).
- **Coverage gates**: New `@myk9/secretary` package gets baseline coverage threshold in CI.
