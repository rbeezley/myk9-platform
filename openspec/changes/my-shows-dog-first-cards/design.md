## Context

My Shows (`apps/myk9show/src/pages/MyEntriesPage`) loads one row per dog per class through `getUserEntries` (replication-backed, offline-first), groups them into one `MyEntry` per online order in `groupEntriesByOrder.ts`, derives each card's state in `myEntryCardState.ts` / `entryNextAction.ts`, and renders `MyEntryCard` → `MyEntryDogFace` (summary band) + `MyEntryCardDetails` (collapsed panel). Filters and tab counts (`useMyEntriesFilters.ts`) already compute from raw rows, and the inbound entry-scope reader (`entryScopeFilter.ts`) matches raw row ids against grouped cards. Check-in writes go through `updateEntryCheckIn` in `useMyEntriesData.ts` (optimistic, replication-backed), opened from `useMyEntriesDialogs.openCheckIn(entry, classEntry)` into `CheckInStatusDialog`. Receipts open from `useMyEntriesDialogs.openReceipt(entry)` into `ReceiptEntryDialog`, which already resolves an order id from the URL for the My Payments deep link.

The settled design is page 1 of the linked canvas: show header → dog cards → class rows; money only on exception; a once-only paid strip; a day-gated batch check-in. The exhibitor intent is "This respects my time" (docs/INTENT.md): fewer taps to check in, one glance to know what is owed, nothing to expand.

Two hard constraints shape the file plan: `index.tsx` is 493 lines and `myk9-show-details.css` is 2,288, and CI's code-quality ratchet fails any regression, so this change extracts rather than grows those files.

## Goals / Non-Goals

**Goals:**

- One show group per show; one card per dog; one row per class with trial date and number.
- Entry status on the dog, check-in state on the class, money on the show, and only when it needs attention.
- A one-tap "Check in for <day>" that fans out over the existing per-class mutation, gated to the trial's day in the trial's timezone.
- Keep every existing dialog, deep link, filter, count and replication path working unchanged.

**Non-Goals:**

- No new mutation, RPC, table, or replication scope. No server-side seen state.
- No change to the cart, My Payments, wait-list section, stats cards, filter strip, or entry-scope banner semantics.
- No new list controls. No light-theme redesign beyond rendering from the same tokens.

## Decisions

**D1. Compose a show grouping over the existing order grouping rather than replacing it.**
`groupEntriesByShow(entries: MyEntry[]): MyShowGroup[]` takes the output of `groupEntriesByOrder` and merges by `showId`, then by `dogId` across orders. Each `MyShowGroup` keeps `orders: MyEntry[]` (for receipts, edit entry, money) and `dogs: MyShowDog[]`, where each `MyShowDog` keeps `classes: (EntryClass & { orderId; registrationId; confirmationNumber })[]`. Alternative considered: regroup from raw rows directly. Rejected because the order grouping already resolves dog-level status merging, balances, refunds and confirmation numbers per order, and every existing selector (`getOrderOnlinePrompt`, `deriveEntryNextAction`, the receipt dialog) takes a `MyEntry`. Composing keeps those untouched and testable in isolation.

**D2. Filters stay on raw rows and orders; the show group is a render-time view.**
`useMyEntriesFilters` keeps returning `filteredEntries: MyEntry[]` with the same tab and status semantics and counts. A new `useMyShowGroups(filteredEntries)` memo produces the groups the list renders. Because the status filter is applied to orders before grouping, a show whose only pending order is filtered out simply disappears, and a show with a pending and an accepted order renders only the pending order's dogs, which is the spec's "status filter narrows dogs". Sorting is by show date as today; groups inherit the order of their first entry.

**D3. Entry-scope deep links narrow inside the group.**
`entryScopeFilter` keeps matching on `MyEntry` cards, so a scoped link yields only the matched orders, and grouping over them renders only those dogs and rows. No change to its matching or to `EntryScopeBanner` copy.

**D4. Dog chip and class state are pure derivations in one module.**
`myShowDogState.ts` exports `deriveDogChip(dog, {isPastShow, isShowCancelled})` implementing the precedence in the spec, and `deriveClassRowState(cls, {today, trialTimezone, isPastShow, selfCheckinEnabled})` returning one of `result | in-ring | at-gate | come-to-gate | conflict | pulled | checked-in | check-in-available | opens-later | not-run | absent`. Both are tested assertion-first. The dog chip renders through the existing `StatusBadge` families and the check-in colour vocabulary already in `design-tokens.css`.

**D5. Money state is one derivation per show over the orders' existing prompts.**
`showMoneyState.ts` exports `deriveShowMoneyState(orders, now)` → `{ kind: 'settled' | 'pay-at-show' | 'balance-due' | 'unresolved'; amountCents; dueDogs; paymentHref }`, built only from `getOrderOnlinePrompt`, `getOrderPayAtShowPrompt`, `MyEntryBalance` and `buildFinishPaymentHref`. It never sums fees itself; the amount is the cart's amount, which keeps `exhibitor-money-clarity` intact. Refund notes come from `refundAmount` / `refundedAt` on the order and are attached to that order's dogs.

**D6. Paid confirmation is a sibling of `resultRevealSeen`.**
`paidStripSeen.ts` with `hasSeenPaidStrip(orderId)` / `markPaidStripSeen(orderId)` under a distinct localStorage prefix. Eligibility: order `paymentStatus` is a paid-online status, `paidAt` (or `lastUpdated` when the balance flipped) is known, and the show's last date is not before today. Alternative considered: a server column. Rejected as scope; device-local matches the result-reveal precedent and the product decision recorded on the canvas.

