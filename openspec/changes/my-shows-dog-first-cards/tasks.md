## 1. Pure grouping and derivations (no UI)

- [x] 1.1 Add `trialTimezone` to `EntryClass` in `my-entries-types.ts` and thread it from the trial relation in `useMyEntriesData.ts` (already resolved by `getTrialTimezone` in `userEntriesReplication.ts`); extend the existing `useMyEntriesData.test.ts` fixture to assert it lands on the class row.
- [x] 1.2 Create `groupEntriesByShow.ts` composing over `groupEntriesByOrder` output: one `MyShowGroup` per `showId` with `orders`, `dogs` (merged across orders by `dogId`, armband order, unassigned last), and per-class order identity (`orderId`, `registrationId`, `confirmationNumber`). Tests: multi-order show renders once; null `registrationId` rows join their show; class set conserved; two trials on one day keep distinct trial numbers.
- [x] 1.3 Create `myShowDogState.ts` with `deriveDogChip` (precedence per spec) and `deriveClassRowState` (result / in-ring / at-gate / come-to-gate / conflict / pulled / checked-in / check-in-available / opens-later / not-run / absent). Assertion-first tests for every branch, including cancelled show and settled-without-score.
- [x] 1.4 Create `dayCheckIn.ts` with `isTrialDayToday(trialDate, trialTimezone, now)` (Intl-based calendar compare), `weekdayLabel(trialDate, trialTimezone)`, and `deriveDayCheckInTargets(dog, { now, selfCheckinByClassId, isPastShow })`. Tests: night-before, trial day with two classes, mixed days, already-set states skipped, Eastern-device-vs-Pacific-trial, self-check-in disabled.
- [x] 1.5 Create `showMoneyState.ts` with `deriveShowMoneyState(orders, now)` over `getOrderOnlinePrompt` / `getOrderPayAtShowPrompt` / `buildFinishPaymentHref`, plus `refundNotesByDog(orders)`. Tests: one unpaid among paid → balance-due with the cart's amount and href; pay-at-show; waived → settled; past show with balance → unresolved; refund note attaches to that order's dogs only.
- [x] 1.6 Create `paidStripSeen.ts` (localStorage, guarded) and `derivePaidStrips(orders, now, hasSeen)`. Tests: first visit shows; dismissed hides; show date passed hides; storage throwing still renders and dismiss works in-memory; pay-at-show and waived never produce a strip.
- [x] 1.7 Run `cd apps/myk9show && pnpm vitest run src/pages/MyEntriesPage/modules` and confirm green.

## 2. Components

- [x] 2.1 Extract the `.myk9-entries-*` block from `src/styles/myk9-show-details.css` into `src/styles/myk9-my-shows.css`, import it beside the existing import, and repoint `src/test/architecture/entryActionsWrapUnconditionally.test.ts` at the new file and the new action-row selectors; add the new selectors for the show header, dog card, class row, strips, and meta line from the canvas (dark and light from existing tokens only).
- [x] 2.2 Create `MyShowDogCard.tsx`: armband (muted dash when unassigned), name, dog chip via `StatusBadge`, class rows (name · trial date and number · state column with result badge / placement / preliminary / time / faults, or the check-in control), refund note, pending reassurance, and the "Check in for <weekday>" button. Row controls: "Check in" link, "change" link → `onOpenCheckIn(entry, cls)`. 44px hit areas, accessible names including the class name.
- [x] 2.3 Create `MyShowGroup.tsx`: show header (name, meta line with date range · directions link · money word · entries-close when editable; actions Orders & receipts, Edit entry when editable, Add to calendar, View show), balance-due / unresolved strip, paid strips with Dismiss, then the dog cards.
- [x] 2.4 Create `MyShowsList.tsx` holding the `<ul>` and the `useMyShowGroups(filteredEntries)` memo; wire it into `index.tsx` in place of the `MyEntryCard` map without growing `index.tsx`.
- [x] 2.5 Render tests with the custom `render` from `src/test/utils/testUtils.tsx`: a multi-order Heartland fixture (four dogs, two trials on one day, one in ring, one at gate, one conflict, one partially scored with a partial refund) asserting one header, four cards, the meta word, the refund note and no payment chip anywhere; a balance-due fixture asserting exactly one strip with the cart href; a pay-at-show fixture; a pending-review fixture with the reassurance; an unassigned-armband fixture.

## 3. Check-in wiring

- [x] 3.1 Add `checkInClassesForDay(dog, classes)` to `useMyEntriesDialogs.ts`: sequential `await updateEntryCheckIn(entryId, classId, 'checked-in')` per target, stop on first failure, existing toast. Keep `openCheckIn` for "change". Preserve the single-write-path `// INTENT:` comment on the new component.
- [x] 3.2 Tests (assertion-first): two Saturday classes → exactly two `updateEntryCheckIn` calls with `'checked-in'` in class order; mixed days → Saturday only; already at-gate class skipped; row "Check in" → one call; "change" opens `CheckInStatusDialog` with the current status preselected; first failure stops the loop and leaves earlier calls made.
- [x] 3.3 Confirm the button and row links honor `selfCheckinByClassId` and `isClassCheckInEligible` (MYK9-209 absent/excused case) with a test each.

