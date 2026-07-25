# Security Audit — 2026-07-17 (Stripe Money Path)

**Mode:** Full Audit (scoped: end-to-end Stripe payment code and money path)
**Checklist version:** references/checklist.md @ 84e656142
**Method:** four parallel auditors (checkout/webhook edge fns; refunds/payouts/waitlist edge fns; DB migrations/RLS; client-side payment code), all findings verified against source with file:line evidence; top findings independently re-verified.

## Summary

| Severity  | Count                     |
| --------- | ------------------------- |
| CRITICAL  | 0                         |
| HIGH      | 0                         |
| MEDIUM    | 5                         |
| LOW       | 10                        |
| **Total** | **15** (+3 informational) |

Auto-fixable: 9 of 15 findings.

**Bottom line:** the money path is in very good shape. No exploitable-by-request money-movement vulnerability was found. All amounts are computed server-side, the webhook fresh-retrieves sessions before trusting them, refunds/payouts are serialized by a per-show money lock with Stripe as the at-most-one authority, and paid-online entry fields are locked down by service-role-only DB triggers. The MEDIUMs are integrity/edge-condition gaps, not open doors.

## End-to-end map (client → edge fn → DB)

| Flow                                           | Client entry point                                                | Edge function                                      |
| ---------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------- |
| Premium subscription checkout                  | `lib/stripe.ts:7` (PricingPage, landing Pricing)                  | `stripe-checkout`                                  |
| Entry cart checkout                            | `lib/stripe.ts:45` (CartPage)                                     | `stripe-checkout`                                  |
| Single entry refund (secretary)                | `RefundEntryDialog.tsx:139`                                       | `stripe-refund-entry`                              |
| Bulk show-cancellation refund                  | `features/payments/useShowRefundAll.ts:39`                        | `stripe-refund-show`                               |
| Mail-in payment link                           | `RequestPaymentDialog.tsx:74`                                     | `stripe-payment-link`                              |
| Waitlist offer payment (secretary + exhibitor) | `useWaitlistManagementData.ts:226`, `useMyWaitlistEntries.ts:144` | `stripe-payment-link`                              |
| Decline waitlist offer                         | `useMyWaitlistEntries.ts:162`                                     | `decline-waitlist-offer`                           |
| Club bank onboarding                           | `useClubStripeAccount.ts:139`                                     | `stripe-connect-onboard`                           |
| Manage subscription                            | `SubscriptionManager.tsx:159`                                     | `stripe-customer-portal`                           |
| Payment success verification                   | `lib/stripe.ts:91` polls webhook-written `stripe_orders`          | (DB read only)                                     |
| Nightly payouts / waitlist expiry              | (cron, Vault-secret-authenticated)                                | `cron-process-payouts`, `cron-waitlist-expiration` |

`stripe-upgrade-subscription` has no client caller. All Stripe UI is hosted-redirect; `@stripe/stripe-js` is not a dependency. Charges land in the platform account (separate charges + transfers, verified in code); payouts are later `transfers.create` from the nightly cron.

## Findings

### [MEDIUM] MP-15: `enrollments` money columns writable by the enrollment owner

**Category:** RLS Policy Integrity
**Location:** `supabase/migrations/054_registrations_table.sql:70` (policy `registrations_update_own`, survives the 130 rename to `enrollments`, never dropped)
**Evidence:**

```sql
CREATE POLICY registrations_update_own ON registrations
  FOR UPDATE USING (
    handler_id IN (SELECT id FROM people WHERE auth_user_id = auth.uid())
  );
```

Only `payment_status` has a column write-guard (`110_restrict_payment_status_column.sql`). `paid_amount` (167), `total_amount`/`discount_amount` (132), `refund_amount`/`refund_notes`/`refunded_at` (176), `payment_reference` (054) have no guard.
**Risk:** an exhibitor can `PATCH` their own enrollment via PostgREST and set `paid_amount = 9999` / forge `payment_reference`. Secretary reconciliation reads these directly (`useEntryManagementData.ts:145-146`, `secretaryReadReplication.ts:213-214`) — a forged "paid" appears in staff financial views. Not money-movement: payouts/refunds key exclusively on trigger-guarded `entries.*` columns, so no funds can be extracted — but staff can be misled into treating unpaid as paid.
**Fix:** new migration adding a `BEFORE INSERT OR UPDATE` trigger on `public.enrollments` (mirror the `trg_restrict_entry_refund_columns` pattern, `SECURITY DEFINER SET search_path=''`) blocking non-service-role/non-staff writes to the seven money columns.
**Auto-fixable:** Yes

