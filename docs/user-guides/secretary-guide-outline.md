# Secretary Guide Outline

**Status:** `qa-draft` — outline phase; final guide gated on Phase 0 readiness.

**Audience:** Trial secretaries. Role intent: "That was easy." Every step should be completable in one motion with no jargon.

**Canonical source:** `docs/journeys/secretary.md`, `docs/testing/secretary-golden-path-checklist.md`

**Guide target:** `docs/user-guides/secretary-guide.md` (create in Phase 6 once gated sections are stable)

---

## Readiness Summary

| Section | Route | Screenshot needed | Stable? | Notes |
|---|---|---|---|---|
| Dashboard | `/secretary/dashboard` | yes | stable | Golden path § 2.1 |
| Create a Show | `/secretary/create-show/wizard` | yes (4 steps) | stable | Golden path § 2.2–2.5 |
| Show Setup (edit) | `/shows/:showId` → Setup tab | yes | stable | Golden path § 2.6–2.7 |
| Entry Management | `/shows/:showId/entry-management` | yes | stable | Golden path § 3 |
| Waitlist Management | `/secretary/waitlist/:showId` | yes | stable | Golden path § 3.5–3.6 |
| Communications | `/secretary/messages` | yes | mostly stable | Email delivery P-01 gap |
| Reports (pre-show) | `/shows/:showId/reports` | yes | stable | Golden path § 4.3 |
| Show Desk | `/shows/:showId?phase=show-desk` | yes | stable | Golden path § 4.1–4.11 |
| Results & Check-In | `/shows/:showId/results-control` | yes | stable | Golden path § 5.3–5.4 |
| Submit to AKC | `/shows/:showId/submit-results` | yes | stable | Golden path § 5.6 |
| Closeout | Show Desk → Closeout section | yes | **partial** | Close Out Show action not yet built |
| At-Show / Ringside | `/at-show/:showId` | yes | stable | Open to all shows; access gated by `AtShowAccessGate`. (Updated 2026-06-23: `unified_ringside_enabled` flag removed — see [`../plan-remove-unified-ringside-flag.md`](../plan-remove-unified-ringside-flag.md)) |

---

## Section 1 — Dashboard (Mission Control)

**User outcome:** Secretary sees all their active shows and identifies which needs attention.

**Rough steps (qa-draft):**
1. Sign in → you land on the Secretary Dashboard (`/secretary/dashboard`).
2. Upcoming shows are listed with entry count, open/close dates, and a status badge.
3. Click a show → opens the Show Workbench for that show.

**Screenshot:** Dashboard showing at least one upcoming show with status badges.

**KB articles this section generates:**
- None (no common support question about the dashboard itself)

**Friction findings:**
- If the secretary has exactly one active show, the app auto-routes to that show's workbench — a new secretary may never see the dashboard. Mention the back-navigation path.

---

## Section 2 — Create a Show

**User outcome:** Secretary creates a show with trials, classes, judges, entry fees, and dates, then publishes it.

**Canonical route:** `/secretary/create-show/wizard`

**Rough steps (qa-draft):**
1. From the Dashboard, click **Create Show**.
2. **Step 1 — Show Details:** Enter the show name, sanctioning organization (AKC / UKC / Other), start and end dates, entry fee, and entry open/close dates. Click **Next**.
3. **Step 2 — Trial Configuration:** Add each trial with its date/time and event number. Click **Next**.
4. **Step 3 — Class Selection:** For each trial, select classes and assign a judge to each. Click **Next**.
5. **Step 4 — Review:** Scan the full structure for errors. Click **Create and Publish**.
6. Success screen — the show is live and accepting entries.

**Screenshots:** All 4 wizard steps; success screen.

**KB articles this section generates:**
- `create-a-show.md` — high priority (S-01 in question bank)

**Stability notes:**
- Wizard is stable. Entry fee editing after publish is a lower-priority section (see S-24 in question bank).

**Friction findings (from journey doc):**
- Volunteer scheduling is a separate post-wizard step; the wizard does not surface it. Do not mention it as part of setup.
- mySWT users expect to create show / trial / class in three separate dialogs — explicitly note that the wizard does all three at once, since this is a common first question.

---

## Section 3 — Show Setup and Configuration

**User outcome:** Secretary edits the show structure, officials, and settings after initial creation.

**Canonical route:** `/shows/:showId` → **Setup** tab

**Rough steps (qa-draft):**
1. From the Show Workbench, click the **Setup** tab.
2. Edit show details: click the edit action (pencil or **Edit Show**).
3. Add or change a judge: find the class row → edit judge assignment.
4. View setup readiness signals — completion checklist or progress indicators.

**Screenshots:** Setup tab with readiness signals; class row with judge assignment.

**KB articles:** None (not a common support question; covered in `create-a-show.md` follow-up).

