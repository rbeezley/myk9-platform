# Stripe Payments Revision — Connect Payouts & Refund Automation

> Supersedes [2026-01-27-stripe-connect-design.md](2026-01-27-stripe-connect-design.md).
> Validated with Richard 2026-06-09 via brainstorming session.
> Implementation plan: [2026-06-09-stripe-connect-implementation.md](2026-06-09-stripe-connect-implementation.md)

## Why a revision

The January 2026 design froze while the codebase moved:

| January plan said | Reality (June 2026) |
| --- | --- |
| Subscriptions to build | Shipped Feb 2026 (`stripe-checkout`, `stripe-webhook`, `stripe-customer-portal`, `stripe-upgrade-subscription`) |
| 5% convenience fee | 3% platform fee, hardcoded in `stripe-checkout` |
| Self-service exhibitor refunds with policy hierarchy | April status model: Withdrawn = refund due, Scratched = no refund, manual processing (migration 176) |
| Stripe-only entry payments | Mixed methods: `entries.payment_method` = `online \| cash \| check \| waived \| secretary_paid` (May migration) |
| New `entry_payments` table | `stripe_orders` already serves this role (migrations 005, 132) |
| Destination charges + delayed payout | Nothing built; charge flow collects everything to the platform account |

## Decisions (2026-06-09)

