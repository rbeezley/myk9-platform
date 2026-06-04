# Secretary Golden Path Checklist

## Phase 2 Testing — myK9Show

**Tester:** _____________________ **Date:** _____________ **URL:** localhost:5173

**Instructions:** Walk every step in order. Check the box when the step completes without a blocker. Log any issue in the "Issue" line — include what you expected vs. what happened. Bring the log back to Claude to triage and fix.

**Last updated:** 2026-05-31 — reflects post-workbench-collapse (Setup / Show Desk tabs), at-show ringside routes, and push notifications.

---

## Pre-Flight

### Data setup [EXPANDED]

Choose one of two approaches:

**Option A — Use seeded fixtures** (faster; see `docs/testing/secretary-walk-seed.md` for credentials and show IDs):
- Secretary: `secretary@myk9t.com` / `TestPass4567!`
- Exhibitor: `exhibitor1@myk9t.com` / `TestPass4567!`
- Seeded show: **QA Walk Show** (ID `a0505c45-64d0-4b04-b2b3-cb213ed738a6`)
- Skip Parts 1–2; start at Part 3 using the seeded entries

**Option B — Create fresh data** (more thorough):
- Create your own accounts via the sign-up flow, or use a site-admin account
- Walk all parts in order from Part 1

### At-show feature flag [ADDED]

Part 6 (At-Show / Ringside) requires `shows.unified_ringside_enabled = true` on the test show.

To enable it for a specific show, run from the Supabase dashboard (SQL editor):
```sql
UPDATE public.shows SET unified_ringside_enabled = true WHERE id = '<your-show-id>';
```

If you cannot set the flag, skip Part 6 and note it in the issue log.

### Environment

- [ ] `pnpm dev:show` is running at localhost:5173
- [ ] You are signed in as a user with the **Secretary** role
- [ ] The app loads with no console errors (open DevTools → Console)

**Issue:** ______________________________________________________________________

---

## Part 1 — Setup: People and Dogs

> These records are prerequisites for entry management. Create them now, before the show, so you have real data to work with.

### 1.1 — Add a Person (Exhibitor)

- [ ] Navigate to **People** in the sidebar
- [ ] Click **Add Person**
- [ ] Fill in: first name, last name, AKC number, email, phone
- [ ] Save — confirm the person appears in the list

**Issue:** ______________________________________________________________________

### 1.2 — Add a Second Person

- [ ] Repeat 1.1 for a second person with different details

**Issue:** ______________________________________________________________________

### 1.3 — Add a Dog

- [ ] Navigate to **Dogs** in the sidebar
- [ ] Click **Add Dog**
- [ ] Fill in: call name, registered name, AKC number, breed, owner (link to person from 1.1)
- [ ] Save — confirm the dog appears in the list and detail page shows the owner correctly

**Issue:** ______________________________________________________________________

### 1.4 — Add a Second Dog

- [ ] Repeat 1.3 for a second dog, owned by the second person

**Issue:** ______________________________________________________________________

---

## Part 2 — Show Setup

### 2.1 — Open the Secretary Dashboard

- [ ] Navigate to `/secretary/dashboard`
- [ ] Upcoming shows list is visible (empty is fine at this point)
- [ ] If exactly one active show exists, the app auto-routes to `/secretary/shows/:showId` — that's expected

**Issue:** ______________________________________________________________________

### 2.2 — Create Show (Step 1: Show Details)

- [ ] Click **Create Show** (or navigate to `/secretary/create-show/wizard`)
- [ ] Wizard opens at Step 1 — Show Details
- [ ] Fill in:
  - Show name: _________________________
  - Sanctioning org: AKC
  - Start date: (next weekend or any future date)
  - End date: (same as start or +1 day)
  - Entry fee: $20
  - Entry open date: (today)
  - Entry close date: (3 days from now)
- [ ] Click **Next** — moves to Step 2

**Issue:** ______________________________________________________________________

### 2.3 — Add Trials (Step 2: Trial Configuration)

