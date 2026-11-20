# Refunds the club settles itself, recorded on the entry (MYK9-2303)

> **Status:** Active

Money work with a migration. Split from MYK9-1953. Owner decision 2026-11-13: after the payout the club settles a refund with the exhibitor directly; the operator clawback is the exception. MYK9-2302 (merged) already says so in the refusal.

Owner answers (2026-11-20, on MYK9-2303): build it; label "Refunded by the club"; partial amounts and several records per entry, capped; the platform never recovers a club-settled amount; a mistake is fixed by a reversing record, never an edit; offered only after the payout.

## What exists today, and why

- **Per-entry card refund.** `RefundEntryDialog` (opened per entry from `EntryListCard` and `PullManagementTab`) calls `stripe-refund-entry` against the entry's money root (`moneyRootEntryId`). Once the show's payout is `completed` the server refuses with `payout_already_sent`, and the dialog says the club pays the exhibitor directly. This dialog already knows exactly which entry is meant, which a group's payment menu does not.
- **Group payment menu.** `EnrollmentCard`'s "Change" menu is the desk ledger (`show_payments`, cash/check, via `record_enrollment_payment`). A card checkout gets a form when its payment lands, so the menu can show on card groups, but it is one menu for several class entries and it reconciles the cash box. Not the place for this.
- **Card refund columns.** `entries.refund_amount`, `refund_notes`, `refunded_at` are written only as service role: `stripe-refund-entry` and `stripe-refund-show` (through `stamp_show_refund_entries`). The trigger `restrict_entry_refund_columns` rejects every other writer. Payout math (`payoutLedger.ts`) subtracts `refund_amount` from the club's share.
- **Payout state.** `show_payouts` holds at most one non-failed row per show; `pending`, `processing`, `completed`, `failed`. Only `completed` means the club received the money. Show secretaries and club admins can read it (`show_payouts_select`).
- **Readers.** The Financial Report (`financialReportTotals.ts`) shows `netRetained = collected - refunded`. The refund-to-decide rule (`paidOnlineUnrefundedRemoval` in `pullReconciliation.ts`) treats `refund_amount > 0`, `refunded_at` or a `denied` decision as decided. All of them read entry rows, most through the replicated entries cache.

Reusing `refund_amount` is wrong: it is service-role-only, it would shrink a payout that already went, and every reader would call it a Stripe refund.

## Shape

### Control: the per-entry refund dialog

No new page and no new menu item. `RefundEntryDialog` reads the show's non-failed payout row when it opens.

- **`completed`:** the dialog shows the club form instead of the card form (`ClubSettledRefundForm`, a sibling component). Title "The club paid this back". First line: "The club has already been paid for this show, so no card refund is issued. Record only money the club already paid the exhibitor." Fields: amount (prefilled with the remaining balance, never above it), date paid (defaults to today), how (check, cash, other), reference (check number), note. Below the form, the entry's earlier club records, each with "This was a mistake…" which records the reversal after a confirm.
- **Not completed (none, `pending`, `processing`, `failed`):** the card form as today. A server `payout_already_sent` refusal (a payout that completed while the dialog was open) switches the dialog to the club form.
- **Offline:** the club form is online-only; it says "Needs a connection" and disables Save instead of queuing. Recording happens after the show and the payout, never ringside, and CLAUDE.md allows direct RPCs on explicitly online-only money paths.

Because the dialog is per entry and posts the money root, refunding one class never touches a sibling class in the same checkout.

### Data

**Ledger `public.club_settled_refunds`** (the record of truth):

| column           | notes                                                                                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| id               | uuid pk                                                                                                                                           |
| show_id          | FK shows, RESTRICT                                                                                                                                |
| entry_id         | FK entries, RESTRICT (the money root)                                                                                                             |
| amount           | numeric(10,2), `<> 0`. Positive: money the club paid back. Negative: a reversal                                                                   |
| reverses_id      | FK to this table, UNIQUE, NULL on a payment. A reversal carries the original's id and `amount = -original.amount`; UNIQUE stops a second reversal |
| paid_on          | date, NOT NULL on a payment, NULL on a reversal                                                                                                   |
| method           | `check` / `cash` / `other`, NOT NULL on a payment, NULL on a reversal                                                                             |
| reference, note  | text, optional                                                                                                                                    |
| recorded_by      | person id of the caller                                                                                                                           |
| client_refund_id | uuid UNIQUE, retry key                                                                                                                            |
| created_at       | timestamptz                                                                                                                                       |

CHECKs tie the shape together: a payment has `amount > 0`, `reverses_id IS NULL`, `paid_on` and `method`; a reversal has `amount < 0` and `reverses_id`. Rows are never updated or deleted.

**Cached total `entries.club_refunded_amount`** numeric(10,2) NOT NULL DEFAULT 0: the net of the entry's ledger rows, written in the same transaction as each ledger row. It exists so every reader that already loads entries (the replicated cache, reports, the refund-to-decide rule) gets the figure with no second read. A trigger rejects any change to it unless the transaction set `myk9.club_settled_refund_write = 'on'` (only the RPC does) or the role is `service_role`. The card refund columns and `restrict_entry_refund_columns` are unchanged.

