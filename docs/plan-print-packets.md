# Print packets: paperwork by trial, by judge, on paper and as PDF

> **Status:** Active

Linear: MYK9-1924. Agreed with the owner in a design conversation on 2026-11-13. No code has been written.

## Why

On Show Desk, "Print paperwork" works one class at a time. A secretary almost always prints for a whole trial at once, hands each judge a stack, and reprints a single class only when something changes. After the show the judge must check and initial every page of the results catalog, and both the judge and the club must keep records for a year. Today each of those is several trips through Reports.

Three facts from the code make this cheaper than it sounds:

- Check-in sheets and scoresheets already accept trial or class scope; armband labels accept show, trial or class (`apps/myk9show/src/lib/reports/reportRegistry.ts`).
- Every report is already tagged with a phase (before, during, after) and, where it applies, a registry (`apps/myk9show/src/lib/reports/types.ts`).
- The Emergency trial packet already renders a trial day's paperwork to PDF in the browser or on the server, stores it, emails a link to the show's managers, and reminds them to print (`apps/myk9show/src/features/emergency-trial-packet/`, `supabase/functions/_shared/trialPacket/`).

## The owner's rule for the whole design

**Smart defaults, never a restriction.** The panel opens already filled in for where it was opened and what state things are in. Every choice in it can be changed. Nothing blocks: a warning is a note beside a working Print button. The app cannot anticipate every situation, so the secretary always has the last word.

## Does this duplicate an existing surface?

No, provided it is built as one thing:

- The existing class print panel (`ClassPrintPanel`) grows into the packet panel. It is not joined by a second panel.
- The Emergency trial packet stops being a separate tool and becomes the saved PDF output of the same packet (owner decision: merge).
- Reports stays the library. A packet is a shortcut into it, opened with reports already ticked. The Reports tab opens the same builder with nothing ticked.

If any of those three turns into a parallel implementation, stop and restructure.

## The packets

| Packet            | Unit           | Starts with                                                                      | Collated                                   | Outputs             |
| ----------------- | -------------- | -------------------------------------------------------------------------------- | ------------------------------------------ | ------------------- |
| Before the trial  | Trial          | Cover sheet, check-in sheets, scoresheets                                        | One packet per judge                       | Print, PDF          |
| Armband labels    | Day            | One label per dog entered that day                                               | By dog                                     | Print               |
| During, per class | Class          | Preliminary results, result labels                                               | By class                                   | Print               |
| Judge review      | Judge          | The results pages for that judge's classes                                       | One per judge, in judging order            | Print, for initials |
| Judge's record    | Judge, per day | The marked catalog pages for that judge's classes, and their scores as submitted | One per judge per day, a section per trial | Print, PDF, email   |
| After the show    | Trial          | Marked catalog, High in Trial, the registry's own forms                          | Registry; club                             | Print, PDF          |

Why these units (owner, 2026-11-13):

- **Sheets go by trial**, not by day or show, because move-ups happen between trials. A dog that finishes Novice in Trial 1 often runs Advanced in Trial 2 or the next day, so a later trial's sheets printed early are wrong.
- **Armband labels go by day.** They are stickers on a shirt. They do not last and do not come back on day two.
- **Scoresheets are handed to the judge.** Check-in sheets are for the gate steward but travel in the judge's packet.

Registry forms are added by the report's own `registryId`, so an AKC trial is never offered a UKC form.

### The judge packet (before the trial)

Per judge, per trial:

1. A cover sheet: judge, show, trial and date, the classes in schedule order, the number of dogs in each.
2. For each class: its check-in sheet, then its scoresheets in run order.

### The judge review packet

The registry requires the judge to compare the catalog with their scoresheets and initial every page. That stays on paper. What changes is how much the judge has to hunt:

