## Context

`CheckoutSuccessPage` uses `pollCheckoutSession` for an initial 30-second verification window, then performs bounded background checks for parked `processing`, `not_found`, and `unavailable` states. MYK9-294 reproduced a successful Stripe order that remained unreadable during that window and left the exhibitor at “Payment Not Found Yet.” MYK9-207 established the existing recovery pattern; this change extends it to the committed-order/readability case without adding another payment surface.

The page is online-only and does not use replication for the Stripe confirmation query. Entry records and show data remain governed by their existing replication-backed paths; this change must not bypass those paths or alter entry settlement.

## Goals / Non-Goals

**Goals:**

- Make a later-readable successful order converge to the success state automatically.
- Establish evidence for the temporary unreadability mechanism, including ownership/RLS timing where observable.
- Keep verification serialized, bounded, abortable, and safe against stale overlapping checks.
- Preserve calm exhibitor copy and the “do not submit another payment” guard rail.

**Non-Goals:**

- No new checkout or payment-collection workflow.
- No change to Stripe webhook settlement, refund behavior, or entry creation.
- No unbounded polling, realtime subscription, or production database mutation unless investigation proves it is required and separately reviewed.

## Decisions

1. **Reuse the existing verification state machine.** Add the regression to `CheckoutSuccessPage`/`checkoutVerification` rather than creating a second confirmation page. This keeps the existing manual check, focus recovery, and bounded background chain as the single workflow.

2. **Investigate before changing query semantics.** Capture the verifier's response class and server-side readability timing where possible. A client retry can mitigate a transient visibility gap, but it must not conceal a persistent RLS or ownership defect.

3. **Prefer bounded slow re-checks plus focus recovery over realtime.** The current pattern already handles resumed mobile tabs and avoids adding a new subscription lifecycle to an online-only confirmation page. Realtime is an alternative only if evidence shows polling cannot meet the bounded recovery requirement.

4. **Use a later-success scenario as the contract.** The test must model an initial poll window returning no readable order, followed by a successful automatic re-check, and assert the success state. It must fail if the recovery chain is removed.

## Risks / Trade-offs

- [Transient unreadability persists longer than the current background budget] → keep the manual status check and focus-triggered re-verification available; document the measured bound.
- [A retry masks a real RLS regression] → record the root cause and verify owner readability separately rather than treating eventual success alone as sufficient evidence.
- [Tests become dependent on wall-clock timing] → use the existing fake-timer and mocked verifier pattern with explicit bounded attempts.
- [Overlapping focus/timer checks settle stale state] → preserve generation, cancellation, and in-flight serialization guards.

## Migration Plan

1. Add the failing regression test and collect local/staging evidence for the readability gap.
2. Implement the smallest state-machine/query fix that makes the regression pass.
3. Run focused checkout tests, typecheck, and the relevant payment-path checks.
4. Verify the sandbox flow for at least 90 seconds and record the result in the issue/PR.
5. Rollback is a code revert; no database migration is expected unless the investigation identifies one.

## Open Questions

- What exact policy, view, or transaction boundary causes the committed order to be unreadable for the observed interval?
- Is the observed interval reproducible outside the seeded staging account and Stripe sandbox?
