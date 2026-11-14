# The exhibitor's wait: from paid to show day

> **Status:** Active

Linear: MYK9-1998 (My Shows and her own pages), with MYK9-1999 (the three emails), MYK9-2000 (emails when something changes) and MYK9-2001 (pulling out, money) as sub-issues. Agreed with the owner in a design conversation on 2026-11-14. No code has been written.

## Why

`docs/plan-exhibitor-entry-to-paid.md` (MYK9-1963) ends when she has paid. This plan covers the days or weeks between that and the morning of the show.

After her receipt she is told almost nothing until she walks into the building. The pages she can open work, but nothing reaches out to her, and what she can open says little before show day. The owner's concern is the secretary: an exhibitor who can't find her judge, her armband or the address emails the secretary to ask.

## How this was checked

- **Seen in the running app** on 2026-11-14 as the test exhibitor at phone width, with every write refused (`scripts/qa/readonly-walk.ts`).
- **Read in code, not seen:** every email, the first-run redirect, and how armbands are assigned. A walk cannot see email.

## What she is sent today

| Sent                                                                   | Never sent                                         |
| ---------------------------------------------------------------------- | -------------------------------------------------- |
| A card receipt ("Entry Confirmation")                                  | Any reminder before the show                       |
| "Entry accepted" or "waitlisted", if the secretary left that switch on | A change to her judge, time, date or venue         |
| Waitlist offer, reminder, expiry                                       | The secretary editing, moving or pulling her entry |
| A message, when the secretary writes one                               | A confirmation that she pulled or withdrew         |
|                                                                        | A refund being issued or declined                  |
|                                                                        | The show being cancelled                           |

## What is wrong

| #   | Finding                                                                                                                                                                                           | Seen or read |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| 1   | **The fuller confirmation never reaches a card payer.** An email with her judge, armband and directions exists. It skips anyone who got a card receipt. The entry wizard promises it to everyone. | Read         |
| 2   | **No reminder is sent.** The step exists in the database and its toggle was hidden (MYK9-318) because nothing produces it.                                                                        | Read         |
| 3   | **A change under her sends nothing:** her entry, her judge, the date or venue, a cancelled show.                                                                                                  | Read         |
| 4   | **A class row on My Shows shows the class, date and trial.** No judge and no time.                                                                                                                | Seen         |
| 5   | **The armband is a bare number** in front of the dog's name. Nothing calls it an armband.                                                                                                         | Seen         |
| 6   | **The directions link is built from the city**, not the street address.                                                                                                                           | Read         |
| 7   | **"Show is tomorrow" and "Show in N days" are worked out and never displayed.**                                                                                                                   | Read         |
| 8   | **Two amounts owed on one page:** "$300.00 outstanding · Contact the club to settle" at the top, which is two shows added together, and "Pay $90.00" below.                                       | Seen         |
| 9   | **A dog in an unpublished show reads "trial date not loaded yet, check-in unavailable".**                                                                                                         | Seen         |
| 10  | **Her first click after paying can be stopped by first-run set-up.** Entering and paying are exempt. My Shows, the cart and her messages are not.                                                 | Read         |
| 11  | **Pulling out gives a toast and nothing in writing.**                                                                                                                                             | Seen, read   |
| 12  | **Nothing on her side says the service fee isn't refunded.**                                                                                                                                      | Seen         |
| 13  | **The fuller confirmation says "A member club of the American Kennel Club"** on UKC and ASCA shows.                                                                                               | Read         |
| 14  | **An expired email-confirmation link is a dead end.** It offers only "Back to sign in".                                                                                                           | Seen         |
| 15  | **"Add to calendar" shows "TypeError: Failed to fetch"** when it can't load. "Change handler or jump height" opens a sheet called "Edit Entry".                                                   | Seen         |

What works and stays: the Pull or Withdraw choice is explained well. The secretary already has a per-show **Delivery history** (Messages → Email) with one row per email and its status, and can send her own message to the whole show, one class or one person, by email too.

Two corrections to what the walk first reported:

- **Armbands are not assigned in a batch after closing.** A database trigger assigns one per dog per show the moment an entry is accepted. So "when her armband is known" means "when her entry is accepted".
- **The address ask is narrower than it looked.** AKC classes already require the owner's full address before she can enter (MYK9-1010), because AKC prints it in the catalog. What stops her after paying is the whole first run (dogs, welcome, and an address for those not yet asked).

