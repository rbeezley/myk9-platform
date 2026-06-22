# Entry Payment, Waitlist & Capacity — payment links, pay-to-claim, judge-day capacity

> **Status:** Active

> **Scope note:** Started as "secretary payment link + refund parity"; grew (via design review with the owner, 2026-06-20) to cover the full unpaid-entry → payment story: secretary payment links, waitlist pay-to-claim with auto-cascade, and judge-day capacity gating with self-service split checkout. These are sequenced phases of one coherent payment/waitlist workflow, not separate features.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This touches payment/Stripe code — run `/codex:review` alongside `/review` before merge.

**Goal:** Give a secretary one button — **"Request payment"** — that generates a Stripe-hosted payment link for an existing _unpaid_ entry, sends it to the exhibitor, and lets the existing `stripe-webhook` reconcile the payment back onto that entry. This single primitive closes two gaps at once:

- **Scenario 3 (mailed-in card):** A secretary keys a mail-in entry as `payment_status='pending'` and needs to collect a card payment without keying the card themselves (no PCI exposure, no paper-card handling — Codex's recommended Option 1).
- **Waitlist promotion (gap 9) → pay-to-claim:** Promotion (`promote_waitlist_entry`, migration 114) creates an `entry_status='pending-payment'` entry and collects nothing today, so an unpaid spot sits forever. The fix ties the offer to the payment link: **paying = claiming** (flips it to paid+confirmed), and if the exhibitor doesn't pay before `waitlist_payment_deadline_hours`, the _already-existing_ `cron-waitlist-expiration` drops it (`promotion-expired`) and cascades the spot to the next person in line. Closes gap 9 by construction (an unpaid promotion can't sit indefinitely).

A small **refund-parity** fix is bundled: the existing `RefundEntryDialog` is wired into the one entry-management surface that lacks it (the table view).

**Architecture:** Reuse, do not duplicate. The new `stripe-payment-link` edge function mirrors `stripe-checkout`'s connected-account + platform-fee + redirect-allowlist model, and the new webhook branch mirrors the existing `checkout.session.completed` handler — but keyed on `metadata.type='entry_payment_request'` and `metadata.entry_ids`, marking pre-existing entries paid instead of creating entries from a cart. No new payment surfaces beyond one action button reused across existing entry-management menus.

**Tech Stack:** Supabase Edge Functions (Deno + Stripe SDK), React + TypeScript, React Query/Zustand, Vitest + RTL, shadcn/base UI.

---

## Context

