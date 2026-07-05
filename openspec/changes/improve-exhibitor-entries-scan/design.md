## Context

The inspected page is `apps/myk9show/src/pages/MyEntriesPage/index.tsx` and `modules/MyEntryCard.tsx`. Current strengths: entries are already grouped by registration/dog, upcoming entries sort before history, the first-run empty state is intentional, mobile lifts entries above the dog strip, tab counts exist, fetch errors render a retry state, and location is now an actual directions link.

The screenshot of `/exhibitor/entries` shows the remaining pain: one entry card consumes most of the viewport, the four-step lifecycle strip competes with badges for the same status story, class tiles are visually heavy, and primary actions are below the fold. For the exhibitor role, the target feeling is "This respects my time"; the page should answer the current entry questions without asking the user to decode every workflow detail.

Duplication check: this does not duplicate an existing page. `/exhibitor/entries` is the canonical exhibitor show hub, Show Details is the deeper show page, `/at-show/:showId` is the day-of execution surface, and cart/payment remains separate. This change improves the hub and keeps links to those existing surfaces.

Offline-first impact: no new core data reads are planned. The implementation should reuse `useMyEntriesData`, `useMyEntriesFilters`, existing result/check-in/payment hooks, and existing route links. If a new UI control needs derived data, it should derive from already-loaded `MyEntry[]`.

## Goals / Non-Goals

**Goals:**

- Make each card scan top-to-bottom as: show/dog, primary status, important dates/location/counts, classes, actions.
- Reduce vertical height enough that an exhibitor with one current show can see the top of the class list and primary action area sooner.
- Replace the four-step lifecycle strip with one primary current-status summary and status chips such as "Pending Review" and "Payment Due."
- Present entered classes as dense rows with stable dimensions and visible class state.
- Keep touch targets at least 44px and preserve current payment, receipt, edit, run-order, result reveal, and check-in affordances.
- Add focused tests before/with implementation and run focused verification.

**Non-Goals:**

- No new My Entries page, dashboard, sheet, route, or duplicated show-day view.
- No change to entry ownership/security/data visibility.
- No database migration.
- No new online-only read for ring/time/class details.
- No redesign of Show Details, cart, results, or `/at-show/:showId`.

## Decisions

### Decision 1: Compact the card instead of adding a new view

Keep `MyEntryCard` as the single card surface, but make it more information-dense:

- Header: show name, dog, confirmation/armband, and one combined primary status.
- Meta row: show date/date range, close date when relevant, directions link, and class count.
- Classes: render as list rows instead of grid cards so five classes read as a schedule, not five subcards.
- Actions: keep primary action(s) close to the status message; secondary actions can wrap but should not dominate.

Alternative considered: add a separate list/table view. Rejected because it creates another mode to learn and fragments the same page.

### Decision 2: Remove the four-step lifecycle strip from My Entries

The stepper consumes a full horizontal band and repeats the information exhibitors actually need as plain statuses. My Entries should show current status directly: review state, acceptance/waitlist/completed state, and payment state. The implementation should remove `EntryStatusStepper` from `MyEntryCard` and rely on current-status chips/summary text.

Alternative considered: keep a compact or conditional stepper. Rejected because the user feedback is clear that the lifecycle steps are not useful here, and the page already has better status vocabulary.

### Decision 3: Keep filters light and derived

Any new scan control should operate on the existing `entries` array. A dog filter or text search is acceptable if it is compact and local. Do not add a duplicate dog-management panel or show-management surface.

Alternative considered: add dog-specific entry pages. Rejected because Dog Detail already owns dog history/profile work; this page should stay cross-show.

### Decision 4: Follow existing shared contracts

Implementation should use existing status helpers/shared classifiers where available, app-facing date formatting from `apps/myk9show/src/lib/format/dates.ts`, and motion tokens/reduced-motion rules where CSS changes add transitions. The current direct `toLocaleDateString()` calls are a cleanup opportunity under the existing `date-formatting` spec, not a new requirement.

## Risks / Trade-offs

- Reducing visual weight could hide useful reassurance -> keep badges/status text visible and add tests for unresolved payment/review states.
- Moving class rows from grid to list could regress mobile wrapping -> add responsive source guard or component tests for long class names and multi-class entries.
- Compacting actions could bury payment -> treat `Finish Payment` as primary whenever present and test its href remains correct.
- Local search/filter can add empty-state confusion -> keep filter empty state distinct from whole-page zero state.
- CSS in `myk9-show-details.css` is shared with other show-details surfaces -> scope new selectors to `.myk9-entries-*` and inspect for unintended matches.
