# Results Control & Self Check-in — Design Spec

**Date:** 2026-03-28
**Status:** Approved

## Summary

Give secretaries control over two aspects of the show-day experience:

1. **Result visibility** — when exhibitors can see each result field (qualification, time, faults, placement)
2. **Self check-in** — whether exhibitors can change their own check-in status in the app

Both use a three-level cascade: show default → trial override → class override. Settings live in Mission Control as a slide-out panel. Enforcement is display-layer only — data is always in the DB, the UI filters what's shown based on role and settings.

## Data Model

### Tables

**`show_result_visibility_defaults`**

| Column                 | Type                                                       | Notes                                                  |
| ---------------------- | ---------------------------------------------------------- | ------------------------------------------------------ |
| `show_id`              | UUID, PK, FK → shows                                       | One row per show                                       |
| `preset_name`          | TEXT ('open' \| 'standard' \| 'review')                    | Quick-set preset                                       |
| `placement_timing`     | TEXT ('immediate' \| 'class_complete' \| 'manual_release') | Never 'immediate' — placement requires all dogs to run |
| `qualification_timing` | TEXT (same enum)                                           |                                                        |
| `time_timing`          | TEXT (same enum)                                           |                                                        |
| `faults_timing`        | TEXT (same enum)                                           |                                                        |
| `self_checkin_enabled` | BOOLEAN, DEFAULT true                                      | Show-level default                                     |
| `updated_at`           | TIMESTAMPTZ                                                |                                                        |
| `updated_by`           | UUID, FK → auth.users                                      | Audit trail                                            |

**`trial_result_visibility_overrides`**

| Column                 | Type                  | Notes                            |
| ---------------------- | --------------------- | -------------------------------- |
| `trial_id`             | UUID, PK, FK → trials | One row per trial with overrides |
| `preset_name`          | TEXT, nullable        | Null = inherit from show         |
| `placement_timing`     | TEXT, nullable        |                                  |
| `qualification_timing` | TEXT, nullable        |                                  |
| `time_timing`          | TEXT, nullable        |                                  |
| `faults_timing`        | TEXT, nullable        |                                  |
| `self_checkin_enabled` | BOOLEAN, nullable     | Null = inherit from show         |
| `updated_at`           | TIMESTAMPTZ           |                                  |
| `updated_by`           | UUID, FK → auth.users |                                  |

**`class_result_visibility_overrides`**

| Column                 | Type                   | Notes                            |
| ---------------------- | ---------------------- | -------------------------------- |
| `class_id`             | UUID, PK, FK → classes | One row per class with overrides |
| `preset_name`          | TEXT, nullable         | Null = inherit from trial → show |
| `placement_timing`     | TEXT, nullable         |                                  |
| `qualification_timing` | TEXT, nullable         |                                  |
| `time_timing`          | TEXT, nullable         |                                  |
| `faults_timing`        | TEXT, nullable         |                                  |
| `self_checkin_enabled` | BOOLEAN, nullable      | Null = inherit                   |
| `updated_at`           | TIMESTAMPTZ            |                                  |
| `updated_by`           | UUID, FK → auth.users  |                                  |

### Constraints

- `placement_timing` cannot be `'immediate'` — placement is only meaningful after all dogs in a class have run.
- CHECK constraints on timing columns to enforce the three valid values.
- Cascade deletes: if a show/trial/class is deleted, the visibility row is deleted too.

### Presets

Constants defined in code, not DB rows:

| Preset     | Label        | Qualification  | Time           | Faults         | Placement      |
| ---------- | ------------ | -------------- | -------------- | -------------- | -------------- |
| `open`     | Immediately  | immediate      | immediate      | immediate      | class_complete |
| `standard` | After Class  | immediate      | class_complete | class_complete | class_complete |
| `review`   | After Review | manual_release | manual_release | manual_release | manual_release |

### Cascade Resolution

For any class, the effective visibility is resolved by checking each field:

1. Class override (if non-null) → use it
2. Trial override (if non-null) → use it
3. Show default → use it

Same cascade for `self_checkin_enabled`.

## Service Layer

### `resultVisibilityService.ts`

Pure functions, no React dependencies.

- **`resolveVisibility(showSettings, trialOverride?, classOverride?)`** — walks the cascade per field, returns effective `{ placementTiming, qualificationTiming, timeTiming, faultsTiming, selfCheckinEnabled }`.
- **`isFieldVisible(timing, classStatus, isReleased)`** — given a field's timing and the class state, returns boolean:
  - `immediate` → always true
  - `class_complete` → true when class status is `'completed'`
  - `manual_release` → true only when `results_released_at` is set on the class
