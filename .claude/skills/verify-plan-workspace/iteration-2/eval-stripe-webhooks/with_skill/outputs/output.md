# Plan: Add Stripe Webhook Handling for Subscription Events

## Context

The myK9 Platform already has a Stripe webhook Edge Function at `apps/myk9show/supabase/functions/stripe-webhook/index.ts` that handles `checkout.session.completed`, `customer.subscription.created/updated/deleted`, `invoice.paid`, and `invoice.payment_failed`. It already updates the user's subscription status in Postgres via the `syncSubscriptionFromStripe()` function.

The existing implementation covers all three requested event types. This plan focuses on deploying the existing function, verifying it works end-to-end, and hardening it for production.

## Step 1: Deploy the Existing Webhook Edge Function

The webhook handler already exists but needs to be deployed to Supabase and registered with Stripe.

**Actions:**

1. Deploy the Edge Function:
   ```bash
   supabase functions deploy stripe-webhook --no-verify-jwt
   ```
2. Set required environment variables on the Supabase project:
   - `STRIPE_SECRET_KEY` — the `sk_live_*` or `sk_test_*` key
   - `STRIPE_WEBHOOK_SECRET` — the `whsec_*` signing secret from Stripe dashboard
   - `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set automatically by Supabase
3. Register the webhook endpoint in the Stripe Dashboard:
   - URL: `https://sojmvhhwsjxmfistvzbe.supabase.co/functions/v1/stripe-webhook`
   - Events to listen for: `checkout.session.completed`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.created`, `customer.subscription.deleted`, `invoice.paid`

## Step 2: Event Handling Logic (Already Implemented)

The existing `handleEvent()` switch statement routes events:

| Event                           | Handler                        | DB Effect                                                                                                                                                   |
| ------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `checkout.session.completed`    | `handleCheckoutCompleted()`    | Routes to entry payment, subscription checkout, or one-time payment handler. Subscription checkout calls `syncSubscriptionFromStripe()`.                    |
| `customer.subscription.updated` | `handleSubscriptionChange()`   | Calls `syncSubscriptionFromStripe()` which upserts `stripe_subscriptions` and updates `exhibitor_profiles.subscription_tier` and `subscription_expires_at`. |
| `customer.subscription.created` | `handleSubscriptionChange()`   | Same as above.                                                                                                                                              |
| `customer.subscription.deleted` | `handleSubscriptionChange()`   | Same — sets tier to `free` if no active subscriptions remain.                                                                                               |
| `invoice.payment_failed`        | `handleInvoicePaymentFailed()` | Calls `syncSubscriptionFromStripe()` which re-fetches subscription from Stripe API and updates status (Stripe will have set it to `past_due`).              |
| `invoice.paid`                  | `handleInvoicePaid()`          | Calls `syncSubscriptionFromStripe()` to confirm active status.                                                                                              |

The `syncSubscriptionFromStripe()` function:

1. Looks up the `stripe_customers` record by `stripe_customer_id`
2. Fetches the latest subscription from Stripe's API
3. Upserts into `stripe_subscriptions` table (status, period dates, cancel flags)
4. Updates `exhibitor_profiles` table: sets `subscription_tier` to `premium` (if active/trialing) or `free` (otherwise), and sets `subscription_expires_at`

## Step 3: Database Schema (Already Exists)

The required tables are defined in `supabase/migrations/005_myk9show_specific.sql`:

- **`stripe_customers`** — maps `person_id` to `stripe_customer_id`
- **`stripe_subscriptions`** — stores subscription ID, price ID, status, period dates, cancellation info
- **`stripe_orders`** — stores payment records for one-time and entry payments
- **`exhibitor_profiles`** — has `subscription_tier` (`free` | `premium`) and `subscription_expires_at` columns

All tables have appropriate indexes and `updated_at` triggers.

## Step 4: Verify Webhook Signature Validation

The existing implementation already validates webhook signatures:

```typescript
event = await stripe.webhooks.constructEventAsync(body, signature, stripeWebhookSecret);
```

This returns 400 if the signature is invalid, preventing forged events.

## Step 5: End-to-End Testing Plan

1. **Local testing with Stripe CLI:**
   ```bash
   stripe listen --forward-to http://localhost:54321/functions/v1/stripe-webhook
   stripe trigger checkout.session.completed
   stripe trigger invoice.payment_failed
   stripe trigger customer.subscription.updated
   ```
2. **Verify database state after each event:**
   - After `checkout.session.completed`: check `stripe_subscriptions` has a new row, `exhibitor_profiles.subscription_tier` is `premium`
   - After `invoice.payment_failed`: check `stripe_subscriptions.status` is `past_due`, `exhibitor_profiles.subscription_tier` reflects downgrade
   - After `customer.subscription.updated`: check `stripe_subscriptions` row matches Stripe's state
3. **Verify the frontend reflects changes:**
   - `useSubscriptionGate()` reads `subscription_tier` and `subscription_expires_at` from the exhibitor profile via `useExhibitorProfile()`
   - After webhook updates the DB, the next React Query refetch (within 5 minutes staleTime, or on window focus) will pick up changes

## Step 6: Production Hardening

1. **Idempotency:** The `syncSubscriptionFromStripe()` function uses `upsert` with `onConflict: 'stripe_subscription_id'`, making it safe for duplicate webhook deliveries.
2. **Async processing:** The handler uses `EdgeRuntime.waitUntil(handleEvent(event))` so the 200 response is returned immediately to Stripe, with processing happening asynchronously. This prevents Stripe timeout retries.
3. **Error isolation:** Each event handler catches errors independently. Email sending failures don't block payment processing (wrapped in try/catch with "Don't throw" comment).
4. **Logging:** Every handler logs the event type and key identifiers for debugging via `console.log` and `console.error`.

## Step 7: Add Monitoring and Alerting [ADDED]

1. **Stripe Dashboard monitoring:** Configure webhook failure alerts in the Stripe Dashboard (Settings > Webhooks > your endpoint > Alert preferences).
2. **Supabase Function logs:** Monitor Edge Function logs in the Supabase Dashboard for `console.error` entries that indicate processing failures.
3. **Consider adding a `webhook_events` audit table** for production:
   ```sql
   CREATE TABLE IF NOT EXISTS webhook_events (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     stripe_event_id TEXT NOT NULL UNIQUE,
     event_type TEXT NOT NULL,
     status TEXT DEFAULT 'processing' CHECK (status IN ('processing', 'succeeded', 'failed')),
     error_message TEXT,
     payload JSONB,
     processed_at TIMESTAMPTZ,
     created_at TIMESTAMPTZ DEFAULT NOW()
   );
   CREATE INDEX ON webhook_events(stripe_event_id);
   CREATE INDEX ON webhook_events(event_type, created_at);
   ```
   This provides an audit trail and makes duplicate detection explicit (via UNIQUE on `stripe_event_id`).

## Step 8: Handle Stripe Customer Creation Race Condition [ADDED]

The `syncSubscriptionFromStripe()` function depends on finding a `stripe_customers` record matching the `stripe_customer_id`. If no record exists (e.g., customer was created out-of-band in Stripe), the function silently returns without updating anything.

**Mitigation:** Add a fallback in `syncSubscriptionFromStripe()` that creates the `stripe_customers` record when it does not exist, by fetching the customer from Stripe's API and matching on email to find the `person_id`.

## Step 9: Retry and Dead Letter Handling [ADDED]

Stripe retries failed webhook deliveries (non-2xx responses) for up to 3 days with exponential backoff. The current implementation returns 200 immediately and processes asynchronously via `EdgeRuntime.waitUntil()`. If the async processing fails, there is no retry mechanism because Stripe already received the 200.

**Mitigation options:**

- Option A: Move to synchronous processing (remove `waitUntil`), so Stripe retries on failure. This requires the handler to complete within Stripe's timeout window (~20s).
- Option B: Keep async processing but add a periodic reconciliation job that compares Stripe subscription states with database states. This is the more robust approach.

**Recommendation:** Option B. Add a scheduled reconciliation function (Supabase CRON or pg_cron) that runs daily, lists active Stripe subscriptions, and ensures the database matches. This catches any events that were lost to async processing failures.

---

## Plan Verification

### Requirements Audit

| Requirement                                  | Status      | Evidence                                                                                                                                                                                                                                           |
| -------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Handle `checkout.session.completed` event    | **Covered** | Step 2: `handleCheckoutCompleted()` routes based on checkout type; subscription checkouts call `syncSubscriptionFromStripe()` which updates DB                                                                                                     |
| Handle `invoice.payment_failed` event        | **Covered** | Step 2: `handleInvoicePaymentFailed()` calls `syncSubscriptionFromStripe()` which re-fetches subscription from Stripe (status will be `past_due`) and updates both `stripe_subscriptions` and `exhibitor_profiles`                                 |
| Handle `customer.subscription.updated` event | **Covered** | Step 2: `handleSubscriptionChange()` calls `syncSubscriptionFromStripe()` for all subscription lifecycle events                                                                                                                                    |
| Update subscription status in Postgres       | **Covered** | Steps 2-3: `syncSubscriptionFromStripe()` upserts `stripe_subscriptions` and updates `exhibitor_profiles.subscription_tier` / `subscription_expires_at`                                                                                            |
| Webhook signature validation (security)      | **Covered** | Step 4: `stripe.webhooks.constructEventAsync()` validates signature, returns 400 on failure                                                                                                                                                        |
| Secrets management (security)                | **Covered** | Step 1: `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` stored as Supabase environment variables, never in code                                                                                                                                    |
| Idempotent event processing (edge case)      | **Covered** | Step 6.1: upsert with `onConflict: 'stripe_subscription_id'` makes duplicate delivery safe                                                                                                                                                         |
| Error handling for external calls            | **Partial** | Step 6.3: errors are caught and logged, but async processing via `waitUntil()` means Stripe won't retry on failure. Step 9 adds reconciliation as mitigation                                                                                       |
| Deployment steps (operational)               | **Covered** | Step 1: `supabase functions deploy`, env vars, and Stripe Dashboard registration documented                                                                                                                                                        |
| Testing strategy                             | **Covered** | Step 5: Stripe CLI local testing, DB state verification, frontend verification                                                                                                                                                                     |
| Monitoring and alerting (operational)        | **Covered** | Step 7 [ADDED]: Stripe Dashboard alerts, Supabase logs, optional audit table                                                                                                                                                                       |
| Rollback / recovery                          | **Partial** | The function can be re-deployed or rolled back via `supabase functions deploy`. However, there is no explicit data rollback plan if a bad webhook update corrupts subscription state. Reconciliation job (Step 9) serves as the recovery mechanism |
| Stripe customer not found in DB (edge case)  | **Covered** | Step 8 [ADDED]: documents the race condition and proposes fallback to create missing customer records                                                                                                                                              |
| Lost async events / retry (edge case)        | **Covered** | Step 9 [ADDED]: proposes daily reconciliation job as safety net                                                                                                                                                                                    |
| Performance (N+1, indexes)                   | **Covered** | Step 3: all tables have indexes on lookup columns. `syncSubscriptionFromStripe()` does a bounded number of queries (3-4 per event, no loops)                                                                                                       |
| Migration / backwards compatibility          | **Covered** | No schema changes needed — all tables already exist in migration 005. The webhook function is additive (new Edge Function deployment, no breaking changes)                                                                                         |

### Coverage: 90/100

Two items are Partial: (1) error handling for async processing failures relies on a proposed-but-not-yet-built reconciliation job, and (2) rollback from corrupted subscription state has no explicit procedure beyond the same reconciliation. The core requirements (three event types, DB updates) are fully covered with citations. The gaps are in production resilience for failure modes.

### Top Gaps

1. **Async failure recovery (Partial)** — If `EdgeRuntime.waitUntil()` processing fails after the 200 is returned to Stripe, the event is lost. The reconciliation job in Step 9 is proposed but not yet implemented. **Impact:** Could leave subscription state stale until reconciliation runs.
2. **Data rollback procedure (Partial)** — No explicit procedure for reverting incorrect subscription state updates. The reconciliation job would fix forward, but a manual intervention runbook would be valuable. **Impact:** Operator confusion during incidents.

### Patched Plan

The plan above already includes the patches:

- **Step 7 [ADDED]:** Monitoring, alerting, and optional audit table for webhook events.
- **Step 8 [ADDED]:** Handling the missing `stripe_customers` record edge case.
- **Step 9 [ADDED]:** Retry strategy analysis and recommendation for daily reconciliation job as a safety net for lost async events.

No further patches needed. The remaining Partial items are acknowledged operational concerns that would be addressed during implementation by building the reconciliation job and writing a brief incident runbook.
