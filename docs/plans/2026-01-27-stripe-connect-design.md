# Stripe Payment Design for myK9 Platform

> Design document for payment processing including marketplace entry fees and premium subscriptions.

## Overview

The myK9 Platform requires two distinct payment flows:
1. **Entry Fees** - Marketplace payments split between platform and dog clubs
2. **Subscriptions** - Premium exhibitor features paid directly to platform

## Payment Flow 1: Entry Fees (Stripe Connect)

### Fee Structure

```
Exhibitor pays: Entry Fee + Convenience Fee + Stripe Processing
                    ↓
Club receives: Full Entry Fee (e.g., $50)
Platform receives: Convenience Fee (e.g., 5%) minus Stripe fees
```

**Example transaction:**
| Item | Amount |
|------|--------|
| Entry fee (to club) | $50.00 |
| Convenience fee (5%) | $2.50 |
| Stripe processing (~2.9% + $0.30) | ~$1.82 |
| **Exhibitor pays** | **$54.32** |
| **Club receives** | **$50.00** |
| **Platform receives** | **~$0.68** |

### Stripe Connect Configuration

| Setting | Value | Rationale |
|---------|-------|-----------|
| Account type | **Express** | Easy onboarding, clubs can view payouts |
| Charge type | **Destination charges** | Automatic split at payment time |
| Payout timing | **Manual (delayed)** | Held until show completion |
| Payout release | **Show date + 3 days** | Buffer for refund requests |

### Club Onboarding Flow

```
Club Admin clicks "Connect Payment Account"
        ↓
Redirect to Stripe Express onboarding
        ↓
Club completes verification (5-10 minutes)
        ↓
Webhook: account.updated
        ↓
Club can now receive entry fee payouts
```

### Refund Handling

| Scenario | Action |
|----------|--------|
| Refund before show | Full refund, transfer reversed (no payout yet) |
| Refund after show, before payout | Full refund, transfer reversed |
| Refund after payout | Clawback from club's next payout |

### Refund Policy System

**Hierarchy:** Platform Default → Show Override (simple two-level)

**Platform Default Policy:**
| Rule | Default Value | Notes |
|------|---------------|-------|
| Full refund until | Entry closing date | Typically 2+ weeks before show |
| No refund after | Entry closing date | Club finalizing catalog, judges, etc. |
| Convenience fee refundable | No | Platform revenue protected |

**Show Override:** When creating a show, clubs can optionally customize:
- Earlier refund deadline (e.g., "7 days before closing")
- Partial refund after closing (rare, but some clubs offer 50%)
- Custom refund message displayed to exhibitors

**Exhibitor Self-Service Flow:**
```
Exhibitor clicks "Cancel Entry"
        ↓
System checks show's refund policy
        ↓
Displays refund amount: "You will receive $XX.XX"
(Entry fee minus any applicable deductions, convenience fee not refunded)
        ↓
Exhibitor confirms cancellation
        ↓
Stripe refund API called automatically
        ↓
Entry marked cancelled, confirmation email sent
```

**Edge case:** If no refund available, button shows "Cancel Entry (No Refund)" with clear explanation.

### Payout Automation

Daily cron job checks for shows where:
- `show_end_date + 3 days <= today`
- `payout_status = 'pending'`

For each qualifying show:
1. Calculate total entry fees collected
2. Call Stripe API to create payout to club's connected account
3. Update `payout_status = 'completed'`
4. Send notification to club

## Payment Flow 2: Premium Subscriptions

### Subscription Tiers

| Plan | Price | Billing |
|------|-------|---------|
| Monthly | TBD (e.g., $9.99) | Monthly recurring |
| Annual | TBD (e.g., $99.00) | Yearly recurring (save ~17%) |

### Features Unlocked

- Health records management
- Title tracking
- Training journal
- (Additional features TBD)

### Implementation

Standard Stripe Subscriptions (not Connect):
- Payment goes 100% to platform
- Use Stripe Billing portal for management
- Webhooks handle subscription lifecycle

## Stripe Dashboard Setup

### 1. Enable Connect

1. Go to **Settings → Connect**
2. Enable Connect for your platform
3. Configure Express account settings
4. Set branding (logo, colors, business name)

