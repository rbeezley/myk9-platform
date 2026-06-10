# Stripe Connect Payouts & Refund Automation — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.
> Design doc (read first): [2026-06-09-stripe-payments-revision-design.md](2026-06-09-stripe-payments-revision-design.md)

**Goal:** Clubs receive entry-fee money automatically via Stripe Connect Express transfers after each show, and secretaries issue capped one-click refunds, replacing manual settlement and dashboard refunds.

**Architecture:** Separate charges and transfers — the shipped checkout keeps collecting to the platform account; a daily pg_cron job transfers each closed show's online entry fees (minus refunds, never the 3% platform fee) to the club's Express account 3 days after show end. Refunds before payout are plain Stripe refunds keyed off a new `entries.stripe_payment_intent_id` column; refunds after payout are blocked in v1.

**Tech stack:** Supabase edge functions (Deno) in `apps/myk9show/supabase/functions/`, pg_cron + pg_net (already enabled, migrations 193/194), Stripe Node SDK, React Query + shadcn/ui, vitest.

**Conventions that bind every phase:**

- Money assertions are written FIRST and run red (`expect(stripe.transfers.create).toHaveBeenCalledWith(...)`) per CLAUDE.md assertion-first rule.
- Every new table gets explicit `GRANT`s + RLS (Supabase no longer auto-exposes `public` tables).
- `supabase db push` and `supabase functions deploy` are shared-system mutations — confirm with Richard before each (Auto Mode rule).
- Run `supabase migration list` before creating any migration file; use timestamp naming (`YYYYMMDDHHMMSS_description.sql`) matching recent migrations.
- Run the `migration-auditor` agent on every migration before push.
- Commit at the end of every task; `pnpm typecheck` + relevant tests must pass first.

---

## Phase 0 — Stripe dashboard prep (manual, Richard) — MOSTLY COMPLETE 2026-06-09

No code. Blocks Phases 3–5; Phases 1–2 can proceed in parallel with it.
[ADDED] Click-by-click version with current-state checks: [docs/operations/stripe-platform-setup.md](../operations/stripe-platform-setup.md).

> Done 2026-06-09: sandbox `myK9Show dev` created; platform-scoped webhook
> destination (7 events) live and proven end-to-end (`stripe trigger invoice.paid`
> → 200 OK); all four secrets set (sandbox sk_test now replaces the live key on
> staging); stray live self-subscription cancelled. Remaining: enable Connect in
> the sandbox (Express + platform profile), branding "Myk9t" → "myK9Show".
> Phase 3 adds the Connected-accounts destination + `STRIPE_CONNECT_WEBHOOK_SECRET`.

1. Stripe Dashboard → Settings → Connect: enable Connect, choose **Express**, set branding.
2. Existing webhook endpoint (`.../functions/v1/stripe-webhook`): add events `account.updated`, `account.application.deauthorized`, `charge.refunded`.
3. Set secrets (test mode first):
   ```bash
   supabase secrets set PLATFORM_FEE_PERCENT=3
   supabase secrets set PAYOUT_CRON_SECRET=$(openssl rand -hex 32)
   ```
   Record the `PAYOUT_CRON_SECRET` value — Phase 5's cron migration embeds it as a literal (pattern: migration 194).

---

## Phase 1 — Schema migration ✅ COMPLETE (pushed 2026-06-09)

> Shipped as `20260609120000_stripe_connect_payouts.sql`. Audit found one blocker
> (zero-arg `is_show_secretary()` would have leaked payouts cross-show — fixed with
> the show-scoped overload from migration 163) plus `updated_at` on `show_payouts`.
> Verified live: both tables 200 (not 404) via Data API, anon sees zero rows.

### Task 1.1: Write the migration

**Files:**
- Create: `supabase/migrations/<timestamp>_stripe_connect_payouts.sql`

Pre-checks (CLAUDE.md migration rules):
- `supabase migration list` — confirm remote state, pick timestamp after the latest.
- [VERIFIED 2026-06-09] The canonical RLS predicate is `has_role(name, club_id)` (used in migrations 009/016/049); role names `club_admin`, `show_secretary`, `trial_secretary`, `platform_admin` are seeded (migration 009). Use `has_role('club_admin', club_stripe_accounts.club_id)` in the policies below instead of the inline `EXISTS` sketches — confirm the helper's exact signature in migration 009 before writing.