1. **Build Stripe Connect now.** Pre-launch is the cheapest time to change the money flow; manual settlement to clubs doesn't scale past the first shows.
2. **Money flow: separate charges and transfers** ("hold and transfer"), NOT destination charges. Payments keep landing on the platform balance exactly as the shipped checkout already works. After `show end_date + 3 days`, one Stripe Transfer per show moves the club's share to its Express account. Rationale: dog-show refunds happen between entry and show day — weeks after payment. Holding funds platform-side until the show closes makes every in-window refund a plain refund, with zero transfer-reversal/clawback machinery.
3. **Platform fee stays 3%, becomes configurable** via a `PLATFORM_FEE_PERCENT` Supabase secret (no deploy to change). Each cart snapshots `platform_fee_cents`, so historical data is immune to fee changes. The fee is never refunded and never transferred.
4. **Refunds: secretary one-click**, built on the April status vocabulary. Exhibitor self-service is a future layer on top of this, not part of v1.
5. **Post-payout refunds are blocked in v1** ("funds already paid out — settle directly with the club"). The 3-day buffer plus Scratched-gets-no-refund covers the window; this cuts the hardest 20% of Connect (reversals, negative balances, clawbacks) from scope.
6. **Subscriptions are out of scope** — already shipped and working.
7. **No `entry_payments` table.** `stripe_orders` remains the payment record; entries get a denormalized `stripe_payment_intent_id` stamped at creation (consolidate, don't duplicate).

## Architecture

### Charge flow (unchanged)

Exhibitor pays entry fees + 3% platform fee via `stripe-checkout` entry mode. Funds land in the platform Stripe account. The webhook creates entries (`payment_status='paid'`, `source='online'`) and a `stripe_orders` row — as today, plus stamping `entries.stripe_payment_intent_id`.

### Club onboarding (new)

```
Club admin → Club settings "Payments" card → Connect payment account
    → stripe-connect-onboard edge function
        creates/reuses Express account, returns account-link URL
    → Stripe-hosted Express onboarding
    → webhook account.updated → club_stripe_accounts.onboarding_complete / payouts_enabled
    → webhook account.application.deauthorized → payouts_enabled = false
```

Gate: a show whose club lacks `payouts_enabled` cannot **newly enable** online entries (banner with connect link). Existing shows are unaffected (pre-launch, only a handful).

### Payout flow (new)

`cron-process-payouts` runs daily:

1. Find shows where `end_date + 3 days <= today`, with ≥1 paid online entry, and no non-failed `show_payouts` row.
2. Compute club share: `SUM(entry_fee_cents)` over entries with `source='online'`, `payment_status='paid'` (refunded entries excluded by status). Offline methods (cash/check/waived/secretary_paid) never enter the calculation.
3. Insert `show_payouts` row as `processing`, then `stripe.transfers.create` with `transfer_group = show_id` and idempotency key derived from the show id.
4. Mark `completed`, email the club (existing `send-email` function).
5. Club not onboarded → row stays `pending`, nudge email to club admin. Transfer failure → `failed` + alert; safe to re-run.

### Refund flow (new)

Secretary marks an entry Withdrawn (or uses an explicit Refund action on any paid online entry):

```
Refund dialog (full = entry fee, or partial; capped at entry_fee_cents)
    → stripe-refund-entry edge function
        verify secretary RBAC for the show
        block if show_payouts row is completed (post-payout)
        stripe.refunds.create({ payment_intent, amount })
        write refund_amount / refunded_at / refund_notes (migration 176 columns)
        set payment_status = 'refunded'
```

The webhook's new `charge.refunded` handler is the reconciliation backstop: a refund issued in the Stripe dashboard still syncs to the DB (idempotent — skip if already recorded).

## Schema (one migration)

```sql
-- Club Stripe Connect accounts
CREATE TABLE public.club_stripe_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL UNIQUE REFERENCES clubs(id) ON DELETE CASCADE,
  stripe_account_id TEXT NOT NULL UNIQUE,        -- acct_xxx
  onboarding_complete BOOLEAN NOT NULL DEFAULT false,
  payouts_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Show payout tracking
CREATE TABLE public.show_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id UUID NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
  club_stripe_account_id UUID REFERENCES club_stripe_accounts(id),
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  stripe_transfer_id TEXT,
  scheduled_date DATE,
  failure_reason TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Idempotency backstop: at most one live payout per show
CREATE UNIQUE INDEX show_payouts_one_live_per_show
  ON public.show_payouts(show_id) WHERE status <> 'failed';

-- Per-entry refund key
ALTER TABLE public.entries
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT;
```

Plus, per current Supabase rules (no auto-exposure since Oct 2026): explicit `GRANT`s on both tables (`authenticated` SELECT; writes via `service_role` only), RLS enabled with club-admin read policies on `club_stripe_accounts` and club-admin/secretary read on `show_payouts`. No client-side writes to either table — all mutations go through edge functions with the service role.

## Edge functions

| Function | New/Change | Purpose |
| --- | --- | --- |
| `stripe-connect-onboard` | New | Create/reuse Express account, return account-link URL |
| `stripe-refund-entry` | New | RBAC check → capped refund → write migration-176 columns |
| `cron-process-payouts` | New | Daily transfer creation per qualifying show |
| `stripe-webhook` | Modify | Add `account.updated`, `account.application.deauthorized`, `charge.refunded` handlers; stamp `entries.stripe_payment_intent_id` on entry creation |
| `stripe-checkout` | Modify | Read `PLATFORM_FEE_PERCENT` from env instead of hardcoded 3 |

Stripe dashboard work: enable Connect (Express), add the three Connect/refund events to the webhook endpoint, set `PLATFORM_FEE_PERCENT` secret.

## UI surfaces

- **Club settings → Payments card**: connect button, onboarding status, payout history (reads `show_payouts`). One new card on an existing page — no new page.
- **Entries Management**: refund dialog wired into the existing Withdrawn flow + Refund action on the existing status dropdown/row actions. No new page.
- **Show online-entry toggle**: gate + banner when club isn't connected.

## Error handling

- Webhook signature verification (already present) covers new events.
- Transfer failure → `show_payouts.status='failed'` + `failure_reason`; cron retries next day via a fresh row.
- Refund failure surfaces in the dialog; nothing written to DB on Stripe error.
- Deauthorized club → `payouts_enabled=false`; payouts for its shows stay `pending` with nudge email.

## Testing strategy

Assertion-first on every money value (project rule): the exact `amount` arguments to `stripe.transfers.create` and `stripe.refunds.create` are asserted with `toHaveBeenCalledWith` before implementation.

1. **Unit**: payout calculation (mixed payment methods, refunded entries excluded, multi-trial shows, zero-online-entry shows), refund cap, fee math from env.
2. **Edge function**: mocked Stripe client; RBAC denial paths; post-payout refund block; webhook idempotency (`charge.refunded` twice).
3. **Stripe test mode E2E checklist** (manual, final phase): onboard test club → pay with 4242 card → withdraw + refund → fast-forward payout → verify transfer in dashboard.

## Future work (explicitly deferred)

- Exhibitor self-service refunds (policy display + automatic refund) — layers on `stripe-refund-entry`.
- Post-payout refunds via transfer reversal.
- Annual subscription tier.

---

*Document created: 2026-06-09 — design validated in session*