- [ ] Step 2 is visible — Trial Configuration
- [ ] Add Trial 1: date/time (show start, morning), event number AKC-2026-0001, type (e.g. Scent Work — Container)
- [ ] Add Trial 2: same date, afternoon, event number AKC-2026-0002, type (e.g. Scent Work — Interior)
- [ ] Both trials appear in the list
- [ ] Click **Next** — moves to Step 3

**Issue:** ______________________________________________________________________

### 2.4 — Add Classes (Step 3: Class Selection)

- [ ] Step 3 is visible — Class Selection
- [ ] For Trial 1: add at least 2 classes (e.g. Novice A, Novice B) with a judge assigned to each
- [ ] For Trial 2: add at least 2 classes with a judge assigned to each
- [ ] Click **Next** — moves to Step 4

**Issue:** ______________________________________________________________________

### 2.5 — Review and Publish (Step 4)

- [ ] Step 4 shows the full show structure (show → trials → classes → judges)
- [ ] No errors flagged
- [ ] Click **Create and Publish**
- [ ] Success screen appears — show created
- [ ] Click **Go to Show** (or navigate to `/secretary/shows/:newShowId`)
- [ ] Show Workbench opens with **Setup** tab active

**Issue:** ______________________________________________________________________

### 2.6 — Verify Setup Tab

- [ ] **Setup** tab is active at `/secretary/shows/:showId`
- [ ] Setup readiness signals visible (progress indicators, checks)
- [ ] Show structure (trials, classes, judges) is displayed in the setup panels

**Issue:** ______________________________________________________________________

### 2.7 — Edit Show After Creation [ADDED]

- [ ] From the Setup tab, find the show edit action (pencil icon, "Edit Show", or `?edit=true` link)
- [ ] Change one show detail (e.g., entry fee or end date)
- [ ] Save — the updated value is reflected on the workbench
- [ ] Change a judge name on one class — save and confirm the updated judge appears in the class row

**Issue:** ______________________________________________________________________

---

## Part 3 — Entry Management

### 3.1 — Open Entry Management

- [ ] Navigate to **Entry Management** via sidebar or `/secretary/entries/:showId`
- [ ] Page loads with entries grouped by status (Pending / Accepted / Waitlisted)
- [ ] Counts show 0 entries (expected — no entries yet); no console 500 errors

**Issue:** ______________________________________________________________________

### 3.2 — Add a Mail-in Entry (Dog 1)

- [ ] Click **Add Entry**
- [ ] Search for Dog 1 by name — found in results
- [ ] Dog 1's owner (Person 1) is pre-filled or selectable
- [ ] Select a class from Trial 1
- [ ] Enter check number and amount paid
- [ ] Save — entry appears in the Accepted (or Pending) tab

**Issue:** ______________________________________________________________________

### 3.3 — Add a Mail-in Entry (Dog 2)

- [ ] Repeat 3.2 for Dog 2 / Person 2, in a different class

**Issue:** ______________________________________________________________________

### 3.4 — Accept a Pending Entry

- [ ] If entries land in Pending: click **Accept** on one entry
- [ ] Entry moves to the Accepted tab

**Issue:** ______________________________________________________________________

### 3.5 — Waitlist an Entry

- [ ] Add a third entry to a class that is at (or near) its limit
- [ ] Click **Waitlist** on that entry
- [ ] Entry appears in the Waitlisted tab

**Issue:** ______________________________________________________________________

### 3.6 — Promote from Waitlist

- [ ] Open the Waitlist view
- [ ] Click **Offer Spot** on the waitlisted entry
- [ ] Entry moves to Accepted

**Issue:** ______________________________________________________________________

### 3.7 — Send Entry Confirmations

- [ ] Navigate to **Messages** (`/secretary/messages?showId=...`)
- [ ] Compose and send a confirmation message to accepted exhibitors

**Issue:** ______________________________________________________________________

---

## Part 4 — Day-of Operations (Show Desk Tab)

> All day-of work now lives in the **Show Desk** tab at `/secretary/shows/:showId?phase=show-desk`. Legacy routes `/secretary/day-of`, `/secretary/check-in`, and `/secretary/run-order` redirect here automatically.

### 4.1 — Open Show Desk

