# Online Entry System Architecture

## Overview

This document outlines the architecture for transforming myK9Show from a license-based desktop replacement into a platform with online entries, per-entry fees, and premium exhibitor subscriptions.

---

## Existing Infrastructure

The following components already exist in the codebase and should be leveraged:

### Database Tables (Already Implemented)

| Table | Migration | Purpose |
|-------|-----------|---------|
| `roles` | 005 | Role definitions (exhibitor, club_admin, trial_secretary, judge, platform_admin) |
| `permissions` | 005 | Individual permission codes (resource + action pattern) |
| `role_permissions` | 005 | Junction table linking roles to permissions |
| `user_roles` | 005 | User-role assignments with optional club_id/show_id scoping |
| `permission_audit_log` | 005 | Tracks all RBAC changes |
| `stripe_customers` | 005 | Links people to Stripe customer IDs |
| `stripe_orders` | 005 | Payment records with status tracking |
| `stripe_subscriptions` | 005 | Subscription lifecycle tracking |
| `notification_queue` | 005 | Queued notifications (push, email, sms) |
| `notification_preferences` | 005 | User notification opt-ins by type |
| `entry_status_history` | 003 | Tracks all entry status changes |

### Services (Already Implemented)

| Service | Location | Purpose |
|---------|----------|---------|
| `RBACService` | `apps/myk9show/src/services/rbac/` | Permission checking, role management, audit logging |
| `PaymentService` | `apps/myk9show/src/services/payment/` | Fee calculation (mock payment processing) |
| `NotificationService` | `apps/myk9show/src/services/` | WebSocket notifications (not email yet) |
| `EntryValidator` | `apps/myk9show/src/services/` | Entry validation, duplicate checking |

### Stripe Client (Partial)

| File | Status |
|------|--------|
| `apps/myk9show/src/lib/stripe.ts` | Checkout session creation via Edge Function |
| `apps/myk9show/src/stripe-config.ts` | Product/price IDs defined |
| Webhook handler | **Not implemented** |

---

## Business Model

### Revenue Streams

| Stream | Description | Pricing (TBD) |
|--------|-------------|---------------|
| **Per-entry fee** | Fee charged for each entry submitted through the platform | $1-2 per entry |
| **Premium exhibitor subscription** | Monthly subscription for advanced features | $5-10/month |

### Premium Exhibitor Features

- **Title tracking** - Progress toward next title, predicted completion dates
- **Competition analytics** - Qualifying rates by element, venue, judge
- **Training journal** - Link training sessions to competition outcomes
- **Health records** - Vaccination records, vet visits (clubs often require proof)
- **Multi-dog dashboard** - Unified view for handlers with multiple dogs

---

## Multi-Tenant Model Redesign

### Old Model (Access Apps)

```
Club buys license → license_key isolates data → Club owns data
```

### New Model (Platform)

```
Platform owns data → Clubs use platform → Per-entry fee → No license needed
```

### Why license_key No Longer Fits

- No club subscription = no license key
- Exhibitors span multiple clubs' shows (platform-wide accounts)
- Platform needs cross-club queries for revenue, analytics
- Natural data isolation already exists via hierarchy

### Data Hierarchy (Natural Isolation)

```
Club
  └── Show
        └── Trial
              └── Class
                    └── Entry
```

### Migration Strategy

- **Leave `license_key` columns in place** - Avoids breaking myK9Q
- **Stop using license_key for new features** - New tables won't have it
- **RLS shifts to ownership-based** - See RBAC section below

---

## Role-Based Access Control (RBAC)

> **Note:** RBAC tables and services already exist. See `supabase/migrations/005_myk9show_specific.sql` and `apps/myk9show/src/services/rbac/`.

### Roles

| Role | Description |
|------|-------------|
| **Exhibitor** | Dog owners who enter shows |
| **Club Admin** | Manages club profile, creates shows |
| **Trial Secretary** | Manages entries, armbands, results for assigned shows |
| **Judge** | Scores entries for assigned classes |
| **Platform Admin** | Full system access (you) |

### Permission Matrix

| Role | Can See | Can Edit |
|------|---------|----------|
| **Exhibitor** | Published shows, own entries, own dogs | Own profile, own dogs, own entries (before close) |
| **Club Admin** | Their club's shows (all statuses) | Their club's shows, trials, classes |
| **Trial Secretary** | Assigned shows | Entries, armbands, results for assigned shows |
| **Judge** | Assigned classes | Scoring for assigned classes |
| **Platform Admin** | Everything | Everything |

