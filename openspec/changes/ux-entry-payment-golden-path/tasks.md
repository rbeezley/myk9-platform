## 1. Routing and Consolidation

- [x] 1.1 Inventory current entry-start links in Show Desk, Entry Management, public show details, My Entries, and any secretary dashboard/workbench surfaces.
- [x] 1.2 Add or tighten route helpers for exhibitor self-entry, secretary on-behalf entry, and Show Desk late-entry return behavior.
- [x] 1.3 Implement the secretary "Add entries" decision point as a routing-only affordance that asks whose dog is being entered.
- [x] 1.4 Replace duplicate or ambiguous secretary entry buttons with links to the decision point or the existing canonical wizard routes.

## 2. Wizard Audience Scope

- [x] 2.1 Verify exhibitor self-service mode only uses the logged-in exhibitor's own dogs and does not render all-dog search, bulk selection, or create-new exhibitor controls.
- [x] 2.2 Verify secretary/admin modes retain dog selection, advanced all-dog search, permitted bulk selection, and create-new controls.
- [x] 2.3 Preserve the selected-dogs owner guard so multiple-owner or ownerless selections cannot proceed to payment.
- [x] 2.4 Tighten labels and helper copy so exhibitor, secretary on-behalf, and late-entry modes are understandable without adding a new workflow surface.

## 3. Payment and Confirmation Behavior

- [x] 3.1 Keep exhibitor self-service card checkout Stripe-hosted and own-entry only, with no in-app card form.
- [x] 3.2 Ensure secretary/admin/on-behalf modes never render card checkout and still reject stale or crafted card submissions.
- [x] 3.3 Assert non-card payment methods are submitted through the entry payload and are not silently stored as online card payments.
- [x] 3.4 Update wizard and checkout confirmation copy for paid online, pay-at-show, waived, already-received, and missing-armband states.
- [x] 3.5 Ensure late/day-of entry completion and cancellation return to Show Desk or preserve an obvious Show Desk path.

## 4. Focused Testing

- [x] 4.1 Add unit tests for route helper behavior and Show Desk late-entry completion paths.
- [x] 4.2 Add component or hook tests proving exhibitor mode hides secretary-grade dog tools and secretary/admin modes keep them.
- [x] 4.3 Add payment gating tests for on-behalf card attempts, including loaded draft or stale-state cases.
- [x] 4.4 Add assertion-first tests proving selected non-card payment methods are passed to the submit payload.
- [x] 4.5 Add confirmation-copy tests for paid online, pay-at-show, waived/already-received, and armband-missing states.
- [x] 4.6 Add focused Playwright coverage for exhibitor self-entry, secretary on-behalf/mail-in entry, and Show Desk late entry returning to Show Desk.

## 5. Verification and Tracking

- [x] 5.1 Run the focused Vitest files added or changed for registration, payment, checkout confirmation, and routing.
- [x] 5.2 Run focused Playwright specs for the three golden-path walks, stopping and reporting if the runner hangs longer than 60 seconds.
- [x] 5.3 Run `pnpm typecheck` when TypeScript changes are complete.
- [x] 5.4 Update `OPEN-TODOS.md` or the relevant tracking doc to reflect the completed Add Entries / dog-picker scope work.
- [x] 5.5 Run `pnpm openspec validate ux-entry-payment-golden-path --strict` before requesting review or implementation sign-off.
