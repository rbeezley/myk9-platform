# Exhibitor entry, from the show page to paid

> **Status:** Active

Linear: MYK9-1963, and MYK9-1964 for the card payment step. Agreed with the owner in a design conversation on 2026-11-13. No code has been written.

## Why

`docs/INTENT.md` sets the exhibitor's target for entering a show: "That took 30 seconds", through "Pre-filled dog info, remembered preferences, minimal taps to enter".

The entry wizard works. The show an exhibitor was looking at is remembered from "Enter this show" through sign-in, sign-up and the email link, and back to the wizard. The gaps are at the wizard's edges: what she is told before she starts, what happens when a rule stops her, and what she receives after paying.

## How this was checked

- **Seen in the running app** on 2026-11-13, at phone width, as a signed-out visitor and as the test exhibitor: the public show page, sign-in, sign-up, and the wizard's Dogs, Classes and Payment steps. Nothing was written to the database. The wizard saves a draft cart; those saves were answered inside the browser and never sent.
- **Read in code, not seen:** the second "Your Entry" page, Stripe, both confirmation emails, the Receipt step, and the profile step after a first entry. Reaching them needs a write.

Each finding below says which.

## The journey today

A first-time exhibitor paying by card meets about 11 screens and about 22 required inputs, counted from code:

1. Public show page, "Enter this show".
2. Sign-in, then "Create account": first name, last name, email, password, terms.
3. "Check your email", and the link in it.
4. The wizard, four steps: **Dogs**, **Classes**, **Payment**, **Receipt**.
   - Dogs: "Add a new dog" opens the Add Dog panel in place. Registration number first, then call name, sex and date of birth.
   - Classes: one tab per dog, trials, then classes. An AKC show asks for the owner's address here.
   - Payment: card, check or cash as the show allows; the entry agreement; the fees.
5. With card: a second page, "Your Entry", then Stripe, then "Entry Submitted Successfully!".

## What is wrong

| #   | Finding                                                                                                                                                                                                                                                              | Seen or read  |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| 1   | **The service fee first appears on step 3.** The show page says "First entry $30.00". The Classes step's total says "$30.00". With card selected the Payment step says $32.10.                                                                                       | Seen          |
| 2   | **Before the Payment step, the wizard explains how to avoid the fee:** "Service fee shown at payment, only when paying by card."                                                                                                                                     | Read          |
| 3   | **Paying by card takes two commits.** "Submit & pay" opens a second page showing the same lines, with "Pay $X and confirm entries", and only then Stripe.                                                                                                            | Read          |
| 4   | **A dog with no registration number is a dead end.** The rule is deliberate (MYK9-1162): only the show's staff may enter one. The messages say "Enter your dog's registration number to continue" and "Add this dog's AKC registration before selecting this class." | Read          |
| 5   | **The wizard says "To change or withdraw an existing entry, message the show secretary"**, while My Shows lets her pull an entry herself.                                                                                                                            | Read          |
| 6   | **On the Dogs step, a dog already entered in this show looks like any other.** The line "Used for this show" on each card refers to the registration number, not to an entry. The Classes step does mark classes already entered.                                    | Seen          |
| 7   | **The card confirmation email is thin.** No link back, no armband, no withdrawal policy. It says "Platform fee" where the app says "Service fee", and "Order cs\_…" where the success page shows a confirmation number.                                              | Read          |
| 8   | **A check or cash entry sends no email unless she presses "Email Confirmation"**, and that button may be replaced by the styled receipt.                                                                                                                             | Read, in part |
| 9   | **A stray comma on every dog card:** "AKC: SR6DD83562 , Used for this show".                                                                                                                                                                                         | Seen          |
| 10  | **A profile step waits on the first page she opens after entering.** The onboarding check exempts the wizard and checkout, so it fires next.                                                                                                                         | Inferred      |
| 11  | **Nothing checks the level.** A dog with no titles can be ticked for Master. The only guard is the line "New to this sport? Start with Novice…". The app holds no record of a dog's titles (`hooks/useEntryEligibility.ts`: "Not stored in dogs table").             | Seen and read |
| 12  | **Wording drifts.** "Enter This Show" and "Enter this show"; "Your Entry", "cart" and "entry" for the same thing; "My Shows" for a page whose route is `/exhibitor/entries`; a line that promises "the final review" when there is no review step.                   | Read          |

Not a bug: signed out, Find Shows read "No upcoming shows" in this database. Demo shows are hidden from guests on purpose (MYK9-952), and they were the only upcoming shows.

## Decisions (owner, 2026-11-13)

1. **Level and title: left as advice.** No check and no question. Finding 11 stands as it is.
2. **Registration number: keep the rule, fix the dead end.** The exhibitor is told the secretary can enter the dog and hold its place.
3. **Card payment goes straight to Stripe.** The second page stays for a cancelled payment and for unpaid entries. Money work, so it is MYK9-1964.
4. **The service fee is said on the show page, in one line, and nothing advertises check or cash.** Card payments are how myK9Show is paid. The split between Stripe and myK9Show stays on the Payment step only.

## Design

### The fee, said once and early

Beside the entry fee on the show page, public and signed in:

> Plus a 7% service fee when you pay online.

- The rate is the show's own, read from the same place the Payment step reads it. It is never typed in.
- The line appears only when the show accepts online entries.
- It links to the existing "How our fees work" page.
- The same line belongs in the premium list's fees section (MYK9-1952), from the same source.

On the Classes step, "Service fee shown at payment, only when paying by card." becomes:

> Plus a service fee, shown at payment.

Nothing is hidden. Where a club accepts check or cash, she sees those choices on the Payment step and the fee drops off the total when she picks one. Card stays selected by default.

