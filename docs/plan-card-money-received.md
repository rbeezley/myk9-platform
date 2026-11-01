# Card money counts as received on an entry form

> **Status:** Active

Linear: MYK9-1637 (blocks MYK9-11, the Stripe live cutover). Follows MYK9-1634, which
made the database own a mail-in form's total and status
(`20261101184700_myk9_1634_db_owns_form_total_and_status.sql`).

## Why

A card-paid form sits at `paid_amount = 0`, status `paid`, `total_amount` = the Stripe
charge (processing fee included). MYK9-1634 left it that way: its triggers skip any form
`private.enrollment_total_is_stripe` recognises. So:

1. A desk add-on onto a card form is never owed, and "Paid in full" under-charges.
2. "Paid in full" on a card form charges the card amount again, because net received
   (`paid_amount - refund_amount`) is 0.

## What failed last time, and why this design is different

faa162264 (reverted in 01daf0e1e) copied card money _into_ the form: a derived
`card_paid_cents` column, `paid_amount` moved by the change in card money, an AFTER
trigger on `stripe_orders`, and an owed figure of "captured charges + uncovered fees".
It passed every test and 13 mutation checks, and Codex round 4 still found three gaps:
payment links (P1), Stripe refunds (P1) and the "Payment Due" reversal (P2). All three
come from one cause: **card money had two homes**, `stripe_orders` (with its refund
ledger) and `enrollments.paid_amount`. Every flow that touches one has to keep the other
in step.

This design keeps card money in one place and attributes it **per entry**, never per order:

- **`paid_amount` / `refund_amount` hold desk money only** (cash, check, group,
  secretary-paid), as they do today. Nothing card-related ever writes them.
- **Card money is a derived fact about entries**: an entry is _card-covered_ when a
  captured `stripe_orders` row lists it in `entry_ids` and the entry has not been
  refunded. A form's card-covered amount is the sum of `entry_fee` over its card-covered
  entries.
- **What a form owes is one formula for every form**, the MYK9-1634 one: the sum of
  `entry_fee` over live entries not excluded by status. A card form's total stops being
  the Stripe charge. Processing and platform fees are the order's business
  (`stripe_orders.entry_subtotal_cents`, `platform_fee_cents`), not what the entries cost.
- **Net received = desk net + card-covered.** Balance due = total − net received.

How the three Codex gaps go away:

| Gap                    | Why it cannot happen here                                                                                                                                            |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Payment links          | Coverage is per entry, read from `entry_ids`. A link spanning three forms covers each form's own entries; no customer, enrollment id or apportionment needed.        |
| Stripe refunds         | A refunded entry is not card-covered and not owed. Desk refunds are capped at desk net, so card money can only go back through Stripe, which already has one ledger. |
| "Payment Due" reversal | It clears `paid_amount` / `refund_amount`, which only ever held desk money. Card money is not in them to undo or resurrect.                                          |

**Duplication question.** No new surface. It deletes a mode (`enrollment_total_is_stripe`
and every branch on it) and keeps one writer per fact: `stripe_orders` for card money,
the ledger core for desk money, the MYK9-1634 trigger for the total.

## Decisions

1. **Owed** = Σ `entry_fee` over the form's entries with `deleted_at IS NULL` and
   `payment_status` not `waived` and not `refunded`. Adding `refunded` is new: an entry
   whose card money went back no longer owes (a desk refund refunds desk money and does
   not change the entry's status, so it is unaffected). Phase 0 confirms the entry status
   values the refund flows actually write.
2. **Card-covered** (cents) = Σ `entry_fee` over live, owed entries listed in a captured
   order's `entry_ids` (captured = status not pending/failed/canceled/cancelled/expired,
   the MYK9-1634 predicate). Stored as `enrollments.card_covered_cents`, written only by
   the same refresh function that writes `total_amount`, so every client reader can
   compute the balance without a join. The money-column guard covers it.
3. **Refresh triggers**: the existing MYK9-1634 entries triggers (now for every form),
   plus one statement on capture: the existing `sync_enrollment_on_payment_success` /
   `sync_inserted_checkout_enrollment` paths refresh every form whose entries the order
   covers (not only `enrollment_id`), which also settles a payment-link form.
4. **Status**: a form is settled when net received ≥ total. Card capture settles to `paid`
   (as today); a desk add-on that pushes total past net reopens it to `pending` (MYK9-1634
   rule 3, now without the Stripe exemption); the desk payment then settles it
   `paid_by_<method>`. Shrinking never promotes (unchanged).
