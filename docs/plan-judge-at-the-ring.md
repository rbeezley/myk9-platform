# The judge at the ring

> **Status:** Active

Linear: MYK9-2002, with sub-issues MYK9-2004 to MYK9-2018. Agreed with the owner in a design conversation on 2026-11-14. No code has been written.

## Why

Owner: "scoring at ringside is critical and must be perfect so we don't ruin an exhibitor's run. Judge needs to really like it and make their job easier otherwise they will refuse to use it."

The dog show world still runs mostly on paper, so the comparison is a clipboard, not another app. Paper never loses signal, never needs charging, and a judge already knows how to use it. Every step here is held to two questions:

- **Is it as safe as paper?** A score written down stays written down.
- **Is it less work than paper?** Where the app is slower or more worrying, a judge goes back to the clipboard.

`docs/INTENT.md` sets the judge's target as "Invisible technology": "The judge's eyes should be on the dog, not the screen."

## How this was checked

On 2026-11-14, in four parts:

- **A map of the screens**, from signing in to the last class of the day, read in code.
- **An audit of the score itself:** the timer, the limit, each result, placements, which sheet opens, and corrections. Read in code.
- **An audit of whether a score can be lost:** saving, the unsent queue, refusals, two devices, a new passcode, and what the judge is told. Read in code.
- **A walk on screen** as the test judge at phone width. Every write was refused (`scripts/qa/readonly-walk.ts`), and the backend was cut off before the scoresheet opened. The dog that was "scored" was unscored in the database afterwards.

**Most findings were read in code and are not yet reproduced.** Every sub-issue says "reproduce first". Findings marked Seen were seen on screen.

The judge at the ring is also the most-walked part of the app: weekly judge walks, the owner's own phone walks, and the v3 parity epic (MYK9-1505). This plan covers what those did not.

## What is sound

- A saved score is written to the device before the screen says so, and it survives a reload. Seen: "1 score not sent yet" after a reload with no signal.
- An app update never interrupts a scoresheet.
- Two devices scoring the same dog is handled and tested.
- Rounding, a double tap on Save, opening and leaving a sheet, Reset score, auto-stop at the limit, and the 30-second warning.
- Placements: qualifiers only, fewest faults then fastest time, re-ranked after a correction.

## What is wrong

### The score itself can be wrong

| #   | Finding                                                                                                                                                     | Seen or read | Issue                |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | -------------------- |
| 1   | **A Qualified saves with no time, and then places first.** UKC two-timer classes before Finish; AKC and ASCA multi-area classes without "Record Area time". | Read         | MYK9-2004, MYK9-2005 |
| 2   | **"Correct this score" opened a blank sheet.** UKC and Nationals are blank by design. A one-field correction can wipe the time.                             | Seen         | MYK9-2006            |
| 3   | **A time over the limit saves as Qualified.** The app works it out and shows nothing.                                                                       | Read         | MYK9-2004, MYK9-2005 |
| 4   | **UKC and ASCA fault limits are not enforced.**                                                                                                             | Read         | MYK9-2004            |
| 5   | **The timer trusts the phone's clock**, and a reload mid-run loses the time.                                                                                | Read         | MYK9-2007            |
| 6   | **A reason is stored that the judge did not pick**, and a timer-set "Max Time" can be replaced by the default.                                              | Read         | MYK9-2008            |
| 7   | **The UKC element time is shown on the read-back and never stored.** Nationals keeps a fifth area only in the total.                                        | Read         | MYK9-2016            |

### A score can be lost or held

| #   | Finding                                                                                                                   | Seen or read | Issue     |
| --- | ------------------------------------------------------------------------------------------------------------------------- | ------------ | --------- |
| 8   | **A new code for a judge strands her unsent scores.** They are never retried and never listed.                            | Read         | MYK9-2009 |
| 9   | **A check-in change on a dog holds its score** behind a message naming no dog. One button discards the score.             | Read         | MYK9-2010 |
| 10  | **A refused score disappears from every count.** The header can read "All sent". There is no list and no automatic retry. | Read         | MYK9-2011 |
| 11  | **A brief server error gives up on a score after about three seconds.**                                                   | Read         | MYK9-2011 |
| 12  | **Changing a class's judge mid-show refuses scores the first judge entered offline.**                                     | Read         | MYK9-2015 |
| 13  | **A score for a withdrawn or moved dog is accepted** from a stale list.                                                   | Read         | MYK9-2010 |

### It is more work than paper

