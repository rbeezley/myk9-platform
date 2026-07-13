## Why

> Request record: the user said “proceed” after confirming that this launch-affecting Stripe and
> waitlist work should run through the `opsx-ship` workflow.

The paid-entry pipeline can enforce judge-day capacity for card checkout while
`submit_show_entries` can still create check, cash, pay-later, and organizer-entered rows without
the same race-safe capacity decision. Waitlist promotion also creates a time-boxed unpaid entry,
but exhibitors must rely on an emailed Stripe URL and secretary-created offers do not reliably
notify them. Closing these gaps prevents overselling and makes a promoted spot claimable without
developer or secretary intervention, directly supporting fall 2026 launch readiness.

## What Changes

- Add one shared, transaction-safe judge-day capacity decision used by both paid-cart entry creation
  and `submit_show_entries`, with source-aware handling for the mail-in reserve.
- Return explicit per-class `created`, `waitlisted`, or `denied` outcomes from non-card submission and
  preserve the result through the RPC's existing idempotency record.
- Show waitlist-offer countdown, payment, decline, expired, and retry states in the existing My
  Shows/My Entries waitlist section; email and push links deep-link to that existing surface.
- Allow an authenticated exhibitor to request a Stripe-hosted payment session only for their own
  active promoted entry while preserving the existing secretary/admin and internal-call paths.
- Add an owner-authorized decline operation that closes the offered row and pending-payment entry,
  expires any open Stripe session safely, and allows the existing cascade to offer the next spot.
- Add idempotent halfway reminders and waitlist promotion/reminder/expiry push notifications using
  the existing waitlist cron and push-secret patterns.
- Add concurrency, authorization, reconciliation, notification, component, and route/deep-link tests,
  plus explicit database/function deployment and rollback gates.

This change does **not** duplicate an existing page. My Shows/My Entries already owns exhibitor
entry state and contains the waitlist section, so a link to that surface plus in-place actions is
enough; the separate payment page proposed in the older plan is intentionally not created.

Non-goals:

- No new entry dashboard, waitlist dashboard, checkout implementation, or card collection UI.
- No offline Stripe checkout. Secretary show-day late entry remains local-first and non-card.
- No automatic processing of mail-in waitlist rows; they remain secretary-managed.
- No Stripe live-mode dashboard, secret rotation, account onboarding, or payout-schedule mutation;
  those remain operator-owned go-live gates.
- No blocking of an authorized secretary's explicit day-of capacity override.

## Capabilities

### New Capabilities

- `entry-capacity-enforcement`: Race-safe, source-aware judge-day capacity outcomes for all online
  entry-creation write boundaries.
- `waitlist-offer-payment`: Owner-authorized payment, decline, expiry, and recovery behavior for a
  promoted waitlist entry on the existing exhibitor entry surface.
- `waitlist-offer-notifications`: Idempotent email/push delivery for promotion, reminder, and expiry
  events with deep links to the existing exhibitor entry surface.

### Modified Capabilities

- `entry-payment-integrity`: Extend payment-link authorization and reconciliation requirements to an
  exhibitor claiming their own active waitlist promotion.

## Impact

- Supabase migrations for shared capacity decisions, `submit_show_entries` outcomes, offer reminder
  state, and owner-authorized decline.
- Existing `create_online_paid_entry`, waitlist promotion, and waitlist expiry database contracts.
- `apps/myk9show/supabase/functions/stripe-payment-link`, `cron-waitlist-expiration`, a new waitlist
  push function, and its database trigger/dispatch wiring.
- `apps/myk9show/src/services/database/entries`, registration submission result handling, My
  Shows/My Entries waitlist UI, and existing route/deep-link handling.
- Generated Supabase TypeScript types, focused tests, OpenSpec specs, and launch tracking documents.
- Shared-system deployment remains confirmation-gated: migration push, Edge Function deployment,
  secret changes, Stripe/live smoke, PR creation, and merge.