- **Existing cart→entries flow:** `stripe-checkout` (cart-based session create) → `stripe-webhook` `handleCheckoutCompleted` reads `metadata.cart_id`/`type='entry'`, creates entries, writes `stripe_orders`. Ownership gate at `stripe-checkout/index.ts:318` (`exhibitor.auth_user_id !== caller` → 403). Entry-window + `club_stripe_accounts.payouts_enabled` gates at `:391–:418`.
- **Why a new path, not the cart:** The unpaid entry already exists. Routing it through the cart webhook would _create a duplicate entry_. We need a "mark existing entry paid" branch.
- **Refund already built:** `RefundEntryDialog` + `isStripeRefundable` exist and are tested, wired into the card view (`EntryListCard.tsx:277,366`) and pull-management tab (`PullManagementTab.tsx:543`). Only `EntryRowActionMenu.tsx` (rendered by `EntriesTableView.tsx`) lacks it.
- **Intent check (`docs/INTENT.md`):** Secretary feeling = "I'm in control / nothing falls through the cracks"; exhibitor feeling = "this respects my time." A pay link that arrives by email/in-app and reconciles automatically serves both.
- **Duplication question:** _Does this duplicate an existing page?_ No new page/dialog beyond reusing one action button across existing menus, and the link reuses Stripe-hosted checkout + the existing webhook. The deliberate consolidation is that **scenario 3 and waitlist promotion share one primitive** instead of two bespoke flows.
- **Related plans (extend, don't fork):** `docs/plan-wizard-stripe-payment.md`, `docs/plan-wave1-exhibitor-entry-payment-trust.md`, `docs/plan-admin-payout-ledger-platform-fee.md`. Operator context: `docs/operations/stripe-platform-setup.md`.
- **Builds toward:** [`docs/plan-entry-draw-lottery.md`](plan-entry-draw-lottery.md) (random-draw / lottery entry mode) DEPENDS on this plan's pay-to-claim primitive — a draw defers the charge to closing, then promotes winners via the same payment link. Keep the link/promotion primitive general enough that the draw plan can call it.
- **Migration 114 (`114_wait_list_capacity.sql`, wait-list feature PR #43) ALREADY built the capacity + mail-in-reservation + waitlist-payment data model** — its Stripe/payment phase was deferred and IS this plan. Provides: `shows.default_judge_day_capacity`/`mail_in_strategy`/`mail_in_value`/`mail_in_deadline`/`mail_in_auto_release`/`mail_in_release_date`/`waitlist_payment_deadline_hours`; `judge_assignments.day_capacity_override`; `get_judge_day_capacity()`; `promote_waitlist_entry()`; `judge_day_summary` view; `entry_status` values `pending-payment`/`promotion-expired`. Live consumers: `WaitListSettingsCard` (in `ShowSettingsPage`), `useJudgeDayCapacity` (in `WaitlistManagementPage`), `useClassAvailability`. **Build on these — do not duplicate.** See `project_judge_day_capacity_model` memory and `docs/plans/2026-04-02-wait-list-design.md`.

## Out of scope (explicit non-goals)

- No keyed/raw card entry by the secretary (Codex Option 4 — rejected: PCI + paper-card risk).
- No Stripe Terminal / Tap to Pay integration (Codex Options 2/3 stay "secretary charges in Stripe directly, then marks paid" — zero build).
- No change to the exhibitor self-pay cart flow (#867) — it stays the golden path.
- **[ADDED] Voluntary-withdrawal, show-cancellation, and judge-change refund policy — DEFERRED (owner-decided 2026-06-20).** A real complaint topic ("I withdrew weeks out and they kept my money"; "show cancelled — where's my refund?"; "judge changed and I only entered for them"), but it's largely _club refund policy_, not link/waitlist mechanics. This plan keeps only **system-caused make-whole refunds** (Task 3.5 Step 6). The voluntary/cancellation refund matrix is its own sibling plan — tracked in `OPEN-TODOS.md` so it doesn't rot (see `feedback_avoid_deferring_followups`). When built it should reuse `stripe-refund-entry` + surface the club's stated policy to exhibitors before they pay.

## Open questions to resolve in Task 1 (do not guess)

- [x] **Connect/platform-fee mechanism — RESOLVED (Task 1, 2026-06-20):** It's a **hold-and-transfer model, NOT destination charges.** The Stripe client uses only the platform secret key (`stripe-checkout/index.ts:17`); the Checkout Session sets **no** `on_behalf_of`/`transfer_data`/`application_fee_amount` (`:573`). The whole charge (entry fees + platform fee) lands in the **platform balance**; the platform fee is just a retained line item (`:509–524`, default 7% via `_shared/platformFee.ts`); the club is paid **later** by `cron-process-payouts` via `stripe.transfers.create({ destination: club_stripe_accounts.stripe_account_id })` (`cron-process-payouts/index.ts:327`). **→ The new `stripe-payment-link` needs NO connected-account params — just replicate the line items (entries + platform-fee) on the platform key.** Payout is automatic downstream IF entries are stamped correctly (see Task 3 finding).
- [x] **Entry/order columns — RESOLVED:** `entries.payment_status` (DEFAULT `'pending'`, `003:35`), `entry_fee DECIMAL` (`003:41`), `payment_method`, `stripe_payment_intent_id` all exist. `stripe_orders` (`005:289–314`) has **`stripe_payment_intent_id TEXT UNIQUE`** (the idempotency latch), `stripe_checkout_session_id TEXT`, and **`entry_ids UUID[]`** — an array, NOT a singular `entry_id` FK. New order rows mirror this shape. ⚠️ **Payment fields on `entries` are trigger-protected** (`20260611240000` + `20260611270000_entries_protect_payment_fields[_insert]`) — confirm the link webhook's service-role writes to `payment_status`/`payment_method`/`stripe_payment_intent_id` are permitted (the cart webhook already writes these, so likely fine; the secretary-initiated path is new — verify).
- [x] **Link transport — DECIDED: Stripe Checkout Session** (`mode:'payment'`, shared via its `url`). It fires the existing `checkout.session.completed` event (reuse the webhook + session-match anti-tamper + `stripe_orders` shape) and supports per-link `expires_at`/metadata. Payment Links are for static reusable links; our links are one-off, per-entry, expirable → Checkout Session is the right fit.
- [x] **Batch shape — CONFIRMED:** `entry_ids[]` in metadata, matching `stripe_orders.entry_ids UUID[]`. One link can cover a multi-dog/promoted batch.
- [x] **Platform fee policy — DECIDED (2026-06-20).** The fee is a plain line item, not a Connect `application_fee` (`stripe-checkout/index.ts:509–524`), driven only by subtotal × percent — independent of `payment_method`. **Rule: fee follows the payment rail** — card→Stripe (self-pay _or_ secretary link) carries the fee; check/cash/secretary-marked-paid does not. **The link charges the same platform fee as self-pay, added on top — the EXHIBITOR pays it** (link total = entry fee + platform fee). Reuse `calculatePlatformFeeCents` + the existing fee line-item block verbatim; a card-paid mail-in/waitlist entry is treated identically to a self-pay entry. (Rejected: club-absorbs / netted-from-proceeds.)

## Files (provisional — confirm in Task 1)

- Create: `apps/myk9show/supabase/functions/stripe-payment-link/index.ts`
- Modify: `apps/myk9show/supabase/functions/stripe-webhook/index.ts` (new `entry_payment_request` branch)
- **[ADDED]** Migration (conditional — only if Task 1 confirms a new column/table is needed to persist the pending session→entry link): `supabase/migrations/NNN_entry_payment_request_session.sql` — with explicit `GRANT`s (CLAUDE.md rule: new `public` tables are not auto-exposed) and RLS. Run through `migration-auditor` before `db push`.
- Create: `apps/myk9show/src/features/registration/requestEntryPayment.ts` (client invoker, mirrors existing `functions.invoke` pattern)
- Create: `apps/myk9show/src/components/entries/management/RequestPaymentDialog.tsx`
- Modify: `apps/myk9show/src/components/entries/management/EntryRowActionMenu.tsx` (add Request-payment **and** Refund actions)
- Modify: `apps/myk9show/src/components/entries/management/EntryListCard.tsx` (add Request-payment action for pending entries)
- Modify: `apps/myk9show/src/components/entries/management/useEntryManagementActions.ts` (dialog state + handler)
- Modify: `apps/myk9show/src/services/database/waitlists/reads.ts` (standardize promotion on `promote_waitlist_entry`; retire `acceptWaitlistOffer` — Task 5 Step 0)
- Notification: reuse existing entry email path (`EmailService.sendEntryConfirmation` / confirmation-email edge fn) + in-app `messageStore` (the path `useWaitlistManagementData` already uses)
- Tests: see Task 6.

---

## Task 1: Recon + design lock (no code)

**Purpose:** Resolve every "Open question" above so the implementation mirrors existing payment infrastructure exactly. Payment bugs are silent and expensive (#867 charged with zero entries).

**[DONE 2026-06-20 — recon complete; findings recorded in "Open questions" above as RESOLVED.]**

- [x] **Step 1:** Connect/fee = hold-and-transfer; no connected-account params needed (see resolved Open Question 1).
- [x] **Step 2:** Columns confirmed; `stripe_orders.stripe_payment_intent_id` UNIQUE; `entry_ids UUID[]` (no singular FK); entries payment fields trigger-protected (Open Question 2).
- [x] **Step 3:** Idempotency latch = `stripe_orders.stripe_payment_intent_id` UNIQUE (`005:301`).
- [x] **Step 4:** Transport = Checkout Session; batch = `entry_ids[]` (Open Question 3–4).
- [x] **Step 5:** Status model resolved — canonical predicate `payment_status='pending'`; webhook advances `entry_status` for waitlist (see resolved Task 1 Step 5 above).

**Remaining for the implementer to confirm at code time (not blockers):** (a) the `entries` payment-field protection triggers permit the link webhook's service-role writes; (b) link TTL value (Task 3.5 Step 1).

- [x] **Status model — RESOLVED (Task 1, 2026-06-20):** Both paths actually converge on **`payment_status='pending'`**: `submit_show_entries` sets it explicitly for mail-in (`181:139–140`), and `promote_waitlist_entry` (`114:209–210`) inserts WITHOUT a `payment_status`, so it takes the column **default `'pending'`** (`003:35`) — while ALSO carrying `entry_status='pending-payment'`. So the earlier fear (that a `payment_status='pending'` gate would reject waitlist entries) does NOT materialize — the default covers it. **Canonical "owes money / requestable" predicate = `payment_status='pending'`** (covers both channels). The two columns are semi-independent: `payment_status` tracks MONEY; `entry_status` tracks LIFECYCLE. Therefore the webhook (Task 3) must, on payment: set `payment_status='paid'` for all; AND for a waitlist entry additionally advance `entry_status` from `pending-payment` → `confirmed`. Tests should still assert a waitlist (`pending-payment`) entry is requestable, since it relies on the column default — make it explicit so a future `promote_waitlist_entry` change can't silently break the gate.

## Task 2: `stripe-payment-link` edge function

**Purpose:** Create a Stripe-hosted payment link for one or more **existing unpaid entries**.

- **[REVISED] Single subject = an existing entry.** Both flows resolve to a real `entries` row before the link is made, so the link is uniformly entry-based (no dual-subject discriminator — earlier complexity removed after finding `promote_waitlist_entry`):
  - **Mail-in / secretary-keyed:** the `pending` entry already exists.
  - **Waitlist promotion:** `promote_waitlist_entry` (migration 114, `reads.ts:353`) already creates a `pending-payment` entry atomically at offer time. The link pays _that_ entry. (This requires standardizing promotion on `promote_waitlist_entry` and retiring the rival `acceptWaitlistOffer` — Task 5 Step 0.)

**[DONE 2026-06-20 — code written, unit-tested green, migration audited (not yet deployed/pushed).]** Files: `_shared/entryPaymentLink.ts` (pure session builder) + `_shared/entryPaymentLink.test.ts` (7 tests green); `stripe-payment-link/index.ts` (edge fn); `supabase/migrations/20260620200000_entry_payment_links.sql` (persistence table, auditor-clean after `(SELECT fn())` fix).

- [x] **Step 1 (assertion-first test):** `_shared/entryPaymentLink.test.ts` asserts `metadata.type='entry_payment_request'`, `metadata.entry_ids`, `mode:'payment'`, the platform-fee-on-top line item, and (per Task 1) **NO** connected-account params (hold-and-transfer). 7/7 green.
- [x] **Step 2:** Auth + same-show check + authz via `is_show_secretary`/`is_club_admin`/`is_site_admin` (mirror refund-entry); unpaid gate = `payment_status='pending'` (Task 1 finding: covers both mail-in and waitlist); `club_stripe_accounts.payouts_enabled` required.
- [x] **Step 3:** Authoritative fee per entry via `authoritativeEntryFeeCents`; fee percent from `platform_settings`→env→default; session built by the pure builder; redirect allowlist enforced.
- [x] **Step 3a — public-safe redirect:** `isAllowedRedirectUrl` guard on `success_url`/`cancel_url`. ⚠️ The actual public success/cancel ROUTES still need to render for an anonymous payer — that's a Task 4 (UI) deliverable; the edge fn only validates the origin.
- [x] **Step 4:** Persists to new `entry_payment_links` table; **re-request expires prior OPEN links** overlapping these entries (`.overlaps` + Stripe `sessions.expire`) → no double-charge; orphaned session expired if the insert fails.
- [x] **Step 5:** Returns `{ url, session_id }`. Deploy (DEFERRED — shared-system, confirm first): `supabase functions deploy stripe-payment-link --no-verify-jwt --workdir apps/myk9show --project-ref sojmvhhwsjxmfistvzbe`; and `supabase db push` for the migration.
- [ ] **[ADDED] Stripe 24h cap — FINDING:** A Checkout Session's `expires_at` max is **24h** (min 30 min). So the link is set to **23h**; a longer pay window (waitlist 48h, multi-day mail-in) is tracked by the ENTRY's deadline, not the link — an expired link is **re-requested** (Task 4 Step 5 surfaces this). If a single persistent shareable URL across a multi-day window is required, switch to a myK9 `/pay/:token` page that mints a fresh session on click (a Task 4 follow-up, noted in Task 3.5 Step 1).

## Task 3: Webhook reconciliation branch

**Purpose:** On payment, mark the existing entries paid — idempotently, signature-verified, no duplicate entries.

**[DONE 2026-06-20 — code written, tested green, typecheck 24/24 (not yet deployed).]** Reconciliation decision extracted to pure `_shared/entryPaymentReconcile.ts` (5 unit tests — real behavioral coverage) + webhook wiring pinned by `src/test/database/stripeWebhookEntryPaymentRequest.source.test.ts` (4 assertions). Handler `handleEntryPaymentRequestCompleted` added to `stripe-webhook/index.ts`.

- [x] **Step 1 (assertion-first test):** Done as a pure-helper unit test (`entryPaymentReconcile.test.ts`) — stronger than source-text: asserts unpaid→paid+online, waitlist `pending-payment`→`confirmed` (mail-in lifecycle untouched), idempotent no-op when link not open, already-paid → duplicate-charge flag. Plus the source-text wiring test.
- [x] **Step 2:** Branch added in `handleCheckoutCompleted` (`checkoutType === 'entry_payment_request'` → `handleEntryPaymentRequestCompleted`). Anti-tamper: anchors on the persisted `entry_payment_links` row (a paid session with no row → alert + Task 3.5 refund). Marks unpaid entries paid; advances waitlist `pending-payment`→`confirmed`; writes `stripe_orders`. ⚠️ **Deferred to Task 5:** flipping the linked `waitlist_entries` row to claimed (the entry doesn't yet store its waitlist-row id — Task 5 standardizes promotion and adds the linkage). `promotion-expired`/withdrawn handling = Task 3.5 Step 3.
- [x] **Step 3:** Idempotency — `entry_payment_links.status` latch (reconcile returns `noop` once not `open`) + the per-entry `.eq('payment_status','pending')` guard + `stripe_orders.stripe_payment_intent_id` UNIQUE (23505 ignored). Replays are no-ops.
- [x] **[DONE] Step 4 — stamp for payout (CRITICAL, Task 1 finding):** The helper stamps `payment_method='online'` + `payment_status='paid'` + `stripe_payment_intent_id`, and a unit test asserts `payment_method==='online'` precisely because `cron-process-payouts`/`calculateShowPayoutCents` only pays out `online`+`paid|refunded` entries. ✅ Confirmed intended: a mail-in entry keyed `check`/`cash` that pays by card link flips to `online` — payout follows the actual rail. (A dedicated `calculateShowPayoutCents` pickup test is still worth adding in Task 7.)

## Task 3.5: [ADDED] Failure modes & recovery

**Purpose:** Payment bugs are silent and expensive (#867 charged with zero entries). Every "what if it goes wrong" below must have an answer before merge.

- [ ] **Step 1 — payment never happens:** A one-off Checkout Session that is never paid fires no webhook; the entry simply stays in its unpaid state (`payment_status='pending'` for mail-in; `entry_status='pending-payment'` for a waitlist promotion, which the cron later flips to `promotion-expired`). Confirm the terminal state per channel, that the secretary can see "link sent / unpaid" and re-request, and the link TTL (mirror cart's ~31-min clamp or a longer secretary-friendly window — Task 1 decision).
- [ ] **Step 2 — duplicate/concurrent links:** Issuing a new link must **expire all prior open links** for the same entry/batch (mirror `stripe-checkout/index.ts:531–563`). If two links were nonetheless both paid, the webhook finds the entry already paid → it must **auto-refund the second charge** (reuse `stripe-refund-entry` path) and log/alert, never silently keep an over-charge.
- [ ] **Step 3 — entry cancelled/removed after link issued, before payment:** The webhook must detect that the target entry is gone/withdrawn and **refund the charge + alert** rather than resurrect or mis-mark it. Add a test for "pay a link whose entry was deleted."
- [ ] **Step 4 — partial-batch:** For an `entry_ids[]` batch where some entries became paid/cancelled between issue and payment, define behavior (mark only still-valid pending entries paid; refund the delta for the rest). Test it.
- [ ] **Step 5 — refund of a link-paid entry already in flight:** Ensure a `charge.refunded` event for one of these entries reconciles the same as cart-paid entries (the existing `charge.refunded` handler keys on `stripe_orders` by payment intent — confirm the Task 3 order row is shaped so it matches).
- [ ] **[ADDED] Step 6 — make-whole vs partial refund (amount policy):** When the system auto-refunds because the exhibitor got **nothing** (overflow→deny, duplicate-link double-charge, paid-an-expired-offer, cancelled entry), refund the **full charge including the platform fee** — they received no service, so myK9 must not keep its cut (the platform eats the Stripe processing cost). A _voluntary_ secretary refund of a real entry is a separate policy decision (may retain the fee) handled by `stripe-refund-entry` — keep the two distinct and assert the amount in tests for each.

## Task 4: Secretary "Request payment" UI

**Purpose:** One reusable action on unpaid entries across existing menus.

**[PARTIALLY DONE 2026-06-20 — core flow built + tested; auto-send, status-indicator, and table-view wiring deferred.]** Files: `RequestPaymentDialog.tsx` (+ co-located `isPaymentRequestable`), `__tests__/RequestPaymentDialog.test.tsx` (4 tests green), wired into `EntryListCard`. Edge fn now returns the fee breakdown for exact disclosure.

- [x] **Step 1:** `RequestPaymentDialog.tsx` — generates the link via `functions.invoke('stripe-payment-link')`, shows the **exact server-computed breakdown** (entry fee + card processing fee = exhibitor pays), exposes the link with **Copy**, maps the server error message. (Used inline invoke like `RefundEntryDialog` rather than a separate `requestEntryPayment.ts` — same pattern, one fewer indirection.)
- [x] **Step 2:** `isPaymentRequestable(entry)` = `paymentStatus===PENDING && !comped` (Task 1 finding: `pending` covers both mail-in and waitlist). Server authz + payouts-enabled remain authoritative. Unit-tested.
- [~] **Step 3:** Surfaced in `EntryListCard` (card view). **Table view (`EntryRowActionMenu`) deferred → bundle with Task 6** (refund parity touches the same menu). No `useEntryManagementActions` change needed — the card owns its dialog state, mirroring refund.
- [x] **[ADDED] Step 3a — public-safe redirect:** `success_url`/`cancel_url` point at the show's PUBLIC page (`/shows/:showId`), which renders for an anonymous payer — no auth wall after paying.
- [ ] **Step 4 — auto-send (DEFERRED):** Copy-link is the delivery mechanism today (secretary pastes into their own email/message). Auto-send via the confirmation-email path + `messageStore` is the enhancement (needs resolving the exhibitor's messaging account like `useWaitlistManagementData`).
- [~] **Step 5 — fallback + status visibility:** Copy-link fallback present (clipboard failure → "select and copy" toast). **Deferred:** the "payment requested — unpaid / expired" entry-list indicator (needs reading `entry_payment_links` into the entry query).

## Task 4.5: [REVISED] Wire the EXISTING judge-day capacity + mail-in reservation (migration 114) into enforcement & split checkout

**Major correction (2026-06-20):** The capacity + mail-in-reservation **data model already exists** — migration `114_wait_list_capacity.sql` (wait-list feature, PR #43), whose Stripe phase was deferred (= this plan). DO NOT create `judge_day_entry_limit`/`overflow_policy` columns; that would duplicate live schema. Build on what's there.

**What already exists & is wired (config + display):**

- `shows.default_judge_day_capacity` (DEFAULT 125), `judge_assignments.day_capacity_override` (per-judge), `shows.mail_in_strategy` (`fixed|percentage|deadline|none`), `mail_in_value`, `mail_in_deadline`, `mail_in_auto_release`, `mail_in_release_date`, `waitlist_payment_deadline_hours` (DEFAULT 48).
- `get_judge_day_capacity(judge,show,date)` → `capacity, confirmed_count, waitlist_count, mail_in_reserved, available_spots = GREATEST(0, capacity − confirmed − reserved), class_ids`. Mail-in reserve math for fixed AND percentage is done.
- **Secretary config UI already live:** `WaitListSettingsCard` is rendered in `ShowSettingsPage` — a secretary can set fixed/percentage/deadline mail-in reservation TODAY. `useJudgeDayCapacity` feeds `WaitlistManagementPage`.

**What's missing (the real work):**

- **Enforcement.** `get_judge_day_capacity` drives DISPLAY only; `submit_show_entries` has NO capacity check, so the reservation is advisory — online entries can currently eat reserved spots. There is no gate.
- **Channel awareness.** The reserve only matters if ONLINE self-service is limited to `available_spots` while the SECRETARY/mail-in path may use up to `capacity − confirmed` (i.e., dip into the reserved pool). `entries.entry_source` is `myk9|ukc_online` — NOT a self-service-vs-secretary signal — so the gate must key off the creation path (cart/`stripe-checkout` = online; secretary RPC/`stripe-payment-link` = mail-in), or a new explicit channel flag.
- **Split checkout.** `cartStore.checkoutWithWaitlist` (`cartStore.ts:731`) is dead code; `CartPage` uses flat `createEntryCheckoutSession`; `ConfirmationStep.waitlistEntries`/`confirmedEntryCount` props are unpopulated.

- [x] **Step 1 — capacity-config audit + the one new column:** Confirm `WaitListSettingsCard`/`useJudgeDayCapacity` read/write the 114 columns correctly and that fixed + percentage reservation compute as expected. The sole NET-NEW schema is the per-class **`deny`-vs-waitlist overflow** choice (owner DECIDED 2026-06-20; 114 assumes waitlist) — add `classes.overflow_policy text NOT NULL DEFAULT 'waitlist' CHECK (overflow_policy IN ('waitlist','deny'))`, backfill defaults, run `migration-auditor`. Completed locally: settings card already reads/writes all 114 settings; fixed/percentage reservation tests exist; added `classes.overflow_policy`.
- [ ] **[ADDED] Step 1a — deadline strategy & auto-release in the gate:** Two 114 config modes the enforcement gate must honor: `mail_in_strategy='deadline'` reserves 0 but gives mail-in priority before `mail_in_deadline` (define what "priority" means in the gate — e.g. online blocked from the last N spots until the date, or purely informational); and `mail_in_auto_release`/`mail_in_release_date` must drop the effective reserve to 0 once the release date passes so online can use the held spots. `get_judge_day_capacity` does NOT currently apply auto-release — confirm and extend it (or apply in the gate) so a stale reserve doesn't permanently lock spots. Test both. Auto-release is completed locally in the capacity readers; deadline-priority semantics still need the server-side gate.
- [ ] **Step 2 — selection gating uses `get_judge_day_capacity`:** Online selection shows "Full — Join Wait List" (or "Judge day full — entries closed" if class policy = deny) when `available_spots` (which already nets out the mail-in reserve) is exhausted — factoring the cart's own pending additions at judge-day granularity. The secretary mail-in surface gates on `capacity − confirmed` instead (may use reserved). Confirm write-authz on the config is secretary/club-admin via RLS, not UI-only.
- [ ] **Step 3 — wire split checkout:** Replace `CartPage`'s flat checkout with `checkoutWithWaitlist`: open → Stripe; full+waitlist → `add_to_waitlist`; full+deny → blocked pre-checkout. Populate `ConfirmationStep` to show "Paid: N · Waitlisted: M · Denied: K". Confirm `add_to_waitlist` RLS lets an exhibitor waitlist only their OWN dog.
- [ ] **Step 4 — server-side atomic enforcement (CRITICAL):** Add the capacity gate at entry creation using `get_judge_day_capacity` semantics, transactionally (advisory lock keyed on judge-day, like `promote_waitlist_entry`'s `pg_advisory_xact_lock` — not a naive read). Online overflow → policy `waitlist`: create waitlist row instead of entry + refund that line (make-whole, Task 3.5 Step 6); policy `deny`: refund + notify. The mail-in reserve is enforced HERE: an online creation that would consume a reserved spot is overflow even if `confirmed < capacity`.
- [ ] **[ADDED] Step 4a — lowering the limit / over-reserved:** Setting a limit below current count grandfathers existing entries (never auto-drop paid ones); block only NEW. Surface "over by N". Pre-launch → no historical backfill (`project_prelaunch_no_users`).
- [ ] **[ADDED] Step 4b — denied-after-payment UX + perf:** Notify the exhibitor when the rare race refunds a spot they saw as "Paid." Keep judge-day counts batched (no N+1); scope the lock to the judge-day key.
- [ ] **Step 5 — tests:** mail-in reserve (fixed AND percentage) holds spots from online but not the secretary; deadline-strategy priority + auto-release-date drops reserve to 0; `get_judge_day_capacity` count correctness; per-judge override; deny-vs-waitlist gating; split routing; confirmation display; **concurrent-overbook race**; lowering-limit grandfather; config write-authz; self-service `add_to_waitlist` ownership.

## Task 5: Waitlist — pay-to-claim with auto-expire + cascade

**Purpose:** Close gap 9 AND deliver the "don't pay in time → dropped, offered to next in line" model — by tying the **existing** expiry/cascade cron to payment, not by building a new timer. Decided model (2026-06-20): **pay-to-claim** (paying the offer link IS accepting), replacing grant-then-collect.

**Reuse what exists — do NOT rebuild:**

- `promote_waitlist_entry(waitlist_entry_id, deadline_hours=48)` (migration 114, called at `reads.ts:353`): atomic (`pg_advisory_xact_lock`), authz-checked, **already creates a `pending-payment` entry** + flips the waitlist row to `offered` with `offer_expires_at = now + deadline_hours`. This IS the pay-to-claim spine.
- `shows.waitlist_payment_deadline_hours` (DEFAULT **48**) is the configurable window — use it, don't hardcode 24.
- `entry_status` already includes `pending-payment` and `promotion-expired` (114) for the offered/dropped states.
- `cron-waitlist-expiration` already expires past-deadline offers → `status='expired'`, offers the next `waiting` entry, emails them, back-fills open spots (`cron-waitlist-expiration/index.ts:119–184`).

- [ ] **[CRITICAL] Step 0 — reconcile the TWO rival promotion paths:** `promote_waitlist_entry` (RPC, creates `pending-payment` entry) and `acceptWaitlistOffer` (`reads.ts:510`, grant-then-collect, creates confirmed entry + deletes waitlist row) BOTH exist and disagree. Standardize on `promote_waitlist_entry`; retire/repurpose `acceptWaitlistOffer`. Audit callers (`waitlists/index.ts`, `WaitlistManagementPage`, tests, phase-4 fixtures); re-point `vi.mock`/fixtures (`feedback_vi_mock_migration`).
- [x] **Step 1 — verify cron is live + aligned:** Confirm a `pg_cron` schedule invokes `cron-waitlist-expiration` (mirror `20260618130000_payout_cron_schedule.sql` if missing). The cron currently expires `waitlist_entries` only — extend it to also flip the linked `pending-payment` ENTRY to `promotion-expired` and kill its Stripe session on expiry, then cascade. Use `waitlist_payment_deadline_hours`, not the function's 24h default. Completed locally in `20260622000222_link_waitlist_promotions.sql`: adds the waitlist-to-entry link, uses show-level waitlist deadline for cron promotions, schedules the cron every 15 minutes, and requires replacing `REPLACE_WITH_CRON_SECRET` before any `supabase db push`.
- [x] **Step 2 — offer carries the pay link:** On promotion (`promote_waitlist_entry`), generate the `stripe-payment-link` for the new `pending-payment` entry and include it in the offer email/in-app message. The offer is actionable. Completed locally: secretary offers include the generated Checkout URL in the existing in-app thread; cron cascade offers call `stripe-payment-link` through a trusted internal header and include the generated URL in the existing waitlist-offer email.
- [x] **Step 3 — pay = claim:** Paying the link flips the `pending-payment` entry to paid+confirmed and resolves the waitlist row (Task 3 Step 2). Unpaid → cron drops it to `promotion-expired` at the deadline and cascades to the next person. Closes gap 9 by construction (an unpaid promotion can't sit indefinitely). Completed locally: webhook uses actual guarded paid entry ids to mark linked `waitlist_entries.promoted_entry_id` rows `accepted`.
- [x] **Step 4 — expire kills the link + race safety:** Expiring an offer expires its Stripe session; a payment landing in the same tick must win or be cleanly refunded (guard the expire UPDATE to fire only while still unpaid; webhook idempotent). Test both orderings. A payment on an already-expired offer → Task 3.5 Step 3 refund+alert. Covered locally by Task 3.5 auto-refund handling plus Step 1 `expireWaitlistOffer` tests for normal expiry and already-paid/complete Stripe sessions.
- [x] **[ADDED] Step 5 — mail-in promotions use the OFFLINE path (fairness, owner-decided 2026-06-20):** The pay-to-claim online-link + 48h clock works AGAINST the elderly mail-in population the reservation exists to protect. So a waitlister who joined by mail-in must NOT be auto-expired on the online clock. Record how each waitlister joined (`waitlist_entries.joined_via` = `online | mail_in`, set at `joinWaitlist`/secretary entry — the channel signal `entry_source` can't provide, see Task 4.5). On promotion of a `mail_in` waitlister: the secretary records check/phone payment (reuse the offline "Secretary Payment (Already Received)" path) under a **manual/longer hold**, and the cron does NOT drop it on `waitlist_payment_deadline_hours`. Online waitlisters keep the link + deadline. The secretary may still send a link to a mail-in person who wants to pay online. Completed locally: adds `waitlist_entries.joined_via`, marks current exhibitor/cart waitlist joins `online`, skips mail-in auto-expiry/payment-link generation in cron and secretary offer orchestration. No existing secretary mail-in waitlist insertion surface was found; future surface should set `joined_via='mail_in'`.

## Task 5.5: [ADDED] Waitlist fairness & transparency (exhibitor-facing)

**Purpose:** The mechanics can be perfectly fair and still generate Facebook complaints if exhibitors can't SEE what's happening. Silence ("where am I in line?", "it said full but it wasn't!") is the complaint engine. Owner-decided 2026-06-20: do all three. Intent: exhibitor feeling = "this respects my time / I'm not being cheated."

- [ ] **Step 1 — show my waitlist position:** Exhibitor sees "You are #3 on the wait list for Class X" on their entries surface, updating as the line moves (`waitlist_entries.position`; reuse `getWaitlistPosition`). Avoid leaking other people's identities — show position/counts, not names.
- [ ] **Step 2 — notify on movement + expiry:** Notify when they move up, when an offer is made, and a **reminder before the offer deadline** (not a single email — the brittle one-shot is why people lose spots to spam/weekends). Reuse the `messageStore` + email path. Secretary can **extend / re-offer** a missed offer (escape hatch).
- [ ] **Step 3 — show the reserved hold to online entrants:** When online selection shows "Full — Join Wait List" because spots are HELD for mail-in (not truly full), display "N spots held for mail-in until [date]" so the hold is transparent, not mistaken for a bug. Derive from `get_judge_day_capacity` (`mail_in_reserved`) + `mail_in_release_date`.
- [ ] **Step 4 — tests:** position display + privacy (no other names); movement/offer/reminder notifications fire; secretary extend/re-offer; reserved-hold copy shows when `mail_in_reserved > 0` and disappears after release.

## Task 6: Refund parity fix

**Purpose:** Table view should match card view.

- [ ] **Step 1:** Import `RefundEntryDialog` + `isStripeRefundable` into `EntryRowActionMenu`; add the Refund action gated by `isStripeRefundable`, mirroring `EntryListCard.tsx:277,366`.
- [ ] **Step 2:** Add/extend a test asserting the Refund action renders for a stripe-refundable entry in the table view and is hidden otherwise.

## Task 7: Testing phase (required — plan is not complete until green)

- [ ] Edge-function source tests (Tasks 2–3): `stripe-payment-link.source.test.ts`, `stripeWebhookEntryPaymentRequest.source.test.ts`.
- [ ] `requestEntryPayment.ts` unit test (invoke shape, error mapping).
- [ ] `RequestPaymentDialog` + `isPaymentRequestable` component/unit tests.
- [ ] `EntryRowActionMenu` refund + request-payment render-gate tests.
- [ ] Waitlist pay-to-claim tests: paying the offer link confirms+removes the waitlist row; an unpaid offer past `offer_expires_at` is expired by the cron and the next-in-line is offered; expiring an offer kills its Stripe session; pay-vs-expire race resolves to win-or-refund (both orderings).
- [ ] **[ADDED]** Failure-mode tests for Task 3.5: pay-twice → second auto-refunded; pay-a-deleted-entry → refunded + not mis-marked; partial-batch reconciliation; unpaid link leaves entry `pending`.
- [ ] **[ADDED]** Public-safe redirect: assert `success_url`/`cancel_url` resolve to a route that renders anonymously (cold-session test).
- [ ] **[ADDED]** If a migration is added: `migration-auditor` pass (GRANTs/RLS present) before any `db push`.
- [ ] **[REVISED]** Unpaid-predicate + waitlist-link tests: a link is requestable for BOTH a mail-in (`payment_status='pending'`) and a waitlist (`entry_status='pending-payment'`) entry; paying a waitlist-promotion link flips that entry to paid+confirmed and resolves the waitlist row; paying a link whose entry was already dropped to `promotion-expired` → refund (full, incl. fee) + no resurrection.
- [ ] **[ADDED]** Refund-amount tests: make-whole refunds (deny/overflow/duplicate/expired) return entry fee + platform fee; assert the cents.
- [ ] **[ADDED]** Capacity-config tests: lowering the limit below current count grandfathers existing entries and blocks new ones; non-secretary cannot change the limit/policy (RLS); exhibitor `add_to_waitlist` only for their own dog.
- [ ] Run `cd apps/myk9show && pnpm test` and `pnpm typecheck`; confirm green before claiming done.
- [ ] Phase-4 seam fixtures: extend `phase4SeamHandlers.ts` if the live walk exercises the new link path.

## Rollout / verification

- [ ] Stripe **test mode** end-to-end: secretary requests payment on a pending mail-in entry → exhibitor pays via link → webhook flips entry to paid → entry shows paid in all three views. Use `/stripe:test-cards`.
- [ ] Same walk for a promoted-waitlist entry.
- [ ] Refund a link-paid entry to confirm `stripe-refund-entry` works on entries paid via this path (it keys on `payment_method='online'` + `stripe_payment_intent_id`, which Task 3 sets).
- [ ] `/codex:review` + `/review` (payment code). Migrations, if any, via `migration-auditor` + confirm before `db push`.

## Done when

- A secretary can generate and send a Stripe payment link for any unpaid entry (mail-in or waitlist-promoted); paying it auto-marks the entry paid via webhook; refunds work on link-paid entries; the table view has refund parity.
- Waitlist is pay-to-claim: an offer carries the pay link, paying confirms the spot, and an unpaid offer auto-expires and cascades to the next person via the existing cron.
- An exhibitor entering 5 classes (3 open, 2 over a judge's day limit) pays only for the open entries and is waitlisted (or denied, per class policy) on the rest, with the split shown in confirmation; the judge-day limit is show-configurable (default 125, migration 114); capacity is enforced atomically server-side so concurrent checkouts cannot overbook.
- A secretary can reserve mail-in spots (fixed number OR percentage, via the existing `WaitListSettingsCard`/migration-114 config) and the reservation is actually ENFORCED: online self-service is held to `available_spots` (capacity − confirmed − reserved) while the mail-in/secretary path may use the reserved pool — so retired mail-in exhibitors aren't locked out by online entries.
- **Fairness:** a promoted mail-in waitlister is collected offline on a flexible window (not forced onto the 48h online link); exhibitors see their waitlist position, get movement + pre-expiry reminder notifications, and online entrants see "held for mail-in until [date]" rather than a confusing "Full." Voluntary/cancellation refund policy is explicitly deferred to a sibling plan (tracked in `OPEN-TODOS.md`).
- All tests + typecheck green; payment paths reviewed (`/codex:review` + `/review`); migrations audited before push.
