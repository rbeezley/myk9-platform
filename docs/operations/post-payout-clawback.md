# Post-payout clawback — refunds and disputes after the club was paid

> **Audience: the operator (site admin).** Internal runbook with service-role SQL and Stripe
> dashboard steps — never publish to the public help site. Tracked by MYK9-195.

## When you are here

One of three signals routes to this page:

1. The refund UI refused with **"already paid out"** (`payout_already_sent` from
   [`stripe-refund-entry`](../../apps/myk9show/supabase/functions/stripe-refund-entry/index.ts) or
   [`stripe-refund-show`](../../apps/myk9show/supabase/functions/stripe-refund-show/index.ts)),
   and the refund is legitimate anyway — the exhibitor is owed money after the club was paid.
2. The **"Reconciled payout amount mismatch"** alert from `cron-process-payouts` — a refund
   landed during a crash window and the club was overpaid.
3. The **"Chargeback opened"** alert from `stripe-webhook`, and the dispute was lost.

Why this is manual: the platform uses **separate charges and transfers**. The charge lands on
the platform balance and the payout cron transfers the club's share at show end + 3 days.
Neither refund function passes `reverse_transfer` or `refund_application_fee`, so once the
transfer is out, any refund comes entirely from the **platform's own balance** while the club
keeps its share — which is exactly why the in-app paths refuse. The refusal is correct;
completing the money movement is your job, by hand, in two halves: refund the exhibitor, then
recover the club's share.

`payout_in_progress` is **not** this page — that's the cron mid-run. Wait a few minutes and
retry in-app.

## Facts to gather first

```sql
-- The entry and its payment (amounts are NUMERIC dollars on entries)
select id, entry_fee, payment_status, refund_amount, stripe_payment_intent_id
from entries where id = '<entry_id>';

-- The settled payout (transfer id + what was sent)
select status, stripe_transfer_id, amount_cents, completed_at
from show_payouts where show_id = '<show_id>'
order by created_at desc limit 1;
```

Route by what you found:

- **Refund request, no completed payout** → not this page. The in-app refund path works; use it.
- **Refund request, payout `completed`** → Case A.
- **"Reconciled payout amount mismatch" alert (signal 2)** → the refund **already exists** in
  Stripe. Skip Case A steps 1–3 entirely — issuing another refund would double-pay the
  exhibitor. Verify the existing refund in the dashboard (Payments → the intent → its refund),
  then do only steps 2 (notify), 4 (reverse the overpaid difference the alert names), and 5
  (stamp, if the entry lacks one — an app-issued refund was already stamped).
- **Lost dispute, any payout state** → Case B, which starts with the payout-state fork. Never
  issue a Stripe refund for a dispute — the bank already pulled the money.

## Case A — legitimate refund after payout

**1. Fix the amount.** Cap it at the entry fee, mirroring in-app policy (`validateRefund`
rejects `amount_exceeds_fee`; the platform fee is never refunded). Everything below assumes
refund ≤ entry fee, which keeps the transfer-reversal math one number.

**2. Notify the club before touching their money.** A transfer reversal pulls funds from a
bank account the club may have already spent from. Email the treasurer what happened, the
amount, and why — reversing first and explaining later is how you lose a club.

**3. Refund the exhibitor.** Stripe dashboard → Payments → search the
`stripe_payment_intent_id` → Refund → enter the partial amount. Note the refund id (`re_...`).

**4. Recover the club's share.** Stripe dashboard → Connect → Transfers →
`stripe_transfer_id` from the query above → **Reverse** → enter the refunded amount. Because
the refund was capped at the entry fee (step 1), the reversal amount equals the refund amount
— the entry fee is club money; the platform-fee portion was never transferred. Note the
reversal id (`trr_...`); the stamp below records both ids, which is why reversal comes first.

**5. Let the webhook book the order ledger — then stamp the entry yourself.** The
`charge.refunded` sweep in `stripe-webhook` records the refund into `stripe_order_refunds`
(kind `post_hoc`, keyed on the refund id) and re-derives the order's totals and status
automatically. It also alerts that the **entry-level** stamp is manual — a payment intent can
cover a whole cart, so the sweep cannot attribute the refund to one entry. Stamp it with the
same shape `buildEntryRefundStamp` writes:

