# The database owns an entry form's total and payment status

> **Status:** Active

Linear: MYK9-1634. Supersedes the closed PR #3509 (convergence stop, 2026-11-01).

## Why

`enrollments.total_amount` (cents) is what a form owes: the footer "$X due", the MYK9-1600
checklist payment card, and "Paid in full" (`record_enrollment_payment` with amount NULL
charges total minus net received). Three places decided it, each with its own waiver and
online rules: the client payment builders, `submit_show_entries`'s received-payment branch,
and Stripe checkout. The client's write runs after the RPC, so a closed tab leaves it
un-incremented, and nothing ever subtracts on a delete. #3509 derived the total in the
database while the client still computed money and status, and its review findings were
both the client re-encoding rules the database had just changed.

**Duplication question.** This adds no surface. It deletes the client's money computation
(two builders reduced to one details-only builder, one dead status writer removed) and
gives each fact one writer.

## Decisions

1. **One formula for every form, card-paid or not.** Owed = the form's captured Stripe
   charges (processing fees included) + the `entry_fee` of every entry that is not deleted,
   not waived (`payment_status IS DISTINCT FROM 'waived'`; owner 2026-11-01: waived never
   counts; the one live waived entry has `payment_method = 'check'`) and not covered by a
   captured order's `entry_ids`. A card-paid entry is owed as its charge, a desk add-on at
   its fee, never both. Captured = any status but pending/failed/canceled/cancelled/expired,
   so a refunded order still counts. The `pi_` reference and `payment_method` mark nothing.
   (Codex round 3 on #3513 showed why a separate "Stripe form keeps its charge" mode fails:
   a desk add-on onto a card form was never owed.)
