# The refund-outcome email (MYK9-2249)

> **Status:** Active

This is a design-first plan (orchestrate rule, #4224). It touches money, so it is reviewed and the
owner decides before any code is written. Parent: MYK9-1998.

It was split from MYK9-2001 at a convergence stop on #4214. That PR shipped two things:

- the amounts shown "before she confirms";
- the "you're out" email.

The outcome email was cut, because Codex round 2 found new defects on paths that round 1 had
already flagged.

Revision 2 corrects the facts and option B's scope after Codex reviewed revision 1 on #4233.

## What exists today

**Decision states.** `entries_refund_decision_check` allows only `denied` or NULL. There is no
`refunded` decision.

- `set_entry_refund_decision(uuid, text)` records only a denial. The latest version is in
  `20261117152900_myk9_2099_refund_decision_removed_absent.sql`.
- `restrict_entry_refund_decision_columns` lets only that RPC write the column, and clears it
  when a no-show is reinstated.
- An issued refund is a separate fact. A person pays it through the refund dialog or
  `stripe-approve-refund`, because refunds are never automatic. `stripe-webhook` then books the
  amount and time onto `entries.refund_amount` from `charge.refunded` or `refund.updated`.

**What the exhibitor already gets for an issued refund.** Nothing from myK9Show tells her:

- My Shows shows a refund note on the dog's card (`MyShowDogCard` / `refundNotesByDog`). It
  appears only once a positive amount and a refund date are booked, so she sees it only if she
  opens My Shows.
- Stripe emails its own receipt, but only when receipts are switched on for the account.

**A denial.** Nothing records why. Nothing tells her: no note, no email, no message saying the
decision is final.

- "Deny refund" in `PullReconciliationActions` calls `denyPullRefundDecision(entry.id)` at once,
  with no reason field.

**The "you're out" email (#4214)** goes to the owner, the handler and the co-owner who pulled.
The trigger reads the co-owner from `auth.uid()` at pull time and does not store it anywhere.

## Why the cut code failed

The outcome email was one trigger on the money columns. Each patch to it reopened the same code:

- After the club had been paid, the email still said "to your card".
- The co-owner who pulled was missed.
- A no-show reconciled after closeout was refused.
- A CHECK that evaluated to NULL let through a reason with no decision.

## Options

### A. Do nothing more

- An issued refund stays visible only on My Shows, plus a Stripe receipt where receipts are on.
- A denial stays silent.
- Cost: none.

### B. A denial email, with a reason the secretary types (recommended)

When the secretary denies a refund, the people the pull email went to get one email:
"No refund for <dog> in <class>." followed by her reason. It names no amount, date or payout.

The scope, revised by #4233's review:

1. **Database.**
   - Add `entries.refund_decision_reason`, with a CHECK built from explicit boolean cases:
     - the reason is NULL; or
     - the decision is not distinct from `denied` and `btrim(reason) <> ''`.
   - Existing denials keep a NULL reason. Nothing is invented for them and nothing is emailed.
   - `restrict_entry_refund_decision_columns` guards the reason like the decision, and clears it
     when it clears the decision on reinstatement.
2. **The RPC.**
   - A new `set_entry_refund_decision(uuid, text, text)` requires a non-blank reason for a
     denial.
   - The two-argument version is kept until the frontend that sends a reason is deployed. A
     follow-up migration then drops it, so it cannot be used to skip the reason. Order:
     migration, then frontend deploy, then the drop.
3. **Who receives it.**
   - Record who pulled the entry when it is pulled, as `entries.pulled_by_person_id`, set by the
     pull trigger.
   - The denial goes to the owner, the handler, and that recorded person only, never every
     co-owner.
   - The secretary who denies is never the recipient, because she is the RPC's caller.
4. **The app.** "Deny refund" opens a short reason field, on the existing control, before it
   calls the RPC. `denyPullRefundDecision` passes the reason along.
5. **Delivery after closeout.** Allow `completed` shows for the denial step in two places:
   - where the job is queued;
   - in `lifecycle-email-autoSend.ts`'s `isPublishedShow` gate at delivery.

**What B leaves out:** an email for an issued refund. She still learns of one from My Shows, or
from Stripe's receipt where receipts are on.

### B-lite. Denial email to the owner and handler only

B without point 3: no puller column. The email goes to the dog's owner and the entry's handler,
who are both already on the entry.

- **Dropped:** the pull-time recorder, the reinstate-clears-puller rule and the rule for pulls
  made before rollout. A co-owner who pulled but is neither owner nor handler does not get the
  denial; the owner does.
- **Kept:** the reason field, the RPC rollout and the completed-show exception.

### C. The full outcome email

C covers three cases:

- an issued refund: "Refunded $X to your card", from the booked `refund_amount`;
- a denial: everything in B;
- after the club is paid: the MYK9-1953 wording, which is still undecided.

The issued email has to be built on the webhook's booking, because no decision marks a refund
as issued. That means amounts, payout state at send time and webhook redelivery. Every earlier
defect came from these.

## Recommendation

**B.** The denial is the one outcome she cannot learn anywhere else today. B is a real piece of
work, not a quick add-on:

- a migration;
- a follow-up drop of the old RPC;
- a recipient column;
- an app change;
- a delivery exception.

C is possible later, once MYK9-1953 decides the after-payout wording.

## Implementation notes from review (#4233, round 2)

These apply to whichever of B or B-lite is chosen.

- **Reinstatement clears the puller (B only).** Only a new exhibitor pull or withdrawal sets
  it. Test the sequence pull, then reinstate, then no-show.
- **Pulls made before rollout (B only).** Recover the recipient from that entry's existing
  `pulled_out` job (`recipient_person_id`) where one exists. Otherwise use the owner and handler,
  and say so.
- **The old RPC drop.** Gate it on client compatibility, not on the deploy. Show Desk tabs left
  open across the deploy still call the two-argument version. Add a version gate or refresh
  prompt before the drop, and test the old-tab flow.
- **Before the drop.** Move `pull_refund_decision_rls_test.sql`,
  `withdraw_or_pull_own_entry_test.sql` and `myk9_2099_refund_decision_removed_absent_test.sql`
  to the three-argument call, and assert that the old signature is gone.
- **Deploy command:**

  ```bash
  supabase functions deploy send-lifecycle-email --project-ref sojmvhhwsjxmfistvzbe --no-verify-jwt
  ```

## Testing phase

**SQL tests**

- A denial with a reason queues one job for each of owner, handler and the recorded puller.
  Distinct identities are used for the secretary, owner, handler and co-owner.
- These are each refused:
  - a blank reason;
  - a whitespace-only reason;
  - a reason with a NULL decision.
- A legacy denial with a NULL reason still validates.
- Reinstating a denied no-show clears both the decision and the reason.

**Delivery test.** A denial on a completed show drains through to the provider call. The test
must not stop at the queued row.

**App test.** The reason typed in the Deny dialog reaches the RPC.

**Checks before review**

- `pnpm qa:sql-local` passes.
- The migration auditor runs.

**Deploy, in this order**

1. The migration.
2. `send-lifecycle-email`, with `--no-verify-jwt` (see the notes above).
3. The site.
4. The follow-up drop.

## Owner decision

**B-lite** (owner, 2026-11-19). The denial email goes to the owner and the handler only, so B's
point 3 (the puller column) and the notes marked "B only" do not apply. Implementation follows
B-lite's scope, the "Implementation notes from review" and the testing phase above.
