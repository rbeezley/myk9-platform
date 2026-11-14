# A club's first hour: from "Add your club" to a published show

> **Status:** Active

Linear: MYK9-1979. Agreed with the owner in a design conversation on 2026-11-13. No code has been written.

## Why

A club moving to myK9Show should reach a published show without a support call. `docs/INTENT.md` sets the secretary's target for setting up a show: "The software already knows what I need", through "Smart defaults, clone from previous shows, minimal required fields". Its anti-pattern is "Anything that makes the user feel like they need to 'learn the software.'"

The show wizard meets that. The trouble is around it: how a club gets in, and how its secretary finds out what stands between a finished draft and a published show.

## How this was checked

- **Seen in the running app** on 2026-11-13, signed out and as the test secretary, with every write refused: the home page's request form, sign-up, the "Add Club" dialog, a club page, the wizard's first step, a draft show, and the Publish control.
- **Read in code, not seen:** creating an account and confirming its email, the owner's approval screens, the request-access page, and Stripe.

## The path today

### Getting in: three doors, three queues

| Door                                                 | What it asks                                    | What happens next                                                                                                                                                                              |
| ---------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Add your club" on the home page                     | Club name, organization, a club number, contact | A row in `onboarding_requests`, shown at `/admin/onboarding`. Nobody is emailed. The page promises "usually within 24 hours". The owner creates the club by hand and grants access separately. |
| "Club officer" or "Show secretary" ticked at sign-up | Nothing extra, not the club's name              | A row in `role_requests` with no club. The owner and the applicant are emailed. Approving needs an existing club to attach.                                                                    |
| "Set up a new club" on the request-access page       | Club name, a club number                        | A row in `club_access_requests`. One approval creates the club, grants admin and secretary access, authorizes it and emails "Your club is ready".                                              |

A fourth route: a secretary can add a club herself from the wizard's host club field. It reads "Unauthorized" until the owner authorizes it, and its shows cannot be published.

### Between the draft and "Published"

Three things block publishing today (`components/shows/ShowStatusPill.tsx`, and the `enforce_show_publish_gate` trigger):

1. The club is authorized by the owner.
2. The club's payouts are enabled, only when online entries are on.
3. The entry opening and closing dates are set.

She learns each one by pressing Publish and reading a refusal. The wizard's Review step mentions the entry dates and nothing else. "Ready for show day" is not a publishing checklist: it appears only in the seven days before the show.

### Counted from code

About 16 screens and 25 to 30 required inputs from the home page to a published one-trial show, with two waits: one for the owner, one for Stripe.

## What is wrong

| #   | Finding                                                                                                                                                                                     | Seen or read |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| 1   | **Three ways to ask, three queues that don't know about each other.** The one the home page points to does the least and tells nobody.                                                      | Read         |
| 2   | **A home page request can sit unseen.** No email, no alert, and the admin home does not count it.                                                                                           | Read         |
| 3   | **The sign-up ticks ask for approval without saying which club.**                                                                                                                           | Seen         |
| 4   | **While she waits she can build nothing**, unless she finds the wizard's "Add Club" link.                                                                                                   | Read         |
| 5   | **What blocks publishing is learned one refusal at a time.**                                                                                                                                | Seen         |
| 6   | **A secretary who is not a club admin hits a dead end at the bank.** The refusal says "Find it under My Club → Payments", a menu she does not have. The club page lists the admins by name. | Seen         |
| 7   | **No screen was found where a club admin adds a second admin.** A club whose treasurer is not already an admin has to ask the owner.                                                        | Read         |
| 8   | **A club waiting for approval is labelled "Unauthorized".**                                                                                                                                 | Seen         |
| 9   | **The request form offers organizations the app does not run:** NACSW, CPE, USDAA, NADAC, NASDA, Other.                                                                                     | Seen         |
| 10  | **A club name already taken produces a raw database message.**                                                                                                                              | Read         |
| 11  | **A new officer who confirms her email appears to be sent through the exhibitor's profile step**, home address included, before she returns to the club form.                               | Inferred     |
| 12  | **The secretary gets no notice of her first entry**, only a copy of the exhibitor's email.                                                                                                  | Read         |
| 13  | **The show wizard has no help link**, and no guide covers asking to join, waiting, or being approved.                                                                                       | Read         |
| 14  | **One role, several names:** "Club officer", "show host" and "Club Admin". "My Club → Payments", "Connect payment account" and "Connect bank account" for one button.                       | Read         |

