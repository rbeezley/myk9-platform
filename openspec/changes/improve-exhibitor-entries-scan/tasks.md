## 1. Pre-Implementation Alignment

- [x] 1.1 Re-read `docs/INTENT.md`, `proposal.md`, `design.md`, and `specs/exhibitor-entry-scanability/spec.md` before coding.
- [x] 1.2 Re-check current `MyEntriesPage` and `MyEntryCard` for drift from the inspected version.
- [x] 1.3 Confirm whether the page should add local search/dog filtering in this slice or limit scope to card hierarchy only.

## 2. Assertion-First Tests

- [x] 2.1 Add/update `MyEntryCard` tests for accepted-paid entries: no four-step lifecycle strip, identity/meta/status still visible.
- [x] 2.2 Add/update `MyEntryCard` tests for pending-review/payment-due entries: current-status chips/text appear before/near the top, no numbered lifecycle steps render, and `Finish Payment` href remains correct.
- [x] 2.3 Add/update `MyEntryCard` tests for multi-class entries: multiple compact class rows render with class name, trial date/number, and check-in/result affordances.
- [x] 2.4 Add/update responsive/source guard tests for long class names and action wrapping if CSS-only layout changes are not directly covered by component tests.
- [x] 2.5 If local search/dog filtering is included, add `useMyEntriesFilters` tests for filtering by dog/show/class/confirmation and for filter-specific empty state behavior. Not included in this slice; scope is card hierarchy/status only.

## 3. Card Hierarchy Implementation

- [x] 3.1 Refactor `MyEntryCard` header into a compact identity/status summary without changing entry/payment semantics.
- [x] 3.2 Remove `EntryStatusStepper` from `MyEntryCard` and replace it with direct current-status chips/summary text.
- [x] 3.3 Convert the classes section from grid mini-cards to compact stable rows that keep check-in/result actions usable.
- [x] 3.4 Preserve current actions: View Show, Finish Payment, pay-at-show text, Edit Entry, View run order, Message the show team, Receipt, and result reveal.
- [x] 3.5 Replace any touched app-facing direct date formatting with the canonical `lib/format/dates.ts` helpers where an appropriate helper exists.

## 4. Page-Level Scan Controls

- [x] 4.1 Keep the mobile source order that lifts entries above the dog strip.
- [x] 4.2 If included, add compact local search/dog filtering above the entry list without adding a new page, panel, or data fetch. Not included in this slice; no new page, panel, or data fetch added.
- [x] 4.3 Make empty states distinguish between "no entries overall" and "no entries match this filter." No new filter state added, so existing zero/filter states remain unchanged.

## 5. Styling and Accessibility

- [x] 5.1 Scope CSS changes to `.myk9-entries-*` selectors and keep card radius at 8px or less unless matching the established page style requires retaining the current card treatment.
- [x] 5.2 Verify all interactive controls keep at least 44px touch targets, accessible labels, and visible focus states.
- [x] 5.3 Remove hover-only meaning and keep mobile layouts stable with no text/action overlap.
- [x] 5.4 Use existing icon/Button/Badge patterns and avoid introducing decorative card-in-card nesting.

## 6. Verification

- [x] 6.1 Run focused unit tests for My Entries modules: `cd apps/myk9show && pnpm vitest run src/pages/MyEntriesPage/modules/MyEntryCard.test.tsx src/pages/MyEntriesPage/modules/useMyEntriesFilters.test.ts src/pages/MyEntriesPage/modules/myEntriesUtils.test.ts`.
- [x] 6.2 Run page-level tests touched by the change: `cd apps/myk9show && pnpm vitest run src/test/pages/MyEntriesPage.test.tsx`.
- [x] 6.3 Run `pnpm typecheck` unless the change is proven CSS/docs-only.
- [ ] 6.4 Start `pnpm dev:show` and visually inspect `/exhibitor/entries` at desktop and mobile widths with an account/data state containing a multi-class entry like Heartland/Tera. Blocked: dev server is running on `http://localhost:5174/`, but the fresh Playwright browser redirects to sign-in.
- [ ] 6.5 Capture/compare screenshots for desktop and mobile to confirm the first viewport is easier to scan and has no overlap. Blocked by the same unauthenticated local browser state.

## 7. Finish

- [x] 7.1 Update relevant tracking docs if this closes or supersedes an existing TODO/audit item. No specific active tracking item was superseded; broad exhibitor golden-path QA remains open.
- [ ] 7.2 Open a PR with the OPSX change name and verification results.
- [ ] 7.3 Wait for CI/review, address feedback, merge, then archive the OpenSpec change.
