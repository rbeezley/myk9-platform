## Why

The entry-to-payment path is launch-critical because it is the first paid exhibitor workflow and the secretary's fallback for mail-in, late, and desk-entered registrations. Today the path works through existing screens, but the audience boundaries are easy to blur: exhibitor self-entry, secretary on-behalf entry, Show Desk late entry, cart checkout, and post-checkout confirmation do not yet read as one calm golden path.

This supports fall 2026 launch readiness by reducing payment confusion, preventing secretary-grade tools from leaking into exhibitor self-service, and keeping show-day late entries anchored in Show Desk instead of creating another entry surface.

## What Changes

- Consolidate the entry/payment golden path around the existing registration wizard, cart checkout, Show Desk late-entry action, and checkout confirmation page.
- Add a single secretary-facing "Add entries" decision point that routes to existing modes:
  - exhibitor's own dogs -> existing exhibitor self-service route with online card checkout
  - another exhibitor's dog, paper entry, or late/day-of entry -> existing secretary registration route with advanced dog search and on-behalf payment controls
- Scope dog picking by audience:
  - exhibitors see and auto-use their own dogs only
  - secretaries and admins retain advanced all-dog search, bulk selection, and create-new tools
- Make payment method defaults and copy follow the real payment rails:
  - exhibitor self-service defaults to card checkout when online payment is available
  - on-behalf/secretary flows never offer card checkout; they record check, cash, waived, or already-received payment
  - post-payment confirmation clearly distinguishes paid online, pay-at-show, waived, and secretary-recorded payment
- Route Show Desk late entry through the same secretary registration wizard with a late-entry context, then return to Show Desk after submission.
- Preserve existing money-path hardening work by treating payment method/status correctness as a hard requirement, not merely UI copy.
- Non-goals:
  - No new standalone registration page, checkout page, payment reconciliation page, or Show Desk replacement.
  - No in-app card form; Stripe-hosted checkout remains the card-payment boundary.
  - No new payout/refund engine work; this change may depend on, link to, or test against the existing money-path hardening plan.

Duplication answer: this change touches multiple entry points, but it does not justify duplicating the underlying workflow. The existing registration wizard, cart, Show Desk, and confirmation surfaces remain canonical; the new work is routing, mode clarity, guardrails, and state-specific confirmation.

## Capabilities

### New Capabilities
- `entry-payment-golden-path`: Defines the routed exhibitor and secretary entry-to-payment experience, including audience-scoped dog selection, payment-method boundaries, Show Desk late-entry return behavior, and confirmation states.

### Modified Capabilities
- None.

## Impact

- Affected app surfaces:
  - `apps/myk9show/src/pages/RegistrationWizardPage.tsx`
  - `apps/myk9show/src/pages/RegistrationWizardPage/*`
  - `apps/myk9show/src/components/shows/RegistrationWorkflow/*`
  - `apps/myk9show/src/features/show-workbench/WorkbenchLateEntryAction.tsx`
  - `apps/myk9show/src/pages/CheckoutSuccessPage.tsx`
  - `apps/myk9show/src/pages/MyEntriesPage/*`
  - cart and checkout handoff utilities under `apps/myk9show/src/store/cartStore*`, `apps/myk9show/src/features/registration/*`, and related checkout tests
- Affected backend/payment boundaries:
  - `submit_show_entries` and `entries.payment_method/payment_status` behavior remain aligned with `docs/plan-money-path-hardening.md`
  - Stripe checkout stays in edge functions; no card data enters app UI
- Testing impact:
  - focused unit coverage for route/mode resolution, dog-picker audience scope, payment gating, and confirmation copy
  - focused E2E coverage for exhibitor self-entry, secretary mail-in/on-behalf entry, and Show Desk late entry returning to Show Desk
  - typecheck for touched TypeScript areas