| #   | Finding                                                                                                                              | Seen or read | Issue     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------ | --------- |
| 14  | **Eight taps per dog.** Six to score, two to reach the next. The Saved screen does not say what was saved.                           | Seen         | MYK9-2012 |
| 15  | **After a reload with no signal, "Your ring" is gone.** Every judge's classes are listed, each reading "Entry count not loaded yet". | Seen         | MYK9-2014 |
| 16  | **Nothing marks the end of her day**, or says every score has been sent.                                                             | Read         | MYK9-2013 |

Smaller wording, counting and dead-control fixes are in MYK9-2018.

## Decisions (owner, 2026-11-14)

1. **A Qualified needs a time.** Refuse a Qualified with no time, and refuse a time over the limit. **A Qualified at exactly max time is allowed.** Owner: "if an exhibitor forgets to say finish they still Q but with max time. If there is a timer malfunction the exhibitor can choose to re-run or Q with max time."
2. **UKC and ASCA fault limits: refuse the save and say why.** The app does not change the result by itself.
3. **NQ and Excused reasons: keep the default and make it safe.**
4. **After Save, go back to the entry list by itself.** The app never suggests the next dog. Owner: "dogs often do not come in the ring in the run order because there are multiple rings going on at the same time. most judges judge whoever comes in the ring so trying to automate the next dog is fruitless."
5. **A check-in change never holds or discards a score.** The score always wins and the judge is never asked.
6. **One "Scores not sent" list on the judge's device, and the counts never lie.** The secretary seeing refusals on Show Desk is filed for after launch (MYK9-2017).
7. **The class list tells her when she is finished**, and whether it is safe to leave.

## Design

### A score that can be saved is a valid score (MYK9-2004, MYK9-2005)

- Save stays off for a Qualified until every area has a time above zero and at or under its limit. A line under the time says why: "Add a time to save a Qualified", or "3:40 is over the 3:00 limit. Fix the time, or choose NQ."
- When the timer runs out the sheet sets NQ "Max Time", as today. Tapping Qualified then saves a Q at max time.
- **Use max time** sits beside the typed time, so a timer malfunction is one tap. A re-run is Reset.
- NQ, Absent, Excused and DQ never need a time.
- A Qualified over the UKC or ASCA fault limit cannot be saved. The sentence names the limit. The counter still counts, and the judge changes the result.
- The server refuses the same things, so paper scoring and an older device cannot save them either. Placements never rank a zero time.

### Reasons (MYK9-2008)

- "Incorrect Call" stays chosen in advance.
- A reason already set, by the timer or the judge, is never replaced unless she taps another.
- The read-back shows the reason in large type.
- UKC and ASCA get their own Excused reasons from their rulebooks.

### One dog, seven taps (MYK9-2012)

The dog, Start, Stop, the result, Save, Confirm & Submit. Then she is on the entry list again, with:

> Saved: 100 Willow · Qualified · 0:04.35 · **Correct**

Offline it adds "on this device, not sent yet". The line stays until she opens another dog.

- The read-back before saving is unchanged. It is protected by `// INTENT:`, because the judge copies it onto paper.
- **One `// INTENT:` note changes, with the owner's approval:** `quickAdvancePanel.tsx:6`, "NOTHING here auto-advances." The new note says the app returns to the list after a confirmed save and never chooses or suggests the next dog.
- The next-dog suggestions are deleted.
- **Correct** reopens the sheet with exactly what was saved, on every sheet (MYK9-2006).

### A score is never held or thrown away by something else (MYK9-2010)

- A check-in change and a score are different facts about a dog. The app keeps both, and the judge sees nothing.
- No button anywhere discards a score without naming the dog and the score.
- Two devices scoring the same dog differently still asks. The question names the dog and shows both scores.
- A dog pulled or withdrawn while the judge was scoring keeps its score. The secretary sees it flagged on Show Desk, on that dog's existing row: "Scored after being pulled", with the score and the two actions she already has, keep the pull or put the dog back.

### Scores not sent (MYK9-2011)

- The header and each class card count every score that has not reached the server, waiting or refused. "All sent" appears only at zero. The count is in scores: one dog reads "1 score not sent yet".
- Tapping the count opens one list. Each row names the dog and armband, the class, the score itself, and why in plain words.
- Temporary failures keep retrying and never show as refused.
- Because each row shows the score, the secretary can key it at the desk from the judge's phone. That is what makes it as safe as paper.
- Removing a row needs a confirmation naming the dog and the score.

