# Money-Path Red-Team — 2026-07-03

**Mode:** Scoped red-team (pay → refund → payout), complements the full audit [`security-audit-2026-07-03.md`](security-audit-2026-07-03.md)
**Checklist version:** references/checklist.md @ 84e656142
**Scope:** `stripe-payment-link`, `stripe-checkout`, `stripe-webhook`, `stripe-refund-entry`, `stripe-refund-show`, `cron-process-payouts`, `stripe-connect-onboard`, shared payment helpers, withdrawal-snapshot flow, payout cron, and the `entries` payment/payout write path. Focus: **idempotency, partial failures, mode-scoped IDs, secretary-facing recovery states** — not general authz (the full audit verified signatures, server-side pricing, refund capping, and portal scoping clean).

Method: three parallel red-team passes (pay / refund / payout), each given the full audit's rejected-findings ledger to avoid re-litigating vetted non-issues. The two load-bearing money-loss findings (MP-01, MP-02) were re-verified by hand against the current migrations and `payoutCalc.ts`.

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 0 |
| HIGH | 4 |
| MEDIUM | 4 |
| LOW | 6 |
| **Total** | **14** |

Auto-fixable: 11 of 14 (MP-08 and MP-11 need a small schema/surface decision; MP-14 is operational).

**Headline.** The payout *mechanism* (idempotency, partial-failure isolation, crash recovery, constant-time cron auth) and the *cart* payment flow (claim-first latch, fresh-retrieve verification, stale-session cleanup) are genuinely well-built and audit clean. All money loss concentrates in two seams:

1. **Amount integrity feeding the payout (MP-01 + MP-02, both HIGH).** The payout eligibility predicate keys on `entries.payment_status`, the one payment field with no write-guard, and `submit_show_entries` defaults every entry to `payment_method='online'`. Chained, they transfer real platform money to a club for fees that never arrived through Stripe — and MP-02 fires in the *ordinary* mail-in secretary workflow, not just under attack.
2. **The payment-link path never inherited the cart path's hardening (MP-03 + MP-04, both HIGH).** A duplicate `checkout.session.completed` delivery makes the link path auto-refund a legitimate charge, and the entire persisted-Stripe-ID layer is mode-blind, which will deterministically re-break checkout at the test→live cutover (the 2026-06-10 incident shape).

None is anonymously exploitable; MP-01/02 require a manage-show role, MP-03/04 are duplicate-delivery / operational-cutover triggered. But all four move or lose real money and should close before live-mode payouts and the first real cancellation.

---

## Findings

### [HIGH] MP-01: `submit_show_entries` silently drops `payment_method` — every RPC-created entry is stored `'online'`, so mail-in/desk entries become payout-eligible

**Category:** Payment Security / money integrity
**Location:** `supabase/migrations/182_submit_entries_add_trial_id.sql:133-161` (current definition) — `INSERT INTO public.entries (...)` omits `payment_method`; default is `'online'` (`supabase/migrations/132_wire_enrollment_on_payment.sql:25`). Client sends the real value that is then ignored: `apps/myk9show/src/services/database/entries/writes.ts:340,351`. Consumed by `apps/myk9show/supabase/functions/_shared/payoutCalc.ts:26-33`.
**Evidence (verified):** The INSERT column list is `show_id, trial_id, class_id, dog_id, handler, handler_id, entry_fee, entry_status, payment_status, submitted_at, registration_id` — no `payment_method`. `p_payment_method` is read only for the waived/`secretary_paid` authorization check (`:69`) and the `payment_status` CASE (`:156`); it is never persisted. So a mail-in **check** entry (`paymentMethod:'check'`) is stored `payment_method='online', payment_status='pending'`.
**Risk / failure scenario (operational, no malice):** (1) Secretary records a mail-in entry, selects "check" → row stored `online`/`pending`. (2) Paper check arrives; secretary marks it paid (`payment_status → 'paid'`). (3) `payoutCalc` counts it (online + paid) and the nightly cron transfers the fee from the **platform balance** to the club's connected account — for money that came in as a paper check, never through Stripe. Platform is out the cash. This also silently defeats the entire 240000/270000 payment-field-guard investment, which assumes `payment_method` reflects reality.
**Fix:** Add `payment_method` to the RPC INSERT column list, valued from the per-entry element (retain the existing waived/secretary_paid authorization check). Before go-live, audit existing `payment_method='online'` rows that have no `stripe_payment_intent_id`. Assertion-first test on the RPC return + a query asserting a `check` entry persists `payment_method='check'`.
**Auto-fixable:** Yes (INSERT column addition; the historical backfill/audit is manual).

