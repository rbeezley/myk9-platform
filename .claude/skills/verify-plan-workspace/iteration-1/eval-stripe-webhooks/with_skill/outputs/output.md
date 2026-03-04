# Plan: Add Stripe Webhook Handling for Subscription Events

## Context

The myK9 Platform already has a fully implemented Stripe webhook Edge Function at `apps/myk9show/supabase/functions/stripe-webhook/index.ts`. This function already handles the three requested event types:

- `checkout.session.completed`
- `invoice.payment_failed`
- `customer.subscription.updated`

It also handles `customer.subscription.created`, `customer.subscription.deleted`, and `invoice.paid`.

The database schema already includes:

- `stripe_customers` table (links `person_id` to `stripe_customer_id`)
- `stripe_subscriptions` table (stores subscription ID, status, price ID, period dates, cancellation info)
- `stripe_orders` table (stores checkout/payment records)
- `exhibitor_profiles` table (has `subscription_tier` and `subscription_expires_at` fields synced from Stripe)

**Because this functionality already exists, the plan below describes how the existing implementation works and what gaps remain to make it production-ready.**

---

## Step 1: Existing Webhook Edge Function (Already Implemented)

**File:** `apps/myk9show/supabase/functions/stripe-webhook/index.ts`

The Edge Function already:

1. Validates the `stripe-signature` header against `STRIPE_WEBHOOK_SECRET`
2. Constructs the Stripe event using `stripe.webhooks.constructEventAsync()`
3. Routes events through a `handleEvent()` switch statement
4. Processes events asynchronously via `EdgeRuntime.waitUntil()`
5. Returns `{ received: true }` immediately (correct for webhook endpoints)

### Event Handlers

| Event                                           | Handler                        | What It Does                                                                                                                                                             |
| ----------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `checkout.session.completed`                    | `handleCheckoutCompleted()`    | Routes by checkout type: entry payments create entries + stripe_orders; subscription checkouts call `syncSubscriptionFromStripe`; one-time payments create stripe_orders |
| `customer.subscription.created/updated/deleted` | `handleSubscriptionChange()`   | Calls `syncSubscriptionFromStripe()` for all three sub-events                                                                                                            |
| `invoice.paid`                                  | `handleInvoicePaid()`          | Calls `syncSubscriptionFromStripe()` to refresh subscription state                                                                                                       |
| `invoice.payment_failed`                        | `handleInvoicePaymentFailed()` | Calls `syncSubscriptionFromStripe()` to update status (failed payment causes Stripe to update subscription status to `past_due`)                                         |

### Core Sync Function: `syncSubscriptionFromStripe()`

This function:

1. Looks up the `stripe_customers` record by `stripe_customer_id`
2. Fetches the latest subscription from Stripe API (`stripe.subscriptions.list()`)
3. Upserts the `stripe_subscriptions` table with current status, period dates, cancellation info
4. Updates `exhibitor_profiles.subscription_tier` to `'premium'` (if active/trialing) or `'free'` (if canceled/past_due/etc.)
5. Updates `exhibitor_profiles.subscription_expires_at` accordingly

---

## Step 2: Database Schema (Already Implemented)

**Migration 005:** `stripe_customers`, `stripe_orders`, `stripe_subscriptions` tables
**Migration 009:** `exhibitor_profiles` table with `subscription_tier` and `subscription_expires_at`
**Migration 023:** Tightened RLS policies so users only see their own subscription data

No schema changes are needed. The existing tables cover all required fields.

---

## Step 3: Stripe Webhook Configuration in Stripe Dashboard

**Status: Needs manual setup in Stripe Dashboard.**

To connect Stripe to the Edge Function:

1. In the Stripe Dashboard, go to Developers > Webhooks
2. Add endpoint URL: `https://sojmvhhwsjxmfistvzbe.supabase.co/functions/v1/stripe-webhook`
3. Select events to listen for:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
   - `invoice.payment_failed`
4. Copy the signing secret (`whsec_...`) and set it as a Supabase secret:
   ```bash
   supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
   ```

---

## Step 4: Deploy the Edge Function

```bash
supabase functions deploy stripe-webhook --no-verify-jwt
```

The `--no-verify-jwt` flag is required because Stripe sends requests without a Supabase JWT. The function authenticates via the Stripe signature instead.

---

## Step 5: Gaps to Address for Production Readiness

### 5a. Idempotency Protection [NEEDS IMPLEMENTATION]

Stripe may deliver the same event multiple times. The current implementation has no idempotency guard. Add an `event_id` check:

- Create a `stripe_webhook_events` table (new migration):
  ```sql
  CREATE TABLE IF NOT EXISTS stripe_webhook_events (
    id TEXT PRIMARY KEY,  -- Stripe event ID (evt_...)
    type TEXT NOT NULL,
    processed_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE INDEX stripe_webhook_events_processed_at_idx ON stripe_webhook_events(processed_at);
  ```
- Before processing, check if the event ID exists. If so, skip.
- After processing, insert the event ID.
- Add a periodic cleanup job (delete events older than 30 days).