- [ ] Navigate to the Show Workbench and click **Show Desk** tab
- [ ] Show Map tree (trials / classes) is visible
- [ ] Next Best Action card is visible (guidance reflects setup phase, not wrap-up)
- [ ] Tools panel is accessible (e.g. via a side sheet or panel)

**Issue:** ______________________________________________________________________

### 4.2 — Verify Tools Panel Contents

- [ ] Open the tools panel / side sheet on Show Desk
- [ ] The following cards are present:
  - [ ] Late Entry action
  - [ ] Judge Hospitality
  - [ ] Quick Broadcast
  - [ ] Class Broadcast
  - [ ] Incident Log
  - [ ] Schedule Slip Script
  - [ ] **Show Access Codes** — view the QR code and passcode; if no plaintext codes are displayed, use **Generate new codes** and confirm the regenerated codes appear
  - [ ] Volunteers
  - [ ] Tasks & Notes

**Issue:** ______________________________________________________________________

### 4.3 — Print Scoresheets

- [ ] Navigate to **Reports** (`/secretary/reports`)
- [ ] Select the show, report type = Check-in Sheet or Scoresheets
- [ ] Report renders with correct class, judge, and entry data
- [ ] Report can be printed or downloaded

**Issue:** ______________________________________________________________________

### 4.4 — Day-of / Late Entry

- [ ] From the Show Desk tools panel, open **Late Entry** action
- [ ] Find or create a dog record (using the exhibitor search or inline creation)
- [ ] Assign to an available class and record payment
- [ ] Save — entry appears in the class

**Issue:** ______________________________________________________________________

### 4.5 — Scratch an Entry

- [ ] In the Show Map tree, locate a class row with entries
- [ ] Open the row actions (three-dot menu, right-click, or keyboard)
- [ ] Select a scratch / no-show action
- [ ] Confirm the scratch — class entry count decreases by 1

**Issue:** ______________________________________________________________________

### 4.6 — Process a Move-Up

- [ ] Find an accepted entry in the Show Map or Entry Management
- [ ] Open the move-up action
- [ ] Select a destination class (higher level)
- [ ] Confirm — entry appears in the destination class

**Issue:** ______________________________________________________________________

### 4.7 — Review Run Order

- [ ] In the Setup tab, locate the Run Order section
- [ ] Class sequence and ring assignments are listed
- [ ] Export run order works

**Issue:** ______________________________________________________________________

### 4.8 — Enter Results from Paper Scoresheet

> This is the paper scoresheet path — used when myK9Q is not at ringside.

- [ ] Navigate to `/scoring/classes/:classId/entries` (accessible via the Show Map class row actions → "Enter Scores")
- [ ] For each dog in the class, enter: Result (Pass / NQ / Absent), search time if applicable
- [ ] Save — all results recorded
- [ ] Repeat for a second class

**Issue:** ______________________________________________________________________

### 4.9 — Mark Class Complete

- [ ] In the Show Map tree, open actions on a fully-scored class
- [ ] Select **Mark Class Complete**
- [ ] Class row status updates in the tree

**Issue:** ______________________________________________________________________

### 4.10 — Log an Incident [ADDED]

- [ ] From Show Desk tools, open the **Incident Log** card
- [ ] Add an entry: select a dog/handler, select an incident type, save
- [ ] Close the tools panel and scroll to the closeout section
- [ ] **Incident Closeout Summary** shows the logged incident

**Issue:** ______________________________________________________________________

### 4.11 — Schedule Slip Broadcast

- [ ] From Show Desk tools, open **Schedule Slip Script**
- [ ] Generate a PA script for a ring running behind
- [ ] Optionally broadcast the message via **Quick Broadcast**
- [ ] Message appears in the Show Desk broadcast lane

**Issue:** ______________________________________________________________________

---

## Part 5 — Closeout (Show Desk → Closeout Section)

> The closeout section lives at the bottom of the **Show Desk** tab, below the Show Map.

### 5.1 — Verify Closeout Section is Visible

- [ ] Scroll to the bottom of the Show Desk tab
- [ ] Closeout section is present (not blocked by incomplete-show guards)

**Issue:** ______________________________________________________________________

### 5.2 — View End-of-Day Reconciliation