This list is also the safety net for findings 8 and 12 while they are fixed.

### The end of her day (MYK9-2013)

A card at the top of her class list, with no new page:

> All 8 classes done. Every score is sent.

or

> 2 scores not sent. Keep this phone on and connected.

Signing out with anything unsent always warns, for an account and for a passcode.

## Does this duplicate an existing surface?

No. "Scores not sent" replaces the toasts as the place refused scores live; it does not sit beside a second list. The saved line and the end-of-day card are on the existing entry list and class list. The Saved screen and the next-dog suggestions are deleted.

## Open, not decided

- **MYK9-2015:** whether a score the first judge entered before a judge change is accepted, or refused visibly.
- **MYK9-2016:** whether the UKC element time must be kept.
- **Finding a dog by armband.** The entry list is laid out as "Up next" and "Then", which assumes running order. The taps to find a dog by armband were not counted. MYK9-2012 counts them and proposes a change if it is more than two.
- **Hides found are not recorded** on any scent sheet. Not discussed.
- **Ties.** Placements have a coin-flip order and no run-off. Not discussed.
- **The ring or area number** is not on a class row. Not discussed.
- **`docs/journeys/judge.md` does not exist**, and `docs/roles/judge.md` still says the judge is not a primary role for fall.

## Phases

**Phase 0: reproduce and confirm.** Before any fix:

- Reproduce each finding marked Read, on a throwaway show, and record the result on its issue.
- Confirm against each registry's current rulebook: fault limits, that a time over the limit never qualifies, the max-time cases the owner described, and the NQ and Excused reasons.
- Survey existing rows: qualified with time 0, and qualified over the limit.
- Count the taps to find a dog by armband.
- Find out whether a class completes by itself when its last dog is scored.

**Phase 1: nothing is lost.** MYK9-2009 (new code), MYK9-2011 (Scores not sent), MYK9-2010 (check-in collision), MYK9-2014 (reload offline).

**Phase 2: nothing is wrong.** MYK9-2004 (scoresheet rules), then MYK9-2005 (server, with its migration, own branch), MYK9-2006 (corrections), MYK9-2007 (timer), MYK9-2008 (reasons), MYK9-2016 (UKC and Nationals).

**Phase 3: less work than paper.** MYK9-2012 (after Save), MYK9-2013 (end of day), MYK9-2018 (small things).

**Phase 4: guides and walks.** The judge's guide describes the seven taps, Use max time, Scores not sent and the end-of-day card. `docs/qa/walks/show-day-walk.md` gains the new checks and loses the stale line about opening a sheet.

**Phase 5: testing.**

- Each issue's own tests, written red first for the value-sensitive ones.
- A Qualified with no time, over the limit, and at exactly the limit, on every sheet and through the server.
- Save, reopen and correct one field, on every sheet, with no signal.
- Queue scores, rotate the judge's code, re-enter it: every score arrives.
- A steward changes a dog's check-in while its score is queued: the score arrives and nobody is asked.
- A refused score is counted, listed by dog, and "All sent" never shows.
- A reload with no signal keeps "Your ring" and the counts.
- A clock change and a reload mid-run.
- The whole suite once with `pnpm vitest run --sequence.shuffle`.
- **A rehearsal on a real phone** at a venue-like signal: a full class scored with the signal switched off and on, a correction, a new code mid-class, and the end-of-day card. The owner or a working judge does this one.
- One judge who scores on paper today is asked to score a mock class and say where it is slower than her clipboard.

## Connections

- MYK9-1505: keep the good parts of v3.
- MYK9-1950, MYK9-1951: per-judge passcodes and the New code button.
- MYK9-1991: remove the "Time" and "Resume" pills on entry cards.
- MYK9-1806: Nationals placement chip stores the score as unscored.
- MYK9-1943, `docs/plan-one-home-per-class.md`: paper-scored classes.
- `docs/plan-print-packets.md`: the judge's record and initials, at the desk.
- `docs/audits/2026-07-08-replication-offline-scoring.md`: five earlier ways a score could be lost.
- `docs/lessons/README.md`, `offline-identity-pairing`.

## Non-goals

- Choosing or suggesting the next dog.
- Skipping or shortening the read-back before saving.
- The judge's initials, the judge's record, or anything else that stays at the desk.
- A secretary's view of refused scores before launch (MYK9-2017).
- New judge features: schedule-change notices, history across clubs, managing assignments.