```sql
-- service_role; mirrors apps/myk9show/supabase/functions/_shared/refundReuse.ts
update entries
set refund_amount  = <dollars>,          -- e.g. 25.00
    refunded_at    = now(),
    refund_notes   = 'Post-payout clawback: re_<id>, reversal trr_<id> (MYK9-195 runbook)',
    payment_status = 'refunded'
where id = '<entry_id>'
  and payment_status = 'paid'
  and coalesce(refund_amount, 0) = 0;   -- same no-double-stamp guard as the function
```

A partial refund still stamps `payment_status = 'refunded'` — that is what the in-app path
does, and the payout math reads `refund_amount`, not the status.

## Case B — dispute lost

The dispute-created alert fires when the bank raises it; Stripe pulls the disputed amount
**plus the $15 fee** from the platform balance immediately, no consent step. First response is
always evidence, not accounting: Stripe dashboard → Payments → Disputes, submit the signed
entry agreement and entry records before the deadline. This section is for after the dispute
**stands**.

**Allocation rule for every stamp below:** `dispute.amount` is the **gross charge** — it can
cover a whole cart and includes the platform fee. Never stamp that gross onto an entry.
Identify the disputed cart's entries via the payment intent, then stamp **each entry with its
own `entry_fee`** (the whole charge was pulled, so each entry's fee is fully lost); the
platform-fee remainder has no entry to live on and is platform loss by definition:

```sql
-- No payment_status filter: an entry partially refunded earlier is already
-- 'refunded' but still holds disputed money. show_id matters: a cart can span
-- shows, and each show has its own payout/transfer.
select id, show_id, entry_fee, payment_status, refund_amount
from entries where stripe_payment_intent_id = '<pi_...>';
```

If the entries span **more than one show**, run everything below **per show**: each show has
its own `show_payouts` row, payout state, and transfer, so the payout-state fork (step 0) and
the reversal are evaluated and executed independently per show — one aggregate reversal
against one transfer would recover the wrong club's money.

**Net out prior refunds.** An entry with an existing `refund_amount` has already reduced (or
been excluded from) the payout by that much. Its stamp target is `entry_fee` (raise the
existing `refund_amount` to it, never add on top), and its reversal share is
`entry_fee - refund_amount` — reversing the full fee would take back money the payout never
sent — and `refund_amount` is NULL when there was no prior refund, so compute the share as
`entry_fee - coalesce(refund_amount, 0)`. Case A step 5's SQL deliberately refuses already-stamped rows, so **raising** an
existing stamp needs this variant instead (append to the notes, don't replace them):

```sql
-- service_role; raise a prior partial-refund stamp to the full disputed fee
update entries
set refund_amount = entry_fee,
    refund_notes  = coalesce(refund_notes || ' | ', '') ||
                    'Dispute dp_<id>: raised to full entry_fee (MYK9-195 runbook)'
where id = '<entry_id>' and refund_amount < entry_fee;
```

Check `dispute.amount` against the charge total first. A **partial dispute** (rare, but some
card networks allow it) means only part of the cart is contested — and Stripe names the
intent and amount, not the entries. If the amount matches exactly one entry's fee (plus its
fee share), stamp that entry alone, capped at its `entry_fee`. If the mapping is ambiguous,
**do not guess an entry stamp**: ask the exhibitor/club which entry was contested, and until
that answer arrives record the loss at the order level only (step 3 books the true gross
regardless) with a clawback-log line noting the unallocated remainder. Stamping unaffected
entries over-deducts the club and marks entries refunded that were never contested.

**0. If the payout row is `processing` or `failed`, ask Stripe, not the row.** `processing`
means the cron has claimed it and may already have sent the transfer — stamping mid-run races
the recompute; wait a few minutes and re-read. And a `failed` row can sit over a transfer that
actually **succeeded** (crash after send — the cron itself guards this with
`transfers.list({ transfer_group: show_id })`). Before treating anything as pre-payout, check
Connect → Transfers for a transfer with the show's id as transfer group: transfer exists →
step 2 (use its id for the reversal); none → step 1.

**1. If the payout has not settled yet** (`pending`, or no payout row): stamp each disputed entry
refunded (Case A step 5's SQL, `refund_amount` per the allocation rule) **before**
the payout fires. The cron recomputes the transfer from `max(0, entry_fee - refund_amount)` at
send time, so the club is simply paid less and no clawback exists. Do **not** issue any Stripe
refund — the bank already took the money. This is the cheap path — the alert says so, and it
is the reason to act on dispute alerts same-day.

**2. If the payout has settled:** reverse the transfer for the sum of each disputed entry's
**reversal share**, `entry_fee - coalesce(refund_amount, 0)` from the netting rule — never the raw fee sum;
the payout already excluded prior refunds (Case A steps 2 and 4 — talk to the club first; a
chargeback is not their fault). Then stamp each entry (Case A step 5's SQL for unstamped
entries, the raise-variant above for previously stamped ones, recording `dp_` and `trr_` ids
in `refund_notes`).

**3. Book the loss into the order ledger by hand.** A dispute produces no Stripe refund
object, so the `charge.refunded` sweep never records it — without this step the financial
dashboard **overstates** collections and `netPlatformIncome` by the full disputed amount.
The recording RPC is idempotent on its key; use the dispute id:

```sql
-- service_role; books the dispute as a post-hoc platform loss and re-derives order totals.
-- Here the GROSS dispute.amount is correct — the order ledger is charge-level, and the
-- platform lost the gross. (The per-entry allocation rule applies only to entry stamps.)
select * from public.record_order_refund_cents(
  '<pi_...>', '<dp_...>', <dispute_amount_cents>, 'post_hoc');
```

The **$15 dispute fee** has no home in the schema — `netPlatformIncome` will overstate by
exactly that much per lost dispute. Keep the running count in the dispute log below;
[`unit-economics.md`](unit-economics.md) prices each one at ~17 entries of profit.

## What ties out afterward — and what deliberately does not

| Record                                | After Case A                                 | After Case B                |
| ------------------------------------- | -------------------------------------------- | --------------------------- |
| `stripe_order_refunds` / order status | Automatic (webhook sweep)                    | Manual (RPC, step 3)        |
| `entries` refund columns              | Manual (step 5)                              | Manual (step 1/2)           |
| `netPlatformIncome`                   | Subtracts the refund                         | Subtracts the booked amount |
| `show_payouts.amount_cents`           | **Unchanged — permanent, expected mismatch** | Same                        |
| Transfer reversal                     | Recorded nowhere in-app                      | Same                        |

The last two rows are the same fact: nothing in the schema represents a transfer reversal. So
after a completed clawback, (a) the club's reconciliation card shows a net **lower** than its
settled transfer, and (b) `netPlatformIncome` **understates** by the reversed amount — the
dashboard subtracted the full refund but never saw the recovery. In Case A (refund capped at
the entry fee) both discrepancies equal the reversal amount exactly. In Case B the booked
gross exceeds the reversal by the dispute's **platform-fee share** — the club card is
understated by that share too (the gross is subtracted from its net, but the fee portion was
never the club's loss), so note the fee share on the clawback-log line to keep the audit
arithmetic honest. All of this is accepted at expected volume (see unit-economics §7d — the window is
show end + 3 days and most withdrawals arrive pre-show); the `refund_notes` stamp carrying
`re_`/`dp_` and `trr_` ids is what lets a later audit tie the numbers out by hand. If clawbacks
stop being rare, that is the trigger to build the in-app path (MYK9-195 step 3), not to widen
this runbook.

## Clawback log

One line per event, newest first — this is the audit trail for the untracked reversals and
dispute fees above.

| Date | Show | Entry | Kind | Refund/dispute | Reversal | Amount | Fee absorbed |
| ---- | ---- | ----- | ---- | -------------- | -------- | ------ | ------------ |