**Stability notes:**
- Stable. From golden path § 2.6–2.7 — edit flow is confirmed working.

---

## Section 4 — Entry Management

**User outcome:** Secretary approves, rejects, or waitlists pending entries; records mail-in payment.

**Canonical route:** `/shows/:showId/entry-management`

**Rough steps (qa-draft):**

**Approving an online entry:**
1. Open **Entry Management** from the sidebar or Show Workbench.
2. Find the entry in the **Pending** tab.
3. Click **Accept** → entry moves to the Accepted tab; payment is already recorded for online entries.

**Adding a mail-in entry:**
1. Click **Add Entry**.
2. Search for the exhibitor and their dog; create records if new.
3. Select the class, enter the check number and amount paid.
4. Click **Save** → entry appears as Accepted with payment recorded.

**Waitlisting:**
1. Click **Waitlist** on a pending entry when a class is full.
2. When a spot opens (someone scratches), go to **Waitlist Management** → click **Offer Spot**.

**Screenshots:** Entry Management overview; Accept / Waitlist actions; Add Entry dialog.

**KB articles this section generates:**
- `approve-entries.md` — high priority (S-03)

**Support macros:** M-03 (entry not showing), M-04 (no confirmation email)

**Stability notes:**
- Stable. Confirmation email on accept is in progress (gap P-01) — do not promise email delivery in the guide until wired.

---

## Section 5 — Communications

**User outcome:** Secretary sends announcements, confirmation notices, and targeted messages to exhibitors.

**Canonical route:** `/secretary/messages`

**Rough steps (qa-draft):**

**Send an announcement to all exhibitors:**
1. Open **Messages** from the sidebar (bell icon) or Message Center.
2. Click **New Message** → select **Announce to all accepted exhibitors**.
3. Write a subject and message → **Send**.

**Send a message to one exhibitor:**
1. In Entry Management, open an entry → click **Message Exhibitor**.
2. Or open Messages → search by name or email.

**Screenshots:** Messages interface; announcement compose dialog.

**KB articles this section generates:**
- `send-announcement.md` (S-14)

**Stability notes:**
- Announcement sending is stable. Mass email delivery depends on Resend being wired — gap P-01. Do not promise delivery until verified in production.

---

## Section 6 — Reports (Pre-Show)

**User outcome:** Secretary prints scoresheets, check-in sheets, run order, and armband labels before the show.

**Canonical route:** `/shows/:showId/reports`

**Rough steps (qa-draft):**
1. Open **Reports** from the Show Workbench sidebar or Show Desk.
2. Select the trial and report type:
   - **Check-in Sheet** — print one per ring before the show
   - **Scoresheets** — print and hand to judges before the first class
   - **Run Order** — print for ring stewards and post at each ring
   - **Armband Labels** — print on Avery 18262 stock
3. Print or download.

**Screenshots:** Reports page with trial selector; each report type preview.

**KB articles this section generates:**
- `print-scoresheets.md` (S-06)

**Stability notes:**
- Reports are stable. Armband label format should be verified against Avery 18262 before first use (noted in journey doc).

---

## Section 7 — Show Desk (Day-of Operations)

**User outcome:** Secretary handles check-in, scratches, move-ups, and late entries from one page.

**Canonical route:** `/shows/:showId?phase=show-desk`

**Entry point:** Show Workbench → **Show Desk** tab. From the Dashboard, a show running today will deep-link here automatically.

**Rough steps (qa-draft):**

**Check in an exhibitor:**
1. Click the **Show Desk** tab.
2. In the Show Map, locate the exhibitor's class.
3. Search by armband number or name → click **Check In**.

**Handle a scratch:**
1. In the Show Map, open the row actions (three-dot menu) on the entry.
2. Select **Scratch** (or Pull) → confirm → class count updates.

**Process a move-up:**
1. Open the row actions on an entry.
2. Select **Move Up** → pick the destination class → confirm.

**Add a late entry / walk-in:**
1. Open the **Tools** panel → click **Late Entry**.
2. Find or create the exhibitor record → assign a class → record payment → Save.

**Enter scores from paper scoresheets (when ringside app is not in use):**
1. From the Show Map, click a class row → **Enter Scores**.
2. For each dog: select Pass / NQ / Absent, enter time if applicable → Save.

**Tools panel (Show Desk side sheet):**
Available from the Tools panel: Quick Broadcast, Class Broadcast, Schedule Slip Script, Incident Log, Show Access Codes, Tasks & Notes, Volunteers.

**Screenshots:** Show Desk overview with Show Map; scratch dialog; move-up dialog; late entry dialog; Tools panel.

**KB articles this section generates:**
- `handle-a-scratch.md` (S-07)
- `handle-move-up.md` (S-08)