### RLS Policy Approach

Uses existing `roles` and `user_roles` tables from migration 005:

```sql
-- Helper function for efficient role checking (avoids subquery in every policy)
CREATE OR REPLACE FUNCTION auth.has_role(role_name TEXT, scope_club_id UUID DEFAULT NULL)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    JOIN people p ON p.id = ur.user_id
    WHERE p.auth_user_id = auth.uid()
      AND r.name = role_name
      AND (scope_club_id IS NULL OR ur.club_id = scope_club_id OR ur.club_id IS NULL)
      AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Example: Exhibitors see published shows only
CREATE POLICY "exhibitors_see_published_shows" ON shows
  FOR SELECT
  USING (
    status IN ('published', 'accepting_entries', 'closed', 'in_progress', 'completed')
    OR auth.has_role('club_admin', club_id)
    OR auth.has_role('trial_secretary', club_id)
    OR auth.has_role('platform_admin')
  );

-- Example: Exhibitors can only edit their own entries before close
CREATE POLICY "exhibitors_edit_own_entries" ON entries
  FOR UPDATE
  USING (
    handler_id IN (
      SELECT id FROM people WHERE auth_user_id = auth.uid()
    )
    AND entry_status NOT IN ('confirmed', 'checked-in', 'competing', 'completed')
  );
```

---

## New Database Tables

### Exhibitor Profiles

Links Supabase auth users to the people table with subscription info.

> **Status:** Not yet in migrations - needs to be added.

```sql
CREATE TABLE exhibitor_profiles (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  auth_user_id UUID NOT NULL UNIQUE,  -- Supabase auth link

  -- Defaults for entry forms
  default_handler_id UUID REFERENCES people(id),

  -- Premium subscription (synced from stripe_subscriptions)
  subscription_tier TEXT DEFAULT 'free' CHECK (subscription_tier IN ('free', 'premium', 'pro')),
  subscription_expires_at TIMESTAMPTZ,

  -- Stripe integration (links to existing stripe_customers table)
  stripe_customer_id TEXT REFERENCES stripe_customers(stripe_customer_id),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX exhibitor_profiles_auth_user_id_idx ON exhibitor_profiles(auth_user_id);
CREATE INDEX exhibitor_profiles_person_id_idx ON exhibitor_profiles(person_id);
CREATE INDEX exhibitor_profiles_stripe_customer_id_idx ON exhibitor_profiles(stripe_customer_id);
```

### Entry Carts

Shopping cart for entries before checkout.

> **Status:** Not yet in migrations - needs to be added.

```sql
CREATE TABLE entry_carts (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  exhibitor_id UUID NOT NULL REFERENCES exhibitor_profiles(id) ON DELETE CASCADE,
  show_id UUID NOT NULL REFERENCES shows(id) ON DELETE CASCADE,

  -- Cart status
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'submitted', 'abandoned', 'expired')),

  -- Timeout (prevent indefinite holds on class spots)
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 minutes'),

  -- Totals (calculated)
  subtotal_cents INTEGER DEFAULT 0,
  platform_fee_cents INTEGER DEFAULT 0,
  total_cents INTEGER DEFAULT 0,

  -- Stripe (links to existing stripe_orders table after checkout)
  stripe_checkout_session_id TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX entry_carts_exhibitor_id_idx ON entry_carts(exhibitor_id);
CREATE INDEX entry_carts_show_id_idx ON entry_carts(show_id);
CREATE INDEX entry_carts_status_idx ON entry_carts(status);
CREATE INDEX entry_carts_expires_at_idx ON entry_carts(expires_at);
```

### Entry Cart Items

Individual entries within a cart.

> **Status:** Not yet in migrations - needs to be added.

