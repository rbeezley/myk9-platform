# Stripe Platform Setup — Operator Runbook (Richard)

> Companion to [the Connect implementation plan](../archive/plans/2026-06-09-stripe-connect-implementation.md)
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
signing secrets, API keys, and products exist _separately_ in the sandbox vs. live. The build
happens entirely in the sandbox; go-live repeats three steps in live mode. (Wherever this
runbook says "test mode," read "inside the sandbox.")

## How the money flows (the mental model)

_Written after the 2026-06-10 sandbox walkthrough, where every step below was exercised
with real (sandbox) money — including the failure paths._

**Life of an entry dollar.** An exhibitor pays their entry fees **plus the platform
fee** (7% since 2026-06-10 — the `PLATFORM_FEE_PERCENT` secret; 3% lost money once
Stripe's ~2.9% + 30¢ was paid) in one card charge. The whole amount lands in the **platform's Stripe balance**
(pending ~2 business days while the card clears, then available). It sits there, pooled,
for the entire entry period. Three days after the show's end date, the nightly payout run
computes _online entry fees minus refunds_ for that show and **transfers exactly that** to
the club's connected account. Stripe then auto-deposits it to the club's bank about a day
later (their Express account pays out daily — never touch that setting). The fee stays in
the platform balance: that's the platform's revenue, and it's also what absorbs Stripe's
~2.9% + 30¢ processing costs.

**Three separate pipes — don't conflate them:**

1. **Platform balance → club** (show payouts): driven by `cron-process-payouts`, nightly.
   Stripe's payout-schedule setting has _nothing_ to do with these transfers.
2. **Club's Stripe account → club's bank**: Stripe automatic daily (Express default).
   The treasurer does nothing, ever.
3. **Platform balance → your bank** (your fee + premium revenue): **Manual only** — you
   log in and click _Pay out_ when you want your cut (monthly is fine). This is the only
   pipe the "Manual" payout-schedule setting controls, and it MUST stay Manual (see the
   payout-schedule section below): the default daily auto-sweep claims the clubs' pooled
   money for pipe 3 and starves pipe 1 forever.

**Refunds.** Before payout: a secretary refund (entry withdrawn → refund dialog) sends
that entry's fee back to the exhibitor's card _from the platform balance_, and the payout
math automatically subtracts it — the club is never paid for refunded money. The platform
fee portion is not refunded. After payout: the app **blocks** Stripe refunds for that show
(deliberate v1 rule) — the money is in the club's hands, so a late refund is the club's
decision (check at the desk, credit at the next show), not a platform balance event.

**Many shows at once.** Five concurrent shows = one pooled Stripe balance, five sums.
Stripe shows a single number with no per-club breakdown; the per-show ledger lives in the
app's database (every entry row knows its fee, refund, and show), and each transfer is
tagged with its show id (`transfer_group`) so everything reconciles one-to-one afterward.
Clubs see their own payouts on their Payments page. Your operator-side view ("whose money
is in my balance right now?") is the **site-admin Payout Ledger at `/admin/payouts`**
(Admin → Payments) — a cross-club table of Collected / Refunds / Net owed / Settle date /
Status / Stripe transfer id per show, plus "Outstanding to clubs" and "Paid out to date"
summary cards and the editable platform-fee %. SITE_ADMIN-gated (route guard + RLS).

**Float rule of thumb.** Refunds and payouts draw from _available_ balance. The clubs'
money pooled in the balance naturally covers this — just don't sweep your own revenue out
so aggressively that a same-week refund has nothing to draw on; keep a few hundred dollars
of float.

**When a transfer fails** you get an alert email (see _Ongoing operations_). The payout
row is marked `failed` with the reason, nothing has moved, and the next nightly run
retries from scratch — `insufficient available balance` is the benign, self-healing one
(card money still clearing; the 3-day buffer usually prevents it entirely).

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
supabase secrets set PLATFORM_FEE_PERCENT=7    # fallback only; platform_settings (site-admin editable) is authoritative
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

## Platform payout schedule — set to MANUAL (required, both modes)

**Found 2026-06-10:** Stripe's default payout schedule sweeps the platform's available
balance to your bank **daily**. With separate charges & transfers, club payouts draw from
that same available balance — so the daily sweep leaves $0 for transfers and every club
payout fails with `insufficient_balance`, forever.

Dashboard → **Balances → Manage payouts → Payout schedule → Manual.** Do this in the
sandbox AND in live mode before the first real show. The platform's own revenue (the 3%
fee + premium subscriptions) then accumulates in the balance; pay yourself out manually
(or set a monthly schedule with a minimum-balance floor large enough to cover upcoming
show payouts — Manual is simpler and safer at this scale).

## Go-live — Task 6.3 (later, ~30 min)

Toggle: **Live mode ON**. Three things exist per-mode and must be redone:

1. **Enable Connect in live mode** (same questionnaire; live mode may include a short Stripe
   review of the platform before activation — plan a few days of buffer, don't do this the
   night before a show opens entries).
2. **Live webhook endpoint** — same URL, same event list, new `whsec_...`:
   `supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_<live>`
3. **Live API key**: `supabase secrets set STRIPE_SECRET_KEY=sk_live_...`
4. **Purge sandbox-created Stripe IDs from the database.** Stripe IDs are mode-scoped: a
   `cus_`/`acct_` ID created in the sandbox does not exist in live mode, and the checkout
   function reuses cached customer IDs from `stripe_customers` — a stale sandbox ID makes
   live checkout fail with "No such customer" (this bit us during the 2026-06-10 walkthrough,
   in the other direction). In the SQL editor:

   ```sql
   delete from public.stripe_customers
    where livemode = false;

   update public.exhibitor_profiles
      set stripe_customer_id = null
    where stripe_customer_id is not null
      and not exists (
        select 1
          from public.stripe_customers
         where stripe_customers.stripe_customer_id = exhibitor_profiles.stripe_customer_id
           and stripe_customers.livemode = true
      );

   delete from public.club_stripe_accounts
    where livemode = false;
   ```

   This keeps any live-mode rows intact while removing cached sandbox customers/accounts
   that live-mode Stripe cannot resolve.

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
- **Changing the bank account your platform pays out to**: Dashboard (live mode) →
  Settings (gear) → **Bank accounts and currencies** → add the new account, set it as
  payout default, remove the old. Verification is instant via bank login or 1–2 days by
  micro-deposits; in-flight payouts still go to the old account. (A _club_ changing theirs
  does it in their own Stripe Express dashboard → payout settings — never through myK9Show
  or your dashboard.)

## Payout cron operations (the nightly transfer job)

_Written 2026-06-27 after finding the cron had failed silently for 5+ nights._

**How it's wired.** The nightly job `nightly-show-payouts` (pg_cron, `0 2 * * *`) is a
small SQL `DO` block that reads three secrets from **Supabase Vault**, then `net.http_post`s
to the `cron-process-payouts` edge function. It is **Vault-backed**, not the old
literal-in-migration approach — migration `20260618130000` (placeholder literal) was
superseded by `20260619130000_payout_cron_vault_secret`. Do not re-introduce the placeholder.

**The three Vault secrets it needs** (exact lowercase names — the cron does `where name = …`):

| Vault secret             | Value                                                                       |
| ------------------------ | --------------------------------------------------------------------------- |
| `edge_function_base_url` | `https://sojmvhhwsjxmfistvzbe.supabase.co/functions/v1` (NO trailing slash) |
| `service_role_key`       | the project service-role key (Settings → API → `service_role`)              |
| `payout_cron_secret`     | **must byte-match** the edge-fn `PAYOUT_CRON_SECRET` env secret             |

Set/rotate them in the dashboard **Project Settings → Vault**. Because edge-fn secrets are
write-only (a lost value can't be read back), the way to make the two `*_cron_secret` ends
match is to **rotate both together**: `supabase secrets set PAYOUT_CRON_SECRET=$(openssl rand -hex 32)`,
then paste that same value into the Vault `payout_cron_secret`. Rotating is safe — the only
consumer is this cron.

**Diagnose (is it actually running?).** The job reporting `succeeded` is NOT proof a payout
happened — `net.http_post` is fire-and-forget, so a typo'd `payout_cron_secret` makes the
job green while the function silently 403s and nothing transfers. Check the real history:

```sql
-- via the read-only MCP, or psql; jobid from: select jobid from cron.job where jobname='nightly-show-payouts';
select status, return_message, start_time
from cron.job_run_details
where jobid = (select jobid from cron.job where jobname = 'nightly-show-payouts')
order by start_time desc limit 5;
```

`Missing Vault secret: …` = a secret isn't set. All `succeeded` but clubs report no money =
suspect a `payout_cron_secret` mismatch; confirm by firing the cron's exact request and
reading the HTTP response (below) — want `status_code = 200`, not 403.

**Manually trigger / verify a payout** (e.g. to confirm a fix, or pay a show early):

```bash
# Direct function call (safe no-op if no show is eligible). Secret = the PAYOUT_CRON_SECRET value.
curl -s -X POST https://sojmvhhwsjxmfistvzbe.supabase.co/functions/v1/cron-process-payouts \
  -H "Content-Type: application/json" -H "x-function-secret: <PAYOUT_CRON_SECRET>" -d '{}'
# → {"eligible_shows":N,"completed":N,"failed":0,...}
```

A show is eligible only when `end_date <= now() - 3 days` and status ∉ (draft, cancelled).
To test before a real show closes, temporarily backdate `shows.end_date` (service-role
write — MCP SQL is **read-only**; use the REST API or psql), run the curl, verify the row,
then **restore the date**:

```sql
select status, amount_cents, stripe_transfer_id, completed_at, failure_reason
from show_payouts where show_id = '<show-id>';   -- want status='completed' + a tr_… id
```

**psql access gotcha.** Writes (backdating, Vault, firing `net.http_post`) need a direct
connection — the MCP SQL tool is read-only and can't even decrypt Vault. Use the **Session
pooler** connection string from the Supabase Dashboard → **Project Settings → Database**, and
copy the exact pooler host from there (the `db.<ref>.supabase.co` CNAME can resolve to the
wrong region and reject the tenant). Password: `supabase/.env` → `SUPABASE_DB_PASSWORD`. The
exact working host/user is in the **private operator notes** (kept out of this public repo).

**Where to see results.** The completed payout appears in your **Payout Ledger at
`/admin/payouts`** (Paid badge + transfer id) and in the club's own **My Club → Payments**.

## Manual reconciliation (refund columns are service-role-only)

A database trigger (migrations `20260609220000` + `20260611090000`) rejects any write to
`entries.refund_amount / refund_notes / refunded_at` that doesn't come from the
service role — that's what stops a forged refund from shrinking a club's payout. The
side effect: when an alert email tells you to "stamp the entry manually" or "clear the
entry's refund columns" (refund issued but not recorded, or a refund that later
**failed**), a plain SQL-editor UPDATE will hit `permission denied`. The exact reconciliation
`UPDATE` statements and the privileged role-elevation wrapper they require are kept in the
**private operator notes** (out of this public repo) — they only run with the service-role
credential, so the recipe is useless without that key.

## Granting a founding member (12-month free premium)

Site-admin-only, manual by design. **`people.early_adopter_until` no longer
exists** — it was dropped in migration `20260725200000`, and any `update` against
it fails with `42703`. Founding access is now a row in
`subscription_entitlement_grants`, which additionally records who granted it,
why, and any later revocation or supersession.

Preferred path — the admin UI: **/people/:id → Edit → Complimentary Premium**.

By SQL, the grant RPC is site-admin-only and the dashboard's `postgres` role is
NOT a site admin, so impersonate one:

```sql
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub','<site-admin auth_user_id>','role','authenticated')::text, true);

SELECT public.admin_grant_entitlement(
  (SELECT id FROM public.people WHERE email = 'person@example.com'),
  'founding', now(), now() + interval '12 months',
  'Founding member', false);
COMMIT;
```

The member sees a "Founding member — premium is on us until <date>" banner and
drops to free automatically when the date passes. Note the banner now survives a
paid subscription: founding status is reported independently of whichever source
currently pays for Premium.

To revoke early, use `public.admin_revoke_entitlement(<grant_id>, '<reason>')`
rather than editing a date — revocation is recorded as revocation, and is
deliberately distinct from natural expiry. To extend, issue a new
non-overlapping grant, or replace the active one explicitly (recorded as
supersession, not revocation).

Operational queries — who currently has access, what lapses soon, and the
PII posture of each surface — are in
[`../entitlement-operations.md`](../entitlement-operations.md).

## What you never configure

- Payout schedules on club accounts — Express defaults (automatic daily) are correct; the
  platform controls timing by _when it transfers_, not by payout schedules.
- Products or prices for entries — entry line items are created dynamically per cart.
- Anything on a club's behalf inside their Express account.
