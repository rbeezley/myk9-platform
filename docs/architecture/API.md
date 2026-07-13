# API Reference -- Supabase Edge Functions

All backend API endpoints in the myK9 Platform are Supabase Edge Functions running on the Deno runtime. There is no traditional REST API server; the frontend communicates with Edge Functions via the Supabase client SDK.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Common Patterns](#2-common-patterns)
3. [Stripe Functions (myK9Show)](#3-stripe-functions-myk9show)
4. [Ringside & Notification Functions](#4-ringside--notification-functions)
5. [Utility Functions (myK9Show)](#5-utility-functions-myk9show)
6. [Adding a New Edge Function](#6-adding-a-new-edge-function)

---

## 1. Overview

- **Runtime:** Deno (via Supabase Edge Functions)
- **Deployment:** All functions are deployed with `--no-verify-jwt` because each function handles authentication internally.
- **Invocation:** Functions are called from the frontend using `supabase.functions.invoke()`, which automatically attaches the user's JWT as a Bearer token in the `Authorization` header.
- **Location:** Functions live in two directories:
  - `supabase/functions/<name>/index.ts` -- platform-wide functions, including ringside (`/at-show`) auth/AI and all notification/email senders.
  - `apps/myk9show/supabase/functions/<name>/index.ts` -- app-scoped functions: Stripe billing and cron jobs.

  There is no longer a separate myK9Q app. Ringside scoring now lives at `/at-show` inside myK9Show, and its supporting functions (e.g. `validate-passcode`) live in the platform-wide `supabase/functions/` directory.

### Complete Function Inventory

Only the key functions are documented in full below. The complete current inventory, grouped by purpose:

**`supabase/functions/` (platform-wide)**

| Group              | Functions                                                                                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Ringside / AI      | `validate-passcode` (ringside passcode auth for `/at-show`), `ask-myk9show` (show-app AI assistant)                                                                      |
| Email senders      | `send-email`, `send-auth-email`, `send-confirmation-email`, `send-registration-email`, `send-targeted-message`, `send-results`, `send-waitlist-invite`, `resend-webhook` |
| Push notifications | `send-push-notification`, `push-trigger-announcement`, `push-trigger-chat-message`, `push-trigger-class-status`, `push-trigger-scoring`, `push-trigger-waitlist`                 |
| Premium / admin    | `generate-premium`, `admin-delete-user`, `admin-generate-reset-link`                                                                                                     |

**`apps/myk9show/supabase/functions/` (app-scoped)**

| Group             | Functions                                                                                                                                                             |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stripe / payments | `stripe-checkout`, `stripe-customer-portal`, `stripe-upgrade-subscription`, `stripe-webhook`, `stripe-connect-onboard`, `stripe-refund-entry`, `cron-process-payouts` |
| Waitlist          | `cron-waitlist-expiration`                                                                                                                                            |
| Email             | `send-email` (app-scoped sender; a same-named platform-wide sender also exists)                                                                                       |

---

## 2. Common Patterns

### Authentication

Most functions extract and verify the user's JWT from the `Authorization` header:

```typescript
const authHeader = req.headers.get('Authorization');
const token = authHeader.replace('Bearer ', '');
const {
  data: { user },
  error,
} = await supabase.auth.getUser(token);
```

After verifying the user, functions typically confirm ownership by joining through the `people` table (via `auth_user_id`).

### CORS

Every function implements a CORS whitelist with dynamic origin matching:

```typescript
const ALLOWED_ORIGINS = [
  'https://myk9show.com',
  'https://www.myk9show.com',
  'https://app.myk9show.com',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
];
```

All functions handle `OPTIONS` preflight requests and return the matching origin in `Access-Control-Allow-Origin`.

### Error Format

All errors are returned as JSON with an appropriate HTTP status code:

```json
{ "error": "Human-readable error message" }
```

Common status codes: `400` (bad request), `401` (unauthorized), `403` (forbidden), `404` (not found), `405` (method not allowed), `429` (rate limited), `500` (internal error), `502` (upstream error).

### Client Invocation

From the frontend, functions are called via the Supabase SDK:

```typescript
import { supabase } from './lib/supabase';

const { data, error } = await supabase.functions.invoke('function-name', {
  body: { key: 'value' },
});
```

The SDK automatically attaches the current session's JWT as a Bearer token. The returned `data` is the parsed JSON response body.

---

## 3. Stripe Functions (myK9Show)

### stripe-checkout

Creates a Stripe Checkout session for subscriptions, one-time payments, or entry cart payments.

| Detail     | Value                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------- |
| **Source** | `apps/myk9show/supabase/functions/stripe-checkout/index.ts`                                 |
| **Method** | `POST`                                                                                      |
| **Auth**   | Bearer JWT -- verified via `supabase.auth.getUser()`, then matched to `people.auth_user_id` |

**Request Body** (discriminated union on `mode`):

```typescript
// Subscription checkout
interface SubscriptionCheckoutRequest {
  mode: 'subscription';
  price_id: string; // Stripe price ID
  success_url: string;
  cancel_url: string;
}

// One-time payment checkout
interface PaymentCheckoutRequest {
  mode: 'payment';
  price_id: string; // Stripe price ID
  success_url: string;
  cancel_url: string;
}

// Entry cart checkout
interface EntryCheckoutRequest {
  mode: 'entry';
  cart_id: string; // UUID of the entry cart
  success_url: string;
  cancel_url: string;
}
```

**Success Response** (`200`):

```json
{
  "sessionId": "cs_test_...",
  "url": "https://checkout.stripe.com/..."
}
```

**Error Responses:**

| Status | Condition                                                                                                                                              |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `400`  | Missing `mode`, `success_url`, or `cancel_url`; missing `price_id` (for subscription/payment); missing `cart_id` (for entry); empty cart; invalid mode |
| `401`  | Missing or invalid Authorization header                                                                                                                |
| `403`  | Authenticated user does not own the cart                                                                                                               |
| `404`  | User profile (`people` record) not found; cart not found or inactive                                                                                   |
| `405`  | Non-POST request                                                                                                                                       |
| `410`  | Cart has expired                                                                                                                                       |
| `500`  | Failed to create Stripe customer; Stripe API error                                                                                                     |

**Side Effects:** For entry checkout, the function creates line items from cart items (with a 3% platform fee), updates the cart with the checkout session ID and calculated totals.

---

### stripe-customer-portal

Creates a Stripe Billing Portal session so the user can manage their subscription, payment methods, and invoices.

| Detail     | Value                                                                                                 |
| ---------- | ----------------------------------------------------------------------------------------------------- |
| **Source** | `apps/myk9show/supabase/functions/stripe-customer-portal/index.ts`                                    |
| **Method** | `POST`                                                                                                |
| **Auth**   | Bearer JWT -- verified, then ownership confirmed via `stripe_customers` -> `people` -> `auth_user_id` |

**Request Body:**

```typescript
interface PortalRequest {
  customerId: string; // Supabase UUID from stripe_customers.id (NOT the Stripe customer ID)
  returnUrl: string; // URL to redirect back to after portal session
}
```

**Success Response** (`200`):

```json
{
  "url": "https://billing.stripe.com/..."
}
```

**Error Responses:**

| Status | Condition                                           |
| ------ | --------------------------------------------------- |
| `400`  | Missing `customerId` or `returnUrl`                 |
| `401`  | Missing or invalid Authorization header             |
| `403`  | Authenticated user does not own the customer record |
| `404`  | Customer record not found in `stripe_customers`     |
| `405`  | Non-POST request                                    |
| `502`  | Stripe API error                                    |

---

### stripe-upgrade-subscription

Upgrades (or changes) an existing subscription to a new plan with prorated billing.

| Detail     | Value                                                                                                                           |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Source** | `apps/myk9show/supabase/functions/stripe-upgrade-subscription/index.ts`                                                         |
| **Method** | `POST`                                                                                                                          |
| **Auth**   | Bearer JWT -- verified, then ownership confirmed via `stripe_subscriptions` -> `stripe_customers` -> `people` -> `auth_user_id` |

**Request Body:**

```typescript
interface UpgradeRequest {
  subscriptionId: string; // Stripe subscription ID (sub_xxx)
  newPlanId: string; // Stripe price ID (must be in the allowlist)
}
```

The function validates `newPlanId` against a hardcoded allowlist of valid price IDs.

**Success Response** (`200`):

```json
{
  "success": true
}
```

**Error Responses:**

| Status | Condition                                                                                                    |
| ------ | ------------------------------------------------------------------------------------------------------------ |
| `400`  | Missing `subscriptionId` or `newPlanId`; invalid plan (price ID not in allowlist); subscription has no items |
| `401`  | Missing or invalid Authorization header                                                                      |
| `403`  | Authenticated user does not own the subscription                                                             |
| `404`  | Subscription not found in database                                                                           |
| `405`  | Non-POST request                                                                                             |
| `502`  | Stripe API error                                                                                             |

**Side Effects:** The actual plan change in the database is handled asynchronously by the `stripe-webhook` function when Stripe sends a `customer.subscription.updated` event.

---

## 4. Ringside & Notification Functions

### validate-passcode

Server-side passcode validation with IP-based rate limiting. This is the ringside passcode authentication endpoint used by the `/at-show` experience inside myK9Show (there is no longer a separate myK9Q app).

| Detail     | Value                                           |
| ---------- | ----------------------------------------------- |
| **Source** | `supabase/functions/validate-passcode/index.ts` |
| **Method** | `POST`                                          |
| **Auth**   | None (this IS the authentication endpoint)      |

**Request Body:**

```typescript
interface ValidateRequest {
  passcode: string; // 5-character code, e.g. "aa260" (role prefix + 4 digits)
}
```

Passcode format: first character is a role prefix (`a` = admin, `j` = judge, `s` = steward, `e` = exhibitor) followed by 4 characters. Codes are no longer derived from the show's license key (that derivation path was removed). Instead the function calls the `validate_passcode(p_code)` Postgres RPC, which looks up the passcode's HMAC-SHA256 hash (with a Vault-stored pepper) in `public.show_passcodes` and returns `{ show_id, role }` on a match. Per-show, per-role codes are hashed at rest in `show_passcodes` (backfilled for existing shows), so the plaintext passcode is never stored.

**Success Response** (`200`):

```typescript
{
  success: true;
  role: 'admin' | 'judge' | 'steward' | 'exhibitor';
  showData: {
    showId: string;
    showName: string;
    clubName: string;
    showDate: string;
    licenseKey: string;
    org: string;
    competition_type: string;
  }
}
```

**Error Responses:**

| Status | Condition                                                                  |
| ------ | -------------------------------------------------------------------------- |
| `400`  | Missing or non-string `passcode`                                           |
| `401`  | Invalid passcode (no matching show) -- includes `remaining_attempts` count |
| `405`  | Non-POST request                                                           |
| `429`  | Rate limited -- includes `blocked_until` timestamp and `message`           |
| `500`  | Database or internal error                                                 |

**Rate Limiting:** Uses the `check_login_rate_limit` and `record_login_attempt` Postgres RPC functions. 5 attempts per 15 minutes, then a 30-minute block.

---

### send-push-notification

Sends Web Push notifications to subscribed devices. Only accepts requests from database triggers (not direct API calls).

| Detail     | Value                                                                          |
| ---------- | ------------------------------------------------------------------------------ |
| **Source** | `supabase/functions/send-push-notification/index.ts`                           |
| **Method** | `POST`                                                                         |
| **Auth**   | `x-trigger-secret` header must match the `TRIGGER_SECRET` environment variable |

**Request Body:**

```typescript
interface NotificationPayload {
  type: 'announcement' | 'up_soon';
  license_key: string;
  // Additional fields vary by type:
  // For 'up_soon': armband_number, etc.
  [key: string]: unknown;
}
```

**Success Response** (`200`):

```json
{
  "success": true,
  "sent": 5,
  "failed": 1,
  "total": 6
}
```

If no active subscriptions exist:

```json
{
  "success": true,
  "sent": 0,
  "message": "No active subscriptions"
}
```

**Error Responses:**

| Status | Condition                                      |
| ------ | ---------------------------------------------- |
| `401`  | Missing or invalid `x-trigger-secret` header   |
| `500`  | VAPID keys not configured; push delivery error |

**Side Effects:** Automatically deactivates subscriptions that return `410 Gone` or `404` from the push service (expired/unsubscribed browsers). Filters recipients by their `notification_preferences` (announcements, up_soon, favorite armbands).

**Environment Variables Required:** `TRIGGER_SECRET`, `VITE_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`

---

## 5. Utility Functions (myK9Show)

### stripe-webhook

Receives and processes Stripe webhook events. Called by Stripe's servers, not by the frontend.

| Detail     | Value                                                               |
| ---------- | ------------------------------------------------------------------- |
| **Source** | `apps/myk9show/supabase/functions/stripe-webhook/index.ts`          |
| **Method** | `POST`                                                              |
| **Auth**   | Stripe webhook signature verification via `stripe-signature` header |

**Handled Events:**

| Event                           | Action                                                                                                                                                                                           |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `checkout.session.completed`    | Routes to handler based on `metadata.type`: entry (creates entries from cart, creates order record, sends confirmation email), subscription (syncs subscription), payment (creates order record) |
| `customer.subscription.created` | Syncs subscription status and tier to `stripe_subscriptions` and `exhibitor_profiles`                                                                                                            |
| `customer.subscription.updated` | Same as above                                                                                                                                                                                    |
| `customer.subscription.deleted` | Resets subscription tier to `free`                                                                                                                                                               |
| `invoice.paid`                  | Syncs subscription (renewal confirmation)                                                                                                                                                        |
| `invoice.payment_failed`        | Syncs subscription (marks payment issue)                                                                                                                                                         |

**Success Response** (`200`):

```json
{ "received": true }
```

**Error Responses:**

| Status | Condition                                                        |
| ------ | ---------------------------------------------------------------- |
| `400`  | Missing `stripe-signature` header; signature verification failed |
| `405`  | Non-POST request                                                 |
| `500`  | Processing error                                                 |

**Subscription Tier Mapping:**

| Stripe Price ID                  | Tier                            |
| -------------------------------- | ------------------------------- |
| `price_1RHz4VAtHgBcw875bF7McPNd` | `pro` (Excellent/clubs)         |
| `price_1RHz3bAtHgBcw875o2gdNaYW` | `premium` (Advanced/exhibitors) |
| Any other                        | `premium` (default)             |

**Environment Variables Required:** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

---

### send-results

Emails an electronic results file (e.g. AKC Scent Work XML) to the registry submission address, with the submitting secretary CC'd. The destination address is resolved server-side from an `organization:sportType` map so the client cannot redirect the email.

| Detail     | Value                                                               |
| ---------- | ------------------------------------------------------------------- |
| **Source** | `supabase/functions/send-results/index.ts`                          |
| **Method** | `POST`                                                              |
| **Auth**   | Supabase JWT (validated internally; origins restricted to myK9Show) |

**Request Body:**

```typescript
interface SendResultsPayload {
  xml: string;
  filename: string;
  organization: string; // e.g. 'AKC'
  sportType: string; // e.g. 'scent_work'
  secretaryEmail: string; // CC'd on the submission
}
```

**Success Response** (`200`):

```json
{ "success": true }
```

**Error Responses:**

| Status | Condition                                                                          |
| ------ | ---------------------------------------------------------------------------------- |
| `400`  | Missing required field, or no submission email mapped for `organization:sportType` |
| `502`  | Resend API rejected the send                                                       |
| `503`  | `RESEND_API_KEY` not configured                                                    |

**Environment Variables Required:** `RESEND_API_KEY`

---

### send-email

Sends transactional emails via the Resend API. Only accepts requests authenticated with the Supabase service role key (internal use only).

| Detail     | Value                                                                                   |
| ---------- | --------------------------------------------------------------------------------------- |
| **Source** | `supabase/functions/send-email/index.ts`                                                |
| **Method** | `POST`                                                                                  |
| **Auth**   | Bearer token must be the `SUPABASE_SERVICE_ROLE_KEY` (internal service-to-service auth) |

**Request Body** (discriminated union on `type`):

```typescript
// Entry confirmation email
interface EntryConfirmationData {
  type: 'entry_confirmation';
  to: string;
  exhibitorName: string;
  showName: string;
  showDate: string;
  showLocation?: string;
  entries: Array<{
    dogName: string;
    className: string;
    classLevel?: string;
    entryFee: number; // In cents
  }>;
  subtotal: number; // In cents
  platformFee: number; // In cents
  total: number; // In cents
  orderId: string;
  receiptUrl?: string;
}

// Payment receipt email
interface PaymentReceiptData {
  type: 'payment_receipt';
  to: string;
  exhibitorName: string;
  showName: string;
  items: Array<{
    description: string;
    amount: number; // In cents
  }>;
  subtotal: number;
  platformFee: number;
  total: number;
  paymentMethod?: string;
  last4?: string;
  orderId: string;
  paidAt: string;
}

// Welcome email
interface WelcomeEmailData {
  type: 'welcome';
  to: string;
  name: string;
}

// Waitlist offer email
interface WaitlistOfferData {
  type: 'waitlist_offer';
  to: string;
  name: string;
  showName: string;
  className: string;
  dogName: string;
  expiresAt: string;
}
```

**Success Response** (`200`):

```json
{
  "success": true,
  "id": "resend_email_id"
}
```

**Error Responses:**

| Status | Condition                                    |
| ------ | -------------------------------------------- |
| `400`  | Missing `to` or `type`; unknown email `type` |
| `401`  | Bearer token is not the service role key     |
| `405`  | Non-POST request                             |
| `500`  | Resend API error                             |
| `503`  | `RESEND_API_KEY` not configured              |

**Side Effects:** Logs sent emails to the `email_logs` table (non-critical, fails silently if the table does not exist).

**Environment Variables Required:** `RESEND_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

---

### cron-waitlist-expiration

Scheduled job that expires overdue waitlist offers and auto-offers spots to the next person in line. Intended to run every 15 minutes via Supabase cron or an external scheduler.

| Detail     | Value                                                                |
| ---------- | -------------------------------------------------------------------- |
| **Source** | `apps/myk9show/supabase/functions/cron-waitlist-expiration/index.ts` |
| **Method** | `POST`                                                               |
| **Auth**   | Bearer token must match `CRON_SECRET` environment variable (if set)  |

**Request Body:** None required.

**Success Response** (`200`):

```json
{
  "success": true,
  "timestamp": "2026-02-15T12:00:00.000Z",
  "results": {
    "expiredOffers": 2,
    "newOffers": 1,
    "remindersSent": 1,
    "expiryNoticesSent": 2,
    "retriedNotifications": 1,
    "errors": []
  }
}
```

**Error Responses:**

| Status | Condition                                                         |
| ------ | ----------------------------------------------------------------- |
| `401`  | `CRON_SECRET` is set and the provided Bearer token does not match |
| `405`  | Non-POST request                                                  |
| `500`  | Internal error (returns `{ "success": false, "error": "..." }`)   |

**Behavior:**

1. Enqueues one halfway reminder for each eligible online offer that remains unpaid.
2. Finds all `waitlist_entries` with `status = 'offered'` where `offer_expires_at` is in the past.
3. Marks them as `expired` and enqueues an expiry notice.
4. For each expired offer, finds the next `waiting` entry for that class (ordered by `position`) and offers it.
5. Additionally scans for classes with available spots (via the `check_class_availability` RPC) and waiting entries but no current offers, and auto-offers to the next in line.
6. New offers expire after 24 hours. Offer notifications are enqueued by the database transition trigger, so both cron- and secretary-initiated promotions follow the same durable delivery path.

**Environment Variables Required:** `CRON_SECRET` (optional but recommended), `PUSH_WEBHOOK_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

---

### push-trigger-waitlist

Internal dispatcher for durable waitlist offer, halfway-reminder, and expiry notifications. It claims a `waitlist_notification_events` row with a renewable lease, revalidates the current unpaid offer cycle, then delivers email and Web Push independently. The cron retries bounded pending, failed, and stale-processing events; per-channel state and hashed successful push endpoints prevent normal retries from duplicating completed delivery.

| Detail     | Value                                                                                 |
| ---------- | ------------------------------------------------------------------------------------- |
| **Source** | `supabase/functions/push-trigger-waitlist/index.ts`                                   |
| **Method** | `POST`                                                                                |
| **Auth**   | Bearer token must match the dedicated `PUSH_WEBHOOK_SECRET`; fail-closed if unset     |

Notifications link to the existing filtered My Entries surface and format deadlines in the trial timezone. Mail-in waitlist rows do not create notification events. A recipient without an authenticated account still receives email; Web Push is skipped because no subscription owner can exist.

**Deployment gate:** merge this code without deploying it until Phase B adds and verifies the My Entries waitlist payment action. Deploying the updated cron earlier would remove the legacy Stripe payment-link email before exhibitors can pay from the new deep link. After Phase B is ready, deploy `push-trigger-waitlist` first, apply the notification-event migration second, and deploy the updated cron with the Phase B functions last.

**Environment Variables Required:** `PUSH_WEBHOOK_SECRET`, `RESEND_API_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

---

## 6. Adding a New Edge Function

### Step-by-Step

1. **Create the function directory and entry point:**

   ```
   apps/<app>/supabase/functions/<function-name>/index.ts
   ```

2. **Follow the standard auth pattern** (choose one based on your use case):

   ```typescript
   // User JWT auth (most common)
   const authHeader = req.headers.get('Authorization');
   if (!authHeader) {
     return corsResponse({ error: 'Missing Authorization header' }, 401);
   }
   const token = authHeader.replace('Bearer ', '');
   const {
     data: { user },
     error,
   } = await supabase.auth.getUser(token);

   // Service role auth (internal service-to-service)
   if (token !== Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) {
     return corsResponse({ error: 'Unauthorized' }, 401);
   }

   // Shared secret auth (cron jobs, database triggers)
   const secret = req.headers.get('x-trigger-secret');
   if (secret !== Deno.env.get('TRIGGER_SECRET')) {
     return corsResponse({ error: 'Unauthorized' }, 401);
   }
   ```

3. **Handle CORS** (copy the standard pattern):

   ```typescript
   const ALLOWED_ORIGINS = [
     'https://myk9show.com',
     // ... other origins
     'http://localhost:5173',
   ];

   function getCorsHeaders(requestOrigin: string | null): Record<string, string> {
     const origin =
       requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin)
         ? requestOrigin
         : ALLOWED_ORIGINS[0];
     return {
       'Access-Control-Allow-Origin': origin,
       'Access-Control-Allow-Methods': 'POST, OPTIONS',
       'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
     };
   }
   ```

4. **Deploy the function:**

   ```bash
   supabase functions deploy <function-name> --no-verify-jwt
   ```

5. **Set any required secrets:**

   ```bash
   supabase secrets set MY_SECRET_KEY=value
   ```

6. **Call from the frontend:**

   ```typescript
   const { data, error } = await supabase.functions.invoke('<function-name>', {
     body: {/* request payload */},
   });
   ```

### Environment Variables

All functions have access to these built-in variables (provided by Supabase):

| Variable                    | Description                             |
| --------------------------- | --------------------------------------- |
| `SUPABASE_URL`              | Project URL                             |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (full database access) |
| `SUPABASE_ANON_KEY`         | Anonymous key (RLS-restricted access)   |

Custom secrets used across functions:

| Variable                | Used By                                                                              | Description                                       |
| ----------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------- |
| `STRIPE_SECRET_KEY`     | stripe-checkout, stripe-customer-portal, stripe-upgrade-subscription, stripe-webhook | Stripe API secret key                             |
| `STRIPE_WEBHOOK_SECRET` | stripe-webhook                                                                       | Stripe webhook signing secret                     |
| `RESEND_API_KEY`        | send-email                                                                           | Resend email service API key                      |
| `CRON_SECRET`           | cron-waitlist-expiration                                                             | Shared secret for cron authentication             |
| `PUSH_WEBHOOK_SECRET`   | push-trigger-waitlist, cron-waitlist-expiration                                      | Dedicated waitlist notification dispatch secret   |
| `ANTHROPIC_API_KEY`     | ask-myk9show                                                                         | Anthropic API key for Claude                      |
| `TRIGGER_SECRET`        | send-push-notification                                                               | Shared secret for database trigger authentication |
| `VITE_VAPID_PUBLIC_KEY` | send-push-notification                                                               | Web Push VAPID public key                         |
| `VAPID_PRIVATE_KEY`     | send-push-notification                                                               | Web Push VAPID private key                        |
