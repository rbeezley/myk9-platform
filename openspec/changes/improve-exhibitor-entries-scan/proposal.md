## Why

`/exhibitor/entries` is now showing the right entries, including Heartland/Tera, but the current card layout is hard to scan: repeated lifecycle signals, tall class tiles, and action-heavy cards make the exhibitor work to answer simple questions like "Am I in?", "What still needs action?", and "Which classes did I enter?" This supports fall 2026 launch readiness by making the exhibitor's primary show hub calm and glanceable before show-day volume makes friction expensive.

## What Changes

- Rework the existing My Entries card hierarchy so each card reads as a compact show/dog summary first, with class details and secondary actions visually subordinate.
- Preserve the current consolidated surface: `/exhibitor/entries` remains the exhibitor show hub, Show Details remains the deeper show page, `/at-show/:showId` remains the show-day execution surface, and payment continues to link to the existing cart flow.
- Remove the four-step lifecycle strip from My Entries cards and replace it with plain current-status chips/summary text such as "Pending Review" and "Payment Due."
- Make class rows easier to scan by presenting class name, trial/date, check-in/result state, and run-order/result affordances in a denser list layout instead of a grid of mini cards.
- Add light-weight list controls only if they tighten the existing page: text search/dog filter/sort must filter the same page data and must not become a new management surface.
- Keep mobile first-fold priority: current entries should appear before dog-management content, and stat/detail expansion must not bury the schedule.

## Capabilities

### New Capabilities

- `exhibitor-entry-scanability`: Defines the scanability, grouping, state hierarchy, and action-placement behavior for the exhibitor My Entries page.

### Modified Capabilities

- None. Existing `status-display`, `date-formatting`, and `motion-language` requirements should be followed during implementation, but this change does not alter their contracts.

## Impact

- Affected app code:
  - `apps/myk9show/src/pages/MyEntriesPage/index.tsx`
  - `apps/myk9show/src/pages/MyEntriesPage/modules/MyEntryCard.tsx`
  - `apps/myk9show/src/pages/MyEntriesPage/modules/useMyEntriesFilters.ts`
  - `apps/myk9show/src/pages/MyEntriesPage/modules/my-entries-types.ts`
  - `apps/myk9show/src/styles/myk9-show-details.css`
  - focused tests under `apps/myk9show/src/pages/MyEntriesPage/modules/` and page-level tests under `apps/myk9show/src/test/pages/`
- No database migration expected.
- No new routes, dialogs, or duplicated entry/show-day surfaces.
- No new online-only reads in the core entry list; retain the existing data path and current payment/show/run-order deep links.