```sql
-- Stripe Connect: club Express accounts + per-show payout tracking.
-- Design: docs/plans/2026-06-09-stripe-payments-revision-design.md

BEGIN;

CREATE TABLE public.club_stripe_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL UNIQUE REFERENCES clubs(id) ON DELETE CASCADE,
  stripe_account_id TEXT NOT NULL UNIQUE,
  onboarding_complete BOOLEAN NOT NULL DEFAULT false,
  payouts_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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

-- At most one live (non-failed) payout per show; failed rows allow retry rows.
CREATE UNIQUE INDEX show_payouts_one_live_per_show
  ON public.show_payouts(show_id) WHERE status <> 'failed';

CREATE INDEX show_payouts_status_idx ON public.show_payouts(status);

-- Per-entry refund key, stamped by stripe-webhook at entry creation.
ALTER TABLE public.entries
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT;

-- Grants: read for clients, all writes via service_role edge functions.
GRANT SELECT ON public.club_stripe_accounts TO authenticated;
GRANT SELECT ON public.show_payouts TO authenticated;
GRANT ALL ON public.club_stripe_accounts TO service_role;
GRANT ALL ON public.show_payouts TO service_role;

ALTER TABLE public.club_stripe_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_stripe_accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.show_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.show_payouts FORCE ROW LEVEL SECURITY;

-- ADAPT: replace the EXISTS clauses with the repo's canonical club-admin
-- predicate found in the pre-check survey.
CREATE POLICY club_stripe_accounts_club_admin_read
  ON public.club_stripe_accounts FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid()
        AND ur.club_id = club_stripe_accounts.club_id
        AND r.name IN ('club_admin')
    )
  );

CREATE POLICY show_payouts_club_read
  ON public.show_payouts FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM shows s
      JOIN user_roles ur ON ur.club_id = s.club_id
      JOIN roles r ON r.id = ur.role_id
      WHERE s.id = show_payouts.show_id
        AND ur.user_id = auth.uid()
        AND r.name IN ('club_admin', 'show_secretary')
    )
  );

COMMIT;
```

### Task 1.2: Audit and push

1. Run the `migration-auditor` agent on the file. Fix findings.
2. **Confirm with Richard**, then push per `/db-push` skill (password from `supabase/.env`).
3. Verify: `club_stripe_accounts` and `show_payouts` return empty arrays (not 404) via authenticated supabase-js query.
4. Commit: `feat(db): stripe connect accounts + show payouts tables`

---

## Phase 2 — Fee config + payment-intent stamping ✅ COMPLETE (deployed 2026-06-09)

> Shipped: `_shared/platformFee.ts` + `_shared/entryFromCartItem.ts` (15 red-first
> tests, vitest include extended), env-driven fee in stripe-checkout, intent
> stamping + atomic cart-claim idempotency in stripe-webhook. Deployed to the
> unified project with `--workdir apps/myk9show` (CLI otherwise resolves the root
> supabase dir). Deviation: the duplicate-delivery guard is enforced by the atomic
> DB claim and verified in Phase 6 E2E, not a unit test — the Deno handler can't
> be imported under vitest (jsr:/npm: specifiers). Discovered live: unified
> stripe-webhook 500s pending STRIPE_WEBHOOK_SECRET (Phase 0); old project
> eergfbehjghvfqvzkhsu still hosts stale healthy copies.

### Task 2.1: Configurable platform fee (assertion-first)

**Files:**
- Create: `apps/myk9show/supabase/functions/_shared/platformFee.ts`
- Create: `apps/myk9show/supabase/functions/_shared/platformFee.test.ts`
- Modify: `apps/myk9show/supabase/functions/stripe-checkout/index.ts` (~line 341, `const platformFeePercent = 3`)

Pure module (no Deno imports, so vitest can run it):

```typescript
export function calculatePlatformFeeCents(subtotalCents: number, percent: number): number {
  if (subtotalCents <= 0 || percent <= 0) return 0;
  return Math.round((subtotalCents * percent) / 100);
}

export function resolvePlatformFeePercent(envValue: string | undefined): number {
  const parsed = Number(envValue);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 20 ? parsed : 3;
}
```

Test first, red, then implement: fee math (rounding, zero subtotal), env resolution (unset → 3, garbage → 3, "5" → 5, out-of-range → 3). Check `apps/myk9show/vitest` include globs cover `supabase/functions/**/*.test.ts`; if not, extend the config in this task.

In `stripe-checkout`, replace the constant with:

```typescript
const platformFeePercent = resolvePlatformFeePercent(Deno.env.get('PLATFORM_FEE_PERCENT'));
```

### Task 2.2: Stamp `stripe_payment_intent_id` on entries

**Files:**
- Modify: `apps/myk9show/supabase/functions/stripe-webhook/index.ts` (entry-creation insert, ~line 157)

In `checkout.session.completed` (entry path), `session.payment_intent` is available. Add it to the entry insert object. Extract the insert-row construction into a pure builder in `_shared/entryFromCartItem.ts` and assert (red first) that the built row includes `stripe_payment_intent_id: 'pi_test_123'`.

**[ADDED — VERIFIED PRE-EXISTING BUG] Make entry creation idempotent.** `handleEntryCheckout` currently fetches the cart with no status filter and creates entries unconditionally; the function 200s Stripe before processing (`EdgeRuntime.waitUntil`), so a duplicate event delivery silently creates duplicate paid entries — which the Phase 5 payout calc would then pay the club for twice. Fix in this task: bail out early if `cart.status !== 'active'` (the handler already sets `'submitted'` on completion, making the status the idempotency latch), and log loudly when entry insertion fails after a successful payment since Stripe will never retry (it already received the 200). Test red-first: handler invoked twice with the same event creates entries exactly once.

### Task 2.3: Deploy + commit

1. `pnpm typecheck`, run the new tests.
2. **Confirm with Richard**, then `supabase functions deploy stripe-checkout stripe-webhook --no-verify-jwt`.
3. Commit: `feat(payments): env-configurable platform fee + payment intent stamping`

---

## Phase 3 — Club Connect onboarding ✅ COMPLETE (deployed + proven 2026-06-09)

> Shipped: stripe-connect-onboard (RBAC via is_club_admin/is_site_admin RPCs as
> caller, both capabilities, open-redirect-safe paths), webhook account handlers
> + dual-secret verification (proven live: Connect-scoped account.updated → 200
> after secret fix), /club-admin/payments page + ClubPaymentsCard (5 states,
> pre-flight checklist with INTENT comment), publish gate on ShowStatusPill (both
> render sites) + EditShowDialog. 19 tests. NOTE: club settings page didn't exist —
> Richard chose a new /club-admin/payments route (sidebar: My Club → Payments).
> 'published' is the entries-open status; the gate fires on draft→published only.
> Both destinations pinned to API version 2020-03-02 (deliberate consistency).

### Task 3.1: `stripe-connect-onboard` edge function

**Files:**
- Create: `apps/myk9show/supabase/functions/stripe-connect-onboard/index.ts`

Behavior (model auth/CORS on the existing `stripe-customer-portal`):
1. Authenticated caller; body `{ club_id, return_path }`.
2. Verify caller is club admin for `club_id` (same RBAC check pattern the RLS policy uses — query `user_roles`).
3. Look up `club_stripe_accounts` by `club_id`. If none: `stripe.accounts.create({ type: 'express', capabilities: { card_payments: { requested: true }, transfers: { requested: true } }, metadata: { club_id } })`, upsert row (service role). [ADDED] The `transfers` capability is required for Phase 5's `transfers.create` — and [VERIFIED 2026-06-09 in sandbox] Stripe rejects `transfers`-only requests (`capabilities_cannot_have_transfers_without_card_payments_unless_payee`); platforms must request BOTH `card_payments` + `transfers` unless specially approved. Clubs never use card_payments; the money flow is unchanged. Test club for E2E: `acct_1TgaoXPQKr1pkcBI` (created via Workbench shell, pre-onboarding state).
4. `stripe.accountLinks.create({ account, refresh_url, return_url, type: 'account_onboarding' })` — both URLs point at the club settings page with `?connect=refresh|return`.
5. Return `{ url }`.

### Task 3.2: Webhook Connect handlers

**[ADDED 2026-06-09 — discovered during Phase 0]** Stripe's event-destination scopes
route `account.updated` / `account.application.deauthorized` only to a **Connected
accounts**-scoped destination, which has its **own signing secret**. This task must:
(1) add `STRIPE_CONNECT_WEBHOOK_SECRET` and verify incoming signatures against
either secret (try platform secret, fall back to Connect secret); (2) have Richard
create the second destination (Connected accounts scope, those 2 events, same URL)
and set the new secret. The platform-scoped destination (7 events) already exists
("myK9Show platform events", `we_1TgaTwAlej2Q9UtXU9GMVbQA`).