---

### [HIGH] MP-02: `entries.payment_status` has no write-guard — a manage-show user can flip an online entry to `paid` and trigger an uncollected payout

**Category:** RBAC / money integrity (payout inflation)
**Location:** Guard gap: `supabase/migrations/20260611240000_entries_protect_payment_fields.sql:68-69` — trigger fires `before update of entry_fee, payment_method, stripe_payment_intent_id` only, **not** `payment_status`. Write path RLS is `can_manage_show(show_id)` only (`supabase/migrations/20260604004045_restrict_entries_update_to_managers.sql`). Reachable client API: `apps/myk9show/src/services/database/entries/writes.ts:44-61` (`updateEntry` does a raw `.update(arbitraryFields)`). Consumed by `payoutCalc.ts:26-33`.
**Evidence (verified):** `payoutCalc.ts:14-18` documents that the authors knew `payment_status` is *not* service-role-guarded — that is precisely why they keyed the refund *deduction* on `refund_amount` instead. But the payout **eligibility** gate is still `payment_status === 'paid' || 'refunded'` (`:28-29`) — the forgeable field. A `payment_status`-only UPDATE does not even fire the 240000 trigger (its `before update of` column list excludes it), and no entries analogue of `migration 110`'s registrations guard exists.
**Risk / failure scenario:** A secretary or club admin (`can_manage_show`) calls `updateEntry({ id, updates: { payment_status: 'paid' }})` on an `online`/`pending` entry → allowed by RLS, blocked by nothing → `calculateShowPayoutCents` now counts the full `entry_fee` → nightly cron transfers it from the platform balance to the club's `acct_…`, money no exhibitor paid. A malicious club admin self-deals (their club receives it); an honest secretary triggers it accidentally via MP-01. The cron logs a **successful** payout — no `failed` row, no alert. HIGH not CRITICAL because it requires a manage-show role.
**Fix:** Add an entries analogue of migration 110 — a `before update` trigger `when (new.payment_status is distinct from old.payment_status)` that blocks a non-`service_role` writer from moving `payment_status` into `paid`/`refunded` for a `payment_method='online'` row (desk methods `cash`/`check`/`waived`/`secretary_paid` may still be marked paid by staff). Mirror the `current_setting('role',true)='service_role'` bypass the sibling guards use. **Fix MP-01 first** — it removes the routine trigger; MP-02 closes the malicious/edge path.
**Auto-fixable:** Yes (mechanical trigger following the 240000 pattern). Migration → `migration-auditor` → confirmation-gated `db push`.

---

### [HIGH] MP-03: payment-link duplicate delivery auto-refunds a legitimate payment — same-intent "already paid" is misclassified as invalid

**Category:** Payment Security / idempotency
**Location:** `apps/myk9show/supabase/functions/stripe-webhook/index.ts:1063-1096, 1107-1111, 1157-1162, 1219-1227`; `_shared/entryPaymentUpdateReconcile.ts:52`; `_shared/entryPaymentAutoRefund.ts:30-36`
**Evidence:** The payment-link path has no up-front atomic claim — the link latch closes only *after* the per-entry patch loop. The no-op re-read (`:1108-1110`) does not select `stripe_payment_intent_id`, so a same-intent already-paid entry hits `entry.payment_status === 'paid' → alreadyPaidFromNoOp → invalidEntryIds`. With zero valid entries, `entryPaymentAutoRefund.ts:30-36` returns `full_make_whole` and refunds the entire charge (`:1219-1227`). The link-close write (`:1157-1162`) is also unchecked (error discarded).
**Risk / failure scenario:** Stripe delivers `checkout.session.completed` twice near-simultaneously (documented behavior), or an operator re-sends the event from the dashboard after a silent link-close failure. Both invocations read `link.status='open'`. Winner stamps entries paid; loser's guarded updates match 0 rows → re-read shows paid → everything classified invalid → loser issues a full make-whole refund of the whole charge and flips the winner's `stripe_orders` row to `refunded`. Exhibitor keeps paid entries **and** gets full money back; payout cron still pays the club (reads untouched `refund_amount`). Platform eats the charge, automatically, no human gate. The cart path solved this exact race with a claim-first latch + verify-first alert (`:631-697`); the link path never inherited it.
**Fix:** (a) Select `stripe_payment_intent_id` in the pre-read (`:997`) and no-op re-read (`:1110`); classify an entry whose intent equals this session's intent as paid-by-this-charge (idempotent success), never invalid. (b) Claim the link first — `update({status:'paid'}).eq('id', link.id).eq('status','open').select()` before patching; 0 rows → return (carry over the expired-promotion-revival case). (c) Check the link-close write's error. Assertion-first test: duplicate delivery must NOT call `stripe.refunds.create`.
**Auto-fixable:** Yes (Codex-review gate — refund logic).

