# The refund-outcome email (MYK9-2249)

> **Status:** Active

Design first (orchestrate rule, #4224): this touches money, so this page is reviewed and the
owner decides before any code. Parent: MYK9-1998. Split from MYK9-2001 at a convergence stop on
#4214. That PR shipped the "before she confirms" amounts and the "you're out" email. The outcome
email was cut, because Codex round 2 found new defects on paths round 1 had already flagged.

## What exists today

- **Recording a decision.** The secretary records it with `set_entry_refund_decision`
  (latest: `20261117152900_myk9_2099_refund_decision_removed_absent.sql`). It writes
  `entries.refund_decision` (`refunded` / `denied` / NULL). `restrict_entry_refund_decision_columns`
  stops anything else writing that column.
- **Paying a refund.** Only a person pays one, through the refund dialog or
  `stripe-approve-refund` (CLAUDE.md: refunds are never automatic). `stripe-webhook` books
  `charge.refunded` / `refund.updated` onto `entries.refund_amount`.
- **What the exhibitor can already see.**
  - My Shows shows each dog's refund as a note (`MyShowDogCard` `refundNote`). The note shows the
    amount when one is booked, and "unknown" otherwise.
  - Stripe sends its own receipt for a card refund, when receipts are on for the account.
- **A denial.** Nothing records why, and nothing tells her. She sees no refund note, and no
  message says the decision is final.
- **Who receives these emails.** #4214's pull-out email goes to the owner, the handler and the
  acting co-owner. It uses the `show_lifecycle_email_jobs` queue and `send-lifecycle-email`.

## Why the cut code failed

The outcome email was one trigger on `refund_amount` / `refund_decision`. Each time it was
patched, Codex found a new case:

- an issued refund after the club was paid still said "to your card";
- the co-owner who pulled was missed;
- a no-show reconciled after closeout was refused, because the producer rejects shows that are
  `completed`;
- a reason could be stored with a NULL decision, because a CHECK that evaluates to NULL passes.

Each fix touched the same trigger, so the review loop kept reopening the same code.

## Options

**A. Do nothing more.**

- For an issued refund, My Shows already shows the amount, and Stripe emails a receipt.
- What is missing is only the denial: she never learns the refund was declined, or why.
- Cost: none. Gap: "Did I get my money back?" stays a question to the secretary when the answer
  is no.

**B. Denial only (recommended).**

- One email, sent when the secretary records `denied`: "No refund for <dog> in <class>." plus
  her reason. Add a required `refund_decision_reason` to `set_entry_refund_decision`.
- The CHECK is written NULL-safe: `refund_decision = 'denied' AND reason IS NOT NULL`, or both
  are NULL.
- It goes to the same people as the pull-out email.
- It is sent from the RPC itself, not from a trigger on the money columns. The amount and the
  payout state never enter it, so the after-payout wording and the webhook timing (the four
  defects above) do not arise.
- A completed show is allowed, so a no-show reconciled at closeout still emails.
- It is small: one RPC change, one step type and one renderer.

**C. The full outcome email, as MYK9-2249 was written.**

- Issued: "Refunded $X to your card", with the booked amount.
- Declined: the reason.
- After payout: the MYK9-1953 wording.
- It needs the webhook-booked amount, the payout state at send time and the two-step timing
  (decision first, money later). That is where every defect came from.
- MYK9-1953's after-payout wording is still undecided.

## Recommendation

**B.**

- The issued case is already covered twice: by the My Shows note and by Stripe's receipt.
- The denial is the one outcome she cannot learn any other way.
- B never names an amount, a date or a payout, so it cannot promise money (docs/INTENT.md,
  Withdraw vs Pull).
- C stays possible later, once MYK9-1953 decides the after-payout wording.

## Testing phase

- SQL tests:
  - a denial with a reason queues one job per recipient: owner, handler and acting co-owner;
  - a blank reason is refused;
  - a NULL decision with a reason is refused;
  - a denial on a completed show still queues.
- Unit test: the renderer prints the reason and no `$` amount.
- `pnpm qa:sql-local` passes. The migration auditor runs before review.
- Deploy `send-lifecycle-email` after the migration push.

## Owner decision needed

Choose A, B or C. B is the recommendation.