- Only that judge's classes, in the order they judged them.
- A cover that says what to do: "Pat Donovan · 4 classes · 6 pages to initial", with an initials box on every page.
- Any score the secretary corrected after the judge submitted it is marked, from the score history, so the judge checks those lines against paper.
- Offered when a judge's last class completes: "Pat Donovan's classes are done. Print results for initials."
- Results shows progress per judge ("2 of 3 judges initialled"), extending the existing "Needs judge's initials" state.

### The judge's record and the show record

- **The judge's record**, offered as soon as that judge's last class of the day is initialled, so they have it before leaving the site: a cover sheet, the marked catalog pages for their classes, and their scores as submitted at ringside. It carries a line saying it is a convenience copy and the signed paper is the official record.
- **The secretary's show record**: one PDF with the full marked catalog, High in Trial, the registry forms, and the entry and transfer forms the club must keep.

Sending rules:

- A judge's record goes only to the judge assigned to those classes, at the email on file. Nobody types a recipient: the delivery function already refuses caller-supplied recipients and resolves them from show roles, and that stays.
- The secretary presses send, after seeing who will receive it. Nothing sends by itself.
- A judge with no email on file gets a PDF the secretary downloads and passes on. Some judges will not have one.
- Nothing is emailed to a judge before they judge.
- The email names the date its link stops working and says to save the file. The secretary can send it again later.
- On a UKC trial, the same moment shows: "UKC: give the judge a copy of the signed judge's book before they leave."

## The panel

One panel, opened from wherever the secretary is.

| Opened from                                  | Scope it starts on   | Starts with                     |
| -------------------------------------------- | -------------------- | ------------------------------- |
| A trial card's menu                          | That trial           | The before-trial packet         |
| A day on the schedule                        | That day             | Armband labels                  |
| A class card                                 | That class           | Whatever that class still needs |
| The "Ready for show day" row                 | The first day        | Everything not yet printed      |
| A dog's row                                  | That dog             | That dog's armband label        |
| Results, when a judge is done                | That judge           | The judge review packet         |
| Results, when a judge has initialled         | That judge, that day | The judge's record              |
| The next trial's card, when a trial finishes | That trial           | The before-trial packet         |
| Results close-out                            | That trial           | The after-show packet           |
| Reports                                      | The show             | Nothing ticked                  |

What she can change inside it:

- **Which classes:** this class, this trial, this day, the whole show, or a set she ticks.
- **Which reports:** any combination.
- **How they are collated:** by judge or by class.
- **Which dogs:** everyone, or only what changed since the last print.
- **Output:** print, save as PDF, or, for the judge's record, email.

One line above the button says what she is about to get, for example "3 judge packets · 42 sheets".

### Layout (owner approved the mock-up, 2026-11-13)

The mock-up is linked from MYK9-1924. Top to bottom, the panel is:

1. **The defaults as one sentence, not a form:** "For **Trial 1 · Mon, Dec 7**, collated **by judge**, for **every dog**." Each bold part is a choice. If the sentence is right, she presses Print. This is how the panel stays simple while everything stays changeable.
2. **Notes**, when there are any. They never block.
3. **What to include:** the packet's own reports, ticked. Every other report sits under "More reports".
4. **What you will get:** the packets with sheet counts, before she prints. One per judge; a class with no judge gets a "No judge assigned" packet of its own; after the show, one set per recipient.
5. **The total, then Print and Save as PDF.** For a judge's record, "Email the judge their record" is a third button, and it shows who receives it before anything is sent.

Scope choices in the sentence: one class, a trial, a day, one judge's classes, the whole show, or classes she ticks.

The only disabled state is having nothing to print. "Only what changed" with no changes says so and offers "Print every dog instead".

### The preview (owner approved the mock-up, 2026-11-13)

The preview is the panel's second step. Its mock-up is also linked from MYK9-1924.

- **"Change what's included"** goes back with every choice kept.
- **A rail of packets** on the left, each with its sheet count. Picking one shows its pages in the order they print.
- **Buttons:** "Print all N packets" (primary), "Print <judge>'s only", and "Save as PDF".
- **After printing:** one line, for example "All 4 classes marked as printed with Trial 1", with Undo. This keeps what `ClassPrintPanel` does today: the record is written when the print dialog closes, and nobody is asked "did it print?". Save as PDF marks nothing as printed.