---

### [MEDIUM] MP-16: cart webhook hard-kill mid entry-creation loop leaves paid items unserved on retry

**Category:** Payment Security
**Location:** `apps/myk9show/supabase/functions/stripe-webhook/index.ts:696-762` (cart claim) and `:792-862` (creation loop)
**Evidence:** the cart is claimed (`active → submitted`) _before_ the per-item `create_online_paid_entry` loop. The Stripe-retry duplicate check only tests `entries WHERE stripe_payment_intent_id = X LIMIT 1`:

```ts
if (!intentEntries || intentEntries.length === 0) { /* duplicate-charge alert */ }
...
console.log(`Cart ${cartId} already processed (duplicate event delivery) — skipping`);
```

**Risk:** if the isolate is hard-killed (CPU/wall-clock eviction — no throw, so no alert) after creating entry 1 of 5, Stripe's retry finds ≥1 entry, logs "already processed," and returns 200. Items 2–5 are paid for but never become entries, waitlist rows, or refunds — silently. Per-item DB _errors_ are handled (auto-refund of failed lines); only the hard-kill window is exposed.
**Fix:** on the already-claimed path, compare the entry count for the intent against `cart.items.length`; on shortfall, alert (or resume creation idempotently keyed on `(payment_intent, cart_item_id)`).
**Auto-fixable:** No (recovery-semantics design choice: alert vs resume)

---

### [MEDIUM] MP-17: payment-link path can collect an amount that diverges from the `entries.entry_fee` that drives the club payout

**Category:** Payment Security
**Location:** `apps/myk9show/supabase/functions/stripe-payment-link/index.ts:306-318` (prices from authoritative show/class fee) vs `stripe-webhook/index.ts:1153-1187` (stamps payment fields but never `entry_fee`); payout pays `entries.entry_fee` (`_shared/payoutCalc.ts:24-35`)
**Evidence:** a mail-in entry stored with `entry_fee = $20` whose authoritative price at link time is $30 collects $30 (+fee) from the payer but pays the club $20 — or the reverse. The cart path is immune (`_shared/entryFromCartItem.ts:36` writes `entry_fee` from the verified charged amount).
**Risk:** collected-vs-paid-out drift on mail-in/waitlist link payments whenever the stored fee and authoritative fee disagree. No attacker control; a bookkeeping-correctness gap.
**Fix:** either price the link from `entries.entry_fee` (with a server-side floor check) or have the webhook stamp `entry_fee` to the per-line collected amount (line-item metadata already carries `entry_id`).
**Auto-fixable:** No (which value is authoritative is a product decision)

---

### [MEDIUM] MP-18: entry refund's payout-state check runs outside the show money lock

**Category:** Payment Security
**Location:** `apps/myk9show/supabase/functions/stripe-refund-entry/index.ts:160` (payout read) vs `:216` (lock acquired later); never re-checked inside the lock
**Evidence:** verified ordering — `show_payouts` status read at line 161, `acquireShowMoneyLock` at line 216. `stripe-refund-show` already re-checks payout state _inside_ the lock per intent (`stripe-refund-show/index.ts:195`).
**Risk:** narrow TOCTOU: refund reads payout `pending`, stalls; payout cron takes the lock, recomputes, transfers, completes; refund resumes, takes the now-free lock, refunds anyway. Next cron sees `completed` and early-returns — no reconcile alert. The club keeps money that was also refunded to the customer; the platform silently eats it. Window is milliseconds, but the loss is silent.
**Fix:** repeat the `show_payouts` read + `validateRefund` payout checks after the lock is acquired, mirroring `refundIntent`'s per-intent re-check.
**Auto-fixable:** Yes

---

### [MEDIUM] MP-19: money buttons missing the project's ref-based in-flight guard

