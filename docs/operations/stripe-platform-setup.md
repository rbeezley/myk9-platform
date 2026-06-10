# Stripe Platform Setup — Operator Runbook (Richard)

> Companion to [the Connect implementation plan](../plans/2026-06-09-stripe-connect-implementation.md)
> (Phase 0 and Task 6.3 are your manual steps; this is the click-by-click version).

## How the integration is shaped

All Stripe access is server-side, inside Supabase edge functions. The browser only follows
redirect URLs to Stripe-hosted pages (Checkout, Express onboarding) — there is no Stripe.js,
no publishable key, no frontend configuration. Your entire surface is:

1. The Stripe Dashboard (dashboard.stripe.com)
2. Four Supabase secrets: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
   `PLATFORM_FEE_PERCENT`, `PAYOUT_CRON_SECRET`

Stripe has two parallel worlds — live mode and a play-money copy. On this account
(`acct_1GgAdNAtHgBcw875`, new-style dashboard) the copy is a **Sandbox**, not the old
"test mode" toggle: top-left account menu ("Myk9t") → **Switch to sandbox** → `myK9Show dev`.
A colored Sandbox banner shows which world you're in. Connect enablement, webhook endpoints,
signing secrets, API keys, and products exist *separately* in the sandbox vs. live. The build
happens entirely in the sandbox; go-live repeats three steps in live mode. (Wherever this
runbook says "test mode," read "inside the sandbox.")

## Step 0 — Find out where you stand (5 min, do first)

> **Partially answered 2026-06-09 (live probe during Phase 2):**
>
> - The **unified** project (`sojmvhhwsjxmfistvzbe`) has `STRIPE_SECRET_KEY` set
>   (stripe-checkout boots) but **`STRIPE_WEBHOOK_SECRET` is missing — its
>   stripe-webhook 500s on every request**, so no webhook event has ever been
>   processed there. Setting that secret is the highest-priority Phase 0 item.
> - The **old pre-monorepo project** (`eergfbehjghvfqvzkhsu`) still hosts healthy
>   copies of both functions — February's deploys likely went there via a stale
>   link in `apps/myk9show/supabase/.temp`. Nothing should target it anymore;
>   consider pausing/archiving it after go-live to avoid a confusing third world.
> - Webhook endpoint registration + which mode the premium product lives in are
>   still unverified — check those in the dashboard as described below.
> - **2026-06-09 (screenshots):** single Stripe account confirmed
>   (`acct_1GgAdNAtHgBcw875` — the hardcoded premium price id carries the same
>   account fingerprint). LIVE mode had a real self-subscription billing
>   $4.99/mo to Richard's own card since Apr 2025 (the April attempt against
>   the old Supabase project) — cancel via Customers → beezley@cox.net.
>   Account display name is "Myk9t" — fix to "myK9Show" in the branding step.

The subscription functions deployed in February already use `STRIPE_SECRET_KEY` and
`STRIPE_WEBHOOK_SECRET`, so some of this may exist. Check before creating duplicates:

1. Dashboard → **Developers → Webhooks**: is there an endpoint pointing at
   `https://sojmvhhwsjxmfistvzbe.supabase.co/functions/v1/stripe-webhook`? In which mode
   (check the toggle)? Which events?