## Decisions (owner, 2026-11-13)

1. **One front door.** The home page form is the only way to ask, and it does what "Set up a new club" does today. Sign-up loses the two role ticks.
2. **She starts at once; approval gates publishing.** Approval stays, by hand.
3. **A "Before you can publish" list holding only what blocks.** A published premium list is required to publish a show.
4. **The bank stays with club admins.** A secretary is told who they are and can send them the link.
5. **No treasurer role.** A treasurer is a club admin who does the bank step. A role limited to Payments would trust someone with the club's bank and then stop them editing its address.

Related, same day: MYK9-1965 makes online entries permanent and requires enabled payouts to publish.

## Design

### One way in

- The home page form stays where it is and asks what it asks now: club name, organization, at least one club number, contact. Organizations: AKC, UKC, ASCA.
- Sign-up is an account and nothing more. The "I am…" ticks go.
- The request-access page keeps its club search, for joining a club that is already here. Its "Set up a new club" points at the form.
- The wizard's "Not the right club? Add Club" points at the form.
- The form says, in one line: "Is your club already on myK9Show? Ask its admin to add you."
- One table holds the requests. The other two stop receiving new rows; what to do with their existing rows is a Phase 0 question.

### She starts at once

Submitting the form:

- creates the club, marked **"Waiting for myK9Show approval"**;
- makes her its admin and its secretary;
- emails her "We've got your request", saying what she can do meanwhile: build her show, connect the club's bank;
- emails the owner, alerts the owner's phone (the route in MYK9-1960), and adds to "Clubs waiting for approval" on the admin home.

Nothing she builds is public until the owner approves. On a yes she is emailed "Your club is approved". On a no she is emailed the owner's reason, and the club and its drafts are removed after the owner confirms, since that deletes her work.

A name already taken reads: "A club with this name is already on myK9Show. If it's yours, ask its admin to add you, or email us."

### Before you can publish

Every draft show carries one list from the day it is created:

> **Before you can publish**
>
> - Club approved by myK9Show · _Waiting, usually within a day_
> - Club's bank account connected · _Under review by Stripe, usually a day or two_
> - Entry opening and closing dates · **Set dates**
> - Premium list published · **Publish the premium list**
> - Publish the show

Rules:

- **Only what blocks.** No "recommended" lines.
- **One calculation.** The list, the Publish control and the server's check read the same facts. The server keeps its own refusal.
- **Each line opens the place to fix it.** It reuses the line from the night-before checklist and "Finish the show" (`features/show-workbench/setupReadinessSignals.ts`).
- **A line waiting on someone else says who and roughly how long.**
- **Three places:** the draft show's page, the wizard's Review step, and the "Show Created!" screen, whose "Review & Publish Show" button leads to a refusal today.
- **It goes when the show is published.**

### What she sees between the form and her first show

This is not a wizard. Two of the steps wait on other people, the steps can be done in any order, and `docs/INTENT.md` names multi-step forms as something to avoid for secretaries. What she gets is one card that always says what is next.

After "Submit request" she lands on her home page, which carries:

> **Get your first show published**
>
> - Your club is on myK9Show ✓
> - myK9Show approves your club · _Waiting, usually within a day_
> - Connect the club's bank account · **Connect** or **Ask your treasurer**
> - Create your show · **Add Show**
> - Publish it

Rules:

- **Each line opens the place to do it.** A line waiting on someone else says who and roughly how long.
- **It reads the same facts as "Before you can publish"**, so the two never disagree. Once she has a draft show, "Publish it" opens that show's list.
- **"Ask your treasurer"** opens "add an admin" on the club's Members tab.
- **It goes when her first show is published**, and never returns for later shows. A draft show's own list covers those.
- **It lives on the existing home page**, above "Needs attention". No new page.