## Decisions (owner, 2026-11-14)

1. **When something changes, the app emails her by itself.** Her entry, her judge, the date or venue, or a cancelled show.
2. **A reminder goes automatically, two days before the first day.**
3. **Tell her each thing as soon as it's known.** Owner: "people are going to want a full confirmation with judge and armband way before two days before the show and the secretary will get tons of people emailing her."
4. **My Shows: each show card answers the questions she'd otherwise email.**
5. **Never block her own pages.**
6. **Pulling out: tell her before, at the time, and at the outcome.**

Also decided: **no all-shows email list for the site admin.** The per-show Delivery history answers "did she get it?".

## Design

### Every email she gets, in order

| When                                            | Email             | Carries                                                                              | Issue     |
| ----------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------ | --------- |
| At payment, or when a mail-in entry is keyed in | Receipt           | Dogs, classes, amount paid, judge for each class, street address                     | MYK9-1999 |
| When her entry is accepted                      | Full confirmation | Armband, judge, classes, street address with directions, the secretary's note        | MYK9-1999 |
| When something changes                          | What changed      | The change, and what she can do                                                      | MYK9-2000 |
| Two days before the first day                   | Reminder          | Date, address, her dogs and classes, armbands, a time only when one is set, the note | MYK9-1999 |
| When she pulls or withdraws                     | You're out        | Dog and classes removed; the refund is waiting for the secretary                     | MYK9-2001 |
| When the refund is decided                      | The outcome       | "Refunded $30.00 to your card", or "No refund" with the reason                       | MYK9-2001 |

Rules for all of them:

- The secretary sets no date and presses nothing.
- Each links to My Shows, which always shows the current details.
- Each is recorded against its show, so it appears in Delivery history. The secretary can read what a sent email said from its row.
- One email per exhibitor per show for each moment, never one per dog or class.
- Nothing is sent for a show that isn't published.

### The three emails (MYK9-1999)

- **The receipt** gains the judge and the street address, both known the day she enters. It stays fixed text, because a money email carries no free text.
- **The full confirmation** is the email the wizard already promises. It goes to card and mail-in exhibitors alike. If "Entry accepted" and the full confirmation would both go, they are one email.
- **The reminder** goes two days before the first day, in the show's own time zone. It is not sent for a cancelled show, or to someone with no live entry left.
- **Note to exhibitors.** One optional box per show, printed in the full confirmation and the reminder, for parking, crating or a late start. It reuses the show's existing confirmation message. No second field is added.

### When something changes (MYK9-2000)

- **Her entry:** the secretary edits, moves or pulls it. Several edits in one sitting go out as one email, held until the Undo window has passed and a few quiet minutes follow, as acceptance emails already are (MYK9-1800).
- **Her judge:** names the old and new judge and says how to withdraw. It says only what that registry's rulebook gives her.
- **The date or venue:** the new date or street address.
- **A cancelled show:** what it says about her money is written with MYK9-1953.

The owner chose automatic knowing its cost: a corrected typo on an entry is emailed too. A change she made herself is not reported back to her as the secretary's.

### My Shows (MYK9-1998)

Each show card, with no new page:

> **Heartland Scent Work Classic** · In 5 days
>
> 1200 Fairgrounds Rd, Springfield · **Directions**
>
> Armband 42 · Vesper
>
> Novice Interior · Sat Dec 5 · Judge Dana Whitlock
>
> Novice Exterior · Sat Dec 5 · Judge Lee Okafor · 9:00 AM
>
> $90.00 owed · **Pay $90.00**

- A time shows only when one is set. Today 1 of 35 live classes has one.
- "Armband not assigned yet" until there is one.
- Money owed is per show. The added-up line across shows goes.

### Her own pages (MYK9-1998)

My Shows, the cart and her messages open even when first-run set-up is unfinished. My Shows carries one line offering to finish it, saying why when an address is missing.

The two `// INTENT:` rules in `pages/onboarding/onboardingSteps.ts` do not change: staff are never redirected, and a finished flow still lands an exhibitor on Find Shows.

### Pulling out (MYK9-2001)

