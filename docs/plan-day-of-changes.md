# Day-of changes: one habit for every change to a dog's entry

> **Status:** Active

Linear: MYK9-1940. Agreed with the owner in a design conversation on 2026-11-13. No code has been written.

## Why

On show day a secretary pulls a dog, marks one absent, changes a class, changes a handler, checks people in. `docs/INTENT.md` sets the target: "calm one-tap operations, not multi-step wizards", and names "confirmation dialogs for routine actions" as something to avoid.

A code search on 2026-11-13 mapped ten such changes across Show Desk, the Check-in desk, the Entries page and ringside. The same change behaves differently depending on where it is started, so she cannot form one habit. Most findings below come from that search and were not re-read line by line; Phase 0 confirms each before it is touched. Two were re-read and are marked.

## The habit

Five rules. Every day-of change follows them from every place it can be started.

1. **One tap.** No dialog, unless the change involves money or cannot be undone.
2. **It says what happened**, naming the dog and the class. Never "Status updated".
3. **Undo in the same place, for the same length of time.** After that, one named way back.
4. **Same words everywhere.** One word for one act, on the secretary's screens and the judge's.
5. **If it needs a connection, it says so before she taps.**

## What is already decided and stays

- **Pull and Withdraw are different acts** (`docs/INTENT.md`). Withdraw carries a rulebook reason; Pull is anything else. No screen says "scratch".
- **Show Desk's per-dog menu** carries Change class, Edit entry, Mark absent, Open dog details and Open person details (owner, 2026-11-11, MYK9-1873). Pull lives in the check-in picker.
- **Each change keeps its home** (the six phases table in `docs/INTENT.md`). This plan adds no page, tab or menu.

## Today against the rules

| Change         | Where                   | Rule broken | What happens today                                                                                                                                                                                            |
| -------------- | ----------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Change class   | Ringside (judge's list) | 4           | The dog that left reads "Pulled", in a "Pulled / not running" group. Re-read: `packages/ringside/src/pages/EntryList/runQueue.ts:141` puts `moved` and `absent` in the statuses that read "Pulled".           |
| Pull           | Show Desk               | 3           | No way back after the toast. The Check-in desk has "Put back".                                                                                                                                                |
| Pull           | Show Desk               | 2           | Recorded as "Pulled at the check-in desk" wherever it was started.                                                                                                                                            |
| Pull           | Entries page            | 2, 3        | No refund note, the toast says "Status updated", and Undo lasts a different time from the desks'.                                                                                                             |
| Mark absent    | Show Desk               | 1, 3        | Opens "Mark #110 Hazel absent?". No Undo; the way back is "Reset score" on the judge's screen.                                                                                                                |
| Change class   | Show Desk, Entries      | 3           | The way back is to reopen the dialog on the moved entry and find "Move back to…". An 8-second Undo banner exists in the code and no screen shows it.                                                          |
| Change class   | Show Desk               | 5           | Needs a connection. The Entries page greys it out with a reason; Show Desk lets her try and fail.                                                                                                             |
| Change handler | Show Desk, Entries      | 2           | Labelled "Edit entry". Re-read: for a secretary on a scent work show the sheet's only editable field is the handler (`EntryEditDialog` with `allowLeaveClass={false}`; jump height is hidden for scent work). |
| Change handler | Show Desk               | 1           | A link to the Entries page, where she opens the sheet. Change class opens in place.                                                                                                                           |
| Change handler | Both                    | 5           | Needs a connection and does not say so beforehand.                                                                                                                                                            |
| Check in       | Both desks              | none        | The pill changing is the feedback. No toast is added.                                                                                                                                                         |

Checked and not a problem: the handler sheet's "saved on this device" wording. It is only reached after the save succeeded (`EntryEditDialog.tsx:270`), and the save needs a connection, so it cannot claim a save that did not happen.

## The work, by screen

Each group is one branch and one PR. None adds a migration or touches money, so groups on the same screen may share a branch.

### 1. Ringside words (first)

- A dog that changed class reads "Moved to {class}", not "Pulled".
- An absent dog reads "Absent".
- The group title covers what is in it: "Not running".
- Before changing it, find out why `moved` and `absent` were put with "Pulled" (`git log -S "PULLED_STATUSES"`). If a test asserts it, read the commit that chose it first.

### 2. Show Desk

- **Mark absent:** one tap, then "#110 Hazel marked absent" with Undo. Undo uses the same reset the judge's screen uses. The dialog goes.
- **Change handler…:** replaces "Edit entry". Opens the existing sheet in place, as Change class does. The sheet's title and description say "Change handler". Its status and score history stay in the sheet.
- **Change class:** greyed out with "Changing a class needs a connection." when offline, as on the Entries page. After a change, the existing Undo banner is shown.
- **Pull:** gains "Put back" under the same conditions the Check-in desk uses. Records where it was really started.

### 3. Entries page

- **Pull:** opens the same dialog the desks use, with the refund note. Says "{dog} pulled from {class}". Undo lasts as long as on the desks.
- **Change handler…:** replaces "Edit entry" in the row menu and in the checklist hint that names it (`formChecklist.ts:112`).
- No toast anywhere on this page says "Status updated"; each names the dog and what changed.

### 4. One Undo

- One helper and one duration for every day-of Undo toast. Today there are at least three: sonner's default, 6 seconds, and 8 seconds.
- Delete what nothing uses: the old Pull flow in the Show Map executor (`scratch-entry`, "Entry marked pulled", "Pull undone") once Phase 0 confirms no screen reaches it.

## Decisions for the owner

1. **Undo length.** One number for all of them. Proposal: 8 seconds, the longest in use today.
2. **Mark absent without a dialog.** Agreed in conversation as part of rule 1. Recorded here because it removes a confirmation someone added on purpose.
3. **The handler sheet's history.** Stays in the sheet under "Change handler". No "Entry history" menu item until someone asks.

## Phases

**Phase 0: confirm.** Reproduce each row of the table in the running app on a test show, with writes to the shared database blocked or on a throwaway show. Drop any row that does not reproduce. Read MYK9-1780 (each dog's status on Show Desk) so the two do not collide on the class entries table.

**Phase 1: ringside words.**

**Phase 2: Show Desk.**

**Phase 3: Entries page.**

**Phase 4: one Undo, and deletions.**

**Phase 5: testing.**

- A unit test per change asserting the message names the dog and the class.
- One test that every day-of Undo uses the shared helper and duration.
- Ringside: a moved dog, an absent dog and a pulled dog each read their own word.
- Mark absent then Undo leaves the entry exactly as it was (assert the row, not the toast).
- Offline: Change class and Change handler are disabled with their reason on both screens.
- One end-to-end walk on Show Desk: pull and put back, mark absent and undo, change class and undo, change handler.
- Add the five rules to the show-day walk (`docs/qa/walks/show-day-walk.md`) so later screens are checked against them.

## Connections

- Class change requests (MYK9-1929) renames the Move-ups list to "Class changes" and uses Accept and Decline. Same words rule; do the two together on the Entries page if they are built close in time.
- MYK9-1780 adds each dog's run status to Show Desk's class panel.

## Non-goals

- Moving any change to a different screen or menu.
- Adding Pull, Withdraw or anything else to Show Desk's per-dog menu.
- Making Change class or Change handler work offline.
- A per-dog armband label; that is in the print packets plan (MYK9-1924).
