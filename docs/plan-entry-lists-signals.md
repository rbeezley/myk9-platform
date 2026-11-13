# Entry lists: a signal on Show Desk when something is waiting

> **Status:** Active

Linear: MYK9-1949. Agreed with the owner in a design conversation on 2026-11-13. No code has been written.

## Why

On 2026-10-31 the owner moved the Entries page's other lists into the header Actions menu, under "Entry lists": Pulls, Move-ups, Registration number needed, Waitlist and Check-in desk (MYK9-1594). Each opens as its own view with a way back. That decision stands. A count on the menu row was the signal chosen, and a row of chips was ruled out as clutter.

The gap is narrower. Three of those lists can have work waiting, and nothing says so on the screen the secretary is working on.

| List                       | What can be waiting for her                                  | Signal where she works                                                              |
| -------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Class changes (Move-ups)   | A request to answer                                          | Planned: a Show Desk pill (MYK9-1929)                                               |
| Pulls                      | A refund to decide, before the payout goes                   | None. The menu count is every pull so far, not the ones needing a decision.         |
| Registration number needed | An entry held until the dog's number is supplied             | None on Show Desk. The entry's own form lists it.                                   |
| Waitlist                   | A spot has opened with dogs waiting, or an offer has run out | None, and no count at all (`components/entries/management/entryManagementViews.ts`) |
| Check-in desk              | People to check in today                                     | Already a Show Desk pill                                                            |

Show Desk's "Needs attention" line has pills for entries to review, check-ins, payments, judge's initials and results to close out (`features/show-map/showDeskPendingSignals.ts`, re-read 2026-11-13). The dashboard's own "Needs attention" strip only knows dates: a draft show, a show happening today, entries closing soon (`hooks/useMyShows.ts`). So Show Desk is the one place a show's waiting work is signalled.

## The rule

**Any list that can have something waiting gets a pill on Show Desk when it does, and its count means "waiting for you".**

- A pill opens its list, like the existing ones.
- Nothing waiting, no pill. This keeps the owner's "no clutter" decision: a pill exists only when there is a job behind it.
- The count on the Actions menu row means the same thing as the pill.
- Each pill reads one calculation shared with any other screen that shows the same fact.

## The three pills

### Pulls: refunds to decide

"1 refund to decide before Thursday's payout."

- The Actions menu's Pulls count changes from every pull to the ones needing a decision.
- It is the same line as on the "Finish the show" list (MYK9-1945) and reads the same calculation, including the payout date.

### Registration number needed

"2 entries held for a registration number."

- An entry is held until the dog's number for the show's registry is supplied (MYK9-1162). Missing numbers also stop the results file going to AKC, so catching them before the show avoids a problem after it.

### Waitlist: a spot is open

"A spot opened in Container Novice A · next in line: Scout."

This needs more than a pill, because the waitlist screen does not yet say who is next or how many spots are really free.

## The waitlist recommends who to offer

Owner decision: offering a spot stays a secretary's action, done by hand. The app recommends who.

Seen in the running app on 2026-11-13: the show's Waitlist Settings already have a switch, "Offer open spots automatically", off on the test show ("You offer every open spot yourself, from the queue below"). So automatic offering exists as a club's choice. This plan is about the by-hand path, which is the default; the recommendation and the pill apply when that switch is off. With it on, the pill is only for an offer that has run out.

Today (`pages/secretary/WaitlistManagementPage/WaitlistTable.tsx`, re-read 2026-11-13) the class's waitlist is shown "in join order (first come, first served)" with positions. When the class is under its own limit, "Offer Spot" appears on every row, all alike.

Changes:

1. **Name who is next.** With a spot open, the top of the list reads "1 spot open. Next in line: Scout (joined Oct 3)" with one main button, "Offer spot to Scout".
2. **She can still choose someone else.** The other rows keep a quieter "Offer". Smart default, never a restriction.
3. **Count offers against spots.** "1 spot open · 1 offered, waiting for payment · none left to offer." Today an offered dog is not counted as entered until it pays, so the button stays on every row after an offer. Not checked: whether the server refuses a second offer for the same spot.
4. **Skip a dog that already has an open offer.** Next in line is then the following dog.
5. **A spot is open only when both limits have room** (owner decision):
   - **The judge's limit for the day**, which the rules mandate. It counts every entry across the classes that judge has that day.
   - **The class's own limit**, which clubs rarely set; the owner has seen it used for Detective.

   Today the button looks only at the class's limit and entered count. The cards above it show the judge's day. So the cards can read "Available 0" while every row offers a spot. When a limit is in the way, the screen says which: "Container Novice A has room, but Pat Donovan's Monday is full."

6. **An offer that has run out** is also something waiting: "1 offer has run out in Interior Advanced." It appears in the same pill and at the top of that class's list.

## Does this duplicate an existing surface?

No. The lists stay where they are. The pills join an existing line. The waitlist changes are inside the existing waitlist view.

## Open, not part of this plan

**The dashboard.** A secretary with several shows sees dates on the dashboard but not "3 things need you on Heartland". The dashboard deliberately does not load each show's entries, so a count there needs a server-side answer. Worth doing only if secretaries with several shows ask.

## Phases

**Phase 0: confirm.** On a test show, writes on a throwaway show only:

- What the server does with "Offer Spot" when the judge's day is full, and with a second offer for one open spot.
- That the menu's Pulls count is all pulls.
- What "held" means for an entry day to day: can a held dog be checked in and run?
- How an expired offer looks today.

**Phase 1: one calculation per list** for "waiting for you": refunds to decide, held entries, open spots with dogs waiting, expired offers. Shared with MYK9-1945's list where the fact is the same.

**Phase 2: the pills and the menu counts.**

**Phase 3: the waitlist recommendation**, including both limits.

**Phase 4: testing.**

- Each pill's count equals the number of rows its list shows as needing her.
- No pill when nothing is waiting.
- A class with room whose judge's day is full shows no open spot and names the judge's day.
- One open spot and one open offer leaves nothing to offer.
- Next in line skips a dog with an open offer.
- The Pulls menu count equals refunds to decide, not all pulls.
- Add the three pills to the secretary task walk (`docs/qa/walks/secretary-task-walk.md`).

## Connections

- MYK9-1929 adds the class changes pill and renames that list.
- MYK9-1945's "Finish the show" list carries the refund line and the registration numbers that block sending results.
- MYK9-1594 set where these lists live.

## Non-goals

- Moving any list, or adding chips to the Entries page.
- Changing the existing "Offer open spots automatically" switch.
- Changing how the judge's daily limit is set or enforced.
