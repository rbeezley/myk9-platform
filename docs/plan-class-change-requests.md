# Class change requests: the exhibitor asks in the app, the secretary accepts in one tap

> **Status:** Active

Linear: MYK9-1929. Agreed with the owner in a design conversation on 2026-11-13. No code has been written.

## Why

A dog entered in one class often needs another by show day. It finished the level at a different show, it was entered in the wrong level, or it belongs in section B and was entered in A. Title tracking cannot drive this: titles are earned at shows that do not use myK9Show, and an exhibitor may choose not to move up because the dog is not ready. So the exhibitor has to ask.

Today the asking happens outside the app. The secretary has a Move-ups list with Approve and Deny (`apps/myk9show/src/components/entries/MoveUpRequestsTab.tsx`), but nothing in the app creates a request. A keyword search of the exhibitor pages found only code that displays the "Move-Up Requested" status. The same gap was found and recorded for pull requests in MYK9-609.

## The owner's rules

- **The exhibitor starts it.** The app never decides a dog should move.
- **Not everyone will use it.** An exhibitor can still ask at the table, and the secretary's own "Change class" keeps working exactly as it does now. Nothing new appears on any screen until a request exists.
- **"Change class" stays generic.** One control covers move-up, move-down and a change of section.

## What the registries say

| Registry | Rule                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AKC      | Chapter 3 §21, Class Transfers. A move-up may be requested when, "according to the owner's records", the dog finished the title after entries closed. Move-down for a mistaken entry; lateral A to B. The request is in writing, to the trial secretary, at least 30 minutes before the start of each trial. Granted only if the class is available and under its limit. A club is not required to accept transfers after entries close; the premium should say, and silence means allowed. A club may accept move-ups between trials held the same day if the premium says so, and the 30 minutes is then waived. A transfer never adds an entry. |
| UKC      | A dog finishing a title at Trial 1 may move to the next level for Trial 2, under the club's class change policy, if that class is available and has not begun. Never the reverse.                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ASCA     | §1.5.15. The premium states whether move-ups are allowed and how they are handled.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

Two consequences. Eligibility is the owner's claim, so the app records it and does not check it. And a request made in the app is a written request with a time on it.

## Does this duplicate an existing surface?

No, provided it stays one flow:

- The exhibitor's control goes on the class row of My Entries, beside "Pull or withdraw…". No new page.
- Requests land in the secretary's existing Move-ups list. No second list.
- Accepting calls the existing `move_up_entry` function. No second way to move an entry.
- The secretary's direct "Change class" (`useEntryChangeClass.tsx`, `ShowMapMoveUpDialog.tsx`) is unchanged.

## The exhibitor's side

"Change class…" on the class row in My Entries.

1. Pick the class to move to, from the classes that trial offers. A full class says so and cannot be picked.
2. Pick why: finished this level, entered the wrong level, wrong section.
3. If the new class costs a different amount, the sheet says so before sending: "Advanced costs $5 more. The club will collect it at the show."
4. If it is inside the deadline, the sheet says so and still sends: "This is less than 30 minutes before the trial starts. The club may not be able to accept it."
5. Send. The row reads "Change requested: Container Advanced. Waiting for the secretary."

The exhibitor can take the request back while it is waiting. A denied request shows the secretary's reason on the row.

## The secretary's side

Each request in the Move-ups list is complete enough to decide on sight:

> Scout · Container Novice A → Container Advanced · Trial 2 · Finished the level · asked Mon 7:12 AM, 48 minutes before start · 4 of 12 entered · owes $5

- **Accept** is one tap with Undo. No dialog, because the exhibitor already chose the class. Undo uses the existing `reverse_move_up_entry`.
- **Deny** keeps its reason dialog.
- A late request carries its note ("asked 12 minutes before start") and can still be accepted. Owner decision: a late request is sent with a note, never blocked.
- When she changes a class herself for someone who asked at the table, the record says "asked in person". Both paths leave the same record, and the AKC Transfer Form and UKC Change Entry Form print from it.

## Money

Owner decision, 2026-11-13: **show the difference, the club collects it.** Nothing is charged online for a class change, and nothing is refunded automatically.

- New class costs more: the exhibitor is told before sending, and the secretary's line says "owes $5".
- New class costs less: the line says "club owes $5", and she decides what to do.

This needs facts the conversation did not establish, so Phase 0 confirms them:

- `move_up_entry` creates the destination entry at a fee of $0 with payment pending, and leaves the payment on the source entry ("money does not travel", MYK9-639). So today a move to a dearer class is free and nothing shows a difference.
- Where a class's price comes from, and whether a show can already price levels differently.
- Whether the app shows an unpaid amount on an entry anywhere the secretary would see it at the table. A search for a balance-due field found none.

## Switches per show

Owner decision: a club may not allow class changes, so each show has switches, in show setup beside the other entry rules.

| Switch                                  | Default | When off                                                        |
| --------------------------------------- | ------- | --------------------------------------------------------------- |
| Class changes after entries close       | Allowed | Exhibitors do not see "Change class…" once entries have closed  |
| Move-ups between trials on the same day | Allowed | Exhibitors cannot ask to move up in a later trial that same day |

The secretary's own "Change class" ignores both switches, because she must still be able to fix a mistake. No setting for this exists today; both are new.

## Phases

**Phase 0: establish the facts.** The three money facts above. Read `docs/INTENT.md` for the exhibitor and secretary rows. Read MYK9-609, MYK9-639, MYK9-980 and MYK9-1265 for decisions already made about requests and moves. Decide where a request's target class, reason and time are stored.

**Phase 1: the request exists.** A database function the exhibitor may call for their own entry, in the pattern of `withdraw_own_entry`, that records the target class, the reason and the time, and sets the request status. Online only. A second function to take the request back. This adds a migration, so it ships on its own branch.

**Phase 2: the exhibitor's sheet.** "Change class…" on the My Entries class row, the five steps above, and the waiting, denied and accepted states of the row.

**Phase 3: the secretary's list.** The complete request line, one-tap Accept with Undo, the late note, "asked in person" on her own changes.

**Phase 4: money and switches.** The difference shown on both sides. The two show switches.

**Phase 5: testing.**

- Unit tests for the request line (late note, fee difference in both directions, full class).
- Database tests for the two new functions: an exhibitor can ask only for their own entry, cannot ask into a full or started class, and cannot ask when the show's switch is off.
- One end-to-end walk: an exhibitor asks, the secretary accepts, Undo restores, the exhibitor's row follows each step.
- Add a class change to the exhibitor and secretary task walks (`docs/qa/walks/`).

## Connections

- Print packets (MYK9-1924): an accepted change is what marks a class "changed since printing".

## Non-goals

- Suggesting or making a move-up from title tracking.
- Charging or refunding a fee difference online.
- Checking the exhibitor's claim that the dog finished the title.
- A request that adds an entry. A class change always replaces one.
- Rebuilding exhibitor pull requests. MYK9-609 covers those; read its decision in Phase 0.