---

### [HIGH] MP-04: Stripe customer/account IDs persisted and reused with zero mode-scoping — test→live cutover repeats the 2026-06-10 "No such customer" incident

**Category:** Payment Security / mode-scoped IDs
**Location:** `apps/myk9show/supabase/functions/stripe-checkout/index.ts:201-213, 253-256`; `stripe-customer-portal/index.ts:109-132`; `stripe-connect-onboard/index.ts:129-158`; `supabase/migrations/20260611260000_stripe_customers_unique_person_id.sql`
**Evidence:** `stripe_customers` is looked up by `person_id` and the stored `stripe_customer_id` reused blindly — no mode column, no `resource_missing` recovery. `grep -rn "livemode|live_mode|test_mode"` across all edge functions and 324 migrations returns nothing; there is no mode column on `stripe_customers`, `stripe_subscriptions`, `stripe_orders`, or `club_stripe_accounts`. The unique-`person_id` constraint guarantees one row per person regardless of mode. `exhibitor_profiles.stripe_customer_id` and `club_stripe_accounts.stripe_account_id` mirror the same unscoped ID.
**Risk / failure scenario:** Swap `STRIPE_SECRET_KEY` to live → every pre-cutover user's stored `cus_test…` is passed to `checkout.sessions.create({ customer })` → `No such customer` → 500 for every such user, permanently, no self-heal. Same break in the portal; and a stale sandbox `acct_…` with `payouts_enabled=true` survives into live mode (checkout gates still see it enabled while transfers fail). This is the exact incident shape already experienced 2026-06-10. The go-live runbook prescribes a purge (Task 6.3 step 4) as the *only* current protection — see MP-14.
**Fix:** Add `livemode boolean not null` to `stripe_customers` and `club_stripe_accounts`, derive current mode once from `stripeSecret.startsWith('sk_live')`, and scope every lookup `.eq('livemode', isLive)`. Belt-and-suspenders: catch `resource_missing` on session create → delete stale row → recreate customer.
**Auto-fixable:** Yes (migration + guarded lookup + recovery catch; contained in three files). Keep the runbook purge (MP-14) as a hard gate until this lands.

---

### [MEDIUM] MP-05: cart checkout doesn't pin `payment_method_types` and the webhook never checks `payment_status` — a delayed-notification method creates paid entries before funds settle

**Category:** Payment Security / partial failures
**Location:** `apps/myk9show/supabase/functions/stripe-checkout/index.ts:573-594`; `stripe-webhook/index.ts:412-949` (`handleEntryPaymentCompleted` never reads `session.payment_status`)
**Evidence:** The cart session is created with no `payment_method_types` (inherits whatever the dashboard enables — ACH, Cash App, Amazon Pay are one checkbox away, no deploy). The webhook never checks `payment_status`. The payment-link path already does both — pins `['card']` (`_shared/entryPaymentLink.ts:111`) and skips unpaid sessions (`entryPaymentReconcile.ts:83-85`) — so the pattern is known. The `async_payment_failed` handler even logs "entries remain pending", false for the cart path.
**Risk / failure scenario:** Dashboard enables ACH → exhibitor pays cart via ACH → `checkout.session.completed` fires `payment_status='unpaid'` → webhook creates entries `paid`/`paid` → ACH later fails → `async_payment_failed` no-ops → entries stay paid → payout cron pays the club for uncollected money. Gated only by an invisible dashboard checkbox.
**Fix:** In `handleEntryPaymentCompleted`, after the fresh retrieve (`:507`): `if (freshSession.payment_status !== 'paid') return;` (async_payment_succeeded re-drives it), and/or pin `payment_method_types: ['card']` in stripe-checkout to match the link path.
**Auto-fixable:** Yes.

