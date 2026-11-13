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

| Packet            | Unit  | Starts with                                             | Collated                        | Outputs                     |
| ----------------- | ----- | ------------------------------------------------------- | ------------------------------- | --------------------------- |
| Before the trial  | Trial | Cover sheet, check-in sheets, scoresheets               | One packet per judge            | Print, PDF                  |
| Armband labels    | Day   | One label per dog entered that day                      | By dog                          | Print                       |
| During, per class | Class | Preliminary results, result labels                      | By class                        | Print                       |
| Judge review      | Judge | The results pages for that judge's classes              | One per judge, in judging order | Print, for initials         |
| After the show    | Trial | Marked catalog, High in Trial, the registry's own forms | Judge's record; registry; club  | Print, PDF, email to judges |

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

### The after-show record

- **The judge's record**, emailed to each judge once results are final: a cover sheet, the marked catalog pages for their classes, and their scores as submitted at ringside. It carries a line saying it is a convenience copy and the signed paper is the official record.
- **The secretary's show record**: one PDF with the full marked catalog, High in Trial, the registry forms, and the entry and transfer forms the club must keep.

Sending rules:

- A judge's record goes only to the judge assigned to those classes, at the email on file. Nobody types a recipient: the delivery function already refuses caller-supplied recipients and resolves them from show roles, and that stays.
- The secretary presses send, after seeing who will receive it. Nothing sends by itself.
- A judge with no email on file gets a PDF the secretary downloads and passes on. Some judges will not have one.
- Nothing is emailed to a judge before they judge.

## The panel

One panel, opened from wherever the secretary is.

| Opened from                   | Scope it starts on | Starts with                     |
| ----------------------------- | ------------------ | ------------------------------- |
| A trial card's menu           | That trial         | The before-trial packet         |
| A day on the schedule         | That day           | Armband labels                  |
| A class card                  | That class         | Whatever that class still needs |
| The "Ready for show day" row  | The first day      | Everything not yet printed      |
| A dog's row                   | That dog           | That dog's armband label        |
| Results, when a judge is done | That judge         | The judge review packet         |
| Results close-out             | That trial         | The after-show packet           |
| Reports                       | The show           | Nothing ticked                  |

What she can change inside it:

- **Which classes:** this class, this trial, this day, the whole show, or a set she ticks.
- **Which reports:** any combination.
- **How they are collated:** by judge or by class.
- **Which dogs:** everyone, or only what changed since the last print.
- **Output:** print, save as PDF, or, for the judge's record, email.

One line above the button says what she is about to get, for example "3 judge packets · 42 sheets".

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

- Mock up the panel in its main states before any code. The risk to settle is whether one flexible panel stays simple enough for a first-time secretary: four choices are fine only if three are already right and visually quiet.
- Answer the open questions below.
- **Tests:** none; the output is the mock-up and recorded decisions.

### Phase 1: the before-trial packet

- Trial scope in the panel, opened from the trial card's menu. Collation by judge. Cover sheets. Print and save as PDF.
- A trial print marks each class in it as printed.
- The "Ready for show day" row links to it.
- **Tests:** unit tests for the collation (classes grouped by judge, schedule order, run order within a class, a class with no judge) and the cover sheet's counts, on real report data and not a hand-made prop. The printed pages are compared with the single-class output for the same class. Print records are asserted per class after a trial print.

### Phase 2: the judge review packet and the after-show record

- Judge review packet, offered when a judge's classes complete, with per-judge progress on Results.
- After-show packet opened from Results close-out, with registry forms chosen by `registryId`.
- The judge's record by email, the secretary's show record as a PDF, and the download path for a judge with no email.
- **Tests:** recipient resolution (only the assigned judge; a caller-supplied recipient is still refused; a judge with no email yields a download and no send). The corrected-score mark against a known score history. A packet for one judge contains no other judge's classes. Edge function tests run under the node environment.

### Phase 3: staying correct after changes, and labels by day

- "Changed since printing" on the class card, and "only what changed" as a panel default.
- The note when printing a later trial early.
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

## Open questions

1. Does any registry restrict what a judge may be sent? Nothing is sent before judging under this plan, so this matters only for the after-show record.
2. What does ASCA require a judge and a club to keep, and for how long?
3. Is UKC's signed judge's book copy produced from the existing UKC Judges Book reports, or does it need its own step in the after-show packet?
4. Should the judge's record be one PDF per trial or one per show?
5. How long do stored packet links stay valid, and is that long enough for a judge's one-year retention? If not, the email must say to save the file.

## Non-goals

- No saved print presets or user-defined templates. The defaults do that job.
- No new page.
- No change to what any registry receives, and no digital replacement for initialled pages.
- No automatic sending.
