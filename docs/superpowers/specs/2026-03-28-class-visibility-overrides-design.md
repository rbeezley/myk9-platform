# Class-Level Visibility Overrides

**Date:** 2026-03-28
**Status:** Approved

## Summary

Add per-class visibility and self check-in overrides to the Show Settings page, extending the existing show > trial override hierarchy to show > trial > class. The database, mutations, cascade logic, and reusable `SettingsOverrideCard` component already exist — only the UI integration in the settings page is missing.

## Approach

Add a "Class Overrides" collapsible section below Trial Overrides in both `ResultsVisibilitySection` and `SelfCheckinSection`. Classes are grouped by trial, each with a preset selector and reset button — matching the existing trial override row pattern.

## Existing Infrastructure (No Changes Needed)

| Layer     | Component                                                    | Status                            |
| --------- | ------------------------------------------------------------ | --------------------------------- |
| Database  | `class_visibility_overrides` table (migration 060)           | Exists with RLS                   |
| Mutation  | `useUpdateClassOverride` hook                                | Exists                            |
| Mutation  | `useResetOverride` with `level: 'class'`                     | Exists                            |
| Cascade   | `resolveVisibilityCascade(show, trial, class)`               | Supports 3 levels                 |
| Cascade   | `resolveCheckinCascade(show, trial, class)`                  | Supports 3 levels                 |
| Types     | `VisibilityOverride`, `VisibilityPreset`, `VisibilityTiming` | Exist in `@myk9/secretary`        |
| Component | `SettingsOverrideCard` (for detail pages)                    | Exists, supports `level: 'class'` |

## New Work

### 1. New Query Hook: `useClassOverrides(showId)`

Add to `useShowSettingsDatabase.ts` alongside the existing `useTrialOverrides`.

```typescript
export interface ClassOverrideEntry {
  classId: string;
  trialId: string;
  override: VisibilityOverride;
  selfCheckinEnabled: boolean | null;
}

export function useClassOverrides(showId: string | null);
```

Fetches all `class_visibility_overrides` rows for classes belonging to the show's trials. Returns `ClassOverrideEntry[]`.

### 2. ShowSettingsPage Updates

- Fetch class overrides via `useClassOverrides(showId)` alongside existing queries.
- Pass `classOverrides` and class data to `ResultsVisibilitySection` and `SelfCheckinSection`.

### 3. ResultsVisibilitySection — Class Overrides UI

After the Trial Overrides separator, add a "Class Overrides" section:

```
─── Class Overrides ───
▶ Saturday Trial 1                    (collapsible per trial)
  │ Container Novice A     [Inherit ▾]  [↺]
  │ Interior Advanced B    [Open ▾]     [↺]    ← has override
  │ Exterior Masters       [Inherit ▾]
▶ Sunday Trial 2
  │ ...
```

- Classes grouped by trial inside `Collapsible` components
- Each class row: class name + preset `Select` + reset `Button`
- Subtitle shows "Inheriting from trial" or "Inheriting from show" depending on whether the parent trial has an override
- Reset button only visible when class has an explicit override
- Class name built from `element + level + section` fields

### 4. SelfCheckinSection — Class Overrides UI

Same pattern as results visibility:

```
─── Class Overrides ───
▶ Saturday Trial 1
  │ Container Novice A     [Inheriting from show]  [toggle]  [↺]
  │ Interior Advanced B    [Override: ON]          [toggle]  [↺]
▶ Sunday Trial 2
  │ ...
```

- Classes grouped by trial inside `Collapsible`
- Each row: class name + inheritance label + `Switch` toggle + reset button
- Reset only shows when class has explicit override

## Data Flow

```
useClassOverrides(showId)
  → SELECT * FROM class_visibility_overrides
    WHERE class_id IN (
      SELECT id FROM classes
      WHERE trial_id IN (
        SELECT id FROM trials WHERE show_id = ?
      )
    )

On preset change:
  → useUpdateClassOverride.mutate({ classId, trialId, showId, preset, ...timings })
    → UPSERT class_visibility_overrides

On reset:
  → useResetOverride.mutate({ entityId: classId, showId, level: 'class' })
    → UPSERT with all nullable columns set to NULL
```

## Class Name Display

Use the same pattern as elsewhere in myK9Show:

```
[element] [level] [section]
e.g., "Container Novice A", "Interior Advanced", "Exterior Masters"
```

Falls back to `className` if element/level are not set.

## Out of Scope

- Bulk select/apply (Approach B — not chosen)
- Per-field advanced timing at class level in this settings view (available via `SettingsOverrideCard` on class detail pages)
- New database migrations (table already exists)

## Testing

- Unit test `useClassOverrides` hook (mock Supabase, verify query shape and mapping)
- Unit test class override rows render correctly in `ResultsVisibilitySection`
- Unit test class override rows render correctly in `SelfCheckinSection`
- Unit test preset change calls `useUpdateClassOverride` with correct params
- Unit test reset calls `useResetOverride` with `level: 'class'`