**Stability notes:**
- Show Desk is stable. Ring numbers are not yet persisted — "Ring 0" or missing ring labels are expected until that field is implemented (known skip per golden path checklist § 4.9).
- `RunOrderPage` uses mock personnel data (`RunOrderPage/mockPersonnel.ts`) — real volunteer data is not wired in from scheduling. Do not describe run order as showing volunteer names.

---

## Section 8 — Results & Check-In

**User outcome:** Secretary verifies all results are complete and releases them to exhibitors.

**Canonical route:** `/shows/:showId/results-control`

**Entry point:** Show Desk → Closeout section → **Results & Check-In** button

**Rough steps (qa-draft):**
1. From the Show Desk, scroll to the **Closeout** section at the bottom.
2. Click **Results & Check-In**.
3. Review: confirm every class shows all entries with a result (Pass / NQ / Absent). No blanks.
4. Toggle **Release Results** → results are now visible to exhibitors in their accounts.

**Screenshots:** Results & Check-In with all classes showing complete results; release toggle.

**KB articles this section generates:**
- None (secretary-only task; exhibitor side covered in `view-results.md`)

**Stability notes:**
- Stable. Known gap P-04: exhibitors may be able to see their own result before release via a direct RLS read — do not promise complete withholding until that gap is closed.

---

## Section 9 — Submit Results to AKC/UKC

**User outcome:** Secretary downloads the electronic submission file and emails it to the registry.

**Canonical route:** `/shows/:showId/submit-results`

**Rough steps (qa-draft):**
1. Open **Submit Results** from the Reports page or Show Desk closeout section.
2. Select the show → preview the generated AKC XML.
3. Check for warnings (missing AKC registration numbers are listed here; contact those exhibitors first).
4. Click **Download XML**.
5. Email the file to `eresults@akc.org` with the club name, event dates, and event numbers in the message body.

**Screenshots:** Submit Results page with XML preview; preflight warning if dogs are missing numbers.

**KB articles this section generates:**
- `submit-akc-results.md` (S-09)

**Stability notes:**
- Download and preview are stable. AKC XML format should be verified against AKC's current submission requirements before the first real show.

---

## Section 10 — Post-Show Reports

**User outcome:** Secretary generates official reports for the judges, the club chairman, and the AKC.

**Canonical route:** `/shows/:showId/reports` (same page as pre-show reports; different report types)

**Reports to generate:**

| Report | Recipient | Frequency |
|---|---|---|
| Results Catalog | Self, club chairman | Once after closeout |
| Judge Report (per judge) | Each judge + AKC | Once per trial |
| Trial Secretary Report | AKC submission packet | Once per trial |
| Result Labels | Qualifying dogs' ribbons | Once per show |

**Rough steps (qa-draft):**
1. Open **Reports** from the Show Desk closeout section.
2. Select the trial.
3. Generate and download/print each report in order: Results Catalog → Judge Report → Trial Secretary Report → Result Labels.

**Screenshots:** Each report type rendered.

**KB articles:**
- `print-scoresheets.md` is pre-show; consider a separate `generate-closeout-reports.md` (lower priority).

**Stability notes:**
- Report generation is stable. PDF format compatibility with AKC's AcroForm requirements is a known gap (report generation is Phase 1+2 complete; PDF AcroForm fill via pdf-lib is deferred per `project_report_generation` memory).

---

## Section 11 — Closeout

**User outcome:** Secretary closes the show, archiving all trials and classes.

**Canonical route:** Show Desk → Closeout section → **Close Out Show** action

**Status:** `walkthrough-needed` — **Close Out Show** cascade action is not yet built as of 2026-06-19. Do not draft this section until the action exists. Gate with the Phase 0 checklist.

**Placeholder steps (to verify when built):**
1. From the Show Desk Closeout section, click **Close Out Show**.
2. Confirm the action → all trials and classes are archived.
3. Show status changes to Closed on the Dashboard.

---

## Cross-References

- Workflow source map: `docs/user-guides/workflow-source-map.md` §12–20
- Role intent: `docs/INTENT.md` § Trial Secretary
- Secretary journey: `docs/journeys/secretary.md`
- Golden path checklist: `docs/testing/secretary-golden-path-checklist.md`
- Support macros that reference this guide: M-03, M-04, M-12
- Investigation cookbook entries: Payment processed, entry missing; Confirmation email not received; AKC submission file

## QA-Draft Friction Findings

The following were identified while writing this outline. Filed to the backlog where marked.

| Finding | Section | Backlog action |
|---|---|---|
| Close Out Show cascade not built | § 11 | Block section; track in OPEN-TODOS |
| RunOrderPage uses mock personnel data | § 7 | Don't document volunteers in run order |
| Email delivery (P-01) may not fire for all paths | § 5 | Don't promise email delivery until wired |
| Ring numbers not persisted | § 7 | Note as known skip; don't document ring numbers |
| Results release gate has RLS gap (P-04) | § 8 | Don't promise withholding; gap is in backlog |