## 4. Receipts, edit entry, scope

- [x] 4.1 Extend `ReceiptEntryDialog` with an optional `orders: MyEntry[]` list stage (date · confirmation · dogs · amount/state · refund rows; row opens that order's receipt; back control). `openReceipt` accepts `MyEntry | MyEntry[]`. Test: one order opens directly; three orders show a list; the `?orderId=` deep link still opens the named order.
- [x] 4.2 Edit entry on a multi-order show: open the single editable order directly, else reuse the list stage to pick one (design D9 / open question). Test the two branches.
- [x] 4.3 Verify `entryScopeFilter` + grouping: a scoped `?entryIds=` link renders only the named dogs and rows and the banner copy is unchanged. Add a test on `useMyShowGroups` over scoped input.
- [x] 4.4 Status filter narrows dogs: test that Pending renders only the pending order's dogs within a show and hides a show with none; tab counts unchanged (extend `useMyEntriesFilters.test.ts`).
- [x] 4.5 Resolve the paid-date source (design open question) and pin it with a test.

## 5. Delete the old card and reconcile tests

- [ ] 5.1 Delete `MyEntryCard.tsx`, `MyEntryCardDetails.tsx`, `MyEntryDogFace.tsx`, `dogFaceSummary.ts` (+ tests) and `MyEntryCard.test.tsx` after triaging each `it`: keep an equivalent for pending reassurance, close-date gating, payment-chip suppression (now money-word suppression), next-action precedence (now button gating), result reveal, and the MYK9-209 / MYK9-263 / MYK9-384 regressions; drop the rest. Remove now-unused exports from `myEntriesUtils.tsx`, `myEntryCardState.ts`, `entryNextAction.ts` and `modules/index.ts`.
- [ ] 5.2 Update E2E specs that assert the old anatomy: `my-entries-page-ui.spec.ts`, `myEntriesZoomReflow.spec.ts` (guard moves to the dog card action row), `simple-show-edit-debug.spec.ts`, `show/phase4CrossRoleSeams.spec.ts` and `fixtures/phase4SeamFixture.ts`, `qa/measurementSweepRoutes.ts` if it names selectors.
- [ ] 5.3 Run `cd apps/myk9show && pnpm vitest run src/pages/MyEntriesPage src/test/architecture > ../../.logs/my-shows.log 2>&1; echo EXIT=$?` and then the whole app suite shuffled once (`pnpm vitest run --sequence.shuffle`); six times if any test adds module-scope mutable state (the seen-marker tests do: reset with `localStorage.clear()` in `beforeEach`).

## 6. Browser verification (evidence for MYK9-482)

- [ ] 6.1 `pnpm dev:show`, sign in as an e2e exhibitor with a multi-order show, and capture desktop + phone screenshots in dark and light of: settled show, balance-due show, pay-at-show show, pending-review dog, two-trials-one-day rows, and the check-in button on a trial day (set the device clock or use a fixture whose trial is today). No horizontal scroll on phone; 44px targets measured, not eyeballed.
- [ ] 6.2 Walk: batch check-in → both rows flip; row "change" → dialog; Orders & receipts → direct for one order, list for several; My Payments Receipt link → same dialog; Dismiss on the paid strip survives reload.
- [ ] 6.3 Attach the screenshots and the walk notes to MYK9-482.

## 7. Ship

- [ ] 7.1 `pnpm typecheck`, `pnpm lint`, `pnpm qa:code-quality-ratchet` (from the worktree), `pnpm format:check:changed`; fix anything red.
- [ ] 7.2 Commit via `/commit`, push, open the PR against `main` with the template (what/why, MYK9-482, checked ACs, screenshots, risk, how to test, non-goals, agent involvement, follow-ups).
- [ ] 7.3 Independent review gate: `pnpm qa:codex-review --base origin/main`; address findings; record the `Review gate:` comment. `bash scripts/qa/watch-pr-checks.sh <pr>` until green.
- [ ] 7.4 Merge with `gh pr merge --squash` from the main repo directory, no `--delete-branch`. Confirm a green production build on `main`.
- [ ] 7.5 Post the implementation comment on MYK9-482 (what changed, checks run, PR link, risks, ACs) and move it to Done only after reading its full description.
- [ ] 7.6 Archive: apply the `exhibitor-my-shows-legibility` delta and add the two new specs (`pnpm openspec archive`), and archive `improve-exhibitor-entries-scan` with a summary stating it is superseded by this change and its three open tasks were evidence/merge items.
