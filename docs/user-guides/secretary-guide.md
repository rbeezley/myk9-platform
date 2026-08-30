# Secretary Guide

**Status:** `qa-draft`
**Audience:** Trial secretaries
**Last verified:** 2026-08-30 — every card below was walked in a browser against staging
**Verified by:** the secretary task walk (`docs/audits/2026-08-28-secretary-task-walk.md`) and its 2026-08-29 verification pass

> **Screenshots are pending.** The previous guide embedded shots captured 2026-06-25,
> before the workbench was collapsed into Show Desk. They show screens that no longer
> exist, so they have been removed rather than left to mislead. The `S-*` files are
> still in `docs/screenshots/` and need recapturing against the current UI before this
> guide moves off `qa-draft`.

> **How this guide is organised.** One card per job, in the order you'll do them. Each card tells you where to go, what to do, and what to watch for. If you only need one thing, jump to its card — they don't depend on each other.

---

## Before you start

**Sign in** at the show's URL and you land on your Secretary Dashboard. It lists the shows you manage with entry counts and anything needing attention.

Two words appear throughout the app and are worth knowing up front:

- **Entry Management** — everything to do with entries: who's in, who's paid, who's waiting, who pulled out.
- **Show Desk** — everything to do with running the show: classes, run order, check-in, volunteers, closeout. Open a show and choose **Show Desk**.

Most day-of jobs live behind **Show Desk → Tools**.

---

# Setting up

## 1 · Create a show, its trials, and its classes

The wizard creates all three in one pass. **Dashboard → Create Show.**

1. **Step 1 — Show Details.** Name, organization (AKC/UKC/ASCA), dates, location, host club, entry fee, and the entry open/close dates. Add your **chairman** and **secretary**.
2. **⚠️ Also on Step 1: add every judge** in the _Show Judges_ field. It looks optional. It is not — see the warning below.
3. **Step 2 — Trials.** One row per trial: date, time, and (for AKC) the event number.
4. **Step 3 — Classes.** Pick a template, then tick the classes each trial offers. Assign a judge per class.
5. **Step 4 — Review.** Check the summary, then **Create Show (Unpublished)** or **Create & Publish Show**.

> **⚠️ Add your judges on Step 1.** If you skip the _Show Judges_ field, Step 3 gives you **no way to assign a judge at all** — and Review will still say "Show Configuration Complete" and offer to publish. Add the judges first, and you can assign them per class normally.

> **Entries closing on the show's first day is allowed** — normal for day-of entry.

## 2 · Edit a show, or reassign a judge

- **Show details:** open the show → **More show actions → Edit**.
- **Add a judge to the show:** same place, **Judges** tab.
- **Change a class's judge:** **Manage Classes**, then the judge dropdown on that class's row.

> A class's judge dropdown only offers judges already attached to the show. If the one you want isn't listed, add them on the Judges tab first, then come back.

---

# Taking entries

## 3 · Approve or accept online entries

**Entry Management → Needs review.** Each registration shows the dog, the entry count, and payment status. Choose **Review registration** to accept, decline, or ask for a correction.

The chips across the top are queues — _Needs review_, _Missing information_, _Payment due_, _All registrations_. The active one is highlighted; the counts beside each tell you what's waiting.

## 4 · Enter a mail-in or paper entry

**Entry Management → Add mail-in entry.** Pick the dog and handler (or create them), choose classes, and record payment.

> This works **after entries close** — you're the trial secretary, so the deadline doesn't block you.

> **A dog needs a registration number** for the trial's registry before it can be entered. This is enforced: an entry without one is refused rather than accepted and fixed later.

## 5 · Take a late or walk-in entry on show day

**Show Desk → Tools → Late entry.** Same flow as a mail-in entry.

## 6 · Manage the wait list

**Entry Management → Exceptions → Waitlist.** Shows each judge-day's capacity — the judge's name, the date, and how full it is — with **View Wait List** per judge-day.

> Capacity is displayed, not enforced. A judge-day can read over its limit (e.g. "130 / 125 entries"); the number is telling you the truth, not warning you of a bug.

## 7 · Handle scratches, pulls, and no-shows