2. **Card money is money received.** Checkout never recorded it (card forms sat at
   `paid_amount = 0`, so "Paid in full" would charge the card amount again). A form's
   captured charges live in a new `card_paid_cents` column AND in `paid_amount` ("the gross
   ever received", the ledger's own definition), so the ledger core, "Paid in full", the
   refund cap and the client's balance need no change. A recompute moves `paid_amount` by
   the change in `card_paid_cents`, so it is idempotent. Both sides count the gross charge,
   so Stripe-side refunds never double-count. The ledger's "Payment Due" reversal resets
   `paid_amount` to the card money, undoing only the desk's. The money guard covers
   `card_paid_cents`.
3. **Status moves with the total in one direction only.** When a form's owed total _grows_
   (an add-on, a restore, a re-price up, an entry moved in) and the net received no longer
   covers it, a settled form (`paid`, `paid_by_cash`, `paid_by_check`, `waived`) becomes
   `pending`. A shrinking total never promotes a status: "Paid in full" at $0 settles it,
   and a form holding more than it owes is a person's call (no refund is ever automatic).
   Growth only, so an unrelated entry edit never flips a `partial_refund` form. One
   exception: a Stripe order event settles a pending form its card money now covers in
   full (checkout's own intent; when an order goes pending -> succeeded its entries attach
   before the order reads as captured, which reopens the form for an instant).
4. **Submission status is decided in `submit_show_entries`**, in the same transaction as
   the entry insert, replacing the client's second write:
   - received payment (`p_payment`): unchanged, the ledger core records it;
   - `secretary_paid` / `group_payment`: `paid_amount` grows by the created fees, and the
     status is `paid` when net covers the total, else `pending`;
   - `waived`: a form that owes nothing and holds nothing becomes `waived`; otherwise the
     add-on is money-neutral and nothing changes;
   - any other method: `payment_method` is recorded while the form is `pending`.
5. **The client writes payment details only** (reference, check number, date, group
   reference, notes), and only the ones it was given. It never writes `total_amount`,
   `payment_status`, `paid_amount` or `payment_method`, and it no longer blanks details a
   secretary already entered. An exhibitor's self-service submit makes no enrollment write.
6. **The status guard accepts the derived demotion.** `restrict_payment_status_update`
   rejects an unprivileged status change unless it is one rule 3 derives: settled →
   `pending` on a form whose derived total exceeds the net received, or pending → `paid`
   on a form whose card money covers it. Without this, an
   exhibitor's add-on onto a paid form would fail (the guard checks the JWT role, and the
   trigger runs in the exhibitor's request). The guard cannot tell the trigger from an
   exhibitor's own PATCH, so an exhibitor may also reopen their own settled form while it
   truly owes more than it holds: the state it should be in, with no money moved.
7. **Backfill: card money, then totals.** No status, no refund. Preview (2026-11-01): 13
   mail-in totals change; MK9-000305/306 keep their $37.45 totals and their `paid_amount`
   moves 0 → 37.45 (the charge they received). No status needs to move: MK9-000320 is already pending, and every paid form keeps its
   status because the money is still held.
8. **Forms holding more than they owe, for a person** (filed, not coded): MK9-000245–248
   (all entries deleted, check received) and MK9-000276 ($44 paid, $22 owed once the waived
   $22 entry stops counting).

## Inventory (origin/main 8d4ebdbda)

Writers of `enrollments.total_amount` / `payment_status` / `paid_amount`:

| Writer                                                                     | Where                                                                                      | After this change                               |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| `submit_show_entries` received branch                                      | `20261028024100_myk9_1460_timezone_names_snapshot.sql:1140`                                | the `total_amount +=` goes; the trigger owns it |
| `private.record_enrollment_payment_core`                                   | `20260926124700_myk9_773_online_paid_server_cascade.sql:170-340`                           | unchanged (ledger math pinned by 677/773 tests) |
| `sync_enrollment_on_payment_success` / `sync_inserted_checkout_enrollment` | `20260914001837_confirm_successful_checkout_enrollments.sql:37-132`                        | unchanged; Stripe forms keep the charge         |
| Staff builder `buildEnrollmentPaymentFields`                               | `apps/myk9show/src/services/database/show-registrations/enrollmentPaymentFields.ts:44-112` | details only                                    |
| Self-service builder                                                       | `.../show-registrations/selfServiceEnrollmentFields.ts:39-58`                              | deleted                                         |
| `updateExistingEnrollmentPayment` / insert                                 | `.../show-registrations/reads.ts:18-78, 135-146`                                           | details only                                    |
| `updateRegistrationPayment`                                                | `.../show-registrations/reads.ts:243`                                                      | deleted (no callers)                            |
| Second write after the RPC                                                 | `apps/myk9show/src/features/registration/submitShowRegistration.ts:203-219`                | details only, staff only                        |

Readers (unchanged, they read the stored figure): the ledger core's "Paid in full" and refund
cap; `send-registration-email` (`supabase/functions/send-registration-email/index.ts:260`);
`utils/enrollmentGrouping.ts:62-71`; `useEnrollmentDialogControls.ts:31`;
`EnrollmentCard.tsx:371`; the secretary read paths (`secretaryReadReplication.ts:159`,
`secretaryPostgrest.ts:70`).

Untouched entry writers covered by the trigger: `soft_delete_entry` / `soft_delete_dog`
(`20261001235300`), `restore_entry` (`20261002015900`), move-up (source stays live as
`moved`, destination at fee 0).

## Phases

### Phase 1: migration `20261101184700_myk9_1634_db_owns_form_total_and_status.sql`

- `enrollments.card_paid_cents` (new, default 0); the money guard's two triggers re-created
  to cover it.
- `private.stripe_order_is_captured`, `private.enrollment_card_cents`,
  `private.enrollment_owed_cents` (rule 1).
- BEFORE INSERT / UPDATE OF `total_amount` on enrollments: the total is replaced by the
  derived figure.
- `private.refresh_enrollment_money(form, card_event)`: lock the form (`FOR NO KEY UPDATE`),
  recompute total and card money, move `paid_amount` by the card change, apply rule 3.
- AFTER on entries (INSERT/DELETE; every UPDATE behind a `WHEN` on fee, deletion, form or
  waived-ness, so Comp / Undo Comp count) and AFTER on `stripe_orders` (INSERT/DELETE;
  UPDATE when status, amount, form or covered entries change) call it.
- `restrict_payment_status_update` (from its live definition) with rule 6.
- `submit_show_entries` (from `20261028024100`) with rule 4; `record_enrollment_payment_core`
  (from `20260926124700`) with the reversal change (rule 2).
- GIN index on `stripe_orders.entry_ids`; grants and REVOKEs on every new or replaced
  function.
- Backfill (rule 7).

Lock order: an entry change locks the entry then its form; the ledger locks the form then
its entries. A simultaneous delete and payment on one form can deadlock; Postgres aborts one
with 40P01, which is retryable and writes nothing. Accepted and documented.

### Phase 2: client

- `enrollmentPaymentFields.ts`: details-only builder; drop the status/waived helpers.
- Delete `selfServiceEnrollmentFields.ts` and its test; delete `updateRegistrationPayment`.
- `submitShowRegistration.ts`: the post-RPC write carries details only and is skipped for
  self-service and when there are no details.
- Update `reads.test.ts`, `showRegistrationQueries.test.ts` and the submit tests.

### Phase 3: testing

- `supabase/tests/myk9_1634_enrollment_total_derived_test.sql` (reused from #3509, extended):
  insert sums; soft-delete lowers; re-price; move between forms updates both; a direct write
  is overridden; a Stripe form untouched, including after a desk payment overwrites its
  `pi_` reference and with a refunded order; a waived add-on on a paid form is
  money-neutral; a waived-only form reads $0 and `waived`; group payment on a fresh form is
  `paid`; a pending add-on demotes a paid form; an exhibitor add-on onto a paid form
  succeeds and demotes; an exhibitor cannot set any other status; "Paid in full" after a
  delete charges only live, non-waived entries; the backfill leaves 0 mismatches.
- Re-baseline 677 submit case 4, 824 and 878 case 7, and the 677 ledger / 773 online
  cascade fixtures, from the #3509 branch; keep its fix for 677 submit case 6 (vacuous
  under RLS).
- Register the new file in `scripts/qa/run-behavioral-sql-tests.sh` and its test.
- `pnpm qa:sql-local` green; mutation-check each guard (break it, watch its case go red).
- Vitest for the touched client files, shuffled; `pnpm typecheck`; lint.

### Phase 4: review and ship

migration-auditor, then `pnpm qa:codex-review --post` (independent floor). Stop at a second
finding on the same path. After merge, and only with the owner's OK: `supabase db push`
from merged main; check on the applied DB that 0 forms differ from the derived total and
that `card_paid_cents` equals each form's captured charges; advisors; Deploy myK9Show straight after the push (the deployed client still sends
the old writes until then; the BEFORE trigger neutralises its total, and pre-launch there
is no traffic to double-count a group payment).

## Non-goals

- Promoting a status when a total shrinks (rule 3).
- Refunding or flagging money in code (rule 8 is a filed task).
- Whether rejected or not-accepted entries count: they still do, as today.
- Stripe fee breakdowns; ledger semantics.
