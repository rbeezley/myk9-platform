# Secretary Guide

**Status:** `qa-draft`
**Audience:** Trial secretaries
**Last verified:** 2026-06-19
**Verified by:** walkthrough against outline (`docs/user-guides/secretary-guide-outline.md`)

> **Note:** This is a QA-draft guide — written against the live app as a testing instrument. Screenshots are placeholders until the shot list (`docs/training/screenshot-shot-list.md`) is captured. Do not publish to customers until status is `verified`.

---

## What this guide covers

This guide walks you through every phase of running a dog show on myK9Show: creating your show, managing entries, communicating with exhibitors, running show day, releasing results, and submitting to AKC.

If you are coming from a spreadsheet or from mySWT, the biggest change is that the wizard handles your show, trials, classes, and judge assignments all at once. You don't create them separately.

---

## Section 1 — Dashboard

When you sign in, you land on the Secretary Dashboard. It shows all your active shows with their entry counts, entry open and close dates, and a status badge for each.

**If you have exactly one active show,** myK9Show routes you directly to that show's workbench instead of the dashboard. Use the breadcrumb at the top left or the sidebar to navigate back to the dashboard if needed.

Click any show to open its workbench.

> *[Screenshot S-01: Secretary dashboard — one active Heritage show with entry count badge]*

---

## Section 2 — Create a Show

The wizard walks you through four steps: show details, trial configuration, class selection, and a review screen. It creates your show, trials, and classes in one pass — there's no separate step for each.

**Before you start,** have these ready:
- Show name, sanctioning organization (AKC, UKC, or Other)
- Start and end dates
- Entry fee per class
- Entry open and close dates
- Each trial's date, time, and AKC event number
- Judge assignments for each class

**Steps:**

1. From the Dashboard, click **Create Show**.

2. **Step 1 — Show Details.** Enter the show name, sanctioning organization, start and end dates, entry fee, and entry open and close dates. Click **Next**.

   > *[Screenshot S-02: Create Show wizard — Step 1 (show details)]*

3. **Step 2 — Trial Configuration.** Add each trial with its date/time and AKC event number. Click **Add Trial** for each additional trial. Click **Next**.

4. **Step 3 — Class Selection.** For each trial, choose which classes to offer and assign a judge to each class. Click **Next**.

   > *[Screenshot S-04: Create Show wizard — Step 3 (class selection with judge dropdowns)]*

5. **Step 4 — Review.** Scan the full structure. If anything looks wrong, click **Back** to correct it. When everything is correct, click **Create and Publish**.

6. Your show is now live and accepting entries. Exhibitors can find it on the Shows page immediately.

**What if I need to change something after publishing?**
Open the show from the Dashboard → click the **Setup** tab → click **Edit** next to the field you want to change.

---

## Section 3 — Show Setup and Configuration

After creating your show, you can edit any part of its structure from the **Setup** tab on the Show Workbench.

> *[Screenshot S-06: Show Workbench — Setup tab with readiness signals]*

**Edit show details:**
1. Click the **Setup** tab.
2. Click **Edit Show** (or the pencil icon next to the field you want to change).
3. Make your changes → click **Save**.

**Change a judge assignment:**
1. Click the **Setup** tab.
2. Find the class row → click the judge assignment → select a new judge from the dropdown.

**Add a trial after the fact:**
This is not available in the Setup tab after publication. If you need to add a trial, contact support — a data correction may be needed.

---

## Section 4 — Entry Management

Entry Management is where you act on pending entries, add mail-in entries, and manage your waitlist.

> *[Screenshot S-07: Entry Management — Pending tab with entry cards]*

### Approving an online entry

1. Open **Entry Management** from the sidebar or from the Show Workbench.
2. Click the **Pending** tab.
3. Find the entry. Click **Accept** → the entry moves to the Accepted tab. Payment is already recorded for online entries paid through the registration wizard.

**To approve many entries at once:** Check the box next to each entry → a sticky action bar appears at the bottom. Click **Approve selected**.

> *[Screenshot S-09: Entry Management — bulk select with sticky approve bar]*

> *[Screenshot S-08: Entry Management — three-dot menu open on a single entry card]*

### Rejecting an entry

1. In the **Pending** tab, open the three-dot menu on the entry.
2. Click **Reject** → the entry moves to Rejected and the exhibitor is notified.

### Adding a mail-in or walk-in entry

1. Click **Add Entry**.
2. Search for the exhibitor by name or email. If they're not in the system, click **Create Exhibitor** and enter their details.
3. Search for their dog. If the dog isn't in the system, click **Add Dog** and enter AKC registration number, breed, and name.
4. Select the class, enter the check number and amount paid.
5. Click **Save** → the entry appears as Accepted with payment recorded.

### Managing the waitlist

When a class is full, click **Waitlist** instead of Accept on a pending entry.