```sql
CREATE TABLE entry_cart_items (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  cart_id UUID NOT NULL REFERENCES entry_carts(id) ON DELETE CASCADE,

  -- Entry details
  dog_id UUID NOT NULL REFERENCES dogs(id),
  class_id UUID NOT NULL REFERENCES classes(id),
  handler_id UUID REFERENCES people(id),

  -- Fees
  entry_fee_cents INTEGER NOT NULL,

  -- Options
  jump_height TEXT,
  special_requests TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX entry_cart_items_cart_id_idx ON entry_cart_items(cart_id);
CREATE INDEX entry_cart_items_dog_id_idx ON entry_cart_items(dog_id);
CREATE INDEX entry_cart_items_class_id_idx ON entry_cart_items(class_id);

-- Prevent duplicate entries in same cart
CREATE UNIQUE INDEX entry_cart_items_unique_dog_class_idx
  ON entry_cart_items(cart_id, dog_id, class_id);
```

### Waitlists

Track waitlist positions when classes are full.

> **Status:** Not yet in migrations - needs to be added.

```sql
CREATE TABLE waitlist_entries (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  exhibitor_id UUID NOT NULL REFERENCES exhibitor_profiles(id) ON DELETE CASCADE,
  dog_id UUID NOT NULL REFERENCES dogs(id),
  handler_id UUID REFERENCES people(id),

  -- Position (1 = first on waitlist)
  position INTEGER NOT NULL,

  -- Status
  status TEXT DEFAULT 'waiting' CHECK (status IN ('waiting', 'offered', 'accepted', 'declined', 'expired')),

  -- When offered a spot
  offered_at TIMESTAMPTZ,
  offer_expires_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX waitlist_entries_class_id_idx ON waitlist_entries(class_id);
CREATE INDEX waitlist_entries_exhibitor_id_idx ON waitlist_entries(exhibitor_id);
CREATE INDEX waitlist_entries_status_idx ON waitlist_entries(status);

-- Unique position per class (only for active waitlist entries)
CREATE UNIQUE INDEX waitlist_entries_class_position_idx
  ON waitlist_entries(class_id, position)
  WHERE status = 'waiting';

-- Function to safely add to waitlist with proper position
CREATE OR REPLACE FUNCTION add_to_waitlist(
  p_class_id UUID,
  p_exhibitor_id UUID,
  p_dog_id UUID,
  p_handler_id UUID DEFAULT NULL
) RETURNS waitlist_entries AS $$
DECLARE
  next_position INTEGER;
  new_entry waitlist_entries;
BEGIN
  -- Lock the class row to prevent race conditions
  PERFORM pg_advisory_xact_lock(hashtext(p_class_id::text));

  -- Get next position
  SELECT COALESCE(MAX(position), 0) + 1 INTO next_position
  FROM waitlist_entries
  WHERE class_id = p_class_id AND status = 'waiting';

  -- Insert new entry
  INSERT INTO waitlist_entries (class_id, exhibitor_id, dog_id, handler_id, position)
  VALUES (p_class_id, p_exhibitor_id, p_dog_id, p_handler_id, next_position)
  RETURNING * INTO new_entry;

  RETURN new_entry;
END;
$$ LANGUAGE plpgsql;
```

---

## Cart Reservation Strategy

### Problem

If 10 exhibitors add entries to carts but class limit is 5, who gets the spots?

### Chosen Approach: Soft Reservation with Warnings

```
┌─────────────────────────────────────────────────────────────┐
│  1. Adding to cart does NOT reserve spots                   │
│  2. Show real-time availability: "3 spots left"             │
│  3. At checkout, validate spots still available             │
│  4. If class filled during checkout → offer waitlist        │
│  5. First successful payment wins                           │
└─────────────────────────────────────────────────────────────┘
```

### Why Not Hard Reservation?

- Prevents cart abandonment from blocking legitimate entries
- Simpler implementation (no need to release holds)
- Standard approach for event ticketing
- 30-minute cart expiration still prevents indefinite browsing

### Implementation

```sql
-- Function to check availability at checkout time
CREATE OR REPLACE FUNCTION check_class_availability(p_class_id UUID)
RETURNS TABLE (
  available_spots INTEGER,
  is_available BOOLEAN,
  waitlist_position INTEGER
) AS $$
DECLARE
  class_limit INTEGER;
  confirmed_count INTEGER;
  waitlist_count INTEGER;
BEGIN
  -- Get class limit
  SELECT entry_limit INTO class_limit FROM classes WHERE id = p_class_id;

  -- Count confirmed entries
  SELECT COUNT(*) INTO confirmed_count
  FROM entries
  WHERE class_id = p_class_id
    AND entry_status IN ('submitted', 'paid', 'confirmed', 'checked-in', 'competing');

  -- Count waitlist
  SELECT COUNT(*) INTO waitlist_count
  FROM waitlist_entries
  WHERE class_id = p_class_id AND status = 'waiting';

  available_spots := GREATEST(0, class_limit - confirmed_count);
  is_available := available_spots > 0;
  waitlist_position := waitlist_count + 1;

  RETURN NEXT;
END;
$$ LANGUAGE plpgsql;
```

