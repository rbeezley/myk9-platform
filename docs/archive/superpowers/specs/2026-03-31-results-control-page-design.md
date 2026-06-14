# Results Control Page — Design Spec

**Date:** 2026-03-31
**Status:** Draft
**Supersedes:** 2026-03-28-results-control-design.md (UI approach changed from slide-out panel to standalone page)

## Summary

Standalone secretary page for controlling result visibility and self check-in across a show's trials and classes. Refactors the existing 488-line `ResultsVisibilitySection` into focused sub-components, adds bulk class operations, self check-in cascade, and Release Results action.

## Decisions

| Decision           | Choice                                                   | Rationale                                                                   |
| ------------------ | -------------------------------------------------------- | --------------------------------------------------------------------------- |
| Page vs panel      | Standalone page at `/secretary/results-control`          | Active event management tool, not a buried setting                          |
| Admin name         | Auto from auth context (`user.id`)                       | myK9Show has real user identities, no manual input needed                   |
| Self check-in      | Same scope as visibility                                 | Same cascade pattern, same audience, minimal extra effort                   |
| Release Results    | Included                                                 | Essential for `manual_release` (Review preset) workflow                     |
| Component strategy | Refactor existing `ResultsVisibilitySection` into pieces | 488 lines already at threshold, adding bulk ops would exceed 500-line limit |

## Data Model

No schema changes. Uses existing tables from migration 093:

- `show_result_visibility_defaults` (show_id PK)
- `trial_result_visibility_overrides` (trial_id PK, nullable fields = inherit)
- `class_result_visibility_overrides` (class_id PK, nullable fields = inherit)

All tables have `self_checkin_enabled` column. Cascade: class override > trial override > show default.

Release Results uses the existing `results_released_at` column on the `classes` table. Note: `results_released_by` does not exist in the shared schema — audit trail for who released is not tracked (acceptable for MVP; can add via migration later if needed).

`updated_by` on all visibility writes = `auth.user.id` from `useAuthContext()`.

## Presets (unchanged from shared package)

| Preset   | Qualification  | Time           | Faults         | Placement      |
| -------- | -------------- | -------------- | -------------- | -------------- |
| Open     | immediate      | immediate      | immediate      | class_complete |
| Standard | immediate      | class_complete | class_complete | class_complete |
| Review   | manual_release | manual_release | manual_release | manual_release |

## Page Layout

Route: `/secretary/results-control` — SECRETARY + SITE_ADMIN only.

```
+--------------------------------------------------+
| Results Control            [Show Name] breadcrumb |
+--------------------------------------------------+
| [Open] [Standard] [Review]    <- PresetSelector   |
|   > Advanced (per-field timing accordion)         |
+--------------------------------------------------+
| Self Check-in                                     |
|   [x] Allow exhibitors to self check-in           |
|   Trial overrides...                              |
+--------------------------------------------------+
| Trial Overrides (visibility)                      |
|   Trial 1: [Standard v] [Reset]                   |
|   Trial 2: [Inherit v]                            |
+--------------------------------------------------+
| Class Overrides                                   |
|   > Trial 1 (4 classes, 1 overridden)             |
|     [x] Novice Standard  [Open v] [Reset]         |
|     [x] Open Standard    [Inherit v]              |
|     [ ] Excellent Std    [Inherit v]              |
|   > Trial 2 ...                                   |
+--------------------------------------------------+
| ====== Sticky Bulk Bar (when classes selected) == |
| 2 selected | [Apply Preset v] [Check-in v] [Release Results] |
+--------------------------------------------------+
```

## Component Decomposition

All new components live in `src/pages/secretary/ResultsControlPage/`.

### `ResultsControlPage.tsx` (~120 lines)

Top-level page component. Responsibilities:

- Route setup, show context from `useShowStore().selectedShowId` (same pattern as `ShowSettingsPage`)
- Fetches data via `useShowSettings`, `useTrialOverrides`, `useClassOverrides` from `useShowSettingsDatabase` + trials/classes from stores
- Composes sub-components
- Manages bulk selection state via `useBulkClassOperations`

### `PresetSelector.tsx` (~120 lines)

Extracted from lines 277-338 of existing `ResultsVisibilitySection`.

- 3 clickable preset cards (Open/Standard/Review) with icons
- Active preset highlighted with ring
- Advanced collapsible: per-field timing dropdowns + "Save Custom Timings" button
- Props: `showId`, `activePreset`, `currentTimings`

### `TrialOverrides.tsx` (~80 lines)

Extracted from lines 341-395 of existing `ResultsVisibilitySection`.

- Per-trial row with preset dropdown + reset button
- Shows "Inheriting from show" or "Override: [preset]" label
- Props: `showId`, `trials`, `trialOverrides`

### `ClassOverrides.tsx` (~120 lines)

Extracted from lines 398-484, **enhanced with checkboxes**.

