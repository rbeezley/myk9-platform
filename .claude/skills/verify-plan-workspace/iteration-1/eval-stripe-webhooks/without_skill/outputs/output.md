# Plan: Add Stripe Webhook Handling for Subscription Events

## Context & Current State

**Important discovery: A Stripe webhook handler already exists.** The file `apps/myk9show/supabase/functions/stripe-webhook/index.ts` is a fully implemented Supabase Edge Function that already handles all three requested event types plus more:

- `checkout.session.completed` -- handled (routes to entry payments, subscription checkouts, and one-time payments)
- `invoice.payment_failed` -- handled (calls `syncSubscriptionFromStripe`)
- `customer.subscription.updated` -- handled (calls `syncSubscriptionFromStripe`, along with `.created` and `.deleted`)

The task mentions "Next.js app" but myK9Show is a **Vite + React SPA** (not Next.js). Webhooks are handled via **Supabase Edge Functions** (Deno), not Next.js API routes. This is the correct architecture for this project.

### Existing Database Schema

The following tables are already in place (from migrations `005_myk9show_specific.sql` and `009_online_entry_system.sql`):

- **`stripe_customers`** -- maps `person_id` to `stripe_customer_id`
- **`stripe_subscriptions`** -- stores subscription state (status, period dates, cancellation)
- **`stripe_orders`** -- stores one-time and entry payment records
- **`exhibitor_profiles`** -- contains `subscription_tier` ('free'|'premium'|'pro') and `subscription_expires_at`, synced from Stripe

### Existing Sync Logic

`syncSubscriptionFromStripe(stripeCustomerId)` in the webhook handler:

1. Looks up the `stripe_customers` record by `stripe_customer_id`
2. Fetches the latest subscription from the Stripe API
3. Upserts into `stripe_subscriptions` (status, period dates, cancellation info)
4. Updates `exhibitor_profiles.subscription_tier` and `subscription_expires_at` based on whether status is `active` or `trialing`
5. If no subscription exists, resets to `free` tier

---

## Plan: What Actually Needs to Be Done

Since the webhook handler already exists and covers all three events, the work falls into **deployment, configuration, and hardening** rather than writing new handler code.

### Phase 1: Verify Deployment & Configuration

1. **Deploy the Edge Function to Supabase**
   - Run: `supabase functions deploy stripe-webhook --no-verify-jwt`
   - The `--no-verify-jwt` flag is required because Stripe sends unauthenticated POST requests
   - File location: `apps/myk9show/supabase/functions/stripe-webhook/index.ts`
   - Note: The function currently lives under `apps/myk9show/supabase/functions/` but the project's Supabase CLI config is at the repo root (`supabase/config.toml`). Verify whether the function needs to be moved to `supabase/functions/stripe-webhook/` to match the CLI's expected path, or if the deploy command needs a `--project-dir` flag.

2. **Set Required Environment Variables in Supabase**
   - `STRIPE_SECRET_KEY` -- the Stripe secret key (test: `sk_test_*`, production: `sk_live_*`)
   - `STRIPE_WEBHOOK_SECRET` -- the webhook signing secret from Stripe (starts with `whsec_`)
   - `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` -- should already be available as built-in Edge Function env vars