---

### [MEDIUM] MP-06: `charge.refunded` webhook backstop doesn't recognize `show_refund` metadata — every bulk cancellation fires ~one false CRITICAL admin alert per payment intent

**Category:** Payment Security / secretary recovery (alert-channel integrity)
**Location:** `apps/myk9show/supabase/functions/stripe-webhook/index.ts:250-257` (app-origin allowlist) vs. `stripe-refund-show/index.ts:207` (bulk refund tags `metadata: { show_refund: showId }`)
**Evidence:** The `allFromAppRefund` allowlist recognizes `entry_id`, `entry_payment_request_auto_refund`, and `entry_cart_overflow_auto_refund` — but not `show_refund`. No `show_refund` string exists anywhere in `stripe-webhook/` (grep exit 1).
**Risk / failure scenario:** Secretary cancels a 200-entry show and runs "Refund all." Each refunded intent's `charge.refunded` falls through the allowlist → handler takes the *dashboard-reconcile* path and calls `alertAdmin('Dashboard refund needs reconciling before payout', …)` → up to ~200 false CRITICAL emails for a fully-recorded refund, possibly tripping Resend rate limits and burying the one real "refund issued but not recorded — payout will overpay" alert. No money moves (the `stripe_orders` update is correct), but the refund system's entire failure-recovery design leans on `alertAdmin` signal integrity.
**Fix:** Add `r.metadata?.show_refund` to the allowlist. Better (pairs with MP-10): when the refund carries `show_refund`, alert only when the intent's entries are *unstamped* (`refund_amount` NULL) — turning today's noise into the exact post-mortem signal MP-10 needs.
**Auto-fixable:** Yes (one-line allowlist; the smarter variant is a small function). Land jointly with MP-10.

---

### [MEDIUM] MP-07: payment-link path trusts webhook-payload `amount_total` that the cart path documents as unreliable — degrades make-whole refunds to manual and records $0 orders

**Category:** Payment Security / partial failures
**Location:** `apps/myk9show/supabase/functions/stripe-webhook/index.ts:1147, 1173, 986` vs. the cart path's fresh retrieve at `:497-508`
**Evidence:** The cart path re-retrieves the session *because* "the pinned webhook payload omits amount_total" (comment `:497-506`). The link path uses `session.amount_total` directly for refund decisions (`:1147`), the `stripe_orders` amount (`:1173`), and the no-link-record refund (`:986`).
**Risk / failure scenario:** Payload arrives without `amount_total` (older pinned endpoint version / event resend) → full-make-whole becomes `cannot_refund: missing_amount` (alert + manual refund instead of automatic) and the `stripe_orders` row is recorded `amount_cents: 0` ($0.00 in exhibitor history, broken reconciliation totals). Operational-failure only, but converts an automated money path to manual and corrupts history.
**Fix:** Mirror the cart path — `stripe.checkout.sessions.retrieve(session.id)` at the top of `handleEntryPaymentRequestCompleted` and use `fresh.amount_total` / `fresh.payment_status` throughout (also satisfies MP-05 for this path).
**Auto-fixable:** Yes.

---

### [MEDIUM] MP-08: every paid-but-broken recovery state funnels into one best-effort email; Stripe retries nothing; no admin reconciliation surface