### The judge's cover sheet (new page)

- Judge, show, trial and date, registry.
- A table of the judge's classes in schedule order: start time, number of dogs, max time, and a total.
- What is in the packet and in what order: the check-in sheet ("Hand it to your gate steward"), then one scoresheet per dog in run order.
- A line saying scores entered at the ring are the working copy and these sheets are the paper record.
- On every page of a packet, a footer with the judge's name, when it was printed with "Later changes are in the app", and "Page n of N".

### The results page a judge initials (new page)

- One page per class: armband, dog, handler, result with any NQ reason, time, faults.
- A score changed after the judge submitted it is highlighted, with a line beneath: "Changed after you submitted: time was 0:38.50, corrected by the secretary at 10:42 AM".
- At the bottom: "I have compared this page with my scoresheets. Initials ___ Date ___".
- Its cover says how many pages to initial, lists the classes with a tick box each, and cites AKC Chapter 4 §17.

The existing Check-in Sheet and Score Sheet are not redesigned.

Assumed in the mock-up and confirmed by the owner on 2026-11-13:

- Armband labels keep today's contents and sheet sizes: armband, call name, breed, handler and the day, on the label stock chosen in Reports (`ArmbandLabelCell.tsx`, `labelTemplates.ts`; the default is Avery #18262, 14 per sheet). The preview mock-up drew ten per sheet before the real templates were read; the real ones are what to build.
- Max time belongs on the cover sheet.
- The certification page a judge signs is the existing "AKC Trial Secretary Certification" report.

### One dog's armband label (owner approved the mock-up, 2026-11-13)

For a lost label or a late entry. The mock-up is linked from MYK9-1924.

- A new row, "Print armband label", in the per-dog menu on Show Desk's entries table, beside Change class, Edit entry and Mark absent.
- The panel opens on that dog: "For **Juni #102**, for **Monday, Dec 7**." A note says when the label was last printed. The scope can still be widened to the class or the day.
- The label is shown as it will print. Its contents and the sheet sizes are today's (`ArmbandLabelCell.tsx`, `labelTemplates.ts`; the default is Avery #18262, 14 per sheet).
- **Where on the sheet:** a picture of the label sheet. She taps the first unused label, and used ones are greyed. This sets the existing "Labels to skip on first page" value without typing or counting.

### The night-before checklist line (owner approved the mock-up, 2026-11-13)

"Ready for show day" already has the line "Check-in sheets and score sheets printed" (`readyForShowDay.ts`). It is renamed "First trial's paperwork printed" and measures the first trial's sheets and the first day's labels (decision 7). Today a failing line counts the sheets and links to the Show Desk schedule, where they print one class at a time. It becomes a door into the panel:

| State                  | The line's detail                                                                     | Its link                                                   |
| ---------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Not printed            | "Trial 1 on Monday: 2 judge packets and 14 armband labels to print."                  | "Print for Monday": everything the first day still needs   |
| Changed since printing | "2 dogs were added to Interior Advanced after Monday's paperwork was printed."        | "Print what changed": only the affected classes and labels |
| Printed                | "Trial 1 printed Sunday at 6:15 PM. Trials 2 and 3 print on Tuesday, after move-ups." | None                                                       |
| Can't check            | "Can't check right now"                                                               | None; it does not guess                                    |

When every line passes, the list still collapses to "Everything is handled."

Every entry point in the table above is now mocked.

Defaults that read the current state:

- **Already printed, nothing changed:** opens on "only what changed", which is empty, and says so. A full reprint is one tap away.
- **Already printed, entries changed:** opens on "only what changed", naming the classes affected.
- **A later trial while an earlier one is unfinished:** a note, "Trial 1 isn't finished. Move-ups may change these sheets", with Print still available.
- **Labels after late entries:** "labels added since the last print". A lost label is reprinted from the dog's row.

