# Money-Path Hardening — pay → refund → payout remediation

> **Status:** Active

> **Source:** [`docs/security-audit-2026-07-03-money-path.md`](security-audit-2026-07-03-money-path.md) (scoped red-team, 2026-07-03). 0 CRITICAL, 4 HIGH, 4 MEDIUM, 6 LOW. This plan sequences the fixes; the audit holds the evidence.

> **For agentic workers:** Every phase touches Stripe / refund-amount math or an RLS/trigger money guard. Run `/codex:review` alongside `/review` before every merge. Any migration goes through `migration-auditor` before `db push`, and `db push` is confirmation-gated (shared staging DB — see CLAUDE.md "Auto Mode — shared-system writes"). Redeploy affected Stripe functions only after the schema is live. All tests are **assertion-first** — write the `toHaveBeenCalledWith` / DB-state assertion red _before_ touching the implementation (see CLAUDE.md "Assertion-first for value-sensitive bugs").

## Implementation status

| Phase           | Status                                                               | Evidence                                                                                                                                                                                                                                                                           |
| --------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 — MP-01/MP-02 | Merged + DB-pushed                                                   | PR #1165; migration `20260705200000_entries_protect_payment_status.sql`; staging `supabase db push` applied 2026-07-06.                                                                                                                                                            |
| 2 — MP-03       | Merged + functions redeployed                                        | PR #1170; assertion-first focused tests red then green; affected Stripe functions redeployed 2026-07-06 14:21:03 UTC. Staging duplicate-delivery payment verification still needs evidence.                                                                               |
| 3 — MP-04/MP-14 | Merged + DB-pushed + functions redeployed                            | PR #1170; migration `20260706013906_stripe_livemode_scoped_ids.sql` applied to `sojmvhhwsjxmfistvzbe`; dry-run now reports remote DB up to date; affected Stripe functions redeployed 2026-07-06 14:21:03 UTC. Staging payment verification still needs evidence.        |
| 4 — MP-06/MP-10 | Merged + function redeployed                                         | PR #1218 (squash `58dc377e8`), merged 2026-07-08. `charge.refunded`'s allowlist now recognizes `show_refund`-tagged refunds and alerts only on unstamped entries (2 Codex review rounds fixed a stamp/webhook race and an eligibility-filter false-positive before a clean 3rd round). No migration. `stripe-webhook` redeployed 2026-07-08. |

---

## Problem

The payout _mechanism_ and the _cart_ payment flow are well-built and were verified clean (idempotency latch, crash recovery, atomic stamping, constant-time cron auth). Every money-loss finding concentrates in two seams the hardening never reached:

1. **Amount integrity feeding the payout** — the payout eligibility predicate keys on `entries.payment_status`, the one payment field with no write-guard, and `submit_show_entries` defaults every entry to `payment_method='online'`. Chained, they transfer platform money to a club for fees never collected through Stripe. **MP-01 fires in the ordinary mail-in secretary workflow.**
2. **The payment-link path never inherited the cart path's hardening** — a duplicate `checkout.session.completed` delivery auto-refunds a legitimate charge (MP-03), and the persisted-Stripe-ID layer is mode-blind, guaranteed to re-break checkout at the test→live cutover (MP-04, the 2026-06-10 incident shape).

**Root theme (guides every fix):** the codebase hardened payment _identity_ fields (`entry_fee`, `payment_method`, `stripe_payment_intent_id`) against forgery but left the money-math _input_ (`payment_status`) unguarded — `payoutCalc.ts:14-18` even documents knowing this. Guard the inputs the payout sums, not adjacent fields.

---

## Finding → phase map

