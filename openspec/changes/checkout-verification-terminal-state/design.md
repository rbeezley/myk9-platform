## Context

Stripe redirects an exhibitor to `/checkout/success?session_id=...` before the webhook-created
`stripe_orders` row is guaranteed to be queryable. `CheckoutSuccessPage` currently polls the
existing `verifyCheckoutSession` query ten times, then renders one generic warning with a page
reload labeled "Retry Verification."

The surrounding money path already has the necessary write-side protection:

- `CartPage` uses an imperative latch to block same-frame checkout starts.
- `stripe-checkout` reuses an unchanged cart's open Stripe Checkout Session.
- `stripe-checkout` returns 409 when that session is complete but its webhook is still processing.
- the webhook guards the cart/session relationship and reconciles paid sessions idempotently.

This change is UX-facing for exhibitors, whose intent is "This respects my time." It changes no
show-day data, replication path, database schema, or webhook. It tightens the existing Stripe
Checkout Session reuse gate so an inspection/expiration error refuses replacement creation.

## Goals / Non-Goals

**Goals:**

- Classify verification results as succeeded, still processing, known failed, or temporarily
  unavailable.
- End bounded polling in a truthful visible state instead of an ambiguous apparent hang.
- Bound each verification request so a half-open network request cannot defeat terminal polling.
- Keep every recovery check bound to the original `session_id`.
- Fail closed when the server cannot safely inspect or expire a cart's prior Stripe session.
- Tell the exhibitor not to submit another payment while the result is unresolved.
- Cover the state transitions and copy with focused Vitest tests.

**Non-Goals:**

- Make Stripe or webhook delivery faster.
- Add a new payment or entry surface.
- Change entry creation, cart persistence, webhook reconciliation, or the database.
- Make card checkout available offline.

## Decisions

### Return a typed verification outcome

`verifyCheckoutSession` will retain its successful order payload and add a discriminated outcome for
non-success responses. Missing orders and `pending`/`processing` rows are still processing; known
`failed`/`cancelled` rows are terminal failures; authentication or query failures are verification
errors whose payment outcome is unknown.

This keeps status interpretation in the Stripe query module instead of duplicating database-status
logic in the page. The alternative—parsing error strings in the component—would be brittle and
would blur payment state with query failures.

### Use bounded sequential polling

The page will perform one verification request at a time with a bounded delay between attempts.
Each request has a deadline; transport rejection or timeout becomes verification-unavailable. The
page retries one transient unavailable result, then lands in a stable terminal state within about
30 seconds. After the final processing result it renders a stable "still processing" state. This
avoids overlapping `setInterval` requests when a query itself takes longer than the interval and
makes unmount cleanup explicit.

Continuous polling was rejected because an indefinitely active page recreates the reported hang and
provides no clear user decision point.

### Recheck the same Checkout Session

The recovery button will call verification again for the `session_id` already in the return URL. It
will never route through `createEntryCheckoutSession`. A secondary action links to the canonical
`/exhibitor/entries` surface so the exhibitor can look for the reconciled entry without returning to
the cart.

The existing server-side open-session reuse and completed-session 409 remain the authoritative
duplicate-charge protection. If Stripe cannot inspect or expire that prior session, the server
returns an error instead of creating another payable session. No new client-persisted idempotency
token is introduced because the Stripe Checkout Session and persisted cart link already provide
that identity.

A Stripe `resource_missing` response is the safe exception: it definitively proves that the
referenced Checkout Session cannot be paid, so the guard creates a replacement and heals carts
that retained an ID from another Stripe key mode. Other retrieval and expiration failures remain
fail-closed and return diagnostics to the function log.

### Keep the cart until success is confirmed

The page will continue clearing the cart only after a succeeded verification result. Clearing it
during an unknown or failed outcome could destroy the safe recovery path for a genuinely unpaid
checkout. It clears only the cart identified by the verified order, and optional entry-detail
hydration does not delay payment confirmation. If the exhibitor returns to the cart while Stripe is
complete but webhook processing is pending, the server's existing 409 guard prevents a replacement
payment session.

## Risks / Trade-offs

- [A very delayed webhook remains unresolved after the bounded poll] → Show an explicit
  still-processing state, keep same-session recheck available, and link to My Entries.
- [A transient query failure is mistaken for payment failure] → Use a separate
  verification-unavailable state and never tell the exhibitor to pay again.
- [Status copy encourages a second charge] → State plainly that another payment must not be
  submitted while processing or verification is unavailable.
- [A prior Stripe session cannot be inspected safely] → Refuse checkout creation rather than
  failing open into a second payable session.
- [Changing the result shape breaks callers] → Keep `success` for compatibility and cover every
  caller with TypeScript plus focused tests.

## Migration Plan

Deploy the client and `stripe-checkout` function changes together. No schema migration or data
backfill is required. Function deployment is a separately approved shared-system operation after
merge. Rollback is a normal application-code/function revert.

## Open Questions

None. MYK9-98 and the existing cart/session guards define the required behavior.