- **Before she confirms**, the dialog shows what she paid for what she is removing: "Entry fee $30.00: the secretary decides on a refund. Service fee $2.10: not refunded."
- **When she confirms**, an email names the dog and classes, and says the refund is waiting for the secretary. It promises no amount and no date.
- **At the outcome**, an email says what was refunded, or that nothing was and why. After the club has been paid, it says the club settles it with her directly (MYK9-1953).

Nothing here issues, approves or schedules a refund. A refund is never automatic.

## Does this duplicate an existing surface?

No. The emails extend the receipt, the confirmation and the scheduled-email steps that exist; the dormant reminder step gets a producer in place of a new mechanism. My Shows changes are on the existing card. The note reuses the show's existing confirmation message. Delivery history is the existing list.

One overlap is removed: the secretary's send date for the fuller confirmation goes, because the email now sends itself.

## Open, not decided

- **Email settings.** She has none. These emails are about an entry she paid for, so none is proposed.
- **Start times.** Almost no class has one, so the emails rarely say when her class runs. Whether secretaries should be asked for them is a separate question.
- **Text alerts** have not launched.
- **The profile step for a brand-new exhibitor before her first entry** was not walked: the test exhibitor's profile is complete.

## Phases

**Phase 0: confirm.** Read-only, before any build:

- Whether a card-paid entry is accepted at payment or waits for the secretary. This decides how long she waits for the full confirmation.
- Where the secretary edits the show's confirmation message today.
- What each registry's rules give an exhibitor when the judge changes.
- How a show is cancelled in the app, and what happens to its entries.
- Whether a declined refund records a reason.
- Walk the first-run redirect as a brand-new exhibitor on a throwaway account, with writes refused after sign-up.

**Phase 1: the receipt and the full confirmation** (MYK9-1999).

**Phase 2: My Shows and her own pages** (MYK9-1998). No edge function, so it can ship alone.

**Phase 3: the reminder and the note** (MYK9-1999).

**Phase 4: emails when something changes** (MYK9-2000).

**Phase 5: pulling out** (MYK9-2001). Money work: own branch, never batched, `independent` review.

**Phase 6: guides.** The exhibitor guide lists the emails she will get. The secretary guide says they send themselves, where the note goes, and where Delivery history is.

**Phase 7: testing.**

- A card payer and a mail-in exhibitor each get a receipt, a full confirmation and a reminder, once each.
- An exhibitor with three dogs in one show gets one of each, not three.
- The reminder's send time is right for a show in a time zone other than the server's, and it is not sent for a cancelled show or to someone who pulled every entry.
- A judge change emails the exhibitors in that judge's classes and nobody else.
- Five edits to one entry in a minute send one email. An exhibitor's own change sends none from the secretary.
- Every email in this plan appears in Delivery history for its show, with its text readable.
- UKC and ASCA emails never name the American Kennel Club.
- My Shows shows the judge, the labelled armband, the street address and one amount per show, at phone width.
- An exhibitor with unfinished set-up and a paid entry opens My Shows, the cart and messages without a redirect; a secretary is still never redirected.
- The pull dialog's amounts equal what she paid, for a card entry and for a check entry.
- A refund issued, a refund declined, and a refund after the payout each send the right email with the right amount, and none of them moves money.
- End to end in Stripe test mode as an exhibitor: enter, pay, read each email, pull one class, read the outcome.
- Add the wait to `docs/qa/walks/role-intent-walk.md` for the exhibitor week.

## Connections

- MYK9-1963: entry, from the show page to paid.
- MYK9-1800: acceptance emails send automatically after the Undo window.
- MYK9-318: the reminder toggles, hidden because nothing produced them.
- MYK9-1010: AKC entries require the owner's address.
- MYK9-1940 and MYK9-1929: day-of changes and class change requests, both of which change her entry.
- MYK9-1953 and MYK9-1956: refunds after the payout, and when the club is paid.
- `docs/superpowers/specs/2026-07-08-show-email-sequence-design.md`: the email sequence design.

## Non-goals

- An all-shows email list.
- A reminder or confirmation the secretary must send.
- A switch for the secretary to hold a change email back.
- A separate show-details page.
- Changing refund rules, who approves a refund, or the service fee.
- Show-day notices. Ringside covers the day.