- [ ] The reconciliation panel shows: total entries, day-of additions, collected fees, no-show/scratch totals
- [ ] Numbers match what was entered in Parts 3–4

**Issue:** ______________________________________________________________________

### 5.3 — Navigate to Results Control

- [ ] Click **Results Control** button in the closeout section
- [ ] Opens `/secretary/results-control`
- [ ] All entries for all classes show a result (Pass / NQ / Absent)
- [ ] No entries are missing results

**Issue:** ______________________________________________________________________

### 5.4 — Release Results to Exhibitors

- [ ] Toggle **Release Results** in Results Control
- [ ] Results are now visible to exhibitor accounts

**Issue:** ______________________________________________________________________

### 5.5 — Generate Reports

- [ ] Click **Reports** from the closeout section → opens `/secretary/reports`
- [ ] Generate each of the following:
  - [ ] Show Catalog
  - [ ] Results Catalog
  - [ ] Judge Report
  - [ ] Trial Secretary Report
  - [ ] Result Labels
- [ ] Each report renders without errors and can be printed or downloaded

**Issue (Show Catalog):** _______________________________________________________

**Issue (Results Catalog):** ____________________________________________________

**Issue (Judge Report):** _______________________________________________________

**Issue (Trial Secretary Report):** _____________________________________________

**Issue (Result Labels):** ______________________________________________________

### 5.6 — AKC XML Export

- [ ] Navigate to **Submit Results** (`/secretary/results-submission`)
- [ ] Preview the AKC XML
- [ ] Click **Download XML** — file downloads
- [ ] Open the XML — it has the correct show name, event numbers, and entries

**Issue:** ______________________________________________________________________

### 5.7 — Payment Reconciliation

- [ ] Open Entry Management for the show
- [ ] Payment amounts are visible per entry
- [ ] Any entries with missing payment are identifiable

**Issue:** ______________________________________________________________________

---

## Part 6 — At-Show / Ringside (NEW)

> The `/at-show/:showId` routes are a full-screen ringside experience for judges and scorers. Access is gated by `shows.unified_ringside_enabled` (currently DEV-only feature flag) and admits either RBAC staff or a valid show-scoped passcode grant.

### 6.1 — Confirm Feature Flag is Enabled [EXPANDED]

- [ ] Verify the test show has `unified_ringside_enabled = true`
  - Option A: confirm it was set in Pre-Flight (see SQL above)
  - Option B: open the Supabase SQL editor and run `SELECT unified_ringside_enabled FROM public.shows WHERE id = '<show-id>';`
- [ ] If the flag is `false`, the `/at-show/:showId` route will show an inline "not enabled" notice — that is expected gating behavior. Confirm the notice text is legible, then **stop Part 6** and note in the issue log that the flag was not set.
- [ ] If the flag is `true`, proceed with 6.2+

**Issue:** ______________________________________________________________________

### 6.2 — Access via Staff Account (RBAC path)

- [ ] Navigate to `/at-show/:showId` while signed in as Secretary
- [ ] `AtShowAccessGate` admits the user (no passcode required for staff)
- [ ] **Class List page** renders — shows all trials and their classes for the show
- [ ] Each class row displays: name, level, judge, entry count

**Issue:** ______________________________________________________________________

### 6.3 — Navigate to Entry List

- [ ] Click a class in the class list
- [ ] **Entry List page** renders at `/at-show/:showId/class/:classId`
- [ ] Entry cards show: dog call name, armband number, handler name
- [ ] Favorite toggle (star) is visible on each card

**Issue:** ______________________________________________________________________

### 6.4 — Toggle a Favorite

- [ ] Tap the favorite (star) icon on an entry card
- [ ] Card updates to show it is favorited
- [ ] Reload the page — favorite persists

**Issue:** ______________________________________________________________________

### 6.5 — Open Live Scoresheet

- [ ] Tap an entry card to navigate to `/at-show/:showId/class/:classId/score/:entryId`
- [ ] **Scoresheet page** renders with the dog's name, armband, and class
- [ ] Timer control is visible (start/stop/reset)
- [ ] Result controls (Q / NQ / Absent) are visible

**Issue:** ______________________________________________________________________

