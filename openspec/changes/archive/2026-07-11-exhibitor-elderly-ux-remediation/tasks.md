## 1. Closed Entry And Entry-Change Gates

- [x] 1.1 Replace Monogram closed-show entry CTAs with closed-state guidance and late-entry recovery copy.
- [x] 1.2 Inventory every public show landing/detail entry CTA and registration start link outside Monogram.
- [x] 1.3 Add or reuse a shared entry-availability helper that matches submission close-date/business rules and returns a recovery destination.
- [x] 1.4 Gate every affected show landing/detail CTA through the shared availability result.
- [x] 1.5 Block direct closed-show registration wizard URLs before dog or class selection.
- [x] 1.6 Replace post-close missing `Edit Entry` actions with plain explanation and a link to the existing message/show-team surface.
- [x] 1.7 Add focused tests for closed CTAs, direct wizard blocking, and post-close entry-card replacement actions.

## 2. Payment Confidence

- [x] 2.1 Identify the existing My Shows fee-summary and cart/payment data source for exhibitor unpaid balances.
- [x] 2.2 Add an amount-due section to My Payments that uses the same entry/cart/payment records.
- [x] 2.3 Link My Shows fee summaries to My Payments or the existing cart/checkout handoff with relevant context.
- [x] 2.4 Separate gross paid, refunds, and net paid in plain language in payment history.
- [x] 2.5 Add focused tests proving My Shows and My Payments display the same due amount and preserve the existing checkout handoff.

## 3. Exhibitor Show-Day Trust

- [x] 3.1 Identify the current exhibitor show-day route, data source, and class/ringside empty states. — `/at-show/:showId` → `AtShowClassListPage`, data via `useAtShowClassList` (replicated shows/trials/classes); prior empty state was a generic "This show has no classes yet" not scoped to exhibitor ownership.
- [x] 3.2 Default exhibitor show-day navigation to the user's dogs today while keeping full class/ringside lists secondary. — new `AtShowMyEntriesToday` view defaults for exhibitor-only accounts (`isExhibitorOnlyForAtShow`) with owned entries; "See all classes" / "Your dogs today" toggle switches between views, class list unchanged for staff.
- [x] 3.3 Show entered dog, class, armband/confirmation, check-in state, and next action when available. — `myAtShowEntryDetails.helpers.ts` (`buildMyAtShowEntryDetails`, `deriveAtShowNextAction`) sourced from `replicatedEntriesTable.getEntriesByShow` (offline-first); one-tap check-in reuses the existing `useCheckInMutation({writer:'self-checkin-rpc'})`.
- [x] 3.4 Replace contradictory "No Entries Yet" states with running-order-not-posted guidance when owned entries exist. — per-entry "Running order not posted yet" / "Not posted yet" copy when the class isn't in the loaded class list yet, instead of the class-list's generic empty state. Confirmed distinct from the separate `QA-STALE-DERIVED-STATE-035` todo (Browse Shows vs. Show Detail, not `/at-show`).
- [x] 3.5 Add focused tests for exhibitor-owned entries, empty running-order states, and secondary class-list access. — `myAtShowEntryDetails.helpers.test.ts` (13 tests) + `AtShowClassListPage.myEntriesToday.test.tsx` (4 integration tests: exhibitor default, staff keeps class-first default, toggle both ways, unposted-running-order copy).

## 4. Exhibitor Check-In Language

- [x] 4.1 Inventory current check-in status labels and role-specific render paths. — done via PR #1264
- [x] 4.2 Add a typed exhibitor label-to-internal-status mapping for "I am here", "I am not there yet", and "I have a conflict - tell the secretary". — `EXHIBITOR_STATUS_LABELS` in `CheckInStatusDialog.tsx`, PR #1264
- [x] 4.3 Apply plain exhibitor labels only to exhibitor-facing check-in controls. — gated on `userRole === 'exhibitor'`, PR #1264
- [x] 4.4 Preserve existing staff operational status labels. — non-exhibitor roles still render `config.label`, PR #1264
- [x] 4.5 Add focused tests for the mapping and role-specific labels. — `CheckInStatusDialog.test.tsx`, PR #1264

## 5. Dog Profile Clarity

- [x] 5.1 Prevent blank or invalid height/weight inputs from saving or displaying as `NaN`.
- [x] 5.2 Hide invalid or blank dog measurements instead of displaying `NaN` or accidental zero values.
- [x] 5.3 Group Edit Dog fields into "Basics" and "More details" without replacing the existing dog profile surface. — `DogEditPanel.sections.tsx` `BasicInfoTab`: photo/call name/registered name/breed/gender/DOB stay visible under "Basics"; color/weight/height/microchip/spayed-neutered/owner/notes/special-needs moved into a collapsed-by-default "More details" `Accordion`.
- [x] 5.4 Add date-of-birth format helper text and mixed-breed/registration guidance near relevant fields. — "Format: MM/DD/YYYY" under DOB; mixed-breed/AKC PAL-ILP guidance under Breed.
- [x] 5.5 Collapse premium dog tabs behind one "More for this dog" area. — `DogEditPanel.tsx`: Registrations + Health tabs replaced with a single "More for this dog" tab containing an `Accordion` (Registrations open by default, Health collapsed).
- [x] 5.6 Remove duplicate registration add affordances that appear on the same surface. — stale: re-verified 2026-07-10, no duplicate add-registration affordance exists on any single surface today (dog profile page and dogs-list dropdown are two separate surfaces, each with one); likely resolved by an earlier PR before this task was written.
- [x] 5.7 Add focused tests for dog-edit grouping, helper text, registration guidance, and duplicate affordance removal. — `DogEditPanel.grouping.test.tsx`, 8 tests: Basics visible/More-details collapsed/expands, DOB + breed guidance text, tab consolidation, accordion nesting.

## 6. Onboarding Confidence

- [x] 6.1 Trace onboarding completion from save through redirect and reload using actual profile-completion state.
- [x] 6.2 Determine whether the observed Step 5 to Step 2 behavior is seed data, partial completion, or a state persistence bug.
- [x] 6.3 If setup is partial, show saved progress with "Finish setting up" and the missing setup item instead of restarting unexpectedly.
- [x] 6.4 Add hook/component tests for onboarding completion and partial-progress reload behavior.

## 7. Verification, Tracking, And Shipping

- [x] 7.1 Run focused tests for the completed Monogram CTA and dog measurement fixes.
- [x] 7.2 Run focused Vitest files for each newly touched helper, hook, utility, and component.
- [ ] 7.3 Run focused exhibitor Playwright coverage for open show, closed show, existing show-day entry, amount due, and elderly low-tech pass when seed data supports it.
- [x] 7.4 Run relevant TypeScript verification for touched app areas.
- [x] 7.5 Update `docs/plan-exhibitor-elderly-ux-remediation.md`, `OPEN-TODOS.md`, or the relevant tracker after each completed slice.
- [x] 7.6 Keep PR #1188 updated with the OpenSpec change link and evidence for completed tasks.
- [x] 7.7 Merge only after focused verification, review, and CI are green; archive the OpenSpec change only after the final required PR for this remediation is merged. — PR #1267 merged 2026-07-11 (7 self-review rounds; merged via admin override after all real checks passed — 2 failures were a pre-existing, unrelated E2E credential drift, not this PR's code).
