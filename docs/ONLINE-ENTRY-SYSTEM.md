# Online Entry System Architecture

## Overview

This document outlines the architecture for transforming myK9Show from a license-based desktop replacement into a platform with online entries, per-entry fees, and premium exhibitor subscriptions.

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

```sql
-- Example: Exhibitors see published shows only
CREATE POLICY "exhibitors_see_published_shows" ON shows
  FOR SELECT
  USING (
    status IN ('published', 'accepting_entries', 'closed', 'in_progress', 'completed')
    OR auth.uid() IN (
      SELECT p.auth_user_id FROM people p
      JOIN user_roles ur ON ur.user_id = p.id
      JOIN roles r ON r.id = ur.role_id
      WHERE r.name IN ('club_admin', 'trial_secretary', 'platform_admin')
      AND (ur.club_id = shows.club_id OR r.name = 'platform_admin')
    )
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

```sql
CREATE TABLE exhibitor_profiles (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  auth_user_id UUID NOT NULL UNIQUE,  -- Supabase auth link
  
  -- Defaults for entry forms
  default_handler_id UUID REFERENCES people(id),
  
  -- Premium subscription
  subscription_tier TEXT DEFAULT 'free' CHECK (subscription_tier IN ('free', 'premium', 'pro')),
  subscription_expires_at TIMESTAMPTZ,
  
  -- Stripe integration
  stripe_customer_id TEXT,
  
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
  
  -- Stripe
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

-- Unique position per class
CREATE UNIQUE INDEX waitlist_entries_class_position_idx 
  ON waitlist_entries(class_id, position) 
  WHERE status = 'waiting';
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
│  4. Add entries to cart                                     │
│  5. Review cart → Checkout (Stripe)                         │
│  6. Payment success → Create entries in database            │
│  7. Confirmation email with entry details                   │
└─────────────────────────────────────────────────────────────┘
```

### 3. Waitlist Flow

```
┌─────────────────────────────────────────────────────────────┐
│  1. Class is full → Offer waitlist option                   │
│  2. Exhibitor joins waitlist (no payment yet)               │
│  3. Entry scratched → Trial secretary notified              │
│  4. Secretary promotes from waitlist                        │
│  5. Waitlist exhibitor notified → Given time window to pay  │
│  6. Payment received → Entry confirmed                      │
│  7. No payment → Next on waitlist offered spot              │
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

### Stripe Connect (Future)

If clubs want direct deposits instead of manual payouts:

- Each club becomes a Stripe Connected Account
- Entry fees go directly to club (minus your platform fee)
- You collect platform fee automatically

### Stripe Sync Engine

Syncs Stripe data to your Supabase database:

- Customers, subscriptions, invoices in `stripe` schema
- Join billing data with application data
- Query: "Show me all exhibitors with active premium subscriptions who entered shows this month"

---

## Implementation Phases

### Phase 1: Foundation
- [ ] Exhibitor registration (sign up, profile, add dogs)
- [ ] Show browsing (public view of accepting shows)
- [ ] Basic RLS for exhibitor access

### Phase 2: Entry Flow
- [ ] Entry cart system
- [ ] Stripe Checkout integration
- [ ] Entry creation after payment
- [ ] Confirmation emails

### Phase 3: Trial Secretary Tools
- [ ] View/manage entries for assigned shows
- [ ] Waitlist management (manual promotion)
- [ ] Move-up request handling
- [ ] Armband assignment

### Phase 4: Premium Features
- [ ] Exhibitor subscription billing (Stripe)
- [ ] Title tracking
- [ ] Competition analytics
- [ ] Training journal
- [ ] Health records

### Phase 5: Platform Operations
- [ ] Stripe Sync Engine integration
- [ ] Revenue reporting dashboard
- [ ] Platform admin tools

---

## Open Questions

1. **Stripe Connect vs. manual payouts?**
   - Connect: Automatic splits, more complex setup
   - Manual: You collect all, pay clubs monthly via ACH/check

2. **Cart expiration handling?**
   - 30 minutes seems reasonable
   - Need cron job to expire abandoned carts

3. **Refund policy?**
   - Before entry close: Full refund minus platform fee?
   - After entry close: No refunds (standard for dog shows)?

4. **Move-up timing?**
   - Allow during online entry (before show)?
   - Day-of only (at check-in)?
   - Both?

5. **AKC integration (future)?**
   - Verify registration numbers via API?
   - Auto-pull titles for title tracking?

---

## Related Documents

- [MIGRATION-PLAN.md](./docs/MIGRATION-PLAN.md) - Monorepo migration status
- [SCHEMA-ANALYSIS.md](./docs/SCHEMA-ANALYSIS.md) - Database schema documentation
- [TO-DOS.md](./TO-DOS.md) - Current task list