**[ADDED] Webhook payloads are pinned to API version 2020-03-02** (account default,
not changeable per destination; same pin will apply in live mode, so code must
handle it — do NOT upgrade only the sandbox's version, that would diverge from
live). One field gap found: checkout sessions in that version lack `amount_total`
→ in `handleEntryPaymentCompleted`, write `stripe_orders.amount_cents` from
`session.amount_total ?? cart.total_cents` (cart already snapshots the total).
Fold into this task's webhook edit + deploy.

**Files:**
- Modify: `apps/myk9show/supabase/functions/stripe-webhook/index.ts`
- Create: `apps/myk9show/supabase/functions/_shared/connectAccountMapper.ts` + test

Pure mapper, assertion-first:

```typescript
export function accountToRowPatch(account: {
  details_submitted?: boolean;
  payouts_enabled?: boolean;
}): { onboarding_complete: boolean; payouts_enabled: boolean } {
  return {
    onboarding_complete: account.details_submitted === true,
    payouts_enabled: account.payouts_enabled === true,
  };
}
```

Wire `account.updated` → update row by `stripe_account_id` with the patch; `account.application.deauthorized` → set both flags false.

### Task 3.3: Club settings Payments card

**Files:**
- Locate the club settings page: `grep -rn "club" apps/myk9show/src --include="*.tsx" -l | grep -i "setting"` (one concern, one page — this is a card on the existing page, not a new page).
- Create: `apps/myk9show/src/features/payments/ClubPaymentsCard.tsx` (+ colocated test)
- Create: `apps/myk9show/src/features/payments/useClubStripeAccount.ts` (React Query read of `club_stripe_accounts`; direct Supabase read is acceptable here — admin config, not offline-critical show-day data)

States: not connected (button → invoke `stripe-connect-onboard`, redirect to returned URL) / onboarding incomplete (resume button) / payouts enabled (green badge) / deauthorized (reconnect prompt). [ADDED] Plus the invoke-failure state: if `stripe-connect-onboard` errors (Stripe down, RBAC denial), show an inline error with retry — never a silent dead button. Handle `?connect=return` by refetching. Component test with the custom render from `src/test/utils/testUtils.tsx` covering all five states.

**[ADDED] Pre-flight "What you'll need" step.** The audience is retired, non-technical club volunteers; the #1 failure mode is being dumped into Stripe's form without the required info, abandoning halfway. The connect button does NOT redirect immediately — it first shows a checklist step (inline expansion or dialog) the treasurer reads before continuing:

1. Your club's EIN (on the club's tax paperwork)
2. The club's legal name and mailing address
3. One of the club's checks (for the bank routing and account numbers) — **use the club's bank account, not a personal one**
4. The treasurer's own name, date of birth, home address, and last 4 of their Social Security number

With this reassurance copy, verbatim or close: *"Stripe is required by federal banking law to verify the identity of the person opening the account. myK9Show never sees or stores this information."* And a time-set: *"About 10 minutes. You can safely stop and resume later."* The "Continue to Stripe" button at the bottom does the actual redirect. Component test: checklist renders before any redirect; redirect only fires from the continue button. (`// INTENT:` comment on the step — it exists to pre-answer the SSN fear and prevent mid-form abandonment; do not collapse it into a direct redirect.)

### Task 3.4: Online-entry gate

**Files:**
- Locate where a show enables online entries (grep `accepting_entries` / entry settings UI).
- Add: banner + disabled toggle when `!payouts_enabled` for the show's club, linking to the Payments card. Applies only when newly enabling — existing accepting-entries shows are untouched.
- Test: gate logic as a pure predicate (`canEnableOnlineEntries(clubAccount)`) + unit test.

### Task 3.5: Deploy + commit

`pnpm typecheck && pnpm lint`, tests green; **confirm**, deploy `stripe-connect-onboard` + `stripe-webhook`; commit `feat(payments): club stripe connect onboarding`.

---

## Phase 4 — Secretary one-click refunds ✅ COMPLETE (pushed + deployed 2026-06-09)