**D7. Batch check-in is a loop over the existing mutation, not a new write path.**
`useMyEntriesDialogs` gains `checkInClassesForDay(dog, classes)` that awaits `updateEntryCheckIn(entryId, classId, 'checked-in')` sequentially for each class in `deriveDayCheckInTargets(dog, now)`. Sequential, not `Promise.all`, so the optimistic update and its revert behave exactly as the single-class path does; a failure stops the loop, leaves earlier classes checked in, and surfaces the existing toast. The row "Check in" link calls the same function with one class. "change" calls `openCheckIn(entry, classEntry)` as today. The `// INTENT:` note in `MyEntryCard` about a single write path is preserved on the new component.

**D8. "Today" is the trial's day.**
`useMyEntriesData` already receives `trial.timezone` resolved through `getTrialTimezone` from `userEntriesReplication`; it is threaded onto `EntryClass.trialTimezone`. `isTrialDayToday(trialDate, trialTimezone, now)` compares calendar dates via `Intl.DateTimeFormat(..., { timeZone })`, never local `getDate()`. The button label is the weekday of `trialDate` formatted in that zone.

**D9. Receipts for multi-order shows use the existing dialog with a list stage.**
`ReceiptEntryDialog` already accepts an order id; it gains an optional `orders: MyEntry[]` prop. With one order it behaves as now; with several it renders a list stage (date, confirmation, dogs, amount/state, refund rows) and a back control. `useMyEntriesDialogs.openReceipt` takes `MyEntry | MyEntry[]`. The My Payments deep link path (`?orderId=`) is unchanged.

**D10. File plan respects the ratchet.**
New modules: `groupEntriesByShow.ts`, `myShowDogState.ts`, `showMoneyState.ts`, `paidStripSeen.ts`, `dayCheckIn.ts` (targets + timezone helpers), `MyShowGroup.tsx` (header + strips), `MyShowDogCard.tsx` (card + rows), `MyShowsList.tsx` (the `<ul>` moved out of `index.tsx`), `OrdersReceiptsList.tsx` (dialog list stage), and `styles/myk9-my-shows.css` holding the `.myk9-entries-*` rules moved out of `myk9-show-details.css` and imported beside it. `MyEntryCard.tsx`, `MyEntryCardDetails.tsx`, `MyEntryDogFace.tsx`, `dogFaceSummary.ts` and `MyEntryCard.test.tsx` are deleted once the new list is wired. `entryActionsWrapUnconditionally.test.ts` is repointed at the new stylesheet and the new action-row selectors.

**D11. Offline and replication impact.**
Reads are unchanged: the page still renders from the replicated rows `getUserEntries` returns. The batch check-in issues the same optimistic replication-backed writes the single-class dialog does, so it works offline and syncs on reconnect exactly as today; nothing bypasses `updateEntryCheckIn`. The paid strip and its seen marker never touch the network. Trial timezone is already replicated with the trial row, so the day gate does not depend on being online.

## Risks / Trade-offs

- [Merging orders hides which order a class belongs to] → Order identity is kept on every class row and surfaced in the receipts list, Edit entry (per order, via the existing dialog picker when a show has several editable orders), and the scope banner.
- [Status-filter semantics feel different once dogs live under a show] → Counts are unchanged; the spec pins "a show with no matching dog is hidden" and the empty-state copy is unchanged.
- [Sequential batch check-in half-completes on a network error] → Each class shows its own state, so the exhibitor sees exactly which classes are in; the existing per-class toast reports the failure; retrying re-derives targets and skips the ones already set.
- [Device clock vs trial timezone] → The gate uses the trial's zone; a wrong device clock still misgates, as it does for every date on the page today. Tests pin the Eastern-vs-Pacific scenario.
- [Old E2E specs assert `.myk9-entries-card` anatomy] → `my-entries-page-ui.spec.ts`, `myEntriesZoomReflow.spec.ts`, `simple-show-edit-debug.spec.ts` and the seam fixtures are updated in the same PR; the zoom-reflow guard moves to the dog card's action row.
- [`MyEntryCard.test.tsx` (1,674 lines) encodes many past regressions] → Each `it` is triaged: behaviours that survive (pending reassurance, close-date gating, payment-chip suppression → now money-word suppression, next-action precedence → now button gating, result reveal) get an equivalent test on the new pure module or component; the rest are dropped with the file.
- [Light theme untested by the canvas] → Every colour is a token already used on the page; both themes are checked in the browser walk before the PR.

## Migration Plan

Single PR, clean cut, no flag: there are no real users, and the old and new lists would otherwise both need to satisfy the filters, scope reader and dialogs. Rollback is a revert. At archive: apply the `exhibitor-my-shows-legibility` delta to the main spec, add the two new specs, and archive `improve-exhibitor-entries-scan` with a note that this change supersedes it.

## Open Questions

- Whether `paidAt` is available on the order for the green strip's date, or whether the strip should use the payment's `lastUpdated`. Resolved during task 4 by reading `MyEntryBalance` / the stripe order mapping; the spec allows either as long as it is the payment's date.
- Whether "Edit entry" on a multi-order show should list orders before opening the edit dialog, or open the first editable order. Default: reuse the receipts list stage pattern; if it is more than an hour of work, open the first editable order and list the rest inside the dialog's existing entry picker.