### The person who can't connect the bank

On the bank line, for someone who is not an admin of the club:

> Club's bank account connected · Morgan Reyes or Taylor Brooks can do this · **Send them the link**

"Send them the link" emails the club's admins: which show is waiting, a link to the club's Payments tab, and the treasurer's guide.

A club admin can add another admin by email from the club's Members tab. The person added gets an invitation. This is how a treasurer gets access.

### Wording

- "Waiting for myK9Show approval", never "Unauthorized".
- "Club admin" wherever the role is named to a user.
- "Connect bank account", the button's own label, in every message and guide that points to it.

## Does this duplicate an existing surface?

No, it removes two. Three request paths become one, and the publish refusals become one list built from an existing component. The additions are "add an admin" on the club's Members tab, which has no equivalent today, and the first-show card on the home page, which is the same list at club level and disappears after the first published show.

`docs/plan-secretary-access-request.md` (Active) built the sign-up ticks through Google and Apple sign-in, and the request-access page. This plan removes the ticks and keeps the page's club search. Read it first, and close it out with this work.

## Open

- **Payouts switched off after a show is published.** Carried on MYK9-1965.
- **A second admin and the bank.** What another club admin can do on the Payments tab once an account is connected. If they can swap the account, guard that one action.
- **Her first entry.** Whether the secretary should hear when the first entry arrives. Not discussed.

## Phases

**Phase 0: confirm.** On a throwaway account and club, with writes allowed there only:

- Walk a new account from the home page to a published show. Count screens and inputs.
- Whether a new officer is sent through the exhibitor's profile step after confirming her email (finding 11).
- That no screen lets a club admin add another admin (finding 7).
- Whether a premium list can be published while its show is a draft. If not, fix the order before making it a blocking line. A club's own uploaded premium (MYK9-1952) counts as published.
- What the owner sees and does today for each of the three kinds of request, and what rows the three tables hold.
- What a second club admin can do on the Payments tab once a bank is connected.

**Phase 1: one door.** The form creates the club and grants access; the emails; the alert and the admin home line; the duplicate-name message; the organization list. Sign-up's ticks and the other two paths are retired last, once the form does their job.

**Phase 2: the list.** One calculation, then the list in its three places, then Publish reading it, then the first-show card on the home page reading the same calculation. Lands with or after MYK9-1965, which changes two of its lines.

**Phase 3: the bank hand-off.** Names on the bank line, "Send them the link", and "add an admin".

**Phase 4: guides.** The club admin guide, the secretary guide and the treasurer's guide describe this path. The treasurer's guide opens with "Ask your club's admin to add you". The show wizard gains its help link.

**Phase 5: testing.**

- A new account can ask for a club from the home page, Account and the wizard, and reaches the same form from each.
- After submitting, she can create a show and open the club's Payments tab without the owner having done anything.
- The owner receives one email and one alert per request, and the admin home's count matches the requests waiting.
- Each of the four blocking lines refuses Publish on the server when unticked, and the list shows exactly the lines the server would refuse.
- After submitting the form she lands on the first-show card. Its lines agree with the draft show's list for the same club, and it is gone after her first show is published.
- A secretary who is not a club admin sees the admins' names and no way to connect the bank herself.
- An added admin can open Payments. A removed admin cannot.
- A declined club and its draft shows are gone, and she was told why.
- End to end as a new club, following only what the screens say: home page to published show, with the owner's approval and a Stripe test-mode account.
- Add the walk to `docs/qa/walks/secretary-task-walk.md`.

## Connections

- MYK9-1965: online entries always on; enabled payouts required to publish. This plan's list is where the secretary reads that rule.
- MYK9-1952: the premium list, now required before a show is published.
- MYK9-1960: the owner's phone alerts.
- `docs/operations/stripe-treasurer-guide.md`: the bank step itself.

## Non-goals

- A treasurer role, or any role limited to Payments.
- Letting a secretary who is not a club admin connect the bank.
- Changing the show wizard's steps or fields.
- Removing the owner's approval.
- "Recommended" lines on the publish list.
