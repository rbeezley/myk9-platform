## Tracking

[MYK9-71](https://linear.app/myk9-platform/issue/MYK9-71/complete-the-exhibitor-journey-and-premium-entitlement-experience)

MYK9-71 is the parent execution contract. Before implementation, create and link one PR-sized child issue for each tasks section 2, 3, 4, 5, and 6 slice, plus the later section 8 compatibility cleanup.

## Why

Exhibitors will be most myK9 users, but the July 23 role-journey audit found trust-breaking defects in the existing free and Premium experience: invalid Premium records can be submitted, date and filter behavior is wrong, the dog workspace does not fit common viewports, complimentary access contradicts the Subscription page, and core entry/payment summaries still disagree. Completing this existing journey now supports fall 2026 launch readiness while preserving the exhibitor intent, "This respects my time."

## What Changes

- Make every shipped Premium dog capability complete and trustworthy: Title Progress, Training Journal, Statistics, Health Records, and Pedigree.
- Prevent invalid pedigree and health records, use date-only-safe formatting, make health filters functional, and give destructive training actions accessible confirmation or recovery.
- Consolidate the existing Dog Details hierarchy into three top-level concerns—Overview, Career, and Records—with secondary views inside Career and Records, responsive layouts, stable deep links, and no repeated activity feed.
- Establish one effective-entitlement contract for paid, complimentary, capability-scoped trial, free, and expired access so navigation gates, Subscription, Pricing, and account messaging agree.
- Enforce effective Premium access at the server boundary for Premium Health, Training, Pedigree, and manual-result creation and updates so a client-side gate cannot be bypassed, while preserving owner read/delete rights and existing export capabilities after downgrade.
- Add a platform-admin-only complimentary Premium grant/revoke control to the existing User Management surface, including expiration, reason, actor, and audit history. Complimentary access does not create fake Stripe subscription rows.
- Remove false product promises and placeholder data from exhibitor-facing Subscription, Pricing, and footer surfaces.
- Enforce the existing `exhibitor-money-clarity` and `exhibitor-count-integrity` contracts instead of inventing new totals, and make entry-change actions describe what they can actually change.
- Retain browser evidence for free, complimentary Premium, revoked/expired, empty, error, phone, tablet, landscape, and desktop states.

## Duplication Decision

This change does not add a Premium dashboard, a second dog profile, a second payment page, or a separate grant-management page. Dog work remains on `/dogs/:id`; exhibitor money remains on `/exhibitor/payments`; paid billing remains in the existing Stripe-backed Subscription surface; and complimentary access is administered from existing User Management. Links alone cannot fix invalid persistence, contradictory entitlement state, inaccessible controls, or layouts that clip inside their current containers, so the canonical surfaces themselves must be remediated.

The active `improve-exhibitor-entries-scan` change continues to own My Shows card hierarchy, and `unified-financial-dashboard` continues to own shared financial reconciliation. This change consumes their established selectors/components where applicable and does not recreate either program.

## Non-Goals

- No new exhibitor dashboard, premium hub, payment page, dog page, route family, or parallel entry-management workflow.
- No change to Stripe pricing, billing intervals, refunds, payout reconciliation, or checkout ownership.
- No secretary, ringside, or show-day redesign.
- No invented Premium features beyond the five already shipped.
- No direct client-side entitlement override, fake Stripe subscription, or unaudited database edit.

## Capabilities

### New Capabilities

- `exhibitor-premium-records`: Defines validation, date integrity, filtering, accessibility, destructive-action recovery, and responsive behavior across Title Progress, Training Journal, Statistics, Health Records, and Pedigree.
- `exhibitor-entitlement-management`: Defines one effective-entitlement model and the safe administration, display, expiration, and revocation of complimentary Premium access alongside paid access and the existing Analytics-scoped trial.

### Modified Capabilities

- `exhibitor-dog-management`: Replaces the crowded peer-tab contract with a consolidated, responsive Overview/Career/Records hierarchy while preserving canonical Dog Details routes and deep-link compatibility.
- `exhibitor-journey-trust`: Extends the end-to-end trust contract to honest entry-change actions, stable navigation position, truthful account/product copy, and evidence for free-to-Premium-to-free transitions.

## Impact

- Affected myK9Show areas include Dog Details navigation and Premium feature components, health/pedigree/training forms, entitlement hooks and gates, Subscription, Pricing, footer content, User Management, My Shows, and My Payments.
- A Supabase migration is required for durable grants, server-evaluated entitlement context, Premium mutation enforcement, and authorized grant/revoke RPCs; production deployment requires the existing shared-system approval gate.
- Core exhibitor show and dog reads retain their replication-backed paths. Entitlement/profile reads and Stripe/admin RPCs remain explicitly online-only, auth-adjacent operations.
- Focused unit/component tests, authorization/RPC tests, cross-surface contract tests, accessibility checks, and responsive browser re-walks are required before completion.