| Phase | Findings                   | Severity     | Surface                                                         | Review gate                                           |
| ----- | -------------------------- | ------------ | --------------------------------------------------------------- | ----------------------------------------------------- |
| 1     | MP-01, MP-02               | HIGH×2       | migrations (RPC INSERT + payment_status trigger)                | auditor + Codex + confirmation-gated push             |
| 2     | MP-03                      | HIGH         | `stripe-webhook` payment-link path                              | Codex (refund logic)                                  |
| 3     | MP-04, MP-14               | HIGH + LOW   | migration + `stripe-checkout`/`portal`/`connect-onboard` + cron | auditor + Codex + push; **must precede live cutover** |
| 4     | MP-06, MP-10               | MEDIUM + LOW | `stripe-webhook` `charge.refunded` allowlist                    | Codex                                                 |
| 5     | MP-05, MP-07               | MEDIUM×2     | `stripe-checkout` + `stripe-webhook` link path                  | Codex                                                 |
| 6     | MP-08                      | MEDIUM       | new `operator_alerts` table + admin surface                     | auditor + Codex + push                                |
| 7     | MP-09, MP-11, MP-12, MP-13 | LOW×4        | refund fns + webhook + RefundAllEntriesCard                     | Codex                                                 |

Each phase = one PR. Land in order (Phase 1→2 close the routine/highest money-loss paths; Phase 3 must merge before any live-mode payout). Phases 4–7 can be batched if review bandwidth allows, but keep one PR per phase for clean revert boundaries.

### [ADDED] Scope boundary — this plan vs. the go-live runbook

This plan closes the **code/schema** money-path findings (MP-01…MP-14). It does **not** own the operator-only Stripe go-live tasks tracked separately in `OPEN-TODOS.md` § Payments & Email — purging sandbox `cus_`/`acct_` ids, setting the live platform payout schedule to **Manual**, renaming the Stripe account, and granting founding members. Those require live-mode dashboard access and belong to the "author one gated go-live runbook" item. **Hand-off points:** Phase 3 (mode-scoping) is the code half of the sandbox-id problem — the runbook purge is its operational counterpart and interim gate; Phase 6 (`operator_alerts` + admin surface) feeds the runbook's recovery/reconciliation section. Note these two dependencies when authoring the runbook.

---

## Phase 1 — Amount integrity (MP-01 + MP-02) — HIGHEST PRIORITY

**Why first:** MP-01 loses money in the ordinary mail-in workflow; MP-02 is the compounding malicious/accidental flip. Together they are the only findings that silently move real platform money with no alert.

### 1a. MP-01 — persist `payment_method` in `submit_show_entries`

- New migration redefining `submit_show_entries` (current def: `182_submit_entries_add_trial_id.sql`). Add `payment_method` to the `INSERT INTO public.entries (...)` column list, valued from the per-entry element (`p_payment_method` / per-entry payload). **Keep** the existing waived/`secretary_paid` authorization check (`:69`) and the `payment_status` CASE unchanged.
- **Backfill audit (manual, before go-live):** query existing `payment_method='online'` rows with `stripe_payment_intent_id IS NULL` — these are the mislabeled desk/mail-in entries. Decide per-row whether to correct `payment_method`. Do NOT blanket-update; some may be genuinely-online-but-unpaid.

### 1b. MP-02 — guard `entries.payment_status` transitions

- New migration adding a `before update` trigger on `public.entries`, `when (new.payment_status is distinct from old.payment_status)`, that **blocks a non-`service_role` writer from moving `payment_status` into `paid`/`refunded` for a `payment_method='online'` row.** Desk methods (`cash`/`check`/`waived`/`secretary_paid`) may still be marked paid by staff.
- Mirror the `current_setting('role', true) = 'service_role'` bypass used by `20260611240000_entries_protect_payment_fields.sql`. Model the transition guard on `migration 110_restrict_payment_status_column.sql` (which does this for `registrations`, not `entries`).

### Phase 1 testing