> Shipped: refundValidation (10 red-first tests; allows refunds during
> pending/failed payouts, blocks processing/completed), stripe-refund-entry
> (RBAC via 3 RPCs, entry-scoped idempotency, entry_id metadata), charge.refunded
> backstop, RefundEntryDialog chained off Withdrawn + row action. Migration
> 20260609220000 adds entries.refund_* + write-guard trigger (auditor blocker:
> managers' full-row UPDATE could forge refunds via PostgREST).
> SCHEMA-REALITY FIXES folded in: Feb webhook insert targeted nonexistent
> columns (entry_fee_cents/source/notes) — corrected to entry_fee dollars +
> payment_method='online' + special_requests; migration 176's refund columns
> are on ENROLLMENTS (desk refunds), entries needed their own. Phase 5 payout
> calc MUST use payment_method='online' and entry_fee*100, not the plan's
> original source/entry_fee_cents references.

### Task 4.1: `stripe-refund-entry` edge function (assertion-first)

**Files:**
- Create: `apps/myk9show/supabase/functions/stripe-refund-entry/index.ts`
- Create: `apps/myk9show/supabase/functions/_shared/refundValidation.ts` + test

Write these tests RED first against the pure validator:

```typescript
// cap: requested > entry fee → clamped/rejected
expect(validateRefund({ entryFeeCents: 5000, requestedCents: 6000, ... }).error).toBe('amount_exceeds_fee');
// platform fee never refunded: full refund of a $50 entry = exactly 5000
expect(validateRefund({ entryFeeCents: 5000, requestedCents: undefined, ... }).amountCents).toBe(5000);
// post-payout block
expect(validateRefund({ ..., payoutStatus: 'completed' }).error).toBe('payout_already_sent');
// only paid online entries
expect(validateRefund({ ..., paymentStatus: 'refunded' }).error).toBe('not_refundable');
expect(validateRefund({ ..., source: 'manual' }).error).toBe('not_online_payment');
// [ADDED] entries with no Stripe key (pre-rollout rows, desk payments) are not refundable
expect(validateRefund({ ..., stripePaymentIntentId: null }).error).toBe('missing_payment_intent');
```

**[ADDED] One refund per entry in v1 — intended behavior, state it in the dialog.** A partial refund still sets `payment_status='refunded'`, so a second refund of the same entry is rejected (`not_refundable`), and the entry-scoped idempotency key enforces the same at the Stripe layer. The dialog copy must say the amount is final ("Refunds can only be issued once per entry"). Multi-step refunds are future work.

Function flow: authenticate → verify secretary/club-admin for the entry's show → load entry + any non-failed `show_payouts` row → `validateRefund` → `stripe.refunds.create({ payment_intent, amount }, { idempotencyKey: `refund-entry-${entry_id}` })` → update entry: `refund_amount` (dollars, matching migration 176's NUMERIC), `refunded_at`, `refund_notes`, `payment_status = 'refunded'`. Assert the exact Stripe call: `toHaveBeenCalledWith({ payment_intent: 'pi_x', amount: 5000 }, { idempotencyKey: 'refund-entry-<id>' })`.

### Task 4.2: `charge.refunded` reconciliation backstop

**Files:**
- Modify: `apps/myk9show/supabase/functions/stripe-webhook/index.ts`

Dashboard-issued refunds can't be attributed to a single entry (one payment intent covers a whole cart), so the backstop is deliberately conservative: mark the matching `stripe_orders` row refunded and log a warning naming the payment intent for manual entry-level reconciliation. Skip silently if the refund originated from `stripe-refund-entry` (check refund metadata — set `metadata: { entry_id }` in Task 4.1 and match on it). Idempotent: re-delivery of the event is a no-op.

### Task 4.3: Refund dialog in Entries Management

**Files:**
- Modify: `apps/myk9show/src/hooks/useEntryManagementActions.ts` (Withdrawn flow)
- Modify: `apps/myk9show/src/components/entries/management/EntryListCard.tsx` (row action)
- Create: `apps/myk9show/src/components/entries/management/RefundEntryDialog.tsx` + test

When the secretary selects Withdrawn on a paid online entry, after the status change offer the refund dialog (skip entirely for cash/check/waived entries). Dialog: full (default, shows `$XX.XX` from `entry_fee_cents`) or partial input, capped client-side too; in-flight guard via `useRef` per the established pattern; on success write nothing client-side — refetch entry (the function already updated it). Error states: post-payout block message, Stripe failure with retry.

Component test: full-refund path asserts the function invocation payload (`supabase.functions.invoke('stripe-refund-entry', { body: { entry_id, amount_cents: undefined } })`).

### Task 4.4: Deploy + commit

