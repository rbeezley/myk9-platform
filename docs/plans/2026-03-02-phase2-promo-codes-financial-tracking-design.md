# Phase 2: Promo Codes, Comped Entries & Financial Tracking — Design Document

**Date:** March 2, 2026
**Status:** Design Complete — Ready for Implementation
**Depends on:** Existing entries table (migration 003), Stripe Edge Functions (test mode)
**Deferred:** Exhibitor credit tracking (requires live Stripe refund flow)

---

## Overview

Secretary-facing tools for managing trial discounts and finances. Three features: promo codes that apply discounts at checkout, comped entry marking for judges/workers/special circumstances, and a financial summary view for club bookkeeping.

---

## Database Changes

### New table: `promo_codes`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | Default gen_random_uuid() |
| `trial_id` | UUID FK → trials ON DELETE CASCADE | Scoped per trial |
| `code` | TEXT NOT NULL | Uppercase, unique per trial |
| `discount_type` | TEXT NOT NULL CHECK ('percentage', 'flat') | |
| `discount_value` | DECIMAL(10,2) NOT NULL | 50.00 = 50% or $50 |
| `usage_limit` | INTEGER | NULL = unlimited |
| `usage_count` | INTEGER DEFAULT 0 | Incremented on redemption |
| `expires_at` | TIMESTAMPTZ | NULL = no expiry |
| `created_by` | UUID FK → auth.users | Secretary who created it |
| `created_at` | TIMESTAMPTZ DEFAULT NOW() | |
| `updated_at` | TIMESTAMPTZ DEFAULT NOW() | |

Unique constraint on `(trial_id, code)`. Index on `trial_id`. RLS: secretary who owns the trial can CRUD. Trigger for `updated_at`.

### Entries table additions (ALTER)

- `promo_code_id` UUID nullable FK → promo_codes — which code was applied
- `discount_amount` DECIMAL(10,2) — computed dollar discount (avoids recalculation in reports)
- `comped` BOOLEAN DEFAULT false — secretary marked as comped
- `comped_reason` TEXT nullable — why the entry was comped

Comped entries have `comped = true`, `payment_status = 'waived'`, and a reason tag. The original `entry_fee` is preserved for reporting.

---

## Promo Code Validation

Client-side for now. When an exhibitor enters a code at checkout:

1. Look up the code for the trial
2. Check: not expired, usage_count < usage_limit (if limit set)
3. Calculate discount: percentage of entry_fee or flat amount (capped at entry_fee)
4. Store `promo_code_id` and `discount_amount` on the entry
5. Increment `usage_count` on the promo code

When Stripe goes live, the checkout Edge Function reads `discount_amount` from the entry to adjust the charge.

---

## UI Components

### Promo Codes Management

Location: Secretary's trial management area. Simple list view.

- **List**: All codes for a trial — code, discount type/value, usage (count/limit), expiry, status
- **Add dialog**: Code string (auto-uppercased), discount type toggle (% or $), value, optional usage limit, optional expiry date
- **Delete**: Remove a code. No edit — delete and recreate if changes needed (avoids mid-use mutation)

### Comped Entries

Not a separate page. An action within the secretary's entry management for a trial.

- "Comp Entry" button on each entry row
- Prompts for a reason (free text)
- Sets `comped = true`, `payment_status = 'waived'`, stores reason
- Entry displays $0 fee with a "Comped" badge and reason tooltip
- Reversible: "Remove Comp" restores original payment status

### Financial Summary

A new tab/section in trial management showing:

- **Summary card**: Total entries, total fees, total discounts (promo), total comps, net amount
- **Status breakdown**: Paid / Pending / Refunded / Comped — counts and dollar totals
- **Entry table**: Per-entry rows — exhibitor, dog, class, fee, discount, promo code, payment status, comp reason. Filterable by exhibitor name and payment status.
- **CSV export**: Downloads the entry table as a spreadsheet for club bookkeeping

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `supabase/migrations/045_promo_codes_financial.sql` | CREATE — new table + ALTER entries |
| `apps/myk9show/src/types/supabase.ts` | REGENERATE |
| `apps/myk9show/src/types/promo-codes.ts` | CREATE — app types |
| `apps/myk9show/src/types/database-mappings.ts` | EDIT — add promo code DB types |
| `apps/myk9show/src/services/database/queries/promoCodeQueries.ts` | CREATE — CRUD |
| `apps/myk9show/src/services/mappers/promoCodeMappers.ts` | CREATE — DB ↔ App |
| `apps/myk9show/src/hooks/queries/usePromoCodeDatabase.ts` | CREATE — React Query hooks |
| Secretary trial management UI (promo codes tab) | CREATE |
| Secretary entry management (comp action) | EDIT |
| Financial summary component | CREATE |
| CSV export utility | CREATE |

---

## Validation Test

After implementation, a secretary should be able to:

1. Create a promo code for a trial (e.g., "WORKER" for 100% off)
2. See the code in the promo codes list with usage tracking
3. Mark an entry as comped with a reason ("Judge entry")
4. View a financial summary showing entries by payment status with totals
5. Export the financial summary as CSV

---

## Deferred

- **Exhibitor credit tracking**: Requires live Stripe refund flow. Will add `exhibitor_credits` ledger table when Stripe is in production mode.
- **Bulk refund + scratch**: Depends on credit tracking and live Stripe.
- **Per-exhibitor aggregation view**: Entry table is filterable by exhibitor, covering the same need.

---

*Source: Brainstorming session March 2, 2026.*