### 2. Create API Keys

| Key | Purpose | Store In |
|-----|---------|----------|
| `STRIPE_SECRET_KEY` | Server-side API calls | Supabase Edge Function secrets |
| `STRIPE_PUBLISHABLE_KEY` | Client-side (Stripe.js) | Environment variables |

### 3. Configure Webhooks

Create webhook endpoint: `https://sojmvhhwsjxmfistvzbe.supabase.co/functions/v1/stripe-webhook`

**Events to subscribe:**

Connect events:
- `account.updated` - Club onboarding status
- `account.application.deauthorized` - Club disconnected

Payment events:
- `checkout.session.completed` - Entry payment successful
- `payment_intent.succeeded` - Payment confirmed
- `charge.refunded` - Refund processed

Subscription events:
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

### 4. Create Subscription Products

In Stripe Dashboard → Products:

1. Create product: "myK9 Premium"
2. Add price: Monthly recurring ($X.XX/month)
3. Add price: Yearly recurring ($XX.XX/year)

## Database Schema Requirements

### New Tables Needed

```sql
-- Club Stripe Connect accounts
CREATE TABLE club_stripe_accounts (
  id UUID PRIMARY KEY,
  club_id UUID REFERENCES clubs(id),
  stripe_account_id TEXT NOT NULL, -- acct_xxx
  onboarding_complete BOOLEAN DEFAULT false,
  payouts_enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Show payouts tracking
CREATE TABLE show_payouts (
  id UUID PRIMARY KEY,
  show_id UUID REFERENCES shows(id),
  club_stripe_account_id UUID REFERENCES club_stripe_accounts(id),
  amount_cents INTEGER NOT NULL,
  status TEXT DEFAULT 'pending', -- pending, processing, completed, failed
  payout_id TEXT, -- Stripe payout ID
  scheduled_date DATE,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Entry payment records
CREATE TABLE entry_payments (
  id UUID PRIMARY KEY,
  entry_id UUID REFERENCES entries(id),
  stripe_payment_intent_id TEXT,
  amount_cents INTEGER NOT NULL,
  platform_fee_cents INTEGER NOT NULL,
  club_amount_cents INTEGER NOT NULL,
  status TEXT DEFAULT 'pending',
  refunded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Edge Functions Required

| Function | Purpose |
|----------|---------|
| `stripe-connect-onboard` | Generate Express onboarding link for clubs |
| `stripe-connect-webhook` | Handle Connect account events |
| `stripe-checkout` | Create checkout session for entries (EXISTS) |
| `stripe-webhook` | Handle payment events (EXISTS - needs update) |
| `stripe-create-subscription` | Start premium subscription |
| `stripe-customer-portal` | Manage subscription (cancel, update card) |
| `cron-process-payouts` | Daily job to release club payouts |

## Configuration Values

Store in application config (adjustable without code changes):

```typescript
const STRIPE_CONFIG = {
  // Platform fee percentage
  PLATFORM_FEE_PERCENT: 5.0,

  // Days after show to release payout
  PAYOUT_DELAY_DAYS: 3,

  // Subscription prices (Stripe price IDs)
  SUBSCRIPTION_MONTHLY_PRICE_ID: 'price_xxx',
  SUBSCRIPTION_ANNUAL_PRICE_ID: 'price_xxx',
};
```

## Testing Strategy

### Test Mode

Use Stripe test mode for development:
- Test API keys (start with `sk_test_`, `pk_test_`)
- Test card numbers (4242 4242 4242 4242)
- Test Connect accounts

### Test Scenarios

1. **Club onboarding** - Complete Express flow with test account
2. **Entry payment** - Pay with test card, verify split
3. **Refund before payout** - Verify transfer reversal
4. **Payout release** - Manually trigger for test show
5. **Subscription flow** - Subscribe, manage, cancel

## Implementation Order

1. Enable Stripe Connect in dashboard
2. Create API keys and webhook
3. Add database tables
4. Implement club onboarding flow
5. Update entry checkout to use Connect
6. Implement payout automation
7. Add subscription flow
8. Test end-to-end

---

*Document created: 2026-01-27*
*Status: Design approved, ready for implementation*