**Entry Management → Exceptions → Pulls / scratches.** Pending and pulled queues in one place, with the refund decision recorded against each.

## 8 · Payments and refunds

Payment status shows on every registration row in **Entry Management**, and refunds are reconciled in the **Pulls / scratches** queue.

> **Known limitation:** every paid entry currently reads **"Paid online"**, including cheques and cash. The amount and the refund state are correct — only the channel label is wrong.

---

# Getting ready for show day

## 9 · Set the run order

**Show Desk → click the class → Run order.**

Choose **Armband ↑**, **Armband ↓**, or **Random**. The order applies immediately and appears on check-in sheets and at ringside.

> You can also reach this from a class's page — **Set run order** takes you straight to that class on Show Desk.

> **Known limitation:** there's no drag-and-drop yet, so you can't hand-place one dog into a specific slot. The three presets above are all that's available.

## 10 · Print check-in sheets

**Reports → Check-in Sheet.** Scope it to a trial or a single class, then print. Columns are Gate Order, Armband, Call Name, Breed, and Handler.

## 11 · Print scoresheets

**Reports → Scoresheet.** One page per dog, with the registry's own fault and scoring layout.

## 12 · Ringside access codes

**Show Desk → Tools → access codes.** Separate codes for Admin, Judge, Steward, and Exhibitor. Copy a code, copy a share link, print a slip, or regenerate if a code gets out.

## 13 · Volunteer scheduling

**Show Desk → Tools → Volunteers.** Add volunteers and assign them to per-class slots grouped by trial.

---

# Show day

## 14 · Move a dog up

**Show Desk → click the class → Entries → Move up** on that dog's row.

Choose the target class and give a reason. Targets are restricted to the same element at a strictly higher level, so you can't move a dog somewhere ineligible.

> The original entry stays on the books as _moved_ and keeps its fee; the new entry is created at no extra charge.

> An exhibitor can also _request_ a move-up before the show. Those arrive in **Entry Management → Exceptions → Move-ups** for you to approve, deny, or waitlist.

## 15 · Check dogs in

**Show Desk → click the class → Enter paper scores** shows the run sheet, with a check-in control on every dog's row.

## 16 · Enter results from paper scoresheets

Same run sheet: **Show Desk → click the class → Enter paper scores.**

Per dog, record Q / NQ / ABS / EX, the search time, and any faults. Search time is digit-masked — type `4520` for 45.20 seconds.

> Placements are calculated for you once every dog in the class is scored. You don't enter them.

## 17 · Print preliminary results

**Reports → Preliminary Results.** Element, level, trial, date, and judge, with each dog's result and placement.

---

# After the show

## 18 · Registry reports

**Reports → Trial Secretary Report** and **AKC Judge's Report**. Both render the registry's own instructions and layout for submission.

## 19 · Close out the show

**Show Desk → Closeout.** Reconciles attendance and fees — entries, day-of entries, collected at the show, waived, and pulled or no-show — so the totals you submit match what you took.

## 20 · High in Trial

> **Not available yet.** There is no High in Trial report in the app. Calculate it by hand from your class results for now.
>
> For AKC Scent Work, High in Trial applies when a club runs more than one element at a difficulty level. A team qualifies if it entered _every_ element offered at that level and qualified in each; Handler Discrimination is excluded. Rank by fewest total faults, then fastest total time, then a coin flip.
>
> Per-class placements (1–4) _are_ calculated automatically — see card 16.

---

## Known gaps and rough edges

Honest list, so nothing surprises you mid-show.

| What                                     | Status                                                                                                                                         |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| High in Trial report                     | Not built — calculate by hand (card 20)                                                                                                        |
| Hand-placing a dog in the run order      | Not built — presets only (card 9)                                                                                                              |
| "Paid online" on cheque and cash entries | Label only; amounts are correct (card 8)                                                                                                       |
| Emailing exhibitors                      | Works, but the composer is in the **Message Center panel in the header**, not the Messages page, and it doesn't pick up the show you came from |
| Wait-list capacity                       | Displayed, not enforced (card 6)                                                                                                               |

---

## Still need help?

Full findings behind this guide, including anything fixed recently: `docs/audits/2026-08-28-secretary-task-walk.md`.
