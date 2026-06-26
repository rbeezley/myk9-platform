# Withdrawal Refund Policy — club-declared, exhibitor-disclosed, manually executed

> **Status:** Active

> **Sibling to** [`plan-entry-payment-request.md`](plan-entry-payment-request.md), which deliberately scopes ONLY system-caused **make-whole** refunds (overbook→deny / duplicate / expired / deleted-entry — full refund incl. platform fee). This plan covers the **club-policy** refunds it deferred: voluntary withdrawal, show cancellation, judge change. **Adjacent to** [`plan-pull-management-split.md`](plan-pull-management-split.md) — a pulled entry that is also a voluntary withdrawal resolves through *this* policy at the reconciliation surface that plan's Phase 2 builds.

> **Decided:** 2026-06-25 (brainstorm with owner).

> **For agentic workers:** Touches payment/Stripe + refund-amount math. Run `/codex:review` alongside `/review` before merge. Any migration goes through `migration-auditor` before `db push`.

---

## Problem

Three refund complaints dominate exhibitor frustration on competitor systems — *"I withdrew weeks out and they kept my money,"* *"show cancelled, where's my refund,"* *"judge changed and I only entered for them."* The root cause that actually generates the complaint is **surprise and silence**, not a missing refund button: the refund *execution* rail (`stripe-refund-entry`, supports partial via `amount_cents`) already exists, but **there is nowhere for a club to declare its withdrawal policy** (no `refund_policy` column exists anywhere in the schema) and **no surface that shows that policy to an exhibitor before they pay.**

This is **not** a refund-calculation engine. The [pull-management plan](plan-pull-management-split.md) already set the governing precedent: *the system must not enforce refund rules or automate refund creation — exceptions are too common and policy varies; inform, don't automate; defaults + override.* Voluntary-withdrawal refunds — even more policy-laden — inherit that philosophy. The build is **declaration + disclosure + manual execution**, not computation.

---

## Scope (clarified in brainstorm — the three cases are NOT co-equal)

| Case | What it needs | Why |
|------|--------------|-----|
| **Voluntary withdrawal** | **The whole feature** — club-declared policy (cutoff + retention + prose), disclosed at checkout, snapshotted at payment, manually executed | Only case with genuine policy nuance + the "kept my money" surprise + where pre-payment disclosure changes behavior |
| **Show cancellation** | A **bulk "refund all"** action (make-whole: full incl. platform fee) | No policy here — club cancelled, everyone gets everything back. The only real problem is *scale* (refunding 200 entries one-by-one) |
| **Judge change** | **Nothing new** — secretary issues a normal refund with a note | Rare; not automatic even when it happens; no club issues blanket judge-change refunds. Already covered by the plain refund button |

### Explicitly NOT a build item — "paid then waitlisted, they kept my money"

The waitlist-money complaint comes from **competitor systems that don't use pay-to-claim**. myK9's [entry-payment plan](plan-entry-payment-request.md) Task 5 (pay-to-claim) means an online exhibitor **doesn't pay until promoted off the waitlist** — so "paid and stuck on the waitlist" *can't happen*. This is a **positioning/onboarding benefit to market** ("On myK9 you never pay for a spot you don't get"), not a feature. **One sanity check owed (in the entry-payment plan, not here):** confirm mail-in waitlisters are also collected *on promotion*, not charged up front — otherwise the benefit claim has a hole.

---

## Domain model & decisions

### D1 — Policy lives club-default / show-override (mirror migration 114)

Same inheritance pattern already in the codebase (`shows.default_judge_day_capacity` + `judge_assignments.day_capacity_override`; heritage registry defaults):

- `clubs.default_withdrawal_policy_*` — club sets once; every show inherits.
- `shows.withdrawal_policy_override_*` (nullable) — set only when *this* show differs (specialty, big-name judge, outdoor weather risk, year-end).
- **One resolution accessor** — `getEffectiveWithdrawalPolicy(show, club)` = override fields if present, else club default. Three callers (checkout disclosure, secretary refund-suggestion, refund-amount default) hit that one function — none re-derives it (same shared-function constraint as the show-map priority fn).

### D2 — Policy shape: lightly structured + prose escape hatch

Not free prose (gives no disclosure precision, no secretary guidance), not a multi-tier computed grid (contradicts "inform, don't automate"). Minimal structured fields:

| Field | Type | Meaning |
|-------|------|---------|
| `refund_cutoff_date` | `date` (nullable) | Full refund **before** it. Pre-fill from the show's entry-close date; editable for a post-close grace window. NULL = no structured cutoff (prose governs). |
| `retention_type` | `'flat' \| 'percent'` | What's kept **after** the cutoff |
| `retention_value` | `integer` | Flat = cents per entry (the dominant dog-show "office fee" pattern); percent = whole-number % |
| `policy_notes` | `text` (nullable) | **Escape hatch** — a club with a full→50%→none three-date schedule puts the nuance here; structured fields still drive the common-case disclosure + the secretary's suggested default |

### D3 — Snapshot the policy onto the entry at payment time (the trust-critical decision)

The disclosed policy is what the exhibitor **agreed to**. If a club edits its policy in week 3, that must NOT retroactively change the deal for someone who paid in week 1 — doing so manufactures the exact *"they changed the rules on me"* complaint this feature exists to kill.

- **Live resolution** (`getEffectiveWithdrawalPolicy`) governs **display before payment** only.
- **A snapshot** of the effective policy is written to the **entry** at payment time (`entries.withdrawal_policy_snapshot JSONB`, or on the `stripe_orders` row). **The snapshot governs the actual refund**, weeks later, immune to later edits.
- Legacy/no-snapshot entries (pre-feature, or comped/cash with no payment event) → fall back to live resolution, surfaced as "policy at time of payment not recorded" (same graceful-NULL spirit as pull-management's `pull_timing = null`).

### D4 — Fee handling splits by bucket (resolves "do we eat the fees")

The norm in both event/ticketing (Eventbrite/Ticketmaster: service fees non-refundable) and online dog-show entry (per-entry processing fee non-refundable on withdrawal) is **"service fees are not refundable."** A withdrawal refund is a stack of three amounts, and the bucket decides each:

| | Entry fee | myK9 platform fee (~7%) | Stripe processing fee | Rationale |
|---|---|---|---|---|
| **Voluntary withdrawal** | Per club policy (full, or minus office fee after cutoff) | **Non-refundable** | **Non-refundable** (Stripe keeps it regardless) | Exhibitor *chose* to leave; got the service. Defensible + matches norm |
| **Show cancellation / make-whole** | Full | **Refunded** | myK9/club eats it | Club/system fault; exhibitor got nothing |

**The retained fee is not a complaint *if disclosed*.** Surprise is the complaint engine. The checkout line — *"Entry fees refundable per the club's policy until June 1; service fees are non-refundable"* — converts "they kept my money" into a non-event.

Worked example: $30 entry withdrawn after cutoff, club office fee $10 → exhibitor gets **$20** back (`stripe-refund-entry` with `amount_cents = 2000`), myK9 keeps its ~$2 platform fee, Stripe keeps its cut — **and the checkout screen said so.**

### D5 — No automation; secretary executes with the snapshot as guidance

The refund dialog **pre-fills** the suggested `amount_cents` from the snapshot (before cutoff → full; after → full minus retained), always one-click overridable (mirrors pull-management defaults+override). The secretary owns the final number; the system never auto-issues a voluntary-withdrawal refund.

### D6 — [ADDED] Online-paid vs offline-paid (cash/check/comped) execution split

`stripe-refund-entry` can only refund an entry with `payment_method='online'` + a `stripe_payment_intent_id`. A cash/check/comped withdrawal has no Stripe charge to reverse — the **policy disclosure and the suggested-amount math still apply** (the exhibitor still wants to know what they get back), but **execution is offline**: the secretary returns cash / voids the check / records the adjustment, and the refund dialog shows "This entry was paid {cash/check} — issue the refund outside myK9; recording only." No Stripe call is attempted. The suggested amount from the snapshot is still displayed as guidance. (Same `payment_method`-gated split the entry-payment plan's payout math already relies on.)

### D7 — [ADDED] Cutoff is timezone-correct; percent rounding is defined

- **Timezone:** the cutoff is a calendar date evaluated in the **show's timezone** (`trials.timezone`, default `America/New_York` — see CLAUDE.md heritage columns), not UTC. `resolveWithdrawalRefundCents(policy, entryFeeCents, asOfDate, timezone)` compares `asOfDate` against `refund_cutoff_date` end-of-day in that tz. A boundary refund evaluated in the wrong tz silently changes the amount — the exact surprise this feature exists to kill.
- **Percent rounding:** `retention_type='percent'` retains `round(entryFeeCents * pct / 100)` (round half up), refunds the remainder; the helper asserts the retained + refunded cents sum to the entry fee (no lost/created cent).

### D8 — [ADDED] Unset-policy empty state

Most clubs won't configure a policy on day one. When `getEffectiveWithdrawalPolicy` resolves to nothing (no show override, no club default), checkout shows a **neutral default line** — *"Refund policy: contact the club. Service fees are non-refundable."* — never a blank. The snapshot records "no structured policy" so the refund dialog flags it for fully-manual handling (same spirit as a NULL `pull_timing`). Optionally surface a one-line nudge on the club/show settings card ("No withdrawal policy set — exhibitors see a generic message") so configuring it is discoverable.

---

## Out of scope

- Automated/triggered withdrawal refunds (D5). The make-whole *auto*-refunds (`_shared/entryPaymentAutoRefund.ts`) stay scoped to the entry-payment plan.
- A new refund rail — reuse `stripe-refund-entry` (`{ entry_id, amount_cents?, notes? }`) verbatim.
- Judge-change structured handling (covered by the plain refund button).
- Per-class or per-entry policy granularity — policy is club-default / show-override only. Revisit only if a real club asks.
- Multi-tier computed schedules — the `policy_notes` prose escape hatch absorbs these; do not build a tier engine.

---

## Implementation

### Phase 1 — Policy data model + resolution accessor

- Migration: add `default_withdrawal_policy_*` to `clubs`, `withdrawal_policy_override_*` to `shows` (cutoff date, retention_type, retention_value, policy_notes). Explicit `GRANT`s (CLAUDE.md: new columns inherit table grants, but verify table grants exist) + confirm RLS on `clubs`/`shows` already gates writes to club/show managers. Run `migration-auditor`.
- Add `getEffectiveWithdrawalPolicy(show, club)` accessor + a pure `resolveWithdrawalRefundCents(policy, entryFeeCents, asOfDate)` helper (returns suggested refund cents; before cutoff = full, after = full − retained; NULL cutoff = full, prose governs). Unit-test the helper first (assertion-first).
- Hand-add the new columns to `database.types.ts` (per `feedback_typecheck_incremental_cache_masks_new_files`).

### Phase 2 — Club/show policy declaration UI

- Club settings: a `WithdrawalPolicyCard` (cutoff date, retention type+value, prose) on the club edit surface — defaults for all the club's shows.
- Show settings: the same card in override mode (empty = "inherits club policy"; filled = overrides) — mirror how `WaitListSettingsCard` sits in `ShowSettingsPage`.
- Write-authz via existing club/show-manager RLS, not UI-only.

### Phase 3 — Pre-payment disclosure (the transparency fix)

- Render the effective policy as a concise line at **both** pay surfaces: `CartSummary.tsx` (exhibitor self-pay) and `RequestPaymentDialog.tsx` (secretary payment link). Format: *"Full refund until {cutoff}; after that, {retained} is non-refundable. Service fees are non-refundable."* Prose-only policy → show the prose.
- **Snapshot on payment:** write the effective policy JSON to the entry (or order row) in the same webhook/path that marks the entry paid (`handleCheckoutCompleted` + the `entry_payment_request` branch). Verify the `entries` payment-field protection triggers permit the service-role snapshot write.

### Phase 4 — Refund execution surfaces

- **Voluntary withdrawal:** in `RefundEntryDialog`, pre-fill suggested `amount_cents` from the snapshot via `resolveWithdrawalRefundCents`, with the policy shown and the amount overridable. (This is the same dialog the pull-management reconciliation surface opens — a pulled entry that's a voluntary withdrawal flows through here.)
  - **[ADDED] Offline-paid entries (D6):** when `payment_method` is cash/check/comped, the dialog shows the suggested amount as *guidance only*, attempts **no** Stripe call, and labels it "record outside myK9."
  - **[ADDED] Refund failure UX:** on a Stripe failure or a rejected amount, surface the mapped error from `_shared/refundValidation.ts` (reuse the existing validation/error path — don't invent new copy); the entry stays unrefunded, retryable.
- **Show cancellation:** a **bulk "Refund all entries"** action (make-whole — full incl. platform fee, reusing the make-whole amount path) on the show-management surface, with a confirm + progress + per-entry result (partial-failure tolerant). Gated to club-admin/secretary.
  - **[ADDED] Scale & idempotency:** iterate entries with **bounded concurrency** (small batch, not 200 parallel Stripe calls — respect Stripe rate limits); **skip** entries already refunded/withdrawn/offline-paid (report them as skipped, not failed); rely on `stripe-refund-entry`'s existing per-entry idempotency key (`refund-entry-{id}-{n}`) so a re-run of a partially-completed bulk refund doesn't double-refund. Only online-paid entries are Stripe-refunded; offline-paid are listed for manual handling.
- **Judge change:** none — documented as "use the standard refund."

### Phase 5 — Tests (plan is not complete until green)

- [ ] `resolveWithdrawalRefundCents` unit: before cutoff = full; after = full − flat; after = full − percent; NULL cutoff = full; prose-only = full + flag-for-manual.
- [ ] **[ADDED]** Timezone boundary (D7): an `asOfDate` that is "after cutoff" in UTC but "before cutoff" in the show's tz resolves as **before** (refund full) — asserts the tz is honored, not UTC.
- [ ] **[ADDED]** Percent rounding (D7): retained + refunded cents sum exactly to the entry fee (no lost/created cent); round-half-up on an odd value.
- [ ] **[ADDED]** Offline-paid (D6): a cash/check/comped entry's withdrawal computes a suggested amount but issues **no** Stripe call (assert `stripe-refund-entry` not invoked).
- [ ] **[ADDED]** Unset policy (D8): no override + no club default → checkout renders the neutral default line (not blank); snapshot records "no structured policy"; refund dialog flags fully-manual.
- [ ] `getEffectiveWithdrawalPolicy` unit: show override wins; falls back to club default; both empty = no structured policy.
- [ ] **Snapshot immutability:** an entry paid under policy A still resolves to A after the club edits to policy B (assertion-first — this is the trust-critical path).
- [ ] Disclosure render: `CartSummary` + `RequestPaymentDialog` show the effective policy line; prose-only path renders prose; "service fees non-refundable" always present.
- [ ] Refund dialog pre-fill: snapshot before-cutoff → suggests full; after → suggests full − retained; secretary override changes the amount sent to `stripe-refund-entry`.
- [ ] Fee-bucket amounts: voluntary withdrawal refund = entry-fee-per-policy only (asserts platform fee NOT included); cancellation/make-whole = full incl. platform fee. Assert the cents (per `feedback_db_constraint_review` / assertion-first money rule).
- [ ] Bulk cancellation: refunds N entries, tolerates a per-entry failure, reports results; non-manager blocked (RLS).
- [ ] Migration: `migration-auditor` pass (GRANTs/RLS) before `db push`.
- [ ] `cd apps/myk9show && pnpm test` + `pnpm typecheck` green.

---

## [ADDED] Rollout / deploy (merge ≠ deploy)

- **Migration** (`clubs`/`shows` columns): `migration-auditor` → `supabase db push` (confirm first — shared-system write). Forward-only; the columns are nullable/additive so no destructive down-migration needed (pre-launch, `project_prelaunch_no_users`).
- **`stripe-webhook` redeploy is REQUIRED** — Phase 3's snapshot write lives inside the existing `stripe-webhook` function. Merging the PR does **not** deploy it (`feedback_merge_is_not_deploy`): after merge, `supabase functions deploy stripe-webhook --workdir apps/myk9show --project-ref sojmvhhwsjxmfistvzbe --no-verify-jwt`, then verify `functions list` `UPDATED_AT` post-dates the merge. `stripe-refund-entry` is **unchanged** — no redeploy.
- Stripe **test-mode** end-to-end before live: set a policy → exhibitor pays (snapshot captured) → withdraw before cutoff (full) and after (full − retained) → confirm refunded cents + that the platform fee is retained on the voluntary path. Use `/stripe:test-cards`.

## Open questions (resolve in Phase 1)

- [ ] Snapshot home — `entries.withdrawal_policy_snapshot JSONB` vs a column on `stripe_orders`. Entry is the natural 1:1 home for the refund decision; confirm the payment-field protection triggers allow the write, else use the order row.
- [ ] Cutoff semantics — absolute date only, or also relative-to-close (auto-shifts if the show's close date moves)? Lean absolute, pre-filled from close date; revisit if clubs phrase policies relative to closing.
- [ ] Does the **club** default need its own settings home if no club-edit surface exists yet? Confirm a club-settings surface exists; if not, scope Phase 2 to show-level first and add club-default when the club surface lands (avoid building a new page — CLAUDE.md consolidation rule).

---

## Related plans

- [`plan-entry-payment-request.md`](plan-entry-payment-request.md) — the make-whole bucket (Task 3.5 Step 6) + pay-to-claim (which makes the waitlist-money complaint a non-issue); this plan is its deferred policy sibling.
- [`plan-pull-management-split.md`](plan-pull-management-split.md) — Phase 2 reconciliation surface (Entry Management, filter=pulled) is where a pulled-and-withdrawn entry's refund decision is executed using this policy.