The Payment step's breakdown is not changed.

### No dead end without a registration number

Both messages gain one line and the existing "Message the show secretary" action:

> Number not issued yet? Message the show secretary, who can enter your dog and hold its place until the number arrives.

On Add Dog the show may not be known, when the panel is opened from My Dogs. There the line reads "…ask the secretary of the show you want to enter".

### One answer about changing an entry

The wizard's notice on a class already entered links to My Shows: "To change or withdraw this entry, open it in My Shows." My Shows is the home for an exhibitor's existing entries; the wizard only adds.

### A dog already entered says so

On the Dogs step a dog with an entry in this show carries "Already entered in 2 classes". She can still select it to add more. The registration line loses its stray comma, and "Used for this show" is reworded so it cannot be read as "entered" (MYK9-1290 already covers the three numbers on each card; do both together).

### A confirmation worth keeping

The card confirmation email:

- says "Service fee";
- shows the confirmation number the success page shows, not Stripe's session id;
- links to her entries on My Shows;
- says in one line where her armband number will appear, and when.

A check or cash entry sends the same email once, when it is submitted, with "Pay at the show: check payable to {club}" or "cash, exact amount" in place of the payment lines. The "Email Confirmation" button goes.

Check first: MYK9-1799 recorded an owner decision about acceptance emails being sent automatically. If that already covers check and cash, this part is done.

### Wording

One name each, wherever an exhibitor reads it: "Enter this show"; "your entry" for what she is building, never "cart"; "Service fee". The line promising a "final review" is corrected.

## Does this duplicate an existing surface?

No. Every change is wording or a link on a page that exists. Nothing is added to the wizard's steps. The second payment page is removed from the card path, not replaced.

Ten Active plans touch the exhibitor's side. None owns the wizard from the Dogs step to paid; the wizard's structure came from the MYK9-483 redesign, an OpenSpec change. The neighbours:

- `plan-exhibitor-elderly-ux-remediation.md` Phase 8 marks classes "Already entered" (recorded done); Phase 6 adds registration guidance on Add Dog (open). This plan's registration line should land with Phase 6, not beside it.
- `plan-wave1-exhibitor-entry-payment-trust.md` keeps `/cart` as the recovery route. MYK9-1964 keeps that.
- `plan-myk9-508-reentry.md` and MYK9-509 cover resuming a draft and a cancelled checkout. MYK9-1964 must not undo either.
- `plan-myk9-1010-owner-address.md` requires the owner's address on AKC entries.

## Open, not part of this plan

- **The profile step after a first entry** (finding 10). Inferred from code. Confirm it in Phase 0 before deciding anything.
- **Email confirmation before a first entry.** Sign-up requires the email link before she can continue. It was not questioned in this conversation.
- **A club that never connects its bank.** Decided by the owner on 2026-11-13 and filed as MYK9-1965: online entries are always on, check and cash are off by default, and a show cannot be published until the club's payouts are enabled. It replaces the 2026-11-09 default (MYK9-1799). Once it ships, the fee line on the show page appears on every published show, and its "only when the show accepts online entries" condition falls away.

## Phases

**Phase 0: confirm.** On a throwaway show, with writes allowed there only:

- Walk a new account from the public show page to a paid card entry in Stripe test mode, and to a check entry. Count screens and required inputs.
- What a brand-new exhibitor meets on the first page after entering (finding 10).
- What a check or cash entry sends today, and when (finding 8, against MYK9-1799).
- Whether a dog already entered is marked on the Dogs step in any state (finding 6).
- What the second payment page checks before it creates a checkout session. MYK9-1964 needs the list.
- Whether Trial 1's two "Interior Advanced" rows are test data. Two classes with one name in one trial should be told apart on screen if a real show can have them.

**Phase 1: wording and links.** The fee line on the show page, the Classes step line, the registration dead end, the wizard's notice, the dog card, the wording list. One branch, one surface at a time. No money logic.

**Phase 2: the emails.** The card confirmation's content, and one email for a check or cash entry.

**Phase 3: card straight to Stripe (MYK9-1964).** Its own branch, never batched, `independent` review, and part of the test-mode rehearsal before Stripe goes live (MYK9-11).

**Phase 4: testing.**

- The fee line shows the show's own rate, appears only when online entries are on, and matches the Payment step's rate for the same show.
- No text before the Payment step says the fee applies only to card.
- An exhibitor with no number for the show's registry reaches the secretary in one tap from Add Dog and from the Classes step.
- A dog with entries in this show is marked on the Dogs step and can still be selected.
- The card email and the success page show the same confirmation number and the same total.
- A check entry and a cash entry each send exactly one email.
- MYK9-1964's criteria, including a cancelled Stripe payment and a double press.
- End to end as a new exhibitor at phone width, from the public show page to paid, following only what the screens say.
- Add each of these to `docs/qa/walks/exhibitor-task-walk.md`.

## Connections

- MYK9-1929 (class change requests): with no level check, a wrong class is fixed by the exhibitor asking for a change. That plan is the remedy for finding 11.
- MYK9-1952 (premium list): the fees section carries the same service fee line.
- MYK9-1931 (class fees): the show page's "First entry $30.00" will need to say more when classes can differ in price.
- MYK9-1944: the one-time question about showing results publicly is asked from the results email, not during entry.

## Non-goals

- A level or title check, or recording a dog's titles.
- Letting an exhibitor enter a dog with no registration number.
- Changing which payment methods a club may accept, or their defaults.
- Changing the fee, its breakdown on the Payment step, or what the club receives.
- A review step in the wizard.
- Removing the second payment page.
