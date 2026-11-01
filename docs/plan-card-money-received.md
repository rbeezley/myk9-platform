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

1. **Owed** = Σ `entry_fee` over the form's entries with `deleted_at IS NULL`,
   `payment_status` not `waived`, and **no Stripe refund stamp** (`refund_amount IS NULL`).
   Not `payment_status = 'refunded'`: a desk refund's cascade marks every entry
   `refunded` too (with no stamp), which would zero a mail-in form's total. Only the
   service role can write `entries.refund_amount` (`trg_restrict_entry_refund_columns`),
   and only the Stripe refund flows do, so the stamp means "Stripe refunded this entry".
2. **Card-paid entry** = one a `succeeded` order lists in `entry_ids`, with no Stripe
   refund stamp. **Card-covered** (cents) = Σ `entry_fee` over the form's card-paid
   entries, deleted or not (money the club still holds, as `paid_amount` keeps a deleted
   entry's desk money). Stored as `enrollments.card_covered_cents`; the BEFORE derive
   trigger recomputes it on every write that names it, so no caller can set it, and the
   money-column guard is not needed for it.
3. **Refresh triggers**: the MYK9-1634 entries triggers (now for every form, plus a change
   of the refund stamp), and one AFTER trigger on `stripe_orders` (a succeeded INSERT, or
   a change of status or `entry_ids`) that refreshes every form the order's entries are
   on. A sync-path refresh alone would not do: during a pending → succeeded UPDATE the
   entries attach in the BEFORE trigger, while the order still reads pending. The checkout
   sync no longer forces `paid` on an existing form (it did, which would have hidden an
   unpaid desk add-on) and creates new forms `pending`; the refresh settles them.
4. **Status** (one function, `private.refresh_enrollment_money`): a settled form becomes
   `pending` when its total grew or its card money shrank and money received no longer
   covers it; a `pending` form becomes `paid` when its card money grew and now covers it
   (a capture, a payment link). The status guard allows both derived moves for an
   unprivileged caller. Shrinking totals never promote (unchanged). The desk's entries
   cascade skips card-paid entries (an existing guard would otherwise reject "Payment
   Due" on a card form: online entries can only be marked paid or refunded).
5. **Desk refund cap = desk net** (`paid_amount - refund_amount`), not net received.
   **This changes an acceptance criterion** ("the refund cap counts card money held, net
   of Stripe refunds"): counting card money in the desk cap lets a secretary hand card
   money back in cash, then Stripe refunds it again. Card money is refunded through
   `stripe-refund-entry` / `stripe-refund-show` only. Owner approved, 2026-11-01.
6. **"Paid in full"** charges total − net received, so it charges only what no card and no
   desk money covers.
7. **Backfill**: every form's `total_amount` and `card_covered_cents` recomputed; no
   status, `paid_amount` or refund change. Card forms' totals drop from the charge to the
   entry fees. All live data is test data (owner, 2026-11-01).

## Phases

### Phase 0: verify the facts the design rests on

Answered 2026-11-01:

- **Refund writes.** `stripe-refund-entry` (`buildEntryRefundStamp`) and
  `stamp_show_refund_entries` stamp `refund_amount`, `refunded_at` and
  `payment_status = 'refunded'`. Make-whole refunds (cart overflow) refund money for
  entries never accepted, and dashboard refunds alert for manual reconciliation; neither
  stamps an entry. A desk refund's cascade sets `refunded` with no stamp. Hence the stamp,
  not the status, is the predicate (decision 1). A partially refunded entry is stamped,
  so it leaves both sides; any remainder the club kept is not shown on the form.
- **Two orders, one entry.** None live (4 orders, all succeeded, 4 entries on 2 forms, no
  payment links). Coverage is an `EXISTS`, so it cannot double-count; pinned in case 8.
- **Order statuses**: pending, processing, succeeded, failed, refunded, cancelled. Only
  `succeeded` is card money held; `processing` has not arrived and `refunded` went back.
- **Readers.** `CheckoutSuccessPage` and `lib/stripe.ts` read `stripe_orders.amount_cents`
  (unchanged). `send-registration-email` is sent for entry-form submissions and shows the
  form's entry total (unchanged in meaning). Entry Management's balance, footer,
  checklist and decision email read money received through `receivedDollars`; the desk
  refund dialog reads `netReceivedDollars`.

### Phase 1: migration

Migration `20261101213300_myk9_1637_card_money_received.sql`:

- `enrollments.card_covered_cents`, derived by `trg_enrollments_derive_total`.
- `private.enrollment_owed_cents` (stamp exclusion), `private.entry_is_card_paid`,
  `private.enrollment_card_covered_cents`, `private.refresh_enrollment_money`; the
  entries triggers call the refresh; `trg_stripe_orders_refresh_enrollments(_on_update)`.
- `sync_enrollment_on_payment_success`: no forced `paid`, no total write.
- `restrict_payment_status_update`: both derived moves, money received includes card.
- `private.cascade_enrollment_entry_payment_status`: skips card-paid entries.
- `private.record_enrollment_payment_core`: "Paid in full" and the status use money
  received; the refund cap uses desk net; 'refunded' only when nothing is held;
  "Payment Due" leaves a form card money covers `paid`.
- `submit_show_entries`: a secretary-paid / group submission counts card money.
- `private.enrollment_total_is_stripe` dropped; backfill of the two derived columns.

### Phase 2: client

- `card_covered_cents` read on both secretary paths (PostgREST and replication) and
  carried to `EnrollmentGroup.cardCoveredAmount` (dollars).
- `receivedDollars(group)` = desk net + card money: the balance, footer, checklist and
  decision email. The desk refund dialog keeps `netReceivedDollars` (decision 5).
- `database.types.ts` carries the column by hand until the post-push regeneration.
- No reader that means "the charge" read `total_amount`, so none switches.

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