- **Assertion-first RPC test:** call `submit_show_entries` with `p_payment_method='check'`; assert the persisted row has `payment_method='check'` (red before 1a, green after).
- **Trigger test:** as an authenticated manage-show role (not service_role), attempt `UPDATE entries SET payment_status='paid'` on an `online`/`pending` row → expect rejection; the same update on a `check` row → allowed; a service_role update (webhook path) → allowed.
- **Regression (CRITICAL — the trigger's blast radius is live payments):** existing online cart payment (webhook `create_online_paid_entry` / paid-marking) still succeeds — the service_role bypass must not break the legitimate paid path. This test must pass before push; if it can't be proven at the RPC/webhook level, do not push.
- `pnpm typecheck` + app `vitest` for any touched TS; migration-auditor clean.

### [ADDED] Phase 1 rollback / recovery

- **Trigger (1b) is the high-risk change** — a false rejection of the service_role paid path silently halts online payment recording. Mitigation: (a) the regression test above is a hard gate; (b) the trigger is a standalone object — rollback is a one-line `DROP TRIGGER trg_entries_protect_payment_status ON public.entries;` in a follow-up migration (never edit the applied migration), which restores today's behavior exactly (payment_status simply unguarded again). (c) After push, verify on staging with a real online cart payment before considering the phase done.
- **RPC (1a)** is a `CREATE OR REPLACE FUNCTION` — rollback = re-apply the prior definition (`182_submit_entries_add_trial_id.sql`) in a new migration. No data change, so no data rollback needed.

### [ADDED] Phase 1a backfill verification

- The backfill is decision-based, not mechanical, so it needs a closing assertion. After the per-row corrections, run and record: `SELECT count(*) FROM entries WHERE payment_method='online' AND stripe_payment_intent_id IS NULL AND payment_status IN ('paid','refunded')` — every remaining row must have a documented reason (e.g. legitimately waived-then-online, or a known migration artifact). A non-zero unexplained count means mislabeled rows are still feeding `payoutCalc`; do not go live until it is zero-or-explained.

---

## Phase 2 — payment-link duplicate delivery (MP-03) — HIGH

- In `stripe-webhook/index.ts` `handleEntryPaymentRequestCompleted`:
  - **(a)** Select `stripe_payment_intent_id` in the pre-read (`:997`) and the no-op re-read (`:1110`). Classify an entry whose intent equals this session's intent as **paid-by-this-charge (idempotent success)**, never `invalid` — this is the bug that drives the wrongful refund.
  - **(b)** Claim the link first: `update({status:'paid'}).eq('id', link.id).eq('status','open').select()` before the per-entry patch loop; 0 rows → return early. Carry over the expired-promotion-revival case from the current logic.
  - **(c)** Check the link-close write's error (currently discarded at `:1157-1162`).
- **Assertion-first test:** simulate duplicate `checkout.session.completed` delivery for the same link/session → assert `stripe.refunds.create` is **NOT** called and both invocations leave entries `paid` (the winner's state intact).
- Codex review (refund logic). No migration.

---

## Phase 3 — mode-scoped Stripe IDs (MP-04 + MP-14) — HIGH, gates live cutover

**Must merge + deploy before the test→live switch.** Until it lands, the runbook purge (`docs/operations/stripe-platform-setup.md` Task 6.3 step 4) is the sole protection — keep it as a hard go-live gate.

- New migration: add `livemode boolean not null` to `stripe_customers` and `club_stripe_accounts` (default per current mode; backfill existing rows to `false`/test). Reconcile the `stripe_customers` unique-`person_id` constraint (`20260611260000`) to unique `(person_id, livemode)`.
- Edge fns: derive `isLive = stripeSecret.startsWith('sk_live')` once; scope every customer/account lookup `.eq('livemode', isLive)` in `stripe-checkout`, `stripe-customer-portal`, `stripe-connect-onboard`. Belt-and-suspenders: catch `resource_missing` on `checkout.sessions.create` → delete the stale row → recreate the customer.
- MP-14 (defense-in-depth): stamp `club_stripe_accounts.livemode` from the `account.updated` webhook (`accountToRowPatch`); have `cron-process-payouts` skip + `alertAdmin` on a row whose `livemode` disagrees with the running key (today it fails loudly per-show via the existing try/catch — this makes it explicit).
- **Testing:** unit-test the mode-derivation + lookup scoping; assert a test-mode `cus_` is not returned when `isLive` is true. Migration-auditor + Codex. Verify against the go-live runbook that the purge step is still documented as the interim gate.

---

## Phase 4 — alert-channel integrity (MP-06 + MP-10) — MEDIUM + LOW

- In `stripe-webhook/index.ts` `handleChargeRefunded`, extend the `allFromAppRefund` allowlist to recognize `r.metadata?.show_refund`. **Smart variant (do this one):** for `show_refund`-tagged refunds, `alertAdmin` only when the intent's entries are _unstamped_ (`refund_amount IS NULL`) — this de-noises the ~200-false-critical flood (MP-06) **and** becomes the exact post-mortem detector for a mid-bulk process kill (MP-10), arriving via webhook so it survives the function's death.
- **Assertion-first test:** a fully-stamped `show_refund` charge → no alert; an unstamped one → exactly one alert. Confirm a 200-entry bulk cancellation no longer floods.
- Codex review. No migration.

---

## Phase 5 — delayed-notification + payload-amount hardening (MP-05 + MP-07) — MEDIUM×2

- **MP-05:** in `stripe-webhook` `handleEntryPaymentCompleted`, after the fresh retrieve (`:507`): `if (freshSession.payment_status !== 'paid') return;` (async_payment_succeeded re-drives). And/or pin `payment_method_types: ['card']` in `stripe-checkout` session creation to match the link path (`_shared/entryPaymentLink.ts:111`).
- **MP-07:** mirror the cart path in `handleEntryPaymentRequestCompleted` — `stripe.checkout.sessions.retrieve(session.id)` at the top, use `fresh.amount_total` / `fresh.payment_status` throughout (also satisfies MP-05 for the link path). Removes the `$0 stripe_orders` corruption and the manual-refund degradation.
- **Testing:** unit-test that an `unpaid`/`payment_status!=='paid'` session does not create/mark paid entries; that a missing-`amount_total` payload triggers the retrieve rather than recording `0`.
- Codex review. No migration.

---

## Phase 6 — operator reconciliation surface (MP-08) — MEDIUM

- New `operator_alerts` table (service-role INSERT, site-admin SELECT; explicit GRANTs per CLAUDE.md migration rules). Persist every `alertAdmin` call (in addition to email) with type, payment_intent/session id, message, `resolved_at`.
- Admin surface listing unresolved rows (a site-admin page or a card on an existing admin screen — check for an existing surface first per CLAUDE.md "consolidate, don't duplicate"; likely folds into the admin support area).
- **Testing:** unit-test that a simulated webhook failure branch inserts an `operator_alerts` row; component test for the admin list rendering unresolved rows.
- Migration-auditor + Codex + confirmation-gated push. This feeds the go-live runbook (recovery/reconciliation section).

---

## Phase 7 — hygiene batch (MP-09, MP-11, MP-12, MP-13) — LOW×4

- **MP-09:** guard the per-entry refund stamp `.eq('id', entry_id).eq('payment_status','paid').select('id')`; 0 rows → already stamped, log don't overwrite (the full-fee show stamp always wins safely). Assertion-first concurrency test.
- **MP-11:** render the `skipped`/`failed` arrays (grouped by reason, with entry links) in `RefundAllEntriesCard.tsx`; optionally persist the run summary so it survives reload (small schema decision — a `show_refund_runs` row or a note on the show).
- **MP-12:** in `stripe-webhook` `handleChargeRefunded`, `alertAdmin` (not `console.log`) when no order matches and the charge lacks app-refund metadata (out-of-order delivery).
- **MP-13:** stamp `entries.confirmation_email_sent_at`/`status` from the webhook confirmation-email path (or exclude `payment_method='online'` from the Heritage cron query) to stop the double-send.
- **Testing:** targeted unit tests per fix; component test for MP-11 rendering.
- Codex review; MP-11 persistence (if chosen) → migration-auditor + push.

---

## Done criteria

- All 4 HIGH findings closed, tests green, deployed (Phases 1–3). MP-04 verified before any live-mode payout.
- MEDIUM/LOW closed or explicitly deferred with rationale in the audit doc.
- Every phase: assertion-first tests written and passing; `pnpm typecheck` + `pnpm lint` clean; migrations auditor-clean and pushed with confirmation; affected Stripe functions redeployed after schema is live; `/codex:review` run on each PR.
- Update the umbrella "Close out the money path" item in `OPEN-TODOS.md` and flip this plan's status to `Complete` + `git mv` to `docs/archive/` when the HIGHs ship (LOW tail can track as a follow-up row if deferred).
