# Refunds the club settles itself, recorded on the entry (MYK9-2303)

> **Status:** Active

Design-first plan: this is money work with a likely migration, so the owner decides before any code. Split from MYK9-1953. Owner decision 2026-11-13: after the payout the club settles a refund with the exhibitor directly; the operator clawback is the exception. MYK9-2302 (merged) already says so in the refusal.

## What exists today, and why

- **Entry payment menu.** `EnrollmentCard.tsx` shows "Refunded…" and "Partial Refund…" only for entry forms (an enrollment) and those write the desk ledger `show_payments` (kind `refund`, cash or check, via `record_enrollment_payment`). A card-paid group has no form, so it gets only a badge. The comment ("would read like a real card refund; their status follows Stripe via the per-entry Withdrawn → refund flow") was written with that code and only moved in the MYK9-328 dead-code sweep (`git log -S`). It is a deliberate guard against a secretary thinking a desk button returned card money.
- **Card refunds.** `stripe-refund-entry` is the only writer of `entries.refund_amount`, `refund_notes`, `refunded_at`; a trigger (`restrict_entry_refund_columns`) rejects every other writer. Each Stripe refund is mirrored in `stripe_order_refunds`, with `club_funded` marking refunds that come out of the club's payout (MYK9-997).
- **Readers.** Payout math (`payoutLedger.ts`) subtracts `entries.refund_amount` from the club's share. The Financial Report (`financialReportTotals.ts`) counts `refundAmount` as "refunded". The close-out money card reconciles the cash box from `show_payments` and, by design, leaves card money out. The refund-to-decide list (`refundsToDecide.ts`) treats `refund_amount > 0` or `refunded_at` as decided.

Consequence: reusing `refund_amount` is wrong. It is service-role-only, it would shrink a payout that has already gone, and every reader would call it a Stripe refund.

## Proposed shape

**Control.** No new page. On a card-paid entry whose payout has gone, the existing payment menu gains one item, "Refunded by the club…". It opens a small dialog headed "The club paid this back" with the line: "No card refund is issued. Record only money you already paid the exhibitor yourselves." Fields: amount (capped at what was paid, minus earlier club-settled amounts), date paid (defaults to today, show timezone), how (check, cash, other) and a reference (check number), plus the secretary's name taken from the session. The item is hidden before the payout (then the normal Stripe refund applies).

**Data.** A new table `club_settled_refunds`: id, show_id, entry_id (RESTRICT FK, like the other ledgers), amount > 0, paid_on date, method (check, cash, other), reference, note, recorded_by, client_refund_id (retry key), created_at. Rows are never edited; a correction is a reversing row. Explicit `GRANT SELECT` to authenticated, `REVOKE ALL` from anon, RLS read for the show's office managers and the club admin; no write grant. The one writer is a SECURITY DEFINER RPC that checks the show's office manager, that the entry is card-paid, that its payout row is not pending, and the cap. No change to `entries` columns or to the refund trigger.

**Offline.** Online-only. It happens after the show and after the payout, never at the ringside, and the CLAUDE.md rule allows direct RPCs for explicitly online-only money paths. The dialog says "Needs a connection" when offline instead of queuing. Reads follow the same path as `show_payments`.

**Counting.**

- Entry form and entry list: a "Refunded by the club" badge with amount and date; the entry is still paid by card and never shows "Refunded by Stripe".
- Financial Report: a separate "Refunded by the club" column and total, not folded into "refunded", so collected, platform fees and net-to-club do not move.
- Close-out: a line "Club paid back directly: $X", outside the cash-box reconciliation and outside platform figures.
- Club reconciliation card: shown as money the club returned, beside (not inside) the Stripe refund figure.
- Payout math, `stripe_orders` and `stripe_order_refunds` are untouched; platform figures are unchanged by construction.
- Refund-to-decide: a club-settled amount resolves the pending decision for that entry.

**Refusal wording.** Until this ships, the MYK9-2302 single-entry refusal also says "check what the club already paid the exhibitor". Once it ships, it adds "you can record it here once it is done" (deep-link to the entry).

## Do nothing, link, or delete?

- **Free-text note on the entry.** Cheapest, and it can ship now, but it feeds no report, so the Financial Report would overstate what the club kept. Fails the "reports count it" criterion.
- **Reuse the non-card refund path.** That path writes `show_payments`, which reconciles the cash box; a club check would make the box look short. Rejected.
- **Reuse `refund_amount`.** Rejected above.
- **Do nothing.** Honest option for launch if clubs rarely refund after payout; the refusal wording already tells them the right thing. Cost: no record, so the club's own books and the report disagree.

Recommendation: build the narrow table and dialog; fall back to the note only if the owner wants no migration before fall.

## Open questions for the owner

1. Is "Refunded by the club" the right label? Recommend yes (the parent's wording).
2. Allow partial amounts and several rows per entry? Recommend yes, capped in total at what was paid.
3. Should the platform ever recover a club-settled amount? Recommend no; it is the club's own money.
4. Can a secretary reverse a mistaken row? Recommend yes, by a reversing row with the same dialog, never an edit.
5. Is the entry hidden before the payout, or allowed anytime? Recommend after the payout only, so the Stripe refund stays the default.

## Testing

- Behavioral SQL (`supabase/tests/`): RPC authorizes only the show's office manager; rejects a non-card or unpaid entry, a payout still pending, an over-cap amount; the retry key writes once; anon and plain exhibitors cannot read or write; payout math, `entries.refund_amount` and `stripe_order_refunds` are unchanged after a write. Verify grants from `pg_class.relacl` on the applied database.
- Unit: Financial Report totals keep collected and net-to-club fixed and add the club column; close-out line; refund-to-decide resolves.
- Component: the menu item shows only for payout-gone card entries, the dialog states no card refund is issued, offline disables confirm, the badge reads "Refunded by the club".
- Shuffled suite run and a staging walk with writes confirmed.