---

## Stripe Webhook Handler

> **Status:** Not implemented - critical for payment flow.

### Webhook Endpoint

```
POST /api/webhooks/stripe
```

### Events to Handle

| Event | Action |
|-------|--------|
| `checkout.session.completed` | Create entries from cart, update `stripe_orders`, send confirmation email |
| `checkout.session.expired` | Mark cart as expired |
| `payment_intent.payment_failed` | Log failure, notify exhibitor |
| `charge.refunded` | Update entry status to `refunded`, update `stripe_orders` |
| `customer.subscription.created` | Update `stripe_subscriptions`, set exhibitor tier |
| `customer.subscription.updated` | Sync subscription status changes |
| `customer.subscription.deleted` | Downgrade exhibitor to free tier |

### Implementation (Supabase Edge Function)

```typescript
// supabase/functions/stripe-webhook/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import Stripe from 'https://esm.sh/stripe@13.0.0'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2023-10-16' })
const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!

serve(async (req) => {
  const signature = req.headers.get('stripe-signature')!
  const body = await req.text()

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
  } catch (err) {
    return new Response(`Webhook Error: ${err.message}`, { status: 400 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      await handleCheckoutComplete(supabase, session)
      break
    }
    case 'charge.refunded': {
      const charge = event.data.object as Stripe.Charge
      await handleRefund(supabase, charge)
      break
    }
    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription
      await handleSubscriptionUpdate(supabase, subscription)
      break
    }
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 })
})

async function handleCheckoutComplete(supabase: any, session: Stripe.Checkout.Session) {
  const cartId = session.metadata?.cart_id
  if (!cartId) return

  // Get cart items
  const { data: cartItems } = await supabase
    .from('entry_cart_items')
    .select('*')
    .eq('cart_id', cartId)

  // Create entries for each cart item
  for (const item of cartItems) {
    await supabase.from('entries').insert({
      class_id: item.class_id,
      dog_id: item.dog_id,
      handler_id: item.handler_id,
      entry_fee: item.entry_fee_cents / 100,
      entry_status: 'confirmed',
      payment_status: 'paid',
      jump_height: item.jump_height,
      special_requests: item.special_requests,
      submitted_at: new Date().toISOString(),
    })
  }

  // Update cart status
  await supabase
    .from('entry_carts')
    .update({ status: 'submitted' })
    .eq('id', cartId)

  // Create stripe_orders record
  await supabase.from('stripe_orders').insert({
    stripe_checkout_session_id: session.id,
    stripe_payment_intent_id: session.payment_intent,
    amount_cents: session.amount_total,
    status: 'succeeded',
    order_type: 'entry',
    show_id: session.metadata?.show_id,
    paid_at: new Date().toISOString(),
  })

  // Queue confirmation email
  await supabase.from('notification_queue').insert({
    notification_type: 'entry_confirmation',
    title: 'Entry Confirmation',
    body: `Your entries have been confirmed for ${session.metadata?.show_name}`,
    channels: ['email'],
    data: { cart_id: cartId, session_id: session.id },
  })
}
```

---

## Email Infrastructure

> **Status:** Not implemented - required for Phase 2.

### Recommended Provider: Resend

- Simple API, works well with Supabase Edge Functions
- Good deliverability, reasonable pricing
- React Email for templates

### Email Types

| Type | Trigger | Template |
|------|---------|----------|
| Entry Confirmation | `checkout.session.completed` webhook | Show name, entries, total paid, armband info |
| Payment Receipt | `checkout.session.completed` webhook | Itemized receipt with fees |
| Waitlist Notification | Manual promotion by secretary | Spot available, payment link, expiration time |
| Waitlist Offer Expired | Cron job | Next person notified, position update |
| Move-Up Approved | Secretary action | New class info, any additional fees |
| Entry Scratched | Exhibitor or secretary action | Refund info if applicable |

### Implementation (Supabase Edge Function)