2. Dashboard → **Product catalog**: which mode contains the "myK9Show Premium" product?
3. Run `supabase secrets list` — confirm which secret names exist (values aren't shown).

⚠ If the existing secrets hold **live** keys and the premium price was created in **live**
mode: switching staging to test keys for the build will break subscription checkout in
staging (the live `price_...` id won't exist in test mode). Fix: create a test-mode clone of
the premium product/price and note its price id for `apps/myk9show/src/stripe-config.ts`
during the build. If everything is already test mode, skip this.

## Phase 0 — Test-mode setup (~30 min, unblocks Phases 3–5)

Dashboard toggle: **Test mode ON** for all of this.

### 1. Enable Connect — ✅ ALREADY ENABLED (verified 2026-06-09)

Connect was activated during the April 2025 attempt — the Connect overview shows a working
dashboard, no setup wizard. Verified by creating a sandbox Express account from the
Workbench shell. Two facts learned:

- Express accounts must request **both** `card_payments` + `transfers` capabilities;
  `transfers`-only (recipient model) is rejected without special Stripe approval
  (`capabilities_cannot_have_transfers_without_card_payments_unless_payee`).
- Sandbox test club for Phase 3 E2E: `acct_1TgaoXPQKr1pkcBI` (pre-onboarding state).

At go-live, confirm live mode shows the same enabled state (it should — the sandbox
inherits from the live account's platform).

### 2. Branding

- **Settings → Connect → Branding**: business name "myK9Show", icon, brand color.
- This is what club treasurers see on the Express onboarding pages and payout emails —
  worth two minutes so the flow doesn't look like a scam to a cautious volunteer.

### 3. Webhook endpoint (test mode)

- **Developers → Webhooks → Add endpoint** (or edit the existing one).
Two destinations are needed because Stripe scopes them (each with its OWN signing secret):

- **Destination 1 — scope "Your account"** (created 2026-06-09), URL
  `https://sojmvhhwsjxmfistvzbe.supabase.co/functions/v1/stripe-webhook`, events:
  - `checkout.session.completed`
  - `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`
  - `invoice.paid`, `invoice.payment_failed`
  - `charge.refunded`
  - Its signing secret → `STRIPE_WEBHOOK_SECRET`.
- **Destination 2 — scope "Connected accounts"** (create during Phase 3, same URL), events:
  - `account.updated`, `account.application.deauthorized`
  - Its signing secret → `STRIPE_CONNECT_WEBHOOK_SECRET` (function support lands in Phase 3).

### 4. Set the secrets

```bash
supabase secrets set STRIPE_SECRET_KEY=sk_test_...        # Developers → API keys (test mode)
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...      # from step 3
supabase secrets set PLATFORM_FEE_PERCENT=3
supabase secrets set PAYOUT_CRON_SECRET=$(openssl rand -hex 32)
supabase secrets list                                     # verify all four names exist
```

**Record the `PAYOUT_CRON_SECRET` value** (password manager) — the Task 5.3 cron migration
embeds it as a literal, the same way migration 194 does for the heritage cron.

## During the build — nothing

No Stripe dashboard work. You'll be asked in chat to confirm each `supabase db push` and
`supabase functions deploy` per the Auto-Mode rules; that's it.

## Phase 6.1 — Test-mode walkthrough (with Claude)

Stripe's test world accepts canned data everywhere:

- Card: `4242 4242 4242 4242`, any future expiry, any CVC, any ZIP.
- Express onboarding: SSN `000-00-0000`, test phone numbers, SMS code `000000`, and a
  "use test account" bank option — no real personal data ever enters test mode.
- Screenshot every onboarding screen — they become the printable treasurer guide (Task 6.4).

## Go-live — Task 6.3 (later, ~30 min)

Toggle: **Live mode ON**. Three things exist per-mode and must be redone:

1. **Enable Connect in live mode** (same questionnaire; live mode may include a short Stripe
   review of the platform before activation — plan a few days of buffer, don't do this the
   night before a show opens entries).
2. **Live webhook endpoint** — same URL, same event list, new `whsec_...`:
   `supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_<live>`
3. **Live API key**: `supabase secrets set STRIPE_SECRET_KEY=sk_live_...`

Then verify the mode-independent pieces survived (`supabase secrets list` —
`PLATFORM_FEE_PERCENT`, `PAYOUT_CRON_SECRET` persist; verify, don't assume), run one real
low-value entry payment + refund as a smoke test, and concierge-onboard the first 3–4 clubs
by phone.

## Ongoing operations

- **Payout failure emails** (the cron alerts you on any failed transfer):
  - `insufficient available balance` — benign and self-healing: show-day card payments take
    ~2 business days to clear into available balance; tomorrow's run retries automatically.
  - `stale_processing` — a run died mid-transfer and was auto-failed for retry; the retry is
    safe (idempotency key), but a second occurrence is worth investigating.
  - Anything else — read `failure_reason` in `show_payouts` and the function logs.
- **Where to look in the dashboard**: Connected accounts (club onboarding status),
  Payments (charges/refunds), Connect → Transfers (per-show payouts; each carries the
  show id in `transfer_group`).
- **Never refund from the Stripe dashboard** for entries — use the app's refund dialog. A
  dashboard refund only syncs the order-level record; the entry-level refund columns and
  status stay stale and need manual reconciliation.
- **Rotating `PAYOUT_CRON_SECRET`**: new migration with `cron.unschedule` + `cron.schedule`
  carrying the new literal, plus `supabase secrets set` — the documented migration-194
  procedure.

## What you never configure

- Payout schedules on club accounts — Express defaults (automatic daily) are correct; the
  platform controls timing by *when it transfers*, not by payout schedules.
- Products or prices for entries — entry line items are created dynamically per cart.
- Anything on a club's behalf inside their Express account.