**Category:** Data Exposure / secretary recovery
**Location:** `apps/myk9show/supabase/functions/stripe-webhook/index.ts:94-110` (`EdgeRuntime.waitUntil` → 200 before processing, so Stripe retries nothing); `_shared/alertAdmin.ts:11-13, 29-31` (silent skip when no `RESEND_API_KEY`; no retry, no queue, no persistence)
**Evidence:** Every failure branch (cart gone, claim failure, entry-stamp failure, order-insert failure, refund failure) depends solely on `alertAdmin`, which is fire-and-forget email and persists nothing queryable. `stripe_orders` powers only the exhibitor's own payment history (`apps/myk9show/src/features/payments/useMyPayments.ts`); no admin view lists orphaned/mismatched payments. Exhibitor sees `CheckoutSuccessPage` poll ~20s then "contact support" (`apps/myk9show/src/pages/CheckoutSuccessPage.tsx:193`); the secretary just sees the entry still pending.
**Risk:** A Resend outage or dropped email co-occurring with any DB failure = silently orphaned money, visible only in the Stripe dashboard, until someone reconciles by hand.
**Fix:** Persist every `alertAdmin` call to an `operator_alerts` table (service-role insert, site-admin read) in addition to email, and surface unresolved rows on an admin page. Longer-term: run the money-marking portion synchronously and 500 on pre-claim failures so Stripe's retry machinery does the work.
**Auto-fixable:** No (schema + admin-surface design decision).

---

### [LOW] MP-09: last-write race between the per-entry refund stamp and `stamp_show_refund_entries` can under-record `refund_amount` → payout overpays

**Category:** Payment Security / concurrency
**Location:** `apps/myk9show/supabase/functions/stripe-refund-entry/index.ts:220-223` (unconditional stamp, no `payment_status`/`refunded_at` predicate); `stripe-refund-show/index.ts:231-234`
**Evidence:** The show-refund plan taints intents only at plan time (`showRefundPlan.ts:78-87`); the entry-refund stamp has no guard predicate. If a partial single refund and a bulk show refund stamp the same entry with the single-refund landing last, `refund_amount` is overwritten `30` instead of `50`, and `calculateShowPayoutCents` credits the club `max(0, 5000-3000)=$20` for an entry whose payer got 100% back. Needs two authorized sessions on the same show within a seconds-wide window (common on cancellation day).
**Fix:** Guard the per-entry stamp `.eq('id', entry_id).eq('payment_status','paid').select('id')`; 0 rows updated → already stamped, log don't overwrite (letting the full-fee show stamp win is always safe).
**Auto-fixable:** Yes (guarded update + assertion-first test).

---

### [LOW] MP-10: mid-bulk termination leaves up to CONCURRENCY=5 intents refunded-but-unstamped with no alert — silent club-overpay if the secretary never re-runs

**Category:** Payment Security / partial failures
**Location:** `apps/myk9show/supabase/functions/stripe-refund-show/index.ts:27` (`CONCURRENCY = 5`), `:198-234` (refund→stamp window), `:235-258` (alert fires only on `stampError`)
**Evidence:** The only overpay alert is inside the `stampError` branch. A runtime kill (edge-fn wall-clock limit, crash) between `stripe.refunds.create` (`:206`) and the stamp RPC (`:231`) alerts no one — the process is gone — and the client gets a bare network error. Re-run is fully resumable (`findReusableShowRefund` + atomic stamp, verified), but a secretary who assumes total failure won't re-run, and the payout cron then pays the ≤5 unstamped entries' fees for money already refunded. Today this is *accidentally* covered by MP-06's noise — a naive MP-06 fix would remove that net.
**Fix:** Fix MP-06 the smart way (alert on unstamped `show_refund` intents via webhook) — that is exactly the post-mortem detector this needs and it survives the function's death.
**Auto-fixable:** Yes (jointly with MP-06).

---

### [LOW] MP-11: bulk-refund outcome detail is ephemeral — per-entry failure reasons and skipped identities are never rendered or persisted

**Category:** Data Exposure / secretary recovery
**Location:** `apps/myk9show/src/components/shows/RefundAllEntriesCard.tsx:164-183`; server returns rich per-entry data at `stripe-refund-show/index.ts:369-379`
**Evidence:** The server returns `refunded[].entryIds`, `skipped[].{entryId, reason}`, `failed[].{entryIds, error}`, but the card renders only counts, held in component `useState` (`:81`) — a reload discards even the counts. A secretary can't see *which* entries were skipped (cash/check vs already-refunded vs shared-payment need different next steps) or *why* a refund failed.
**Fix:** Render the `skipped`/`failed` arrays grouped by reason with entry links; optionally persist the run summary (e.g. a `show_refund_runs` row) so it survives reload.
**Auto-fixable:** Partially (rendering yes; persistence needs a small schema decision).

