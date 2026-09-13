## Tracking

[MYK9-482](https://linear.app/myk9-platform/issue/MYK9-482/my-shows-one-card-per-show-dog-first-money-only-when-it-needs) · Design: [My Shows Entry Cards canvas](https://claude.ai/code/artifact/040d0891-9557-431b-b63b-7a66cba5b935) (page 1 "Final" is the contract; pages 2–4 are the explorations that were rejected and why).

## Why

`/exhibitor/entries` (My Shows) renders one card per online **order**, so a show the exhibitor entered three times appears three times, and every card stacks three bordered boxes, two status chips of different weight, a floating status sentence, and a "View Show" button competing with a full-width "Entered Classes" bar. The exhibitor cannot answer "which dogs am I running at Heartland, and what do I still owe?" without reading three cards and opening three panels. Fall 2026 launch readiness needs this page calm before show-day volume: it is where an exhibitor checks in from the parking lot, and the check-in control today only reaches the first eligible class on an order.

## What Changes

- **BREAKING (spec-level): group by show, not by order.** One show header per show (name, date range, place, a meta line) with every order's dogs beneath it. Rows with no `registrationId` (secretary-entered) join their show instead of getting their own card. The set of visible classes is conserved.
- **Dog-first cards.** Each dog is its own card under the show header: armband (a muted dash when unassigned), name, one rolled-up status chip, and one row per class showing class name, trial date **and trial number**, and the class's check-in or result state. Two trials on the same day are distinguishable.
- **Entry status lives on the dog, check-in state on the class.** The order-level status chip, the lifecycle sentence, the "Entered Classes (N)" toggle and the collapsed details panel are removed. The dog chip rolls up its classes: in ring > at gate > checked in; a conflict or pull anywhere becomes the chip; pending review / accepted / waitlist / scored otherwise.
- **Money only when it needs attention.** The show meta line carries a muted "✓ Paid" or "Pay at show" word. A balance due renders exactly one warm strip above the dog cards naming the dog and the amount, with the existing Finish Payment link. A refund is a muted note under the dog it touched. "Orders & receipts" in the show header opens the existing receipt dialog: directly for a single order, via a short order list (date · confirmation · dogs · amount · receipt) when the show has several.
- **Paid confirmation that shows once.** After a payment, a green strip (dog, amount, date, receipt destination) with Dismiss. It retires on dismiss or once the show date has passed; the seen marker is device-local, reusing the pattern `resultRevealSeen` established for newly released results.
- **Day-gated batch check-in.** The dog card carries one button, "Check in for <weekday>", which marks every eligible class for **that trial day** by calling the existing per-class check-in mutation once per class. It appears only on the trial day itself, in the trial's timezone, never for a later day, and honors the same self-check-in cascade as today. Each class row keeps its own "Check in" link (one class) and, once a state is set, a "change" link into the existing `CheckInStatusDialog` (at gate, conflict, pulled).
- **Edit entry** and **Entries close** appear in the show header only while the editing window is open. Add to Calendar moves into the show header's secondary actions.
- **Filters keep their contract.** The when/status chips and their counts are still computed from raw rows. The status filter narrows which dogs render inside a show; a show with no matching dog is hidden.

## Duplication decision

No new page, sheet, dialog or route. The receipt dialog, the check-in status dialog, the edit-entry dialog, the cart, and My Payments are reused as they are; the only new UI is the arrangement of what the page already shows. The multi-order receipt list is the inside of the existing receipt dialog, not a surface. A link could not fix this because the problem is the card unit itself (order vs show) and the hierarchy inside it.

## Non-goals

- No change to `/exhibitor/payments`, the cart, the check-in mutation in `useMyEntriesData`, the replication layer, or any server code.
- No server-side "seen" marker for the paid strip.
- No new list controls (search, dog filter, sort).
- No change to the wait-list section, the stats cards, the filter strip, or the entry-scope banner beyond making them work with the show grouping.
- No light-theme redesign: the canvas is dark-only; both themes must render from the same tokens.

## Capabilities

### New Capabilities

- `exhibitor-show-day-check-in`: the day-gated batch check-in from My Shows and the per-class controls beside it.
- `exhibitor-money-on-exception`: the show meta-line money word, the balance-due strip, the once-only paid confirmation, and the multi-order receipt list.

### Modified Capabilities

- `exhibitor-my-shows-legibility`: "One card per online order" becomes one card group per show with dog-first cards; "Entry card leads with summary and single next action" is replaced by the show-header / dog-card hierarchy (the single next action moves to the dog card); "Dog items wrap at five per row" is removed (dogs are cards, not items).

## Impact

- `apps/myk9show/src/pages/MyEntriesPage/index.tsx` (493 lines — at the 500-line cap; the list rendering moves out to a sibling module rather than growing this file)
- `apps/myk9show/src/pages/MyEntriesPage/modules/`: `groupEntriesByOrder.ts` (kept; a new `groupEntriesByShow.ts` composes over it), `MyEntryCard.tsx`, `MyEntryCardDetails.tsx`, `MyEntryDogFace.tsx`, `myEntryCardState.ts`, `entryNextAction.ts`, `useMyEntriesFilters.ts`, `entryScopeFilter.ts`, `useMyEntriesDialogs.ts`, `MyEntriesDialogs.tsx`, `useMyEntriesData.ts` (adds trial timezone to the class row), `my-entries-types.ts`, and their tests (the 1,674-line `MyEntryCard.test.tsx` is replaced by tests on the new pure modules plus one render test per component).
- `apps/myk9show/src/styles/myk9-show-details.css` `.myk9-entries-*` rules (2,288-line file; the entries block is extracted to `myk9-my-shows.css` rather than grown).
- `apps/myk9show/src/features/result-card/resultRevealSeen.ts` pattern reused for a `paidStripSeen.ts` sibling.
- `openspec/specs/exhibitor-my-shows-legibility/spec.md` updated at archive; `openspec/changes/improve-exhibitor-entries-scan` is superseded and archived with that note.
- `apps/myk9show/e2e` exhibitor My Shows specs that assert the old card anatomy.