## What the rulebooks require

Read 2026-11-13 from `docs/rulebooks/`. These decide what the after-show packets must contain.

| Registry | Rule                                                                                                                                                      | Consequence                                                                                  |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| AKC      | Ch. 4 §17: after the trial the judge "must examine and initial each page of the catalog" and sign a certification page.                                   | The judge review packet. Paper, with initials.                                               |
| AKC      | Ch. 4 §18: judges retain score sheets and a copy of the marked catalog for one year, "in hard-copy or electronic format".                                 | A PDF of the judge's record is expressly allowed.                                            |
| AKC      | Ch. 3 §37: the club "shall provide the judge(s) with a marked catalog", and keeps a marked catalog, entry forms and transfer forms for at least one year. | Emailing the judge's record meets a duty the club has. The show record meets the club's own. |
| AKC      | Ch. 6 §§8–10: High in Trial and High Combined Division.                                                                                                   | Both are already built, in one report (`highInTrial.ts`, `highCombinedDivision.ts`).         |
| AKC      | Ch. 3 §37, continued: "The judge must be provided their copy of the marked catalog prior to leaving the trial site."                                      | The judge's record is offered when that judge is done, per day, not after the show.          |
| UKC      | The secretary must give the judge one copy of the signed judge's book before the judge leaves the grounds; the judge keeps their books for one year.      | The paper copy is still owed on the day. A PDF is extra.                                     |
| ASCA     | §1.10: High in Trial is optional, one winner per level, and a team entered in more than one level is ineligible.                                          | No ASCA High in Trial report exists. Filed as MYK9-1925.                                     |
| ASCA     | No retention rule was found by keyword search.                                                                                                            | Read the ASCA rules properly before building its after-show packet.                          |

Not checked: UKC Chapter 13 (placements, awards and ribbons).

## What has to be built

Existing and reused: the reports themselves, trial and class scope, the PDF renderer, packet storage and link delivery, per-class print records, the "Needs judge's initials" state.

New:

- Collation by judge, and the cover sheets.
- A day scope for armband labels. A day is a set of trials; a dog in two trials that day gets one label. Whether the label report already removes such duplicates is unverified.
- "Changed since printing": comparing a class's print record with later entry changes, and showing it on the class card.
- The corrected-after-submission mark on the judge review packet, from the score history.
- Delivery to a judge. Today recipients are the show's managers.
- The panel's scope, report and collation controls.
- Entry points on the trial card menu, the day header, a dog's row and Results.

## Phases

One pull request per phase. A phase is not done until its tests pass.

### Phase 0: mock-up and open questions

- Done 2026-11-13: the panel is mocked up in seven states and the owner approved the sentence layout (see "Layout"). The preview, the judge's cover sheet and the initials page were mocked and approved the same day (see "The preview"). One dog's label and the checklist line followed, also approved.
- Done 2026-11-13: the seven open questions are answered (see "Decisions on the open questions"). The three mock-up assumptions (label layout, max time on the cover sheet, the certification page) were confirmed the same day. Phase 0 is complete.
- **Tests:** none; the output is the mock-up and recorded decisions.

### Phase 1: the before-trial packet

- Trial scope in the panel, opened from the trial card's menu. Collation by judge. Cover sheets. Print and save as PDF.
- A trial print marks each class in it as printed.
- The "Ready for show day" row links to it.
- **Tests:** unit tests for the collation (classes grouped by judge, schedule order, run order within a class, a class with no judge) and the cover sheet's counts, on real report data and not a hand-made prop. The printed pages are compared with the single-class output for the same class. Print records are asserted per class after a trial print.

### Phase 2: the judge review packet and the after-show record