```typescript
// supabase/functions/send-email/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { Resend } from 'https://esm.sh/resend@2.0.0'

const resend = new Resend(Deno.env.get('RESEND_API_KEY'))

serve(async (req) => {
  const { to, subject, template, data } = await req.json()

  const html = renderTemplate(template, data)

  const { error } = await resend.emails.send({
    from: 'myK9 <noreply@myk9.app>',
    to,
    subject,
    html,
  })

  if (error) {
    return new Response(JSON.stringify({ error }), { status: 500 })
  }

  return new Response(JSON.stringify({ success: true }), { status: 200 })
})

function renderTemplate(template: string, data: any): string {
  // Template rendering logic
  // Consider using React Email for complex templates
  const templates: Record<string, (data: any) => string> = {
    entry_confirmation: (d) => `
      <h1>Entry Confirmation</h1>
      <p>Your entries for <strong>${d.show_name}</strong> have been confirmed!</p>
      <h2>Entries</h2>
      <ul>
        ${d.entries.map((e: any) => `<li>${e.dog_name} - ${e.class_name}</li>`).join('')}
      </ul>
      <p><strong>Total Paid:</strong> $${(d.total_cents / 100).toFixed(2)}</p>
    `,
    waitlist_offer: (d) => `
      <h1>A Spot is Available!</h1>
      <p>A spot has opened up for <strong>${d.dog_name}</strong> in <strong>${d.class_name}</strong>.</p>
      <p>You have until <strong>${d.expires_at}</strong> to claim this spot.</p>
      <a href="${d.payment_link}">Claim Your Spot</a>
    `,
  }

  return templates[template]?.(data) || ''
}
```

### Email Processing (Cron Job)

```sql
-- Process notification queue every minute
-- Run via pg_cron or Supabase scheduled function

CREATE OR REPLACE FUNCTION process_notification_queue()
RETURNS void AS $$
DECLARE
  notification RECORD;
BEGIN
  FOR notification IN
    SELECT * FROM notification_queue
    WHERE status = 'pending'
      AND (scheduled_for IS NULL OR scheduled_for <= NOW())
    ORDER BY created_at
    LIMIT 100
  LOOP
    -- Call Edge Function to send email
    -- Update status to 'sent' or 'failed'
    UPDATE notification_queue
    SET status = 'processing'
    WHERE id = notification.id;
  END LOOP;
END;
$$ LANGUAGE plpgsql;
```

---

## User Flows

### 1. Exhibitor Registration

```
┌─────────────────────────────────────────────────────────────┐
│  1. Sign up with email (Supabase Auth)                      │
│  2. Create person record (name, address, phone)             │
│  3. Create exhibitor_profile (links auth to person)         │
│  4. Add dogs (name, breed, registration numbers)            │
│  5. Optional: Add payment method (Stripe)                   │
└─────────────────────────────────────────────────────────────┘
```

### 2. Entry Flow

```
┌─────────────────────────────────────────────────────────────┐
│  1. Browse shows (filter by date, location, type)           │
│  2. Select show → View available classes                    │
│  3. Select dog → Show eligible classes                      │
│  4. Add entries to cart (soft reservation, show warnings)   │
│  5. Review cart → Checkout (Stripe)                         │
│  6. Stripe webhook → Create entries in database             │
│  7. Confirmation email via notification_queue               │
└─────────────────────────────────────────────────────────────┘
```

### 3. Waitlist Flow

```
┌─────────────────────────────────────────────────────────────┐
│  1. Class is full → Offer waitlist option                   │
│  2. Exhibitor joins waitlist (no payment yet)               │
│  3. Entry scratched → Trial secretary notified              │
│  4. Secretary promotes from waitlist (manual action)        │
│  5. Waitlist exhibitor notified → 24-hour window to pay     │
│  6. Payment received → Entry confirmed                      │
│  7. No payment → Cron expires offer, next person notified   │
└─────────────────────────────────────────────────────────────┘
```

### 4. Move-Up Request Flow

```
┌─────────────────────────────────────────────────────────────┐
│  1. Dog qualifies in current level                          │
│  2. Handler requests move-up (online or at check-in)        │
│  3. Secretary reviews request                               │
│  4. If approved: Entry updated to higher level class        │
│  5. If class full: Offered waitlist position                │
└─────────────────────────────────────────────────────────────┘
```