- Classes grouped by trial in collapsibles
- Checkbox per class row (for bulk selection)
- Per-class preset dropdown + reset button
- Select-all per trial group
- Props: `showId`, `trials`, `classes`, `classOverrides`, `selectedClasses`, `onToggleClass`, `onToggleAllInTrial`

### `BulkOperationsBar.tsx` (~100 lines)

New component. Sticky bottom bar, only visible when `selectedClasses.size > 0`.

- Shows: "X classes selected" + Select All / Clear buttons
- Actions:
  - **Apply Preset** — dropdown (Open/Standard/Review), batch applies to selected
  - **Toggle Self Check-in** — Enable/Disable buttons
  - **Release Results** — button, enabled only when at least one selected class uses `manual_release` timing. Sets `results_released_at = now()` on selected classes.
- Confirmation toast after each bulk action with count of affected classes

### `SelfCheckinSection.tsx` (existing, 255 lines)

**Already exists** at `src/pages/secretary/ShowSettingsPage/SelfCheckinSection.tsx`. Fully functional with show toggle + trial/class cascade overrides. Move to the new `ResultsControlPage/` directory and import from there. No changes needed to its implementation — just relocate and re-export from the old location for backwards compatibility (or update ShowSettingsPage to import from the new location).

### `resultsControlUtils.ts` (~60 lines)

Shared helpers extracted from `ResultsVisibilitySection`:

- `TimingSelect` component
- `detectPreset(timings)` — reverse-lookup which preset matches field timings
- `hasVisibilityOverride(override)` — checks if any field is non-null
- `PRESET_ICONS` constant
- `FieldTimings` type + `fieldTimingsFromSettings()` converter

## Hooks

### Existing (reused as-is)

- `useVisibilitySettings(showId)` — React Query, fetches all 3 visibility tables
- `useUpdateShowVisibility()` — mutation, upsert show defaults
- `useUpdateTrialOverride()` — mutation, upsert/reset trial override
- `useUpdateClassOverride()` — mutation, upsert/reset class override
- `useResetOverride()` — mutation, delete override row

### New

#### `useBulkClassOperations(showId)`

Selection state + batch mutations:

- **State:** `selectedClasses: Set<string>`, managed with `toggle`, `selectAll`, `clear`, `selectAllInTrial`
- **`bulkApplyPreset(preset)`** — calls `useUpdateClassOverride` for each selected class via `Promise.all`
- **`bulkToggleCheckin(enabled)`** — same pattern, updates `self_checkin_enabled` on class overrides
- **`bulkReleaseResults()`** — calls `useReleaseResults` for selected class IDs

#### `useReleaseResults()`

New React Query mutation:

- Updates `classes` table: `{ results_released_at: new Date().toISOString() }`
- Accepts array of class IDs
- Invalidates visibility settings + class queries on success
- Toast: "Results released for X classes"

## Route Integration

Add to `secretaryRoutes.tsx`:

```tsx
const ResultsControlPage = lazy(() => import('@/pages/secretary/ResultsControlPage'));

<Route
  path="/secretary/results-control"
  element={
    <ProtectedRoute requiredRole={[UserRole.SECRETARY, UserRole.SITE_ADMIN]}>
      <SuspenseWrapper>
        <PageTransition>
          <ResultsControlPage />
        </PageTransition>
      </SuspenseWrapper>
    </ProtectedRoute>
  }
/>;
```

## Old `ResultsVisibilitySection` in ShowSettingsPage

Replace the full component with a summary card + link:

- Shows current show preset (e.g., "Standard — After Class")
- "Manage Results Visibility" link navigating to `/secretary/results-control`

## Testing

### Component Tests

| Test file                    | Covers                                                                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `PresetSelector.test.tsx`    | Renders 3 presets, highlights active, calls mutation on click, advanced accordion toggles                                       |
| `TrialOverrides.test.tsx`    | Renders trials, applies override via dropdown, resets to inherited                                                              |
| `ClassOverrides.test.tsx`    | Renders grouped classes, checkbox selection, per-class override, select-all per trial                                           |
| `BulkOperationsBar.test.tsx` | Shows/hides based on selection count, action buttons trigger mutations, Release Results disabled when no manual_release classes |

### Hook Tests

| Test file                        | Covers                                                                          |
| -------------------------------- | ------------------------------------------------------------------------------- |
| `useBulkClassOperations.test.ts` | Selection toggling, select all/clear, batch preset apply, batch check-in toggle |
| `useReleaseResults.test.ts`      | Calls correct table/columns, sets user ID, invalidates queries                  |

### Integration Test

| Test file                     | Covers                                                                                                                 |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `ResultsControlPage.test.tsx` | Full page render with mock data, preset change, bulk select + apply preset, release results flow, self check-in toggle |

All tests use `testUtils.tsx` render wrapper with mocked Supabase client.