---

### [LOW] MP-12: out-of-order `charge.refunded` (before the order row exists) is dropped with a log, not an alert

**Category:** Payment Security / idempotency
**Location:** `apps/myk9show/supabase/functions/stripe-webhook/index.ts:282-285`
**Evidence:** `if (!data || data.length === 0) { console.log('… matched no order — ignoring'); return; }`. A dashboard refund issued seconds after payment, while `checkout.session.completed` is delayed, arrives first, matches no `stripe_orders` row, and is silently ignored — so the dashboard-refund reconciliation alert (`:293-303`) that protects payout math never fires. Narrow window and the runbook forbids dashboard refunds, but catching runbook violations is this handler's whole purpose.
**Fix:** `alertAdmin` (not `console.log`) when no order matches and the charge lacks app-refund metadata.
**Auto-fixable:** Yes.

---

### [LOW] MP-13: two independent confirmation-email systems; webhook path has no idempotency tracking and can double-send with the Heritage cron

**Category:** Data Exposure / idempotency
**Location:** `apps/myk9show/supabase/functions/stripe-webhook/index.ts:1591-1720`; `supabase/functions/send-confirmation-email/index.ts:443, 592, 607`
**Evidence:** The webhook's `sendEntryConfirmationEmail` neither stamps `entries.confirmation_email_sent_at` nor sends a Resend idempotency key. The Heritage cron is properly idempotent (`.is('confirmation_email_sent_at', null)` + `Idempotency-Key`), but because the webhook never stamps, a heritage-configured trial (`trials.confirmation_date` set) whose entries paid via online cart gets *both* the webhook receipt email and the Heritage confirmation email.
**Fix:** Stamp `confirmation_email_sent_at`/`status` from the webhook path too, or exclude `payment_method='online'` entries from the Heritage cron query. No money impact.
**Auto-fixable:** Yes.

---

### [LOW] MP-14: no `livemode` validation in `cron-process-payouts`; mode-purge is runbook-only

**Category:** Payment Security / mode-scoped IDs (defense-in-depth for MP-04)
**Location:** `apps/myk9show/supabase/functions/cron-process-payouts/index.ts` (no `livemode` check); purge documented at `docs/operations/stripe-platform-setup.md:196-214` (Task 6.3 step 4)
**Evidence:** No code distinguishes `livemode`; `club_stripe_accounts` has no mode column. If the go-live purge is skipped, a sandbox `acct_…` with `payouts_enabled=true` survives into live. **Fails loudly, not silently:** the live transfer is rejected, caught by the try/catch (`:366-390`), the row marked `failed` with `failure_reason`, and the admin emailed — so residual risk is a stalled first-night payout, not money loss.
**Fix:** Optional — add `livemode boolean` to `club_stripe_accounts` (stamped from the `account.updated` webhook) and have the cron skip + alert on a mode mismatch. At minimum, keep the runbook purge as a hard go-live gate (currently the sole protection).
**Auto-fixable:** No (schema + operational decision).

---

### [INFO] `refunds.list({ limit: 100 })` reuse guard reads only the first page

`stripe-refund-entry/index.ts:192-195`; `stripe-refund-show/index.ts:198`. An intent with >100 refunds could hide the reusable refund, but reaching that requires >100 sibling per-entry refunds on one cart intent — practically unreachable under the one-live-refund-per-entry model, and refund-show's `charge_already_refunded` catch bounds over-refund to zero. Adjacent to previously-rejected idempotency style points. No action urged.

---

## Verified clean

The following idempotency, partial-failure, and integrity properties were checked and confirmed correct:

**Payout mechanism**
- **No double transfer** — `transfers.list({ transfer_group: show.id })` before every `transfers.create` (`cron-process-payouts:295-296`) + partial unique index `show_payouts_one_live_per_show ... where status <> 'failed'` + status-gated `.update({status:'processing'}).eq('status','pending').select()` claim → at most one transfer per show, ever.
- **Crash between transfer and DB update is safe** — `processing` rows failed after 24h by `recoverStaleProcessing`; the retry re-hits the `transfers.list` guard and reconciles the orphan instead of re-paying.
- **Partial failures isolate + retry** — per-show try/catch; one failure marks only that row `failed` (falls outside the unique index → fresh retry next night) and emails the admin.
- **Payout amount excludes the platform fee** — `payoutCalc` sums only `entry_fee`; the 7% platform fee stays in the platform balance.
- **Refund-after-payout blocked** — `validateRefund` rejects `completed`/`processing` payout states; both refund fns re-read payout state immediately before issuing; cron recomputes the amount *after* claiming `processing`.
- **Cron auth is constant-time** — `secretMatches` SHA-256-hashes both sides and XOR-accumulates; a leaked secret only allows idempotent nuisance triggers of already-owed shows.
- **`refund_amount` forgery closed** — service-role-only on UPDATE and INSERT; payout deduction keys on it, not `payment_status`.
- **`stripe-connect-onboard` authz** — verifies `is_club_admin`/`is_site_admin` as the caller; allow-listed redirect origins; orphan Express account cleaned up on persist failure; onboarding flags only ever set from `account.updated` webhook, defaulting missing fields to `false`.

**Pay path (cart)**
- **Cart duplicate delivery** — atomic claim latch `update({status:'submitted'}).eq('status','active')` before any entry write; genuine second charge disambiguated with a verify-first alert.
- **Replayed events** — signature verified first (dual-secret); sequential replays latched by cart/link status.
- **Per-entry paid-marking** — every stamp `.eq('payment_status','pending')` + active-status filter; can't double-apply.
- **Withdrawal-snapshot failure isolation** — `stampWithdrawalSnapshot` never throws, runs after the payment write; NULL snapshot degrades to fully-manual refund by design; money state provably unaffected.
- **Payment-field forgery blocked** — `entries_protect_payment_fields` locks `entry_fee`/`payment_method`/`stripe_payment_intent_id` (the gap is `payment_status`, MP-02).
- **Capacity-gate entry creation** — `create_online_paid_entry` re-verifies class→show/trial membership and takes the judge-day advisory lock; service-role-only.

**Refund path**
- **Client double-submit** — `inFlightRef` + disabled buttons on both single and bulk.
- **Concurrent same-entry refunds** — shared Stripe idempotency key `refund-entry-{id}-0`; same params dedupe, different amounts error.
- **refund-show run twice** — stamped entries classify `already_refunded` and skip; refunded-but-unstamped intents reuse via `metadata.show_refund`; resumable, never double-refunds.
- **Per-intent stamp atomicity** — `stamp_show_refund_entries` is a single UPDATE over the id array, service-role-only.
- **Cumulative partials can't exceed the charge** — single-refund-per-entry model; amount capped ≤ server-read `entry_fee`; recorded amount is Stripe's `refund.amount`.
- **Bulk refund gated on deliberate cancellation** — server requires `shows.status === 'cancelled'`; UI enforces a two-step with an `// INTENT` guard.
- **Cross-show cart intents never bulk-refunded** — paginated scan, fail-safe skip on read error.

---

## Recommended remediation order

1. **MP-01 → MP-02** (money out for uncollected fees; MP-01 first removes the routine trigger). Small migrations, `migration-auditor` + Codex + confirmation-gated `db push`.
2. **MP-03** (wrongful full auto-refund on duplicate delivery). Edge-fn fix, Codex-review gate.
3. **MP-04** + **MP-14** (mode-scoped IDs — must land before live-mode cutover; keep the runbook purge as the interim gate).
4. **MP-06 + MP-10** together (alert-channel integrity + the missing mid-bulk-kill signal — one webhook change).
5. **MP-05, MP-07** (delayed-notification + payload-amount hardening — often one fresh-retrieve change per path).
6. **MP-08** (operator_alerts persistence + admin surface — schema decision; also feeds the go-live runbook).
7. **MP-09, MP-11, MP-12, MP-13** (hygiene; batch with the above).

All fixes are assertion-first (write the `toHaveBeenCalledWith`/DB-state assertion red first). Migrations go through `migration-auditor` before `db push`; every edge-fn/RLS change gets `/codex:review` alongside `/review`. Redeploy affected Stripe functions only after the schema is live.