---

## Stripe Integration

> **Note:** `stripe_customers`, `stripe_orders`, and `stripe_subscriptions` tables already exist in migration 005.

### Payment Flow

```
┌─────────────────────────────────────────────────────────────┐
│  Cart Checkout                                              │
│  ├── Entry fees (go to club)                                │
│  ├── Platform fee (per-entry, kept by you)                  │
│  └── Total charged to exhibitor                             │
│                                                             │
│  Using: Stripe Checkout + Connect (for club payouts)        │
└─────────────────────────────────────────────────────────────┘
```

### Existing Stripe Config

```typescript
// apps/myk9show/src/stripe-config.ts
export const stripeProducts = {
  excellent: { priceId: 'price_1RHz4VAtHgBcw875bF7McPNd' },  // Premium subscription
  advanced: { priceId: 'price_1RHz3bAtHgBcw875o2gdNaYW' },   // Pro subscription
}
```

### Stripe Connect (Phase 5)

If clubs want direct deposits instead of manual payouts:

- Each club becomes a Stripe Connected Account
- Entry fees go directly to club (minus your platform fee)
- You collect platform fee automatically via `application_fee_amount`

### Stripe Sync Engine

Syncs Stripe data to your Supabase database:

- Customers, subscriptions, invoices in existing stripe_* tables
- Join billing data with application data
- Query: "Show me all exhibitors with active premium subscriptions who entered shows this month"

---

## Implementation Phases

### Phase 1: Foundation
- [ ] Create migration for `exhibitor_profiles` table
- [ ] Exhibitor registration flow (sign up → person → exhibitor_profile)
- [ ] Show browsing (public view of accepting shows)
- [ ] Update RLS policies for exhibitor access (use existing roles tables)

### Phase 2: Entry Flow
- [ ] Create migration for `entry_carts`, `entry_cart_items` tables
- [ ] Cart UI with availability warnings
- [ ] Stripe Checkout integration (extend existing `lib/stripe.ts`)
- [ ] **Stripe webhook handler** (Edge Function)
- [ ] **Email integration** (Resend + notification_queue)
- [ ] Confirmation emails

### Phase 3: Trial Secretary Tools
- [ ] Create migration for `waitlist_entries` table
- [ ] View/manage entries for assigned shows
- [ ] Waitlist management (manual promotion)
- [ ] Move-up request handling
- [ ] Armband assignment

### Phase 4: Premium Features
- [ ] Exhibitor subscription billing (use existing stripe_subscriptions)
- [ ] Webhook handler for subscription events
- [ ] Title tracking
- [ ] Competition analytics
- [ ] Training journal
- [ ] Health records

### Phase 5: Platform Operations
- [ ] Stripe Connect for club payouts
- [ ] Revenue reporting dashboard
- [ ] Platform admin tools
- [ ] Cron jobs for cart expiration, waitlist offer expiration

---

## Open Questions

### Resolved

1. **Stripe Connect vs. manual payouts?**
   - **Decision:** Start with manual payouts (simpler). Add Connect in Phase 5.
   - Collect all payments, generate monthly club payout reports, pay via ACH/check.

2. **Cart expiration handling?**
   - **Decision:** 30 minutes, soft reservation (warnings only).
   - Cron job expires abandoned carts, no spot holds.

3. **Move-up timing?**
   - **Decision:** Both online (before entry close) and day-of (at check-in).
   - Online move-ups processed immediately if space available.

### Still Open

4. **Refund policy?**
   - Before entry close: Full refund minus platform fee?
   - After entry close: No refunds (standard for dog shows)?
   - *Recommendation:* Platform fee always non-refundable. Entry fee refundable before close.

5. **AKC integration (future)?**
   - Verify registration numbers via API?
   - Auto-pull titles for title tracking?
   - *Recommendation:* Phase 6 consideration. AKC API access requires approval.

6. **Waitlist offer window?**
   - How long should exhibitors have to claim a spot?
   - *Recommendation:* 24 hours for online, 30 minutes for day-of.

---

## Related Documents

- [MIGRATION-PLAN.md](./MIGRATION-PLAN.md) - Monorepo migration status
- [SCHEMA-ANALYSIS.md](./SCHEMA-ANALYSIS.md) - Database schema documentation
- [TO-DOS.md](../TO-DOS.md) - Current task list