**Grants** (MYK9-93 recipe, as in `20261031163700_myk9_1601_entry_form_notes.sql`): `REVOKE ALL ON public.club_settled_refunds FROM PUBLIC, anon, authenticated;` then `GRANT SELECT TO authenticated` and full rights to `service_role`. RLS on, one SELECT policy: site admin, the show's secretary, or the show's club admin (the predicate `show_payouts_select` uses). No INSERT/UPDATE/DELETE grant or policy. The RPCs are `REVOKE ALL ... FROM PUBLIC, anon` and `GRANT EXECUTE ... TO authenticated`.

**Writer: `record_club_settled_refund(p_entry_id, p_amount, p_paid_on, p_method, p_reference, p_note, p_client_refund_id)`**, SECURITY DEFINER, `search_path = ''`:

1. Same `client_refund_id` already recorded for this entry: return that row (retry). For another entry: refuse.
2. Lock the entry row `FOR UPDATE`.
3. Authorize as the caller: `is_show_secretary(show)`, `is_club_admin(club)` for a show with a club, or `is_site_admin()`, the same three `stripe-refund-entry` uses.
4. The entry was paid by card: `payment_method = 'online'` and a `stripe_payment_intent_id`.
5. The show's payout is `completed`. Absent, `pending`, `processing` and `failed` are refused (`payout_not_completed`).
6. Cap: `p_amount <= (entry_fee - coalesce(discount_amount, 0)) - coalesce(refund_amount, 0) - club_refunded_amount`. Stripe refunds from either path (`stripe-refund-entry` or `stamp_show_refund_entries`) are already in `refund_amount`. Over the cap: `amount_exceeds_balance`.
7. Insert the row, set the transaction flag, update `club_refunded_amount`, clear the flag.

**Reverser: `reverse_club_settled_refund(p_refund_id, p_note, p_client_refund_id)`**: same retry, lock, authorization and payout steps; the original must be a payment (not a reversal) and not already reversed. Inserts the negative row and lowers the cached total. A reversal restores the available balance.

Error codes are stable strings in `RAISE EXCEPTION ... USING ERRCODE = 'P0001'` with the code as the message, mapped to secretary language in the form.

### Counting

The **platform payout** is a historical fact and never moves: `payoutLedger.ts`, `stripe_orders`, `stripe_order_refunds` and the payout transfer are untouched. What changes is what the **club retained**.

- **Financial Report:** each line gets `clubRefunded = min(club_refunded_amount, netFee - refunded)`; `netRetained = collected - refunded - clubRefunded`, so "Net Retained" is what the club kept. Buckets (summary, by payment, by trial) add a `clubRefunded` total. The "Refunded by the club" column and summary figure show only when the scope has any.
- **Entry list:** a "Refunded by the club $X" badge on the entry. The entry stays paid by card and never reads "Refunded" (the card word).
- **Close-out:** a "Club paid back directly: $X" line, outside the cash-box reconciliation and beside, not inside, the Stripe refund figure. The club reconciliation card (`clubShowReconciliation.ts`) is built from `stripe_orders` and `show_payouts` only, with no entry rows; it stays as it is (a payout-side view), since adding the figure would need a second fetch.
- **Views:** `view_authenticated_entry_results` (masked by `can_view_admin`, like `refund_amount`) and its `_replication` wrapper append `club_refunded_amount`, so the bulk sync carries it. Cold reads do not select it until the migration is applied everywhere (the MYK9-1757 deploy-order rule in `ReplicatedEntriesTable.coldReadColumns.ts`).
- **Refund to decide:** `club_refunded_amount > 0` resolves the removal's decision. A full reversal sets it back to 0 and the decision reopens on its own.

**Refusal wording.** With the club form in the same dialog, `payout_already_sent` no longer dead-ends; the message becomes the club form's first line.

## Alternatives weighed

- **Free-text note on the entry.** Feeds no report; fails the criterion that the books count it.
- **Reuse the desk refund (`show_payments`).** It reconciles the cash box; a club check would make the box look short.
- **Reuse `refund_amount`.** Rejected above.
- **Ledger only, no cached column.** Every reader would need a second online read, including the offline-first refund-to-decide count. The cached column is written only beside its ledger row, so they cannot drift.
- **Do nothing.** Was the launch fallback; the owner chose to build.

## Not included

- Recording a club refund for the whole show at once (the refund-all path). Per entry only.
- The exhibitor's My Entries view of a club refund.
- Changing the payout, the card refund columns or the clawback runbook.

## Testing

- **Behavioral SQL** (`supabase/tests/`): only the show's secretary, its club admin or a site admin may record; a non-card entry, and absent, pending, processing and failed payouts are refused; the cap counts a prior partial Stripe refund ($40 entry, $15 Stripe refund, $25 club max), earlier club rows, and a reversal restoring the balance; a second reversal of the same row is refused; the retry key writes once; a direct UPDATE of `club_refunded_amount` by an authenticated user is refused; recording on one entry leaves its sibling in the same checkout untouched; `refund_amount` and `show_payouts` are unchanged after a write. ACL: `pg_class.relacl` shows anon with nothing and authenticated with SELECT only (no TRUNCATE).
- **Unit:** report line and buckets ($40 collected, $10 club refund: club refunded $10, net retained $30, collected unchanged); refund-to-decide resolves at > 0 and reopens at 0.
- **Component:** the dialog shows the club form only when the payout is `completed`; it states no card refund is issued; the cap and the remaining balance; reversal confirm; offline disables Save; the entry badge.
- Shuffled suite run; grants verified on the applied database after `db push`.