5. **Desk refund cap = desk net** (`paid_amount - refund_amount`), not net received.
   **This changes an acceptance criterion** ("the refund cap counts card money held, net
   of Stripe refunds"): counting card money in the desk cap lets a secretary hand card
   money back in cash, then Stripe refunds it again. Card money is refunded through
   `stripe-refund-entry` / `stripe-refund-show` only. Needs the owner's OK before Phase 1.
6. **"Paid in full"** charges total − net received, so it charges only what no card and no
   desk money covers.
7. **Backfill**: every form's `total_amount` and `card_covered_cents` recomputed; no
   status, `paid_amount` or refund change. Card forms' totals drop from the charge to the
   entry fees. All live data is test data (owner, 2026-11-01).

## Phases

### Phase 0: verify the facts the design rests on

Answer each from code or the live catalog, and record the answer here before Phase 1:

- Entry `payment_status` values written by `stripe-refund-entry`, `stripe-refund-show`
  (`stamp_show_refund_entries`), `stripe-approve-refund` and the dashboard-refund path in
  `stripe-webhook`; whether any of them leaves a partially refunded entry, and what it
  should count as.
- Whether an entry can appear in two captured orders' `entry_ids` (a retried link). If
  yes, coverage is still per entry, so nothing double-counts; pin it in a test.
- Every order status value in use (`stripe_orders.status` CHECK) against the captured
  predicate.
- Which readers show a card form's total today: `send-registration-email` (index.ts:260),
  `CheckoutSuccessPage.tsx`, `lib/stripe.ts`, `EnrollmentCard.tsx`,
  `useEnrollmentDialogControls.ts`, `enrollmentGrouping.ts`, `useEntryManagementData.ts`,
  the secretary read paths (`secretaryPostgrest.ts`, `secretaryReadReplication.ts`), and
  the entry-blank `FeesSection`s. Any that should show the charge read
  `stripe_orders.amount_cents` instead of `total_amount`.

### Phase 1: migration

- `enrollments.card_covered_cents integer NOT NULL DEFAULT 0`, guarded by
  `restrict_enrollment_money_columns`; added to the secretary replication select.
- `private.enrollment_owed_cents`: add the `refunded` exclusion.
- `private.enrollment_card_covered_cents(uuid)`; GIN index on `entry_ids` already exists.
- Refresh function writes both columns for every form; drop
  `private.enrollment_total_is_stripe` and the BEFORE trigger's Stripe branch.
- `restrict_payment_status_update`: drop the non-Stripe condition from the reopen
  allowance; net received includes card-covered.
- `private.record_enrollment_payment_core` (copy from its latest definition): "Paid in
  full" uses net received; the refund cap uses desk net (decision 5); the reversal is
  unchanged.
- The two checkout sync functions refresh every covered form.
- REVOKEs on new functions; backfill.

### Phase 2: client

- One shared balance helper (`total − (paid − refund) − card_covered`) replaces each
  reader's own subtraction; the `Database` types regenerate after the push.
- Readers from Phase 0 that mean "the charge" switch to the order amount.

### Phase 3: testing

- `supabase/tests/myk9_1637_card_money_received_test.sql`, one case per criterion:
  - card checkout: total = fees, card-covered = fees, balance 0, status `paid`;
  - desk $25 check add-on onto a card form: reopens to `pending`, "Paid in full" charges
    exactly $25, then `paid_by_check`;
  - "Paid in full" on a fully card-covered form charges nothing;
  - payment link covering entries on two forms: each form's coverage is its own entries,
    both settle;
  - Stripe refund of one card entry: it leaves owed and card-covered, balance unchanged,
    no status promotion;
  - desk refund on a card form is capped at desk money (card money cannot leave in cash);
  - "Payment Due" after a desk add-on clears desk money only, card coverage intact;
  - an entry in two captured orders counts once;
  - a pending, failed or expired order covers nothing.
- Re-baseline the MYK9-1634 tests whose Stripe cases assumed "keeps its charge".
- Mutation-check every guard with the `mutate1634.py` driver pattern (break each predicate,
  watch its case go red); `pnpm qa:sql-local` green.
- Vitest for the balance helper and every touched reader, shuffled; `pnpm typecheck`;
  lint; `pnpm qa:code-quality-ratchet`.

### Phase 4: review and ship

migration-auditor, then `pnpm qa:codex-review --post` (independent floor; money paths).
Convergence rule: a second finding on the same path, or a finding in code the previous fix
introduced, stops the PR for a restructure, not a patch. After merge and only with the
owner's OK in chat: `supabase db push` from merged main; check 0 forms differ from the
derived total and coverage; advisors; Deploy myK9Show; regenerate types.

## Non-goals

- Fee breakdowns (platform, processing) on the form; they stay on `stripe_orders`.
- Changing Stripe refund flows themselves or their ledger.
- Partial refunds of a single entry beyond what Phase 0 finds the flows can produce.
- MYK9-11 itself (the live cutover).