- **`getVisibleFields(effectiveSettings, classStatus, isReleased, userRole)`** — returns `{ showPlacement, showQualification, showTime, showFaults }`. Staff roles (secretary, judge, site_admin) always return all true. Exhibitors are subject to visibility rules.

### React Query Hooks

- **`useVisibilitySettings(showId)`** — fetches all three tables for the show in one query (show defaults + trial overrides + class overrides). Cached with `cacheStrategies.moderate` (5 min).
- **`useEffectiveVisibility(classId)`** — derives effective settings for a specific class from the cached data. Calls `resolveVisibility`.
- **`useVisibleResultFields(classId, userRole)`** — consumer-facing hook. Returns the four boolean flags for which fields to show. Uses `useEffectiveVisibility` + `isFieldVisible` + class status.

### Mutations

Direct Supabase writes (not through replication layer — these are configuration, not competition data):

- **`useUpdateShowVisibility()`** — upsert to `show_result_visibility_defaults`. Invalidates `useVisibilitySettings` cache.
- **`useUpdateTrialVisibility()`** — upsert or delete on `trial_result_visibility_overrides`. Delete = reset to show default.
- **`useUpdateClassVisibility()`** — upsert or delete on `class_result_visibility_overrides`. Supports bulk operations (array of class IDs).

All mutations include optimistic updates and rollback.

## UI — Show Settings Panel in Mission Control

### Access

A gear icon / "Show Settings" button in the Mission Control header. Opens a slide-out panel (same pattern as `ClassRequirementsPanel`).

### Component: `ShowSettingsPanel.tsx`

Located at `src/features/pipeline/components/ShowSettingsPanel.tsx`.

Two collapsible sections:

#### 1. Result Visibility

**Show default:** Three preset cards in a grid ("Immediately" / "After Class" / "After Review"), each with a short description. Active preset highlighted. Selecting a preset sets all four timing fields at once.

**Advanced toggle:** Expands per-field dropdowns (placement, qualification, time, faults) for non-preset combinations. Shows when the current configuration doesn't match any preset.

**Trial overrides:** Expandable list of trials. Each trial shows:

- Current effective preset (inherited badge if no override, custom badge if overridden)
- Preset selector dropdown
- "Reset" button to remove override (returns to show default)

**Class overrides:** Expandable section. Checkbox list of classes with bulk actions:

- Select all / clear selection
- Apply preset to selected classes
- "Reset" button per class to remove override

#### 2. Self Check-in

**Show default:** Toggle switch (enabled/disabled) with description text.

**Trial overrides:** List of trials with toggle + reset button. Shows "Inherited" or "Custom" badge.

**Class overrides:** Bulk select classes + enable/disable buttons.

### Visual Indicators

- **"Inherited"** badge (muted) on trials/classes using the parent default
- **"Custom"** badge (accent color) on trials/classes with explicit overrides

## Enforcement Points

Visibility rules are enforced at the display layer. Data stays in the DB — the UI filters what's shown.

### ClassResultsTable

Each field cell (qualification, time, faults, placement) checks `useVisibleResultFields(classId, userRole)`. Hidden fields show `--` or a muted "Pending" indicator. Staff always sees everything.

### Public Results Tab (ShowDetailsPage)

PodiumCards and result listings use `useVisibleResultFields`. Hidden placements → no podium cards, replaced with "Results pending review" message.

### My Entries Tab

Same field-level filtering when exhibitors view their own results.

### Self Check-in Enforcement

`StatusPickerDialog` checks `useEffectiveVisibility(classId).selfCheckinEnabled`. When false and user is an exhibitor, the check-in badge is display-only (no click handler). Staff can always change check-in status regardless of setting.

## RLS Policies

- All three tables: SELECT open to authenticated users (exhibitors need to read settings to know what's visible).
- INSERT/UPDATE/DELETE restricted to secretary, judge, site_admin roles.
- No anon access.

## Testing

- Unit tests for `resolveVisibility` cascade logic (all combinations of null/non-null at each level)
- Unit tests for `isFieldVisible` with each timing × class status combination
- Unit tests for `getVisibleFields` role bypass (staff always sees all)
- Component tests for `ShowSettingsPanel` preset selection and override management
- Integration test: set visibility to "After Review", verify exhibitor view hides fields, verify staff view shows all