When a spot opens (someone scratches or is pulled):
1. Open **Waitlist Management** from the sidebar.
2. Find the next exhibitor in line → click **Offer Spot**.
3. The exhibitor is notified. If they don't confirm within the notice window, move to the next person.

> *[Screenshot S-10: Waitlist Management — blocked: needs a seeded waitlisted entry]*

---

## Section 5 — Communications

### Send an announcement to all accepted exhibitors

1. Open the **Message Center** (bell icon in the top bar, or **Messages** in the sidebar).
2. Click **New Message**.
3. Select your show from the dropdown.
4. Choose **All accepted exhibitors** as the recipient.
5. Write a subject and message body → click **Send**.

Exhibitors receive the announcement in their myK9Show inbox and as a push notification on their device.

> *[Screenshot S-11: Message Center — compose form with show selected]*

### Send a message to one exhibitor

**From Entry Management (fastest):**
1. Open the entry card → click **Message Exhibitor**.
2. A compose window opens with the exhibitor pre-selected.

**From the Message Center:**
1. Open the Message Center → click **New Message**.
2. Search for the exhibitor by name or email.

### What about email delivery?

Messages in myK9Show send push notifications. Email delivery to exhibitors who haven't installed the app is dependent on the Resend email integration being active for your show. If you're unsure whether exhibitors are receiving email, use the Message Center and follow up directly for time-sensitive communications.

---

## Section 6 — Reports (Pre-Show)

Run these reports before the show to prepare your rings, judges, and stewards.

> *[Screenshot S-12: Reports page — Check-in Sheet selected]*

1. Open **Reports** from the Show Workbench sidebar or from the Show Desk.
2. Select the trial from the dropdown.
3. Select a report type:

| Report | When to run | Who gets it |
|---|---|---|
| Check-in Sheet | Morning of show day | Ring steward / check-in table |
| Run Order | Before each class | Steward, posted at ring |
| Scoresheets | Before judges arrive | Each judge |
| Armband Labels | Before check-in opens | Print on Avery 18262 stock |

4. Print or download the report.

> *[Screenshot S-13: Reports page — Run Order preview]*
> *[Screenshot S-14: Reports page — Armband Labels]*

**Note on run order:** The run order shows dog names, handler names, and armband numbers. Volunteer names are not included — those are managed separately outside the app.

---

## Section 7 — Show Desk (Day-of Operations)

The Show Desk is your headquarters on show day. Check-in, scratches, move-ups, late entries, and announcements are all here.

> *[Screenshot S-15: Show Desk — Show Map with trial expanded and class rows]*

**Getting there:** From the Show Workbench, click the **Show Desk** tab. On a show running today, the Dashboard will route you here automatically.

### Check in an exhibitor

1. In the Show Map, find the exhibitor's class row → expand it.
2. Locate the exhibitor's entry by armband number or name.
3. Click **Check In** → the row updates to show checked-in status.

### Scratch / pull an exhibitor

1. Find the entry in the Show Map.
2. Open the three-dot menu on the entry row.
3. Click **Scratch** → a confirmation dialog appears.
4. Confirm → the entry is marked pulled and the class count updates.

> *[Screenshot S-16: Show Desk — scratch dialog open on entry row]*

### Process a move-up

A move-up promotes a qualifying dog to a higher-level class in the same element.

1. Find the entry in the Show Map.
2. Open the three-dot menu → click **Move Up**.
3. Select the destination class from the picker (only eligible classes are shown — same element, higher level, same trial).
4. Confirm → the entry appears in the new class and is removed from the original.

> *[Screenshot S-17: Show Desk — move-up dialog with target class picker — blocked: needs a move-up-requested entry in seed data]*

### Add a late entry (walk-in)

1. Open the **Tools** panel (button at the top right of the Show Desk).
2. Click **Late Entry**.
3. Find or create the exhibitor record.
4. Select their dog and the class → record the payment method and amount.
5. Click **Save** → the entry is added and the class count updates.

> *[Screenshot S-18: Show Desk — Late Entry dialog in Tools panel]*

### Enter scores from paper scoresheets

When judges are scoring on paper rather than using the ringside app:
1. From the Show Map, click the class row → **Enter Scores** (or click into the class directly from the results section).
2. For each dog in run order: select **Q**, **NQ**, or **Absent** → enter the time if the dog qualified → click **Save**.

### Tools panel

Open the Tools panel from the Show Desk for:
- **Quick Broadcast** — message all exhibitors in the show
- **Class Broadcast** — message exhibitors in one class
- **Show Access Codes** — generate or share the passcode for judge and steward ringside access
- **Incident Log** — record any show-day incidents
- **Tasks and Notes** — your personal show-day checklist

> *[Screenshot S-19: Show Desk — Tools panel side sheet with Quick Broadcast and Access Codes visible]*

---

## Section 8 — Results Control

After all classes are scored, use Results Control to verify results are complete and release them to exhibitors.

