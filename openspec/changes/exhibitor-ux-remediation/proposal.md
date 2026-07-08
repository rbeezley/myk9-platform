# exhibitor-ux-remediation

## Why

The 2026-07-08 exhibitor role-journey UX audit (`docs/ux-audits/exhibitor-elderly-novice-2026-07-08.md`) found 13 buildable defects, headlined by contradictory money messaging (the same moment shows "Payment Due", "Paid in full", and "$0.00 due" on three surfaces), disagreeing entry counts, a cart that lets an exhibitor pay for a closed show, and a "Show day" nav item that dead-ends exhibitors with staff jargon. These erode the exhibitor's target feeling ("this respects my time", docs/INTENT.md) and are trust-destroying for the launch audience; fixing them is consolidation of existing surfaces, not new surface area — directly supporting fall 2026 launch readiness.

**Duplication check:** every fix tightens or reconciles an existing surface (entries page, cart, /at-show gate, heritage landing, dogs list). No new pages, sheets, or dialogs are added; the only near-new UI is an exhibitor-voiced variant of the existing check-in dialog and a conditional "Pay now" action on the existing entry card — both links/adjustments to surfaces that already own those concerns.

## What Changes

- Reconcile payment status across `/exhibitor/entries` (chip), the dashboard stats strip, and `/exhibitor/payments` so all three derive from one amount-due computation; the "Payment Due" chip appears only when money is actually owed, and when it appears the entry card offers a "Pay now" path.
- Harden the cart: disable pay + explain when the target show's entries are closed, expire cart items at entries-close, and surface a cart affordance (badge/link) whenever the cart is non-empty.
- Fix count integrity: dashboard "entries" pill vs "My Entries" tab counts, Shows page "Entered as exhibitor" tab, show-detail "Entries received" counter, and per-dog "N upcoming classes" vs the dog page's Activity list — each counter's query scope corrected and its label made to say what it counts.
- Render heritage landing dates through the trial-timezone helpers (fixes the Jul 31/Aug 1 off-by-one and the entries-close date drift); fall back Venue to the show's address record instead of "TBA".
- Give exhibitors a sane "Show day" path: the sidebar item no longer dead-ends entered exhibitors at the ringside passcode gate; gate copy rewritten for non-workers.
- Exhibitor-voice check-in dialog: first-person status labels, staff-only statuses (Conflict, Pulled) hidden for exhibitors, "Armband #" mislabel corrected, dangling "#" removed.
- Polish batch (no requirement-level changes): dogs list refetch after delete + success toast; tablet stat-tile clipping and dog-rail scroll affordance; heritage hero fold cap on short viewports; /shows none-enterable empty state; consistent "Breed not set" placeholder; "Trial Saturday Trial" chip de-duplication.

Cosmetic-only audit findings deliberately excluded (per audit report): #14 Developer menu item (verify dev-mode gating only), #16 stale route in audit-pages inventory (skill doc edit, not app code), #17 premium upsell density (intentional monetization — needs product approval).

## Capabilities

### New Capabilities
- `exhibitor-money-clarity`: one amount-due source of truth across entry chips, dashboard stats, and My Payments; pay path exists wherever a debt is announced.
- `cart-integrity`: cart items for closed shows cannot be paid, expire at entries-close, and a non-empty cart is always discoverable.
- `exhibitor-count-integrity`: exhibitor-facing counters (entries, entered shows, entries received, per-dog upcoming) agree with the lists they summarize and label what they count.
- `exhibitor-show-day-access`: entered exhibitors reaching Show day get exhibitor-relevant info or exhibitor-voiced guidance, never a worker-passcode dead end; check-in dialog speaks in exhibitor voice with staff-only statuses hidden.

### Modified Capabilities
- `date-formatting`: heritage/public landing pages SHALL render show and close dates in the trial's timezone via the canonical helpers (extends the existing timezone-bound landing-page exception into a requirement).

## Impact

- `apps/myk9show/src` exhibitor surfaces: entries page (chips, stats pill, check-in dialog), cart/checkout, shows list + heritage landing (`features/registries`), /at-show gate, dogs list/detail.
- Fee-status selectors in `services/entryDisplay` (`entryDisplaySelectors.ts`, `entryStatusUiAdapter.ts`) — must respect the documented 'paid'-stays-pending entry-review bucketing while separating *payment* state from *review* state.
- React Query invalidation for dogs delete; no DB migrations expected; no replication-layer bypass (reads stay on replicated tables / documented fallbacks per `account-entry-sync`).
- Tests: unit tests for amount-due selector, counter scopes, cart-closed gating, date/timezone rendering; manual re-walk per the audit skill.