### 5b. Error Handling and Retry Logic [NEEDS IMPROVEMENT]

Current gaps:

- `syncSubscriptionFromStripe()` throws on failure, but `EdgeRuntime.waitUntil()` swallows the error silently
- No dead letter queue or alerting for failed webhook processing
- No structured logging for monitoring

Recommendations:

- Wrap each handler in try/catch with structured error logging
- Log event ID, type, and customer ID on every error
- Consider a `stripe_webhook_failures` table for events that fail processing, enabling manual retry

### 5c. Webhook Endpoint Security Hardening [NEEDS IMPLEMENTATION]

- The function currently validates the Stripe signature (good)
- Add IP allowlisting if Supabase Edge Functions support it (Stripe publishes their webhook IPs)
- Add rate limiting consideration (Stripe can burst during catch-up)

### 5d. Testing [NEEDS IMPLEMENTATION]

- Use `stripe trigger checkout.session.completed` (Stripe CLI) to test locally
- Write unit tests for `syncSubscriptionFromStripe()` logic (mock Stripe API + Supabase client)
- Write integration tests using Stripe test mode webhooks
- Test the `mapPriceToTier()` function with known and unknown price IDs

### 5e. Monitoring and Alerting [RECOMMENDED]

- Monitor the Stripe Dashboard webhook delivery logs for failures
- Set up alerts for repeated 500 responses from the webhook endpoint
- Log subscription tier changes for audit trail

---

## Step 6: Environment Variables Required

| Variable                    | Purpose                             | Where Set            |
| --------------------------- | ----------------------------------- | -------------------- |
| `STRIPE_SECRET_KEY`         | Stripe API calls from Edge Function | Supabase secrets     |
| `STRIPE_WEBHOOK_SECRET`     | Webhook signature verification      | Supabase secrets     |
| `SUPABASE_URL`              | Database access                     | Auto-set by Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Bypass RLS for webhook writes       | Auto-set by Supabase |

---

## Summary

The core webhook handling is **already implemented** and covers all three requested events. The remaining work is operational:

1. Configure the webhook endpoint in Stripe Dashboard
2. Set the `STRIPE_WEBHOOK_SECRET` secret
3. Deploy the Edge Function
4. **[New work]** Add idempotency protection (new migration + code change)
5. **[New work]** Improve error handling/logging
6. **[New work]** Add tests

---

---

## Plan Verification

### Requirements Audit

| Requirement                                        | Status      | Evidence                                                                                                                                                                                  |
| -------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Handle `checkout.session.completed` event          | **Covered** | Step 1 table: "Routes by checkout type: entry payments create entries + stripe_orders; subscription checkouts call `syncSubscriptionFromStripe`"                                          |
| Handle `invoice.payment_failed` event              | **Covered** | Step 1 table: "`handleInvoicePaymentFailed()` -- Calls `syncSubscriptionFromStripe()` to update status"                                                                                   |
| Handle `customer.subscription.updated` event       | **Covered** | Step 1 table: "`handleSubscriptionChange()` -- Calls `syncSubscriptionFromStripe()` for all three sub-events"                                                                             |
| Update user's subscription status in Postgres      | **Covered** | Step 1 "Core Sync Function" section: "Upserts the `stripe_subscriptions` table with current status, period dates, cancellation info" and "Updates `exhibitor_profiles.subscription_tier`" |
| Webhook signature verification (implied security)  | **Covered** | Step 1: "Validates the `stripe-signature` header against `STRIPE_WEBHOOK_SECRET`" and Step 5c discusses hardening                                                                         |
| Stripe Dashboard configuration (implied setup)     | **Covered** | Step 3: full instructions for adding endpoint URL, selecting events, setting signing secret                                                                                               |
| Deployment instructions (implied operational need) | **Covered** | Step 4: `supabase functions deploy stripe-webhook --no-verify-jwt` with explanation                                                                                                       |
| Environment variables documented (implied)         | **Covered** | Step 6: table of all 4 required variables with purpose and location                                                                                                                       |
| Idempotency / duplicate event handling (edge case) | **Covered** | Step 5a: describes the gap and provides migration SQL + implementation approach                                                                                                           |
| Error handling for failed processing (edge case)   | **Covered** | Step 5b: identifies silent error swallowing and recommends structured logging + failure table                                                                                             |
| Testing strategy (implied quality gate)            | **Covered** | Step 5d: Stripe CLI triggers, unit tests, integration tests, and specific function test cases                                                                                             |
| Database schema for subscription data (implied)    | **Covered** | Step 2: lists all relevant tables and migrations, confirms no schema changes needed                                                                                                       |

### Coverage: 100/100

All explicit requirements (three event types, Postgres subscription update) are addressed with citations to specific plan sections. Implied requirements (security, deployment, testing, idempotency, error handling, environment config) are also covered. The plan identifies that the core implementation already exists and focuses on the operational and hardening gaps.

### Top Gaps

No gaps remain. All requirements are covered.

### Patched Plan

No patches needed -- coverage is 100%.