> *[Screenshot S-20: Results Control — all classes complete — blocked: needs a fully-scored show in seed data]*

1. From the Show Desk, scroll to the **Closeout** section.
2. Click **Results Control**.
3. Review each class: every entry must have a result (Q, NQ, or Absent). If any entry shows a blank result, go back to Show Desk and enter the missing score before proceeding.
4. When every class is complete, toggle **Release Results** to On.

Once released, exhibitors can see their Q/NQ result and placement in their My Shows view immediately.

> *[Screenshot S-21: Results Control — Release Results toggle in Off position — blocked: needs fully-scored show]*

**Can I un-release results?**
Yes — toggle Release Results back to Off. Results will no longer be visible to exhibitors. This is useful if a scoring correction is needed after an initial release.

---

## Section 9 — Submit Results to AKC

After results are released, generate the electronic submission file and email it to AKC.

1. From the Show Desk closeout section (or from **Reports**), click **Submit Results**.
2. The page shows a preflight summary: number of entries ready for submission and any warnings.
3. **If a warning appears about missing AKC registration numbers:** Contact those exhibitors to provide their dog's registration number before submitting. You can still download and submit without them, but AKC may return the file.

   > *[Screenshot S-24: Submit Results — preflight warning listing dogs without AKC registration numbers — blocked: needs dogs with null AKC numbers in seed data]*

4. Click **Download XML** to download the submission file.

   > *[Screenshot S-22: Submit Results — submission summary (preflight)]*
   > *[Screenshot S-23: Submit Results — XML download button]*

5. Email the file to `eresults@akc.org`. Include in your message:
   - Club name
   - Event dates
   - AKC event numbers (one per trial)

AKC processes the file and updates their records. You will receive a confirmation or error reply from AKC directly.

---

## Section 10 — Post-Show Reports

After the show closes, generate the official reports for judges, the club chairman, and your AKC submission packet.

1. Open **Reports** from the Show Desk closeout section or sidebar.
2. Select the trial.
3. Generate each report in order:

| Report | Recipient | When |
|---|---|---|
| Results Catalog | Club chairman, your records | After closeout |
| Judge Report | Each judge + AKC submission packet | One per trial |
| Trial Secretary Report | AKC submission packet | One per trial |
| Result Labels | Qualifying dogs' ribbons | One per show |

**Note on PDF submission:** The downloaded reports are formatted for printing. The AKC results file (Section 9) is the electronic submission — the Judge and Trial Secretary reports are paper supplements for your own records and the judge's copy.

---

## Section 11 — Closeout

> **Status: Not yet available** — The Close Out Show action (archiving all trials and classes) is not yet built as of this guide's verified date. This section will be completed when the feature ships.
>
> If you need to mark a show as complete or close it after the event, contact support.

---

## Still need help?

- [KB: create-a-show](#) — detailed step-by-step for wizard configuration
- [KB: approve-entries](#) — entry management quick reference
- [KB: handle-a-scratch](#) — scratch and pull procedures
- [KB: handle-move-up](#) — move-up eligibility and process
- [Show-day triage runbook](../support/show-day-triage-outline.md) — live show incident prioritization
- Support contact: [placeholder — email or contact page]

---

## Screenshot Checklist

All shots from `docs/training/screenshot-shot-list.md`. Status as of 2026-06-19:

| Shot ID | Section | Description | Status |
|---|---|---|---|
| S-01 | § 1 | Dashboard — one active show | ready |
| S-02 | § 2 | Wizard Step 1 (show details) | ready |
| S-04 | § 2 | Wizard Step 3 (class selection) | ready |
| S-06 | § 3 | Show Workbench — Setup tab | ready |
| S-07 | § 4 | Entry Management — Pending tab | ready |
| S-08 | § 4 | Three-dot menu on entry card | ready |
| S-09 | § 4 | Bulk select + approve bar | ready |
| S-10 | § 4 | Waitlist Management page | blocked: seed |
| S-11 | § 5 | Message Center — compose | ready |
| S-12 | § 6 | Reports — Check-in Sheet | ready |
| S-13 | § 6 | Reports — Run Order preview | ready |
| S-14 | § 6 | Reports — Armband Labels | ready |
| S-15 | § 7 | Show Desk — Show Map | ready |
| S-16 | § 7 | Scratch dialog | ready |
| S-17 | § 7 | Move-up dialog | blocked: seed |
| S-18 | § 7 | Late Entry dialog | ready |
| S-19 | § 7 | Tools panel | ready |
| S-20 | § 8 | Results Control — all classes complete | blocked: seed |
| S-21 | § 8 | Release Results toggle | blocked: seed |
| S-22 | § 9 | Submit Results — preflight summary | ready |
| S-23 | § 9 | XML download button | ready |
| S-24 | § 9 | Preflight warning — missing AKC numbers | blocked: seed |
