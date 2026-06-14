# Configurable Payment Methods Per Show — Design Spec

**Date:** 2026-04-05
**Status:** Approved

---

## Problem

Clubs currently have no way to restrict which payment methods exhibitors can use when registering for a show. Some clubs only want online payments; others also accept check or cash at the door. The registration wizard presents all exhibitor-facing methods regardless of the show's actual policy.

## Goal

Let secretaries configure per-show whether exhibitors can pay by check or cash, in addition to the always-enabled online (card) payment. Surface accepted methods on the Show Details page before exhibitors begin registering.

---

## Business Context

myK9Show earns a percentage of online (Stripe) transactions only. Check and cash payments go directly to the club — myK9Show earns nothing from them. Online payment is therefore always enabled and cannot be disabled. Check and cash are opt-in additions.

---

## Data Model

One migration adds two boolean columns to the `shows` table:

```sql
ALTER TABLE shows
  ADD COLUMN accept_check_payments BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN accept_cash_payments  BOOLEAN NOT NULL DEFAULT FALSE;
```

Online (card) payment is implicit — always enabled, not stored as a column. No array, no enum. Two flags is the correct level of complexity for two optional methods.

The `Show` TypeScript type gains two optional fields:

```typescript
acceptCheckPayments?: boolean;
acceptCashPayments?: boolean;
```

---

## Affected Files

### 1. Database Migration

**File:** `supabase/migrations/115_add_payment_method_flags.sql`

Adds `accept_check_payments` and `accept_cash_payments` columns to `shows` with `DEFAULT FALSE`.

### 2. Show Creation Wizard

**File:** `apps/myk9show/src/components/shows/wizard/steps/ShowDetailsStep.tsx`

A new "Payment Methods" section is added below the fee fields. Contents:

- Non-interactive locked row: "Credit/Debit Card — always enabled" (muted appearance, communicates the business rule visually)
- Checkbox: "Check (pay at show)" — default unchecked
- Checkbox: "Cash (pay at show)" — default unchecked

Values flow into the existing wizard form state alongside other Show Details fields.

### 3. Show Edit Panel — Fees Tab

**File:** `apps/myk9show/src/components/panels/edit/ShowEditFeesTab.tsx`

The same Payment Methods section (identical layout and logic) is added below the existing fee fields, so secretaries can update the config after show creation.

### 4. Show Details Page — Exhibitor View

**File:** `apps/myk9show/src/components/shows/ShowDetails/ShowInformationCard.tsx`

A "Payment Methods" row is added below the fee display. It renders text-only indigo pill badges:

- **Card** — always rendered
- **Check** — rendered only when `acceptCheckPayments === true`
- **Cash** — rendered only when `acceptCashPayments === true`

No emojis. Badge style matches the existing indigo pill pattern in the codebase (`bg-indigo-500/12 border-indigo-500/30 text-indigo-300`).

### 5. Registration Wizard — Payment Method Selector

**File:** `apps/myk9show/src/components/shows/RegistrationWorkflow/PaymentStep/PaymentMethodSelector.tsx`

The component gains an `acceptedMethods` prop:

```typescript
interface AcceptedMethods {
  check: boolean;
  cash: boolean;
}
```

The `check` and `cash` payment cards are conditionally rendered based on these flags. If `check` is false, the check card does not appear. Same for cash.

Secretary-only methods (`secretary_paid`, `group_payment`, `waived`) are not affected — they remain always visible to users with secretary permissions, regardless of show configuration.

The show's accepted methods are fetched as part of the existing show data query and passed through to `PaymentMethodSelector` via the registration wizard's show context.

---

## Visual Design

### Wizard / Edit — Payment Methods Section

```
┌─ Payment Methods ───────────────────────────────┐
│  [locked]  Credit/Debit Card — always enabled   │
│  [ ] Check (pay at show)                        │
│  [ ] Cash (pay at show)                         │
└─────────────────────────────────────────────────┘
```

Grouped inside a bordered/rounded container with a section label, matching the existing section pattern in `ShowDetailsStep`.

### Show Details Page — Payment Methods Row

```
PAYMENT METHODS
[Card]  [Check]  [Cash]
```

Text-only indigo pill badges. "Card" always present. "Check" and "Cash" render conditionally.

---

## Out of Scope

- Club-level default payment methods (each show is configured independently)
- Disabling online (card) payment — always enabled by business rule
- Changes to secretary-only payment methods (`secretary_paid`, `group_payment`, `waived`)
- Stripe integration (card payment already shows "coming soon" — this feature does not change that)
- Analytics or reporting on payment method usage