Tests green, **confirm**, deploy `stripe-refund-entry` + `stripe-webhook`; commit `feat(payments): secretary one-click entry refunds`.

---

## Phase 5 — Automated payouts

### Task 5.1: Payout calculation (assertion-first, pure)

**Files:**
- Create: `apps/myk9show/supabase/functions/_shared/payoutCalc.ts` + test

```typescript
interface PayoutEntry {
  entry_fee_cents: number;
  source: string;
  payment_status: string;
}

export function calculateShowPayoutCents(entries: PayoutEntry[]): number {
  return entries
    .filter(e => e.source === 'online' && e.payment_status === 'paid')
    .reduce((sum, e) => sum + e.entry_fee_cents, 0);
}
```

Tests RED first: mixed methods (cash/check/waived/secretary_paid excluded), refunded entries excluded (`payment_status='refunded'`), empty list → 0, multi-trial show entries all counted. Platform fee never appears — it was a separate line item, not part of any `entry_fee_cents`.

### Task 5.2: `cron-process-payouts` edge function

**Files:**
- Create: `apps/myk9show/supabase/functions/cron-process-payouts/index.ts`

1. Guard: reject unless `x-function-secret` header equals `PAYOUT_CRON_SECRET` (pattern: migration 194 / heritage cron — do NOT rely on bearer JWT or `app.settings` GUCs, see memory `project_trigger_push_guc_unset`).
2. Query shows: `end_date + 3 days <= today`, status in (`completed`, `closed`), no non-failed `show_payouts` row, ≥1 paid online entry.
3. Per show: load entries (id, fee, source, payment_status) via service role → `calculateShowPayoutCents` → look up club's `club_stripe_accounts`.
   - No account or `!payouts_enabled` → insert `show_payouts` as `pending`, send nudge email to club admin via existing `send-email` function; continue.
   - Else insert as `processing` → `stripe.transfers.create({ amount, currency: 'usd', destination: stripe_account_id, transfer_group: show_id, metadata: { show_id } }, { idempotencyKey: `show-payout-${show_id}` })` → update row `completed` + `stripe_transfer_id` + `completed_at`, email the club a payout summary.
   - Stripe error → row `failed` + `failure_reason` (next run inserts a fresh row — the partial unique index permits it). [ADDED] An **insufficient-available-balance** failure is *expected and benign* when entries were paid on show day (card funds take ~2 business days to clear into available balance); the daily retry self-heals it. Name this in `failure_reason` mapping and in the admin alert email so it doesn't read as an incident.
3b. **[ADDED — found in Phase 4] Recompute `amount_cents` when sending a `pending` row.** Refunds are allowed while a payout row is `pending` (club not onboarded; money still platform-side), so a pending row's stored amount can go stale. When the cron picks up a pending row to transfer, it must recompute the sum from entries at that moment and update the row — never trust the figure stored at creation.

4. **[ADDED] Stale-`processing` recovery (run this FIRST each invocation).** A crash between `transfers.create` and the row update leaves a row stuck `processing`, and the unique index would block retries forever. At run start, mark `processing` rows older than 24h as `failed` with `failure_reason='stale_processing'`. The retry is safe even if the original transfer actually went through: the per-show idempotency key makes Stripe return the existing transfer, and the retry path records its `stripe_transfer_id`.
5. **[ADDED] Platform-admin failure alert.** Any row entering `failed` (including `stale_processing`) emails the platform admin (Richard) via `send-email` with show name, amount, and `failure_reason` — club nudges alone leave the platform blind to broken payouts. Test: failed-transfer path asserts the admin email invocation.
6. Assert the exact transfer call in tests (mocked Stripe), and that a second run over the same shows creates no second transfer (unique-index conflict path handled gracefully). [EXPANDED] Add: stale-processing row is failed then successfully retried on the following run, recording the idempotent transfer's id.

### Task 5.3: Cron schedule migration

**Files:**
- Create: `supabase/migrations/<timestamp>_payout_cron.sql`

Follow migration 194 verbatim pattern: `cron.schedule('process-show-payouts', '0 10 * * *', ...)` → `net.http_post` to the hardcoded function URL with `x-function-secret: <PAYOUT_CRON_SECRET literal>`. pg_cron/pg_net already enabled by 193 — no extension changes. Audit with `migration-auditor`, **confirm**, push.