**Category:** Client Auth Patterns
**Location:** `apps/myk9show/src/components/landing/Pricing.tsx:59-74` (no guard, no disabled state) and `apps/myk9show/src/pages/CartPage.tsx:139-158` (state-only `disabled={isCheckingOut}`, which lags one render)
**Evidence:** `pages/PricingPage.tsx:65-67` has `checkoutInFlightRef` with the comment "a double-click would start two checkout sessions"; the landing Subscribe button and the highest-traffic entry-checkout button lack it.
**Risk:** rapid double-click creates two live Checkout sessions. Entry cart is server-mitigated (session reuse, `stripe-checkout/index.ts:625`); the subscription path can genuinely double-subscribe (see also MP-23).
**Fix:** add `useRef` in-flight guards per the project pattern (`feedback_inflight_guard_ref`); or route the landing CTA through PricingPage's handler.
**Auto-fixable:** Yes

---

### [LOW] MP-20: refund edge functions echo raw internal error messages to callers

**Location:** `stripe-refund-entry/index.ts:360-363`, `stripe-refund-show/index.ts:412-415` — `error.message` (Stripe SDK detail incl. intent/charge ids) returned verbatim in the 500 body. Callers are authorized staff, so informational only. Fix: generic message + server-side log. **Auto-fixable:** Yes

### [LOW] MP-21: `already_stamped_elsewhere` treats any pre-existing stamp as covering the refund just created

**Location:** `stripe-refund-entry/index.ts:336-348`, `_shared/entryRefundStampGuard.ts:63-66`. If an operator manually stamped only `refund_amount` (runbook-noncompliant state) and a UI refund later creates a _fresh_ Stripe refund, the stamp UPDATE zero-rows, the re-read sees the old stamp, and the function returns 200 — the new refund has no accounting record and no alert. Fix: only return success on that branch when the refund was _reused_ (`existingRefund` non-null); otherwise fall through to `record_failure`/alert. **Auto-fixable:** No (state-model judgment)

### [LOW] MP-22: mutable module-global CORS headers race across concurrent requests

**Location:** all five CORS'd stripe functions, e.g. `stripe-checkout/index.ts:50,100` — `let _corsHeaders` reassigned per request; a concurrent request can overwrite it before the response is built. Allowlisted origins only, no credentials — worst case a blocked legit response, not a leak. Fix: request-scoped local. **Auto-fixable:** Yes

### [LOW] MP-23: subscription duplicate-checkout guard is TOCTOU-only

**Location:** `stripe-checkout/index.ts:744-760` — `subscriptions.list` pre-flight then session create; two tabs can both pass and double-bill. Downstream sync is id-specific so the wrong-sub-sync hazard is gone; the double-billing itself remains. Acceptable pre-launch; close with an idempotency key / Stripe-side cap before launch. **Auto-fixable:** No

### [LOW] MP-24: dead `handleOneTimePaymentCompleted` branch trusts payload `amount_total`

**Location:** `stripe-webhook/index.ts:1933-1962` — records unverified payload amount into `stripe_orders`; unreachable today (checkout no longer creates bare `mode:'payment'` sessions, `stripe-checkout/index.ts:182-185`). Fix: delete the branch or add the fresh-retrieve gate. **Auto-fixable:** Yes

### [LOW] MP-25: mock payment stubs still in tree (dead)

**Location:** `services/payment/PaymentService.ts:126-183` (`createPaymentIntent` returns `mock_client_secret_…`, `confirmPayment` returns `true`, hardcoded fee schedule at `:76-124`); sole consumer `hooks/usePaymentProcessing.ts` has zero callers; also unconsumed `components/cart/CartPreviewPanel.tsx`. Unreachable, but future wiring would silently fake payment success. Fix: delete. **Auto-fixable:** Yes

### [LOW] MP-26: float-dollar accumulation in financial summary displays

**Location:** `components/secretary/FinancialSummary.tsx:109-127`, `ShowFinancialSummary.tsx`, `PaymentService.ts:320-345` — summing binary-float dollars then `.toFixed(2)`; penny-off totals possible on large shows. Display-only. Related: `lib/stripe.ts:172` returns cents under the name `totalAmount`. Fix: accumulate integer cents (pattern already in `payoutLedger.ts:36-62`); rename to `totalAmountCents`. **Auto-fixable:** Yes

### [LOW] MP-27: customer portal accepts `customerId` from the request body

**Location:** `SubscriptionManager.tsx:159-163` sends it; `stripe-customer-portal/index.ts:112-130` re-derives ownership and 403s otherwise — not exploitable, just unnecessary surface (UUID probing via 404-vs-403). Fix: derive server-side from the auth user; drop the field. **Auto-fixable:** Yes

### [LOW] MP-28: `sync_enrollment_on_payment_success` deviates from the pinned-search_path convention