- Judge review packet, offered when a judge's classes complete, with per-judge progress on Results.
- After-show packet opened from Results close-out, with registry forms chosen by `registryId`.
- The judge's record, one per judge per day, offered when that judge's last class of the day is initialled: print, PDF and email, with the download path for a judge with no email. The UKC reminder at the same moment.
- The secretary's show record as a PDF.
- **Phase 2a (built, MYK9-1924):** the judge review packet, the after-show packet and the show record's PDF half. Left for the next PR because it adds an edge function and email: the judge's record (print, PDF, email, the UKC reminder) and its recipient-resolution tests.
- **Tests:** recipient resolution (only the assigned judge; a caller-supplied recipient is still refused; a judge with no email yields a download and no send). The corrected-score mark against a known score history. A packet for one judge contains no other judge's classes. Edge function tests run under the node environment.

### Phase 3: staying correct after changes, and labels by day

- "Changed since printing" on the class card, and "only what changed" as a panel default.
- The note when printing a later trial early, and the note on the next trial's card when the trial before it finishes.
- The checklist line renamed "First trial's paperwork printed", measuring the first trial's sheets and the first day's labels.
- Day scope for armband labels, "labels added since the last print", and one dog's label from its row.
- **Tests:** a move-up, a late entry and a pull each flip the right classes to changed, and only those. One label per dog per day across two trials.

### Phase 4: fold in the Emergency trial packet

- The saved PDF of the before-trial packet replaces the separate Emergency trial packet tool. Its automatic generation, storage, reminder and "This show uses…" switch move with it.
- Delete the old tool's own panel once nothing reaches it.
- **Tests:** the scheduled generation still produces and delivers a packet; the reminder still fires; the existing packet tests pass against the merged path.

### Phase 5: close out

- A browser walk of each entry point at desktop and tablet width, with the evidence on the issue. Add the packet flow to the secretary walk.
- Flip this plan to `Complete`, move it to `docs/archive/`, drop its row from `docs/README.md`.

Launch priority is show-day reliability. If time is short, Phase 1 alone delivers the everyday need.

## Decisions on the open questions (owner, 2026-11-13)

All seven are settled. Where one changes an earlier section, that section has been updated to match.

1. **The judge's record is offered when that judge is done, not after the show.** AKC Ch. 3 §37: "The judge must be provided their copy of the marked catalog prior to leaving the trial site." UKC says the same of its judge's book. No rulebook restricts what a judge may be sent. Whether an emailed PDF counts as "provided" under §37 is not stated, so printing a copy on the day is the safe reading, with the PDF as well.
2. **ASCA gets the same packets, with no rule cited.** ASCA requires the judge to verify and sign the paperwork (§1.6.2, §1.6.3) and gives no retention period. Its pages make no claim about what ASCA requires.
3. **UKC gets a reminder plus the judge's record.** UKC's judge's book is a blank registry form, filled and signed on paper, so the app cannot produce the signed copy. When a UKC judge is done, the app says: "UKC: give the judge a copy of the signed judge's book before they leave." Filling the judge's book from the scores, and attaching a scan of the signed book, are not part of this plan.
4. **One judge's record per day**, for each day the judge works, with each trial as its own section starting on a new page.
5. **Links keep their 30-day limit.** A packet link lasts until 30 days after the show ends (never under 7 days or over 60; `_shared/trialPacket/delivery.ts`). The email names the date the link stops working and says to save the file, the PDF's cover says "Keep this file for one year", and the secretary can send it again, which makes a fresh link. No year-long links and no attachments.
6. **A note on the next trial's card prompts the next print.** When a trial's last class completes, the next trial's card reads "Trial 1 is finished. Trial 2's paperwork is ready to print", with a link into the panel. If the next trial is on a new day, it names that day's armband labels too. This covers the next day and a later trial on the same day.
7. **The checklist line is renamed "First trial's paperwork printed"**, and it measures the first trial's sheets and the first day's labels. Today `rollUpFirstDayPaperwork` counts every class on the first day, so this is a change in what it measures as well as its name.

## Non-goals

- No saved print presets or user-defined templates. The defaults do that job.
- No new page.
- No change to what any registry receives, and no digital replacement for initialled pages.
- No automatic sending.