[ADDED] **De-risk option (recommended): hold this migration until after the first live payout.** Everything else can deploy with the cron unscheduled; the first real show's payout is then triggered manually (`curl` with the secret header), the transfer verified in the Stripe dashboard against a hand-calculated expected amount, and only then is the schedule pushed. Automation should inherit trust from a verified manual run, not be granted it upfront.

### Task 5.4: Payout history in Payments card

**Files:**
- Modify: `apps/myk9show/src/features/payments/ClubPaymentsCard.tsx`

Table of `show_payouts` for the club's shows (show name, amount, status, date). Pending rows with no connected account show the connect nudge inline. Empty state: "Payouts appear here after your first show closes."

### Task 5.5: Deploy + commit

Tests green, **confirm**, deploy `cron-process-payouts`; commit `feat(payments): automated show payouts via stripe connect transfers`.

---

## Phase 6 — End-to-end verification + docs

### Task 6.1: Stripe test-mode E2E checklist (manual, with Richard)

1. Onboard a test club through Express (use Stripe's test onboarding data) → card shows payouts enabled. [ADDED] **Screenshot every Stripe screen during this walkthrough** — they feed Task 6.4's printable guide.
2. Pay a 2-entry cart with `4242 4242 4242 4242` → entries created with `stripe_payment_intent_id`; cart shows 3% fee line.
3. Withdraw one entry → refund dialog → verify refund in Stripe dashboard, `refund_amount`/`refunded_at` set, `payment_status='refunded'`.
4. Set the test show's `end_date` 4 days back, invoke `cron-process-payouts` manually with the secret header → transfer appears in dashboard for the NON-refunded entry's fee only; `show_payouts` row `completed`; second manual invoke creates nothing.
5. Attempt refund on the paid-out entry → blocked with the settle-directly message.

### Task 6.2: Suite + docs sync

1. `pnpm typecheck && pnpm lint`; `cd apps/myk9show && pnpm test` (respect the known hanging-test caveat — report, don't loop).
2. `OPEN-TODOS.md`: add/close payout items; note the wait-list Phase 7 (promotion payment) can now build on `stripe-checkout` + this infrastructure.
3. Confirm the January design doc carries its superseded banner.
4. Commit: `docs: stripe connect rollout notes`; open PR for the whole branch (main is PR-only).

### Task 6.3: Go-live cutover checklist (manual, Richard) [ADDED]

Everything above runs in Stripe **test mode**. Before the first real show accepts money:

1. Enable Connect (Express) in **live mode** — the dashboard setting is per-mode.
2. Add the live webhook endpoint with the same event list; update `STRIPE_WEBHOOK_SECRET` to the live signing secret.
3. Swap `STRIPE_SECRET_KEY` / publishable key to live values (`supabase secrets set` + frontend env).
4. Re-set `PLATFORM_FEE_PERCENT` and verify `PAYOUT_CRON_SECRET` carried over (secrets are per-project, not per-mode — verify, don't assume).
5. Smoke test: one real low-value entry payment + refund on a test show before announcing.
6. [ADDED] **Concierge-onboard the first 3–4 clubs personally**: get on the phone with each treasurer and walk the Stripe form together. Ten minutes per club, and it doubles as usability testing for the Task 6.4 guide — note every place a treasurer hesitates and fix the guide there.

### Task 6.4: Printable club onboarding guide [ADDED]

**Files:**
- Create: `docs/guides/club-payment-setup-guide.md`

A one-page, hand-it-to-the-treasurer walkthrough with the Task 6.1 screenshots: one screenshot per Stripe screen, the four-item "have these ready" list, the SSN reassurance paragraph, and "if you get stuck" contact info. Written for a reader who prints it out — number every step, no jargon, no URLs to retype (the journey starts from the button in myK9Show). Apply the writing-concisely skill. Link it from the pre-flight checklist step ("Print these instructions") and from `docs/roles/` club documentation.

---

## Out of scope (do not build in this plan)

Exhibitor self-service refunds; post-payout refunds/transfer reversals; annual subscription tier; any change to offline desk payments or the wait-list promotion flow.

[ADDED] **Cancelled shows:** the cron's status filter (`completed`, `closed`) already guarantees a cancelled show's money never transfers — funds stay on the platform balance. v1 refund path for a cancelled show is the secretary issuing per-entry refunds through the Task 4.3 dialog (post-payout block never triggers, since no payout exists). A bulk "refund all entries" action is future work; if a show with dozens of paid entries cancels before that exists, it's dialog-clicking, not data loss.