**Location:** `supabase/migrations/132_wire_enrollment_on_payment.sql:45` — `SET search_path = public` with unqualified refs, vs the hardened `search_path=''` + qualified pattern used by every other money function. Low practical risk. Fix: new migration rewriting the function. **Auto-fixable:** Yes

### [LOW] MP-29: policy-snapshot path can request a 0-cent refund and surface a misleading error

**Location:** `stripe-refund-entry/index.ts:199` → `_shared/refundValidation.ts:37` — 100%-retention policy yields `refundCents = 0` → `invalid_amount` (422) instead of a "nothing to refund under policy" code. No money moves; UX only. **Auto-fixable:** No (needs an error-code contract addition)

---

### Informational (no action required for go-live)

- **connect-onboard Accounts v2 TODO** — `stripe-connect-onboard/index.ts:135-140`: acknowledged migration from `type:'express'` before opening club onboarding to real users. The only TODO in any audited money path.
- **`entries_protect_payment_status` scope** — `20260705200000:27-31` keys on `payment_method='online'`; NULL/legacy methods uncovered, but no live gap (webhook/RPC always stamp `online`, payout filters on `online`).
- **Doc drift** — `_shared/entryPaymentLink.ts:117-119` claims the webhook validates `platform_fee_percent` for link sessions; only the cart path does. Harmless (link amounts fixed at creation).

## Verified solid — what the audit confirmed is rock solid

**Server-side pricing, no client-trusted amounts anywhere.** Cart items explicitly distrusted and re-priced with heal + 409 on drift (`stripe-checkout/index.ts:408-552`); webhook fresh-retrieves the session and re-verifies `amount_total` against authoritative pricing + the stamped fee rate before creating entries (`stripe-webhook/index.ts:561-683`, `_shared/freshSessionGate.ts`); subscription price ids allowlisted both ends; platform fee bounds-clamped 0–20%, integer-cents math throughout; no float money in DB (integer cents / NUMERIC only) or edge functions.

**Auth on every function.** JWT via `getUser(token)` in all five client-facing stripe fns; webhook uses `constructEventAsync` failing closed on missing secret; authorization evaluated _as the caller_ via anon-key clients calling canonical SQL predicates (`is_show_secretary`, `is_club_admin`, `is_site_admin`) — role rows, not JWT claims; club-A-secretary-cannot-touch-club-B verified, clubless-show `is_club_admin(NULL)` hole explicitly closed; bulk refund additionally requires `shows.status='cancelled'`. Cron endpoints: constant-time SHA-256 secret comparison, fail-closed on missing header _and_ missing env, Vault side raises on missing secret.

**Idempotency and races.** Cart claim latch + `stripe_orders` UNIQUEs (session id, payment intent id) + payment-link status latch with same-intent recognition + per-entry `.eq('payment_status','pending')` CAS guards; refund idempotency keys with attempt counters; per-show money lock (service-role-only, FORCE RLS, TTL steal) serializes refund-entry / refund-show / payout cron; `show_payouts` partial unique one-live-per-show + status-CAS claim + post-claim recompute + `transfers.list(transfer_group)` as at-most-one-transfer authority + reconcile-mismatch alerts; stale `processing` payouts auto-fail after 24h and retries reconcile instead of re-paying; async payment methods handled (unpaid sessions skipped via fresh-retrieve; cart checkout card-only).

**DB write-guards on the payout-critical path.** Paid-online entries: `payment_status`, `entry_fee`, `payment_method`, `stripe_payment_intent_id`, and `refund_amount/refunded_at/refund_notes` all service-role-only via triggers (migrations 20260705200000, 20260611240000/270000, 20260706184621→20260611090000), covering both UPDATE and INSERT forgery; payout calc deliberately keys on the guarded columns, not manager-writable `payment_status`. Subscription/premium self-grant blocked (`trg_restrict_subscription_columns`, `people_protect_early_adopter`). ENABLE+FORCE RLS on every money table; least-privilege GRANTs (money locks and ledger RPCs service-role-only; no anon writes anywhere); anon entry views exclude all payment columns.

**Waitlist money paths never strand money.** Promotion inserts `pending-payment` (no entry without payment) under advisory locks; expiry/decline inspect the Checkout session first, abort to reconciliation if paid, CAS-guard entry expiry, and fail closed when a session can't be expired.