### 6.6 — Score an Entry

- [ ] Start the timer
- [ ] Stop the timer at a time within the class time limit
- [ ] Select **Q** (Qualified)
- [ ] Save — navigate back to the entry list
- [ ] The scored entry shows its result in the list

**Issue:** ______________________________________________________________________

### 6.7 — Verify At-Show Results in Results Control [ADDED]

> This step confirms that scores submitted via the at-show scoresheet persist back to the secretary's system — the critical data integrity check for the at-show flow.

- [ ] After scoring at least one entry in step 6.6, switch to the secretary view (sign out of the passcode session if needed, or open a new tab signed in as secretary)
- [ ] Navigate to `/secretary/results-control`
- [ ] Select the same show and class used in step 6.6
- [ ] The scored entry shows the result entered via the at-show scoresheet (Q / NQ / Absent)
- [ ] The result is **not** blank or stale

**Issue:** ______________________________________________________________________

### 6.9 — Combined Section A/B View

- [ ] If the show has a Novice A + Novice B combined run, navigate to `/at-show/:showId/class/:classIdA/:classIdB`
- [ ] Both sections' entry cards appear in a unified list

**Issue:** ______________________________________________________________________

### 6.10 — Passcode Access Path (QR / Sign-in)

- [ ] Open an incognito window (no session)
- [ ] Navigate to `/at-show/:showId`
- [ ] `AtShowAccessGate` should redirect to **SmartSignInPage** or show a passcode entry form
- [ ] Enter the show passcode (obtain from Show Access Codes card in Show Desk tools)
- [ ] After passcode entry, the Class List renders without requiring a full account sign-in

**Issue:** ______________________________________________________________________

---

## Part 7 — Push Notifications (NEW)

> Show-day push notifications let exhibitors and staff receive real-time alerts (schedule slips, announcements) on their mobile devices.

### 7.1 — Subscribe to Push Notifications

- [ ] Sign in as an exhibitor (or use a second browser profile)
- [ ] Navigate to a show's public page or the exhibitor dashboard
- [ ] Find the **Enable Notifications** prompt or settings
- [ ] Grant browser push permission
- [ ] Subscription is confirmed (no console error)

**Issue:** ______________________________________________________________________

### 7.2 — Trigger a Notification from Show Desk

- [ ] As Secretary, open the Schedule Slip Script card in Show Desk tools
- [ ] Generate and broadcast a message with push enabled
- [ ] On the subscribed device / browser: a push notification arrives within ~30 seconds

**Issue:** ______________________________________________________________________

### 7.3 — Tap Notification to Deep-Link

- [ ] Tap (click) the received push notification
- [ ] Browser opens (or foregrounds) to the correct show page — not the generic home
- [ ] The routed destination is logical for the notification type

**Issue:** ______________________________________________________________________

---

## Issue Log Summary

Use this section to list every issue found during the walk. Bring this back to Claude to triage.

| #   | Step | What happened | Expected | Severity (Blocker / Major / Minor) |
| --- | ---- | ------------- | -------- | ---------------------------------- |
| 1   |      |               |          |                                    |
| 2   |      |               |          |                                    |
| 3   |      |               |          |                                    |
| 4   |      |               |          |                                    |
| 5   |      |               |          |                                    |
| 6   |      |               |          |                                    |
| 7   |      |               |          |                                    |
| 8   |      |               |          |                                    |
| 9   |      |               |          |                                    |
| 10  |      |               |          |                                    |

---

## Known Skip Items (do not log as bugs)

| Step | Item | Reason |
| ---- | ---- | ------ |
| 6.1  | At-show feature flag | `unified_ringside_enabled` is DEV-only. If testing against staging without the flag set, the inline gate notice is expected. |
| 4.9  | Ring number display | Ring numbers are not yet persisted. `Ring 0` or absent ring labels are expected behavior until the ring-number contract is implemented. |

---

## Golden Path Exit Criteria

- [ ] All checkboxes above are checked (skipping the Known Skip Items)
- [ ] All Blocker and Major issues from the Issue Log have been fixed
- [ ] No step required workaround or developer intervention

**Sign-off:** _____________________ **Date:** _____________
