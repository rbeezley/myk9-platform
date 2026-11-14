# Club admin after set-up: money and people

> **Status:** Active

Linear: MYK9-1984, with MYK9-1985 (the Payments tab's wording) and MYK9-1986 (who is emailed) as separate money issues. Agreed with the owner in a design conversation on 2026-11-14. No code has been written.

## Why

`docs/roles/club-admin.md` calls the club admin role "Functional only" and puts "a full Club Admin experience" after the fall. This plan does not reopen that. It covers the narrow part that cannot wait: what can cost a club money, or lock someone out, before launch.

Getting a club in, to its first published show, is `docs/plan-club-first-hour.md` (MYK9-1979). This plan starts where that one ends.

## How this was checked

- **Seen in the running app** on 2026-11-14 as the club-admin test account, which the owner signed in to a window with every write refused (`scripts/qa/readonly-walk.ts`). A query afterwards showed nothing changed. Also walked as the site admin, to see the same screens with payout data present.
- **Read in code, not seen:** the payout run, its emails, the Stripe set-up function, and what each badge on the Payments tab means. Heartland, the club walked, has no payouts, so its list of shows was empty.

## What a club admin has today

**Payments tab.** A "Bank account" box, a "Show reconciliation" list, and a note on fees.

- With payouts enabled the box shows a green "Payouts enabled" and one sentence: "Entry fees from your shows are deposited to your club's bank account automatically after each show." It has no button.
- Each show in the list has one net amount and a badge: Scheduled, Sending, Paid, Retrying, Needs attention, Waiting for account.

**Members tab.** Three sections:

- **Members:** the club's roster, "Add Member", and membership requests to approve or deny.
- **Officers:** "Assign Officer" to a position (President, Vice President, Secretary, Treasurer, Board Member).
- **Show Access:** who can create and run the club's shows. "Appoint Secretary" and "Revoke".

## What is wrong

| #   | Finding                                                                                                                                                                                                                                      | Seen or read |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| 1   | **Once payouts are enabled the bank account can be neither seen nor changed in the app.** Changing it means knowing to sign in at Stripe with the email and phone of whoever set it up.                                                      | Seen         |
| 2   | **A treasurer who leaves takes the Stripe sign-in with them.** The only documented handover is "email us".                                                                                                                                   | Read         |
| 3   | **No payout has a date.** "Scheduled" never says for when.                                                                                                                                                                                   | Read         |
| 4   | **The box says "automatically after each show".** The payout approval (MYK9-1956) makes that untrue.                                                                                                                                         | Seen         |
| 5   | **Collected and refunded are not shown, only the net.**                                                                                                                                                                                      | Read         |
| 6   | **A failed payout tells the owner and not the club.** The club sees a badge change if someone opens the tab.                                                                                                                                 | Read         |
| 7   | **Money emails go to the club's contact address**, not to its admins. Nothing is sent when Stripe switches a club's payouts off.                                                                                                             | Read         |
| 8   | **"View in Stripe" opens the platform's Stripe dashboard**, which a club cannot sign in to.                                                                                                                                                  | Inferred     |
| 9   | **A refund after the payout has four stories:** the app says contact support; the club admin guide says Stripe deducts it from the next payout; the treasurer's guide says the club pays directly; a code note says the platform absorbs it. | Read         |
| 10  | **No club admin can add or remove another admin.** Only the owner can.                                                                                                                                                                       | Seen         |
| 11  | **The Officers list does nothing.** It grants no access, appears nowhere else, and can only pick people who have an account. Its "Secretary" is not the app's secretary.                                                                     | Seen         |
| 12  | **A membership request can sit unseen.** One on the test club was two months old, with nothing pointing to it outside the Members tab.                                                                                                       | Seen         |
| 13  | **One permission has five names:** Show Access, Show Manager, Secretary, secretary access, Trial secretary.                                                                                                                                  | Read         |

What works and stays: appointing and revoking a secretary. It refuses to revoke the club's only secretary while shows are upcoming, and says why. A club admin is correctly refused the owner's admin pages.

Withdrawn: the walk first read the "Add Member" picker, which lists every person with an email, as a privacy problem. It is a recorded decision (MYK9-664): a manager may read every person's name and contact details, because that is what makes mail-in search and these pickers work. Dates of birth are private. What remains is small and filed as MYK9-1983: show nobody until something is typed.

## Decisions (owner, 2026-11-14)

1. **The bank after set-up: show it, and link to Stripe to change it.**
2. **Payouts: say the date and the stage in plain words**, with collected, refunded and paid as separate figures.
3. **Money emails go to the club's admins and to its contact address.**
4. **Officers: keep the list and give it a job.** It is what the premium list prints.

Carried from 2026-11-13: no treasurer role; a club admin can add another admin (MYK9-1979); every payout waits for the owner's approval, with clubs told "within five business days of your show's last day" (MYK9-1956); after a payout the club settles a refund with the exhibitor directly (MYK9-1953).

## Design

### The bank account (MYK9-1984)

With payouts enabled, the box reads:

> **Bank account** · Payouts enabled
>
> First National Bank ····4821 · connected by Morgan Reyes
>
> **Change bank account**

- "Change bank account" asks for the password, as connecting does today, then opens Stripe's own page. The app never holds or shows a full account or routing number.
- Only a club admin of that club, or a site admin, sees the box.

**To confirm against Stripe first.** The app has never asked Stripe for a way back into an enabled account: every button calls the set-up function, which returns a set-up link. Before this is built, the test-mode rehearsal (MYK9-11) must answer:

- Can a second club admin reach an account another admin set up, and through which link?
- What may a club change by itself on this account type? This depends on MYK9-1955.

If Stripe ties the account to the first person's sign-in, a handover still needs the owner. The box then says so, with exactly what to send, and the guide says the same.

### What the club is told about a payout (MYK9-1985)

Each show reads as a sentence that answers "when do we get paid?":

| Stage                            | The club reads                                                         |
| -------------------------------- | ---------------------------------------------------------------------- |
| Before the show ends             | Paid within five business days of December 9.                          |
| Waiting for the owner's approval | Being checked by myK9Show. Paid by December 16.                        |
| Sent                             | Sent December 12. Usually in your account the next business day.       |
| Failed, the platform's to fix    | We couldn't send this. We're on it, and you don't need to do anything. |
| Failed, the club's to fix        | Your bank account needs attention. **Fix it**                          |
| Bank not connected               | Waiting for your club's bank account. **Connect bank account**         |

With three figures: **Collected $1,280 · Refunded $32 · Paid $1,248**.

The sentence at the top becomes "Entry fees are sent to your club's bank account within five business days of each show." Nothing on the tab says "automatically". "View in Stripe" goes, or opens something a club can open.

Built with MYK9-1956: the dates come from the same place.

### Who is emailed (MYK9-1986)

- Every money email goes to each active club admin and to the club's contact address. One message per address.
- A failure the club must fix emails them once, with the link that fixes it. So does Stripe switching the club's payouts off.
- A failure the platform must fix stays with the owner's alert.
- Each email names the show and the amount. None carries bank details.

A treasurer receives these by being a club admin. That is why "add an admin" in MYK9-1979 matters.

### Officers (MYK9-1984, built with MYK9-1952)

The list becomes what the premium list prints.

- A name can be typed for someone with no account.
- The section says: "Printed in your premium list. Doesn't change what anyone can do in myK9Show."
- The position "Secretary" reads "Club secretary".
- "Treasurer" stays, as a title. It is not a role.

### One story for a refund after the payout

Not a new decision: MYK9-1953 already says the club pays the exhibitor directly and records it. This plan adds the two places that issue did not name: `docs/user-guides/club-admin-guide.md` ("Stripe will deduct it from the next payout") and the note in `features/financial/clubShowReconciliation.ts` ("absorbed by the platform"). Both change with MYK9-1953.

## Does this duplicate an existing surface?

No. Every change is on the club page's existing Payments and Members tabs. The Officers list is connected to the premium list in place of a second officers field being built there. "Change bank account" opens Stripe's page; nothing is rebuilt in the app.

## Open, not decided

- **A payout statement or a year-end total** for a treasurer's report. The show's Financial Report exists; nothing sums a club's year.
- **The membership request that sits unseen** (finding 12). A count on the club's page or the admin's home would surface it. Not discussed.
- **One name for the secretary permission** (finding 13). Not discussed.
- **`docs/roles/club-admin.md` is out of date.** It lists the member roster and multiple admins as deferred. The roster is built.

## Phases

**Phase 0: confirm.** In Stripe test mode, with a throwaway club:

- The two Stripe questions above.
- Whether a failed payout is retried each night, as the code appears to do, or "will not retry on its own", as the club admin guide says.
- What a fully refunded show reads on the Payments tab.
- Whether "View in Stripe" opens anything for a club.
- Walk a club with real payout rows as a club admin: this plan's walk saw an empty list.

**Phase 1: the Payments tab's wording and figures** (MYK9-1985), with MYK9-1956. Money work: own branch, `independent` review.

**Phase 2: who is emailed** (MYK9-1986). Money work: own branch, `independent` review.

**Phase 3: the bank account box** (MYK9-1984), once Phase 0 has answered the Stripe questions.

**Phase 4: Officers**, with the premium list (MYK9-1952).

**Phase 5: guides.** The club admin guide and the treasurer's guide say what the app does: the date and stage of a payout, who is emailed, how to change the bank, and how to hand over to a new treasurer.

**Phase 6: testing.**

- Each payout stage shows its sentence and a date, for a club with payouts in every state.
- Collected, refunded and paid on the club's tab equal the owner's ledger for the same show.
- A club with two admins and a separate contact address gets three messages for one payout; a deactivated admin gets none.
- A club-side failure emails once, not nightly. A platform-side failure emails nobody at the club.
- A second club admin can change the bank account, or reads why not.
- No screen or email shows a full account number.
- An officer typed by name appears in the premium list.
- End to end as a club admin in test mode: see the bank, see a payout move through every stage, receive each email.
- Add the money checks to `docs/qa/walks/role-intent-walk.md` for the club-admin week.

## Connections

- MYK9-1979: a club's first hour, including "add an admin".
- MYK9-1956: the payout approval and the five-business-day promise.
- MYK9-1953: refunds after the payout.
- MYK9-1955: the club's Stripe account type.
- MYK9-1952: the premium list.
- MYK9-1983: the people pickers.
- `docs/operations/stripe-treasurer-guide.md`.

## Non-goals

- A treasurer role, or any role limited to Payments.
- Holding or displaying full bank details.
- The club's profile page, a multi-show view, or more member management.
- Changing when or how a payout is sent.
- Changing who may read the people directory.