**Client hygiene.** No secret material client-side (verified repo-wide); no `@stripe/stripe-js`; success pages poll webhook-written state — no client-trusted "paid" anywhere; refund UI double-gated (route role guard + server authz); error codes mapped to plain English with a dedicated Connect sanitizer.

**Recovery/observability.** Every paid-but-broken state (dashboard refunds, unmatched refunds, failed refunds, disputes, unstamped bulk refunds, payout reconcile mismatches, live/test mode mismatches) produces a persisted, deduped `operator_alerts` row before email.

## Remediation Progress — 2026-07-17

Fixed same-day as atomic `security: MP-NNN` commits on `claude/stripe-payment-review-1f7f04` (typecheck, lint, and all colocated tests green): **MP-15** (new migration `20260717120000` — trigger guard on enrollments money columns; passed migration-auditor), **MP-18** (in-lock payout re-check in stripe-refund-entry), **MP-19** (ref latches on landing Subscribe + CartPage checkout), **MP-20** (generic `refund_failed` bodies + client error-map entries), **MP-22** (request-scoped CORS threading across all seven stripe fns), **MP-24** (dead branch deleted; unexpected sessions log loudly), **MP-25** (mock stubs, usePaymentProcessing, CartPreviewPanel, and their tests deleted; PaymentService now read-only), **MP-26** (integer-cents accumulation; `totalAmountCents` rename), **MP-27** (portal customer derived from JWT; body id dropped), **MP-28** (new migration `20260717121000` — search_path re-pin).

**Deployment note:** merging does not deploy — the two migrations need `supabase db push` and the edited edge functions (`stripe-refund-entry`, `stripe-refund-show`, `stripe-checkout`, `stripe-payment-link`, `stripe-connect-onboard`, `stripe-upgrade-subscription`, `stripe-customer-portal`, `stripe-webhook`) need `supabase functions deploy --project-ref sojmvhhwsjxmfistvzbe --no-verify-jwt`.

**Still open (need product decisions):** MP-16 (cart-webhook retry recovery: alert vs resume), MP-17 (which fee value is authoritative for payment-link entries), MP-21 (stamp-guard success only on reused refunds), MP-23 (subscription duplicate-checkout idempotency), MP-29 (policy 0-cent refund error code).

## Categories Checked

| Category                                  | Files Examined           | Findings                       | Skipped                         |
| ----------------------------------------- | ------------------------ | ------------------------------ | ------------------------------- |
| RLS Policy Integrity (money tables)       | ~40 migrations           | 2 (MP-15, MP-28)               | non-money tables                |
| Edge Function Auth                        | 12 fns + _shared         | 1 (MP-22)                      | non-payment fns (covered 07-11) |
| RBAC & Privilege Escalation (money scope) | predicates + policies    | 0                              | general RBAC (covered 07-11)    |
| Client Auth Patterns (money UI)           | ~25 files                | 1 (MP-19)                      | non-payment routes              |
| Data Exposure (payment data)              | views + queries          | 1 (MP-20)                      | —                               |
| Payment Security                          | all stripe surfaces      | 8 (MP-16,17,18,21,23,24,25,29) | —                               |
| Input Validation (money inputs)           | request bodies + amounts | 1 (MP-26/27 hygiene)           | —                               |

## Previous Audit Comparison (vs 2026-07-03 money-path audit)

**Resolved (verified in current code):** MP-01 (RPC stamps `payment_method`; hardened 20260712/13 RPCs), MP-02 (`entries_protect_payment_status` trigger), MP-03 (same-intent recognition, `entryPaymentReconcile.ts:83-93`), MP-04 (livemode-scoped uniques on `stripe_customers`/`club_stripe_accounts`), MP-05 (card-only + unpaid-session skip via fresh-retrieve gate), MP-06 (`show_refund` metadata recognized; unstamped-alert backstop), MP-07 (fresh-retrieve gate on both entry paths; residual dead branch = MP-24), MP-08 (persisted deduped `operator_alerts`), MP-09 (show money lock; residual ordering window = MP-18), MP-10 (alerting + refund-reuse re-runs), MP-11/MP-12 (persisted operator alerts), MP-14 (live/test mode mismatch detection in payout cron).

**Not re-verified:** MP-13 (confirmation-email double-send) — email delivery, outside the money-movement scope of this audit.

**New findings:** MP-15 through MP-29 above. None reach HIGH; the 07-03 audit's four HIGHs are all closed.