3. **Configure Stripe Webhook Endpoint**
   - In the Stripe Dashboard (or via CLI), register the webhook URL:
     `https://sojmvhhwsjxmfistvzbe.supabase.co/functions/v1/stripe-webhook`
   - Subscribe to these events:
     - `checkout.session.completed`
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.paid`
     - `invoice.payment_failed`
   - Copy the resulting `whsec_*` signing secret into the `STRIPE_WEBHOOK_SECRET` env var

4. **Test with Stripe CLI**
   ```bash
   stripe listen --forward-to https://sojmvhhwsjxmfistvzbe.supabase.co/functions/v1/stripe-webhook
   stripe trigger checkout.session.completed
   stripe trigger invoice.payment_failed
   stripe trigger customer.subscription.updated
   ```

### Phase 2: Hardening & Edge Cases

5. **Add Idempotency Protection**
   - The current handler does not check for duplicate event delivery. Stripe may send the same event multiple times.
   - Create a `stripe_webhook_events` table (or add a column to an existing table) to track processed event IDs:
     ```sql
     CREATE TABLE IF NOT EXISTS stripe_webhook_events (
       id TEXT PRIMARY KEY,  -- Stripe event ID (evt_xxx)
       type TEXT NOT NULL,
       processed_at TIMESTAMPTZ DEFAULT NOW()
     );
     CREATE INDEX ON stripe_webhook_events(processed_at);
     ```
   - At the top of `handleEvent()`, check if the event ID already exists. If so, return early.
   - Add a periodic cleanup job (or TTL) to purge events older than 30 days.

6. **Add Error Handling for `syncSubscriptionFromStripe` Edge Cases**
   - **Missing `stripe_customers` record**: If the webhook fires before the customer record is created (race condition during checkout), the sync silently fails. Consider creating the `stripe_customers` record on-the-fly from the Stripe customer object.
   - **Missing `exhibitor_profiles` record**: The `UPDATE` to `exhibitor_profiles` will silently affect 0 rows if no profile exists yet. Log a warning when `updateCount === 0`.

7. **Handle `past_due` Subscription Status**
   - Currently, only `active` and `trialing` map to the premium tier. The `past_due` status (which occurs after `invoice.payment_failed`) correctly falls through to `free`. Verify this is the desired behavior -- some platforms give a grace period before downgrading.
   - Consider: Should `past_due` users retain premium access for N days? If so, add logic to check `current_period_end` before downgrading.

8. **Add Structured Logging / Monitoring**
   - The current handler uses `console.log`/`console.error`. Consider adding structured JSON logging with event type, customer ID, and subscription status for easier debugging in Supabase logs.

### Phase 3: Testing

9. **Unit Tests for `mapPriceToTier`**
   - Verify known price IDs map correctly
   - Verify unknown price IDs default to 'free'

10. **Integration Test for Webhook Signature Verification**
    - Test that requests without `stripe-signature` header return 400
    - Test that requests with invalid signatures return 400
    - Test that valid signatures pass through

11. **End-to-End Test with Stripe Test Mode**
    - Create a test subscription via Stripe API
    - Verify `stripe_subscriptions` and `exhibitor_profiles` are updated correctly
    - Cancel the subscription and verify downgrade to `free`

### Phase 4: Production Readiness

12. **Separate Test vs. Production Webhook Endpoints**
    - Stripe requires separate webhook endpoints for test and live mode
    - Register two endpoints in Stripe Dashboard (one for test, one for live)
    - Use different `STRIPE_WEBHOOK_SECRET` values for each environment

13. **Add Alerting for Failed Webhook Processing**
    - If `syncSubscriptionFromStripe` throws, the error is logged but not surfaced. Consider integrating with an alerting service (e.g., Sentry, or a Supabase database log that the admin dashboard can surface).

---

## Verification: Gap Analysis

### Requirements Coverage

| Requirement                              | Covered? | Notes                                                               |
| ---------------------------------------- | -------- | ------------------------------------------------------------------- |
| `checkout.session.completed` handling    | YES      | Existing handler routes to entry, subscription, or one-time payment |
| `invoice.payment_failed` handling        | YES      | Calls `syncSubscriptionFromStripe` which updates status             |
| `customer.subscription.updated` handling | YES      | Calls `syncSubscriptionFromStripe`                                  |
| Update subscription status in Postgres   | YES      | Updates both `stripe_subscriptions` and `exhibitor_profiles` tables |

### Edge Cases & Gaps Identified

| Gap                                                                                                                                           | Severity                  | Status                                                                             |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------- |
| **No idempotency protection** -- duplicate events could cause duplicate entries or orders                                                     | HIGH                      | Phase 2, item 5                                                                    |
| **Race condition: webhook before customer record** -- `syncSubscriptionFromStripe` fails silently if `stripe_customers` row doesn't exist yet | MEDIUM                    | Phase 2, item 6                                                                    |
| **No grace period for `past_due`** -- users lose premium immediately on first failed payment                                                  | LOW (design decision)     | Phase 2, item 7                                                                    |
| **Edge Function location mismatch** -- function is in `apps/myk9show/supabase/functions/` but Supabase CLI expects `supabase/functions/`      | HIGH (deployment blocker) | Phase 1, item 1                                                                    |
| **No alerting on handler failures** -- errors only go to console logs                                                                         | MEDIUM                    | Phase 4, item 13                                                                   |
| **Webhook endpoint not registered in Stripe** -- code exists but may not be deployed/configured                                               | HIGH (functional blocker) | Phase 1, items 1-3                                                                 |
| **`handleEntryPaymentCompleted` is not idempotent** -- if called twice, creates duplicate entries                                             | HIGH                      | Phase 2, item 5                                                                    |
| **No retry logic** -- if Supabase DB is temporarily down, the event is lost                                                                   | MEDIUM                    | Could add a dead-letter queue or rely on Stripe's automatic retries (up to 3 days) |
| **`customer.subscription.deleted` missing from requirements** -- but already handled in code                                                  | N/A                       | Already covered, good                                                              |
| **`invoice.paid` missing from requirements** -- but already handled in code                                                                   | N/A                       | Already covered, good for renewal tracking                                         |

### Implied Requirements Not Explicitly Addressed

1. **Webhook secret rotation**: No mechanism for rotating the `STRIPE_WEBHOOK_SECRET` without downtime. Stripe supports multiple active endpoints, so this can be handled by creating a new endpoint before removing the old one.

2. **CORS**: The webhook handler correctly does NOT include CORS headers (Stripe server-to-server calls don't need them). The OPTIONS handler returns 204 which is fine.

3. **Response time**: Stripe expects a 2xx response within 20 seconds. The current code uses `EdgeRuntime.waitUntil()` to process asynchronously after responding, which is correct.

4. **Subscription tier mapping**: Only two price IDs are mapped. If new plans are added, `mapPriceToTier()` must be updated. Consider making this configurable via env vars or a database lookup.

5. **The `pro` tier exists in the schema** (`CHECK (subscription_tier IN ('free', 'premium', 'pro'))`) but `mapPriceToTier` only returns `'free'` or `'premium'`. The `pro` tier has no price ID mapping -- this is fine if `pro` is not yet a product, but should be documented.

---

## Summary

The core webhook handling code already exists and is well-structured. The primary work is:

1. **Deploy and configure** (Phase 1) -- move/deploy the Edge Function, set env vars, register in Stripe
2. **Add idempotency** (Phase 2) -- critical for production safety, especially for entry creation
3. **Test thoroughly** (Phase 3) -- use Stripe CLI and test mode
4. **Production hardening** (Phase 4) -- alerting, secret rotation planning

Estimated effort: ~1-2 days for Phases 1-3, additional half-day for Phase 4.
