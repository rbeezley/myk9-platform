## Context

myK9Show already has the necessary entry/payment surfaces:

- exhibitor self-service registration at `/shows/:showId/register`
- secretary/on-behalf registration at `/secretary/register/:showId`
- Show Desk late entry via `WorkbenchLateEntryAction`
- cart checkout and Stripe handoff via `registrationCartCheckout`
- confirmation states in the wizard and `CheckoutSuccessPage`

The problem is not missing infrastructure; it is mode clarity. The same wizard supports multiple audiences, and fall 2026 launch readiness depends on making those audiences feel obvious and hard to mix up. Exhibitors should feel "this respects my time." Secretaries should feel "that was easy," especially when recording paper entries or adding a dog during show-day pressure.

Core show-day entry writes must continue through established registration, entry submission, armband, and sync paths. Card payment remains online-only and Stripe-hosted. Pay-at-show and secretary-recorded entries must stay available when card checkout is unavailable or inappropriate.

## Goals / Non-Goals

**Goals:**

- Make one coherent golden path from entry selection to payment/confirmation for exhibitors and secretaries.
- Keep existing canonical surfaces; add routing and guardrails instead of duplicate pages.
- Make the "whose dog is this?" distinction explicit before a secretary reaches dog selection.
- Ensure exhibitor self-entry never exposes secretary-grade all-dog search, bulk tools, or on-behalf payment controls.
- Ensure secretary/on-behalf entry never offers Stripe card checkout as if the secretary can pay for another exhibitor's cart.
- Return Show Desk late entries to Show Desk after submission.
- Add focused tests for mode resolution, dog selection scope, payment gating, confirmation copy, and late-entry routing.

**Non-Goals:**

- No replacement registration wizard.
- No new checkout implementation or embedded card form.
- No new refund, payout, or payment-link engine work.
- No new standalone entry-management page; existing Entry Management and Show Desk remain the drill-in destinations for their concerns.

## Decisions

### Decision: Use the existing wizard as the only entry workflow

Route all entry-start actions to existing wizard modes:

- `/shows/:showId/register` for exhibitor self-service
- `/secretary/register/:showId` for secretary/admin on-behalf or paper-entry recording
- `/secretary/register/:showId?source=show-desk&entryMode=late` for late/day-of Show Desk entries

Alternative considered: create a new "entry payment" flow. Rejected because it duplicates the wizard and fragments the pre-launch workflow.

### Decision: Add a secretary decision point, not a parallel form

Secretary-facing "Add entries" affordances should first ask whose dog is being entered and then link/deep-link to the correct existing route. This can live as a small decision component reused from Show Desk and Entry Management, while the actual entry data collection stays in the wizard.

Alternative considered: keep separate buttons such as "Record Mail-In Entries" and "Enter My Dogs." Rejected because it makes the secretary remember which surface owns which work.

### Decision: Model audience scope from route/mode, then enforce it in UI and submit guards

The route-derived workflow mode remains the source of UI scope:

- exhibitor mode skips dog selection and auto-selects the exhibitor's own dogs
- secretary/admin modes include dog selection with advanced search, bulk selection, and create-new tools
- loaded drafts or crafted URLs cannot bypass payment restrictions because `submitPaymentStep` still rejects card checkout for non-exhibitor modes

Alternative considered: infer mode from selected dogs alone. Rejected because selected-dog state loads too late and would make route behavior unpredictable.

### Decision: Keep card checkout Stripe-hosted and own-entry only

Exhibitor self-service may default to card checkout. On-behalf flows must use check, cash, waived, or already-received payment methods and must never render card checkout as selectable.

Alternative considered: allow secretaries to pay by card for an exhibitor. Rejected because the current Stripe checkout path runs under the logged-in user's account and intentionally rejects carts the caller does not own.

### Decision: Treat payment method/status persistence as a golden-path acceptance gate

The UI must pass the selected `paymentMethod` through registration submission, and tests must assert that mail-in/check entries do not silently become online-paid/payout-eligible. Backend hardening belongs to `docs/plan-money-path-hardening.md`, but this golden path must not ship with UI tests that ignore those invariants.

Alternative considered: leave this solely to the money-path hardening plan. Rejected because the golden path is where the ordinary secretary workflow triggers the risk.

### Decision: Preserve Show Desk as the late-entry home

Late/day-of entries start from Show Desk, use the existing secretary registration route with late-entry context, and return to Show Desk after submission. The registration wizard may show late-entry wording, but Show Desk remains the operational anchor.

Alternative considered: add a late-entry dialog directly inside Show Desk. Rejected because it would duplicate dog selection, class selection, payment, agreement, and armband behavior.

## Risks / Trade-offs

- [Risk] Route/mode logic can drift across wizard, Show Desk, Entry Management, and tests. -> Mitigation: centralize route helpers and write focused route-resolution tests.
- [Risk] Existing drafts may carry stale card payment defaults into secretary modes. -> Mitigation: keep mode-change reset and submit-time card guard; add tests for loaded/crafted on-behalf card attempts.
- [Risk] Card checkout requires network, while show-day venues may be unreliable. -> Mitigation: treat online checkout as exhibitor pre-show self-service; keep secretary pay-at-show and already-received rails available for show-day operations.
- [Risk] Confirmation copy can overpromise, especially armbands and pay-at-show status. -> Mitigation: make copy conditional on payment method/status and armband availability.
- [Risk] A reusable "Add entries" decision component could become another mini-workflow. -> Mitigation: it only routes; it does not collect dog, class, handler, or payment data.

## Migration Plan

1. Add/adjust route helpers and the shared secretary "Add entries" decision component.
2. Replace duplicate secretary entry doors with links to that decision point or to the existing route with explicit mode parameters.
3. Tighten wizard mode labels, dog-picker visibility, payment defaults, and card guards.
4. Update confirmation and return-path behavior for paid online, pay-at-show, waived, secretary-recorded, and late-entry submissions.
5. Add focused unit tests and E2E coverage.
6. Update `OPEN-TODOS.md` or the relevant tracking doc after implementation.

Rollback is low-risk: revert the routing/decision component and copy changes while leaving the underlying registration, cart, Stripe, and Show Desk flows in place.

## Open Questions

- Should the secretary decision point live in Entry Management and be linked from Show Desk, or live as a shared component rendered in both places? Default implementation should choose the smaller route/link option unless the existing surfaces make reuse clearly cleaner.
- Should late-entry payment defaults prefer check/cash, or leave payment method unset for the secretary to choose? Default implementation should avoid hidden assumptions and require an explicit secretary choice unless product guidance says otherwise.
