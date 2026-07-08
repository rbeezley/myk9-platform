# Tasks — exhibitor-ux-remediation

## 1. Money clarity (audit #1, #2)

- [ ] 1.1 Trace how the "Payment Due" chip, dashboard fee stat, and My Payments amount-due are each computed today; document the divergence
- [ ] 1.2 Implement a shared amount-due selector in `services/entryDisplay` (payment state decoupled from the review-status bucket; preserve 'paid'-stays-pending review semantics)
- [ ] 1.3 Wire entry-card chip, dashboard stats, and My Payments to the shared selector
- [ ] 1.4 Add "Pay now" deep-link action on entry cards when amount due > 0 (routes into existing cart/checkout, no new payment UI)
- [ ] 1.5 Unit tests: assertion-first tests pinning chip/stat/amount agreement for the audit's contradiction fixture (paid entry pending review; genuinely-owed entry)

## 2. Cart integrity (audit #3)

- [ ] 2.1 Verify server-side behavior: does entry submission/checkout reject closed shows? Add a fail-closed guard if missing
- [ ] 2.2 Cart load: mark/remove items whose show's entries-close (trial timezone) has passed; exclude from payable total with explanation
- [ ] 2.3 Disable pay/confirm for expired items client-side
- [ ] 2.4 Add non-empty cart affordance (badge/link) to the exhibitor navigation
- [ ] 2.5 Unit tests: expiry logic around the close boundary (trial timezone), pay-button gating, cart-affordance visibility

## 3. Count integrity (audit #4)

- [ ] 3.1 Inventory each counter's query scope: stats pill, My Entries tabs, Shows "Entered as exhibitor" tab, heritage "Entries received", per-dog upcoming-classes
- [ ] 3.2 Fix scope bugs (entered-tab returning 0; dog-card upcoming vs dog Activity list) keeping reads on replication paths per `account-entry-sync`
- [ ] 3.3 Align labels with scopes ("class entries" vs "shows entered"); extract counter derivations as pure functions
- [ ] 3.4 Fix heritage entries-received counter via the sanctioned public read path
- [ ] 3.5 Unit tests for each counter derivation pinning its scope

## 4. Heritage dates & venue (audit #5, #15)

- [ ] 4.1 Route heritage landing date/close rendering through `getTrialTimezone` + timezone-anchored helpers; kill the UTC off-by-one
- [ ] 4.2 Venue falls back to the show address record when unset (no "TBA" when an address exists)
- [ ] 4.3 Unit tests: date fixtures across timezone boundaries (Jul 31/Aug 1 case), close-date agreement, venue fallback

## 5. Show day & check-in voice (audit #6, #7)

- [ ] 5.1 At-show no-access gate: branch copy by audience; entered exhibitors get exhibitor-voiced guidance + links to their entries' show-day info; passcode path secondary
- [ ] 5.2 Check-in dialog audience variant: first-person labels, hide Conflict/Pulled for exhibitors, correct identifier label, remove dangling "#"
- [ ] 5.3 Verify staff surfaces are unchanged (secretary/steward check-in retains full status set and staff copy)
- [ ] 5.4 Unit tests: status-option filtering by audience, gate-copy branching

## 6. Polish batch (audit #8, #9, #10, #11, #12, #13)

- [ ] 6.1 Dogs delete: invalidate dogs list query on success + success toast (no stale deleted dog)
- [ ] 6.2 Stats tiles wrap at intermediate widths; dog-card rail gets a scroll affordance (tablet 834px)
- [ ] 6.3 Heritage hero/monogram max-height on short viewports so content is above the fold (landscape tablet)
- [ ] 6.4 /shows none-enterable empty state ("No shows are open for entries right now")
- [ ] 6.5 Consistent "Breed not set" placeholder (replaces mixed "Mixed Breed"/"Unknown" defaults)
- [ ] 6.6 De-duplicate trial chip label ("Trial Saturday Trial")
- [ ] 6.7 Unit tests where logic was extracted (breed placeholder, empty-state condition)

## 7. Verification & ship

- [ ] 7.1 `pnpm typecheck` and `pnpm lint` clean
- [ ] 7.2 `cd apps/myk9show && pnpm test` — full unit suite green
- [ ] 7.3 Manual re-walk of the exhibitor journey per `role-journey-ux-audit` (mobile + tablet spot-check) confirming findings 1–13 resolved; note results
- [ ] 7.4 PR (user-visible behavior → run `/codex:review` alongside `/review`), address feedback, CI green, merge
- [ ] 7.5 Update tracking: OPEN-TODOS.md pointer row checked off; archive change via opsx:archive (fill promoted spec Purpose per archive-placeholder convention)
