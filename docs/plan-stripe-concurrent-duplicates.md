# Stripe: two requests at once must not make two charges (MYK9-2451, MYK9-2449)

> **Status:** Active

Linear: MYK9-2451 (payment links, split from MYK9-2448) and MYK9-2449 (subscriptions, found on #4425).
Docs only. No code changes until the owner picks an option.

## What exists today, and why

**Payment links** (`stripe-payment-link/index.ts`). A secretary, club admin or site admin asks for a link for unpaid
entries. An exhibitor can also ask for one to claim their own waitlist offer. The function reads open
`entry_payment_links` rows that overlap the entries, checks each with Stripe, expires the old session, then creates
a new one and inserts its row. The table (`20260620200000_entry_payment_links.sql`) exists so that "a re-request
EXPIRES the prior open link so two live links can't both be paid". This covers requests made one after another.
It does not cover two requests at the same moment. Both read "no open link", both create a session, and both insert
a row. Nothing stops it: `entry_ids` is an array, so no unique index can say "one open link per entry". Only
`stripe_checkout_session_id` is unique. No Stripe idempotency key is sent.

Guards that already exist:

- `RequestPaymentDialog` disables Generate while it waits, so one secretary's double-click sends one request.
- The webhook already handles a link paid for an entry that is already paid. It stamps the valid entries, puts the
  rest in `alreadyPaidEntryIds`, queues a `refund_requests` row (kind `entry_payment_link`) in the same
  transaction as its latch (`queue_payment_link_refund`), and alerts the admin. The refund waits for a person. The
  service fee is never refunded (MYK9-966).
- `_shared/showMoneyLock.ts` (`show_money_locks`, `20260706184621`) is a per-show lock with a TTL. Refunds and
  the payout cron already use it. A second taker gets `locked`. A crashed holder heals when the TTL ends.

**Entry checkout** (`stripe-checkout`, MYK9-1012, #2755). Cart checkout had the same race. It was closed with a
lease, not a guard per interleaving: `claim_cart_checkout` gives one holder a 90-second lease, a second Pay gets
409 `checkout_in_progress`, and `checkoutLeasedCart` re-reads the cart under the lease. That is the pattern to copy.

**Subscriptions** (`handleSubscriptionCheckout`). MYK9-2444 (#4425) added `hasBlockingSubscription`: refuse a new
checkout when the customer has an active, trialing or past_due subscription. An open Checkout Session is not a
subscription yet. Two tabs can each open a session and both can be paid. Unlike the link race, this one needs no
exact timing: tab B can open minutes after tab A, as long as A is not yet paid. The webhook
(`handleSubscriptionCheckoutCompleted`) syncs each subscription by its own id and does not look for a second one.
The second subscription bills every month until someone notices.

## Proposed shape

**MYK9-2451, payment links: take the show money lock.** Call `acquireShowMoneyLock(supabase, show.id, { holder:
'stripe-payment-link', ttlMs: 2 * 60 * 1000 })` right before the prior-link read. Release it in a `finally`
after the row is inserted. A second request gets 409: "Another payment link for this show is being made. Try again
in a moment." No migration and no new helper. The lock is per show, not per entry, so two secretaries working
different entries in one show can bump into each other. The cost is one retry. Payouts and refunds hold the same
row only while they run, so contention is rare.

Rejected: a Stripe idempotency key from entries and amount. The session params carry `expires_at` from
`Date.now()`, so two requests send different params and Stripe rejects the second key. Stripe keeps a key for 24
hours, so a key would hand back the session a re-request just expired. A database lease like
`cart_checkout_leases` keyed per entry would be tighter, but it needs a migration for a smaller gain.

If a duplicate still lands, nothing changes: the webhook queues the refund request and alerts, as it does today.

**MYK9-2449, subscriptions: expire the customer's open subscription sessions first.** After
`hasBlockingSubscription`, list the customer's open Checkout Sessions (`checkout.sessions.list({ customer,
status: 'open' })`), keep those with `mode === 'subscription'`, and expire each. Then create the new one. Newest wins.
The old tab shows Stripe's expired page. If `expire` fails because that session was just paid, return the same "You already have a
subscription" 400. Tab A can also finish paying after the first check but before the list, so its session is
already complete and never reaches `expire`. So run `hasBlockingSubscription` again after the expiry pass and
right before create. Copy the retrieve, expire and recheck order that `stripe-payment-link` already uses. Reusing an open session is simpler for the user but breaks when the price
differs (monthly against annual). Expiring is one rule.

This leaves a window of about a second for two truly simultaneous requests. A per-customer lock would close it.
It is not worth a new table for a premium subscription.

**Webhook backstop for subscriptions.** In `handleSubscriptionCheckoutCompleted`, after the sync, count the
customer's blocking subscriptions. If there is more than one, alert the admin with both ids and queue a `refund_requests` row for the newer
subscription's first invoice. Key both the alert and the row on the newer subscription's id, not the session:
both completion events can arrive after both subscriptions exist, and each picks the same newer one. The code
never cancels or refunds on its own. Recovery has a second human step: the alert tells the admin to cancel the
duplicate in Stripe, or it bills again at renewal.

Cancelling it must not drop the customer to free. Today `syncSubscriptionFromStripe` writes
`subscription_tier: 'free'` for any event on a subscription that is not active or trialing, even when the
customer holds another active one. Fix that in the same PR: before writing `free`, list the customer's
subscriptions and keep the tier and expiry of any other active or trialing one. This needs a migration: a new kind (`duplicate_subscription`) in
`refund_requests_kind_check` and a branch in the settle RPC. Per the rules, that ships alone, not in a batch.

## Do nothing, delete, or link

- **Payment links: doing nothing is defensible.** Pre-launch, no real payers. One secretary's double-click is
  already blocked by the UI. The race needs two staff on the same entries in the same second, or an exhibitor with
  two tabs pressing Pay at once. Then the payer must pay both pages. If that happens, the webhook already catches it
  and queues a refund for approval. The real harm is small: one refund for the admin and a kept service fee. The lock
  costs about 15 lines and reuses tested code, so it is still cheap.
- **Subscriptions: doing nothing is not defensible.** Two tabs opened minutes apart are ordinary behaviour. The
  harm repeats every month and nothing in the webhook notices. Deleting premium checkout is out of scope. Linking to
  the customer portal ("manage your subscription") is already the answer for a customer who has one. It does not
  help while the first session is still open.

## Recommendation

1. MYK9-2449: ship the expire-open-sessions step now. Small, no migration, closes the realistic case.
2. MYK9-2449 backstop: the webhook alert plus the `duplicate_subscription` refund kind, as its own PR with its
   migration. Do it before premium takes real money.
3. MYK9-2451: take the show money lock. It is cheap, so do it, but it may wait behind 1 and 2. If the owner would
   rather close it, close it as covered by the webhook's existing refund queue.

## Testing

- **Link lock (vitest, Deno-free).** Pull the lock-around-create step into `_shared/` so vitest can drive it. Write
  the assertion first: a second call while the lock is held returns 409, and `sessions.create` is called once. The
  lock is released when create throws and when the insert fails. A lock read error answers 503, never a link.
- **Subscription expiry (vitest).** A helper beside `existingSubscriptionGuard.ts`, with a fake Stripe: open
  subscription sessions are expired before create; payment-mode sessions are left alone; an expire that fails on a
  now-paid session returns 400 and does not create; pagination is followed (`has_more`). A separate case: the
  first check passes, a session completes before the list, and the second check returns 400 with no create.
- **Webhook backstop (vitest plus a behavioral SQL test).** Two blocking subscriptions give one alert and one
  `refund_requests` row. Deliver both distinct completion events, in either order, after both subscriptions
  exist: still one alert and one row. A redelivery adds neither. One subscription gives neither. Then cancel the
  duplicate: the `customer.subscription.deleted` event leaves the profile on the paid tier with the kept
  subscription's expiry. The case ends with one renewable subscription and the right tier, not just a queued row. The SQL test under
  `supabase/tests/` covers the new kind and the settle branch. It runs only in CI.
- **Sandbox walk.** In Stripe test mode, open premium checkout in tab A, then tab B. Tab A must show
  Stripe's expired page and refuse payment. Pay B: one subscription in Stripe. Separately, pay A before opening B:
  B's checkout gets the "You already have a subscription" 400. For links, fire two requests at once with `curl`: expect one
  200 and one 409, and one open row in `entry_payment_links`.
- Run targeted suites while developing. Before pushing added or changed tests, run the whole app suite once from
  `apps/myk9show`: `pnpm vitest run --sequence.shuffle`.

## Review notes

Codex round 1: all five findings checked against the code and accepted. The paid-between-checks race, the
cancel step and the `free` overwrite in `syncSubscriptionFromStripe`, dedupe by subscription, the tab order in
the sandbox walk, and the whole shuffled suite are now in the plan above.
