# Secretary Golden Path Checklist

## Phase 2 Testing — myK9Show

**Tester:** **********\_\_\_********** **Date:** ********\_******** **URL:** localhost:5173

**Instructions:** Walk every step in order. Check the box when the step completes without a blocker. Log any issue in the "Issue" line — include what you expected vs. what happened. Bring the log back to Claude to triage and fix.

---

## Pre-Flight

- [ ] `pnpm dev:show` is running at localhost:5173
- [ ] You are signed in as a user with the **Secretary** role
- [ ] The app loads with no console errors (open DevTools → Console)

**Issue:** ******************************\_\_\_\_******************************

---

## Part 1 — Setup: People and Dogs

> These records are prerequisites for entry management. Create them now, before the show, so you have real data to work with.

### 1.1 — Add a Person (Exhibitor)

- [ ] Navigate to People (find it in the nav)
- [ ] Click the button to add a new person
- [ ] Fill in: first name, last name, AKC number, email, phone
- [ ] Save — confirm the person appears in the list

**Issue:** ******************************\_\_\_\_******************************

### 1.2 — Add a Second Person (yourself as a second exhibitor)

- [ ] Repeat 1.1 for a second person with different details

**Issue:** ******************************\_\_\_\_******************************

### 1.3 — Add a Dog

- [ ] Navigate to Dogs (find it in the nav)
- [ ] Click the button to add a new dog
- [ ] Fill in: call name, registered name, AKC number, breed, owner (link to person from 1.1)
- [ ] Save — confirm the dog appears in the list and detail page shows owner correctly

**Issue:** ******************************\_\_\_\_******************************

### 1.4 — Add a Second Dog

- [ ] Repeat 1.3 for a second dog, owned by the second person

**Issue:** ******************************\_\_\_\_******************************

---

## Part 2 — Show Setup

### 2.1 — Open Mission Control

- [ ] Navigate to the Secretary Dashboard / Mission Control
- [ ] Upcoming shows list is visible (empty is fine at this point)

**Issue:** ******************************\_\_\_\_******************************

### 2.2 — Create Show (Step 1: Show Details)

- [ ] Click **Create Show**
- [ ] Wizard opens at Step 1 — Show Details
- [ ] Fill in:
  - Show name: ************\_************
  - Sanctioning org: AKC
  - Start date: (next weekend or any future date)
  - End date: (same as start or +1 day)
  - Entry fee: $20
  - Entry open date: (today)
  - Entry close date: (3 days from now)
- [ ] Click **Next** — moves to Step 2

**Issue:** ******************************\_\_\_\_******************************

### 2.3 — Add Trials (Step 2: Trial Configuration)

- [ ] Step 2 is visible — Trial Configuration
- [ ] Add Trial 1:
  - Date/time: (show start date, morning)
  - Event number: AKC-2026-0001
  - Trial type: (e.g. Scent Work — Container)
- [ ] Add Trial 2:
  - Date/time: (same date, afternoon)
  - Event number: AKC-2026-0002
  - Trial type: (e.g. Scent Work — Interior)
- [ ] Both trials appear in the list
- [ ] Click **Next** — moves to Step 3

**Issue:** ******************************\_\_\_\_******************************

### 2.4 — Add Classes (Step 3: Class Selection)

- [ ] Step 3 is visible — Class Selection
- [ ] For Trial 1: add at least 2 classes (e.g. Novice A, Novice B)
  - Assign a judge name to each class
- [ ] For Trial 2: add at least 2 classes
  - Assign a judge name to each class
- [ ] Click **Next** — moves to Step 4

**Issue:** ******************************\_\_\_\_******************************

### 2.5 — Review and Publish (Step 4)

- [ ] Step 4 shows the full show structure (show → trials → classes → judges)
- [ ] No errors flagged
- [ ] Click **Create and Publish**
- [ ] Success screen appears: "Show Created!" (or equivalent)
- [ ] Click **Go to Dashboard**
- [ ] Show appears in the Mission Control upcoming shows list

**Issue:** ******************************\_\_\_\_******************************

---

## Part 3 — Entry Management

### 3.1 — Open Entry Management

- [ ] Open Entry Management for the show just created
- [ ] Page loads with entries grouped by status (Pending / Accepted / Waitlisted)
- [ ] List is empty (expected — no entries yet)

**Issue:** ******************************\_\_\_\_******************************

### 3.2 — Add a Mail-in Entry (Dog 1)

- [ ] Click **Add Entry**
- [ ] Search for Dog 1 by name — found in results
- [ ] Dog 1's owner (Person 1) is pre-filled or selectable
- [ ] Select a class from Trial 1
- [ ] Enter check number and amount paid
- [ ] Save — entry appears in the Accepted (or Pending) tab

**Issue:** ******************************\_\_\_\_******************************

### 3.3 — Add a Mail-in Entry (Dog 2)

- [ ] Repeat 3.2 for Dog 2 / Person 2, in a different class

**Issue:** ******************************\_\_\_\_******************************

### 3.4 — Accept a Pending Entry

- [ ] If entries land in Pending: click **Accept** on one entry
- [ ] Entry moves to the Accepted tab

**Issue:** ******************************\_\_\_\_******************************

### 3.5 — Waitlist an Entry

- [ ] Add a third entry to a class that is at (or near) its limit
- [ ] Click **Waitlist** on that entry
- [ ] Entry appears in the Waitlisted tab / Waitlist page

**Issue:** ******************************\_\_\_\_******************************

### 3.6 — Promote from Waitlist

- [ ] Open the Waitlist view
- [ ] Click **Offer Spot** on the waitlisted entry
- [ ] Entry moves to Accepted

**Issue:** ******************************\_\_\_\_******************************

### 3.7 — Send Entry Confirmations

- [ ] Select all accepted entries (or use bulk action)
- [ ] Open SecretaryMessagesPage / bulk email action
- [ ] Compose and send a confirmation message

**Issue:** ******************************\_\_\_\_******************************

---

## Part 4 — Day-of Operations

### 4.1 — Print Scoresheets

- [ ] Open Reports page
- [ ] Generate / print scoresheets for each class
- [ ] Scoresheets render with correct class, judge, and entry data

**Issue:** ******************************\_\_\_\_******************************

### 4.2 — Open Day-of Operations

- [ ] Navigate to Day-of Operations page for the show
- [ ] Class availability table visible
- [ ] Check-in queue visible (entries from Part 3 are listed)

**Issue:** ******************************\_\_\_\_******************************

### 4.3 — Check In an Exhibitor

- [ ] Search by name or armband number
- [ ] Find Dog 1 / Person 1
- [ ] Click **Check In** — status updates to checked-in

**Issue:** ******************************\_\_\_\_******************************

### 4.4 — Day-of Entry

- [ ] Click to add a new day-of entry (a dog that didn't pre-enter)
- [ ] Find or create a dog record inline
- [ ] Assign to an available class
- [ ] Record payment
- [ ] Save — entry appears in the class

**Issue:** ******************************\_\_\_\_******************************

### 4.5 — Scratch an Entry

- [ ] Find an entry in the check-in list
- [ ] Open scratch dialog
- [ ] Confirm the scratch
- [ ] Class entry count decreases by 1

**Issue:** ******************************\_\_\_\_******************************

### 4.6 — Process a Move-Up

- [ ] Find an accepted entry
- [ ] Open move-up dialog
- [ ] Select a destination class (higher level)
- [ ] Confirm — entry is now in the destination class

**Issue:** ******************************\_\_\_\_******************************

### 4.7 — Review Run Order

- [ ] Navigate to Run Order page for Trial 1
- [ ] Class sequence and ring assignments are listed
- [ ] Drag to reorder if available
- [ ] Export run order

**Issue:** ******************************\_\_\_\_******************************

### 4.8 — Enter Results from Paper Scoresheet

> This is the paper scoresheet path — used when myK9Q is not at ringside.

- [ ] Navigate to Results Control page
- [ ] Select Trial 1, Class 1
- [ ] For each dog in the class, enter:
  - Result: Pass / NQ / Absent
  - Search time (if applicable) — keyboard entry is fast and clear
- [ ] Save — all results recorded
- [ ] Repeat for Class 2

**Issue:** ******************************\_\_\_\_******************************

### 4.9 — Print Preliminary Results

- [ ] Open Reports page
- [ ] Generate Preliminary Results for a class
- [ ] Report renders with correct results for each dog

**Issue:** ******************************\_\_\_\_******************************

---

## Part 5 — Closeout

### 5.1 — Verify All Results Complete

- [ ] Open Results Control page
- [ ] All entries for all classes show a result (Pass / NQ / Absent)
- [ ] No entries are missing results

**Issue:** ******************************\_\_\_\_******************************

### 5.2 — Release Results to Exhibitors

- [ ] Toggle **Release Results**
- [ ] Results are now visible to exhibitor accounts

**Issue:** ******************************\_\_\_\_******************************

### 5.3 — Generate Reports

- [ ] Open Reports page and generate each of the following:
  - [ ] Show Catalog
  - [ ] Results Catalog
  - [ ] Judge Report
  - [ ] Trial Secretary Report
  - [ ] Result Labels
- [ ] Each report renders without errors
- [ ] Each report can be printed or downloaded

**Issue (Show Catalog):** ************************\_\_************************

**Issue (Results Catalog):** **********************\_\_\_\_**********************

**Issue (Judge Report):** ************************\_\_\_************************

**Issue (Trial Secretary Report):** ********************\_\_\_\_********************

**Issue (Result Labels):** ************************\_\_\_************************

### 5.4 — AKC XML Export

- [ ] Open Results Submission page
- [ ] Select the show
- [ ] Preview the AKC XML
- [ ] Click **Download XML** — file downloads
- [ ] Open the XML — it has the correct show name, event numbers, and entries

**Issue:** ******************************\_\_\_\_******************************

### 5.5 — Payment Reconciliation

- [ ] Open Entry Management for the show
- [ ] Filter or review all accepted entries
- [ ] Payment amounts are visible per entry
- [ ] Any entries with missing payment are identifiable

**Issue:** ******************************\_\_\_\_******************************

### 5.6 — Close Out Show

- [ ] Find the Close Out Show action (ShowManagementPage or similar)
- [ ] Confirm closeout
- [ ] Show and all trials/classes are marked closed

**Issue:** ******************************\_\_\_\_******************************

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

## Golden Path Exit Criteria

- [ ] All checkboxes above are checked
- [ ] All Blocker and Major issues from the Issue Log have been fixed
- [ ] No step required workaround or developer intervention

**Sign-off:** **********\_\_\_********** **Date:** ********\_********







  Critical bugs (fix immediately)                                                                                                                                                                            
                                                                                                                                                                                                             
  1. Routes not registered — /scoring/classes/:classId/entries and /:entryId exist as pages but are absent from every route file. Every scoring link from EntryCardGrid hits a 404.                          
  2. classId: 'bulk-entry-class' hardcoded — BulkResultEntry's submit handler always saves results with the wrong class ID. Silent data corruption.
  3. No success state after bulk submit — secretary sees nothing after clicking Submit. Likely causes duplicate submissions.                                                                                 
                   
  High priority

  4. Bulk entry is Scent Work-only — types are ScentWorkEntry/ScentWorkResult; the form shows a time field and Q/NQ options that don't apply to Obedience, Agility, Rally, or Tracking.                      
  5. No direct "Enter scores" shortcut — secretary navigates Show → Trial → Classes → class card → Secretary tab = 4–5 clicks every time.
  6. No unsaved-changes warning — navigating away mid-entry silently loses all work.                                                                                                                         
                   
  Quick wins                                                                                                                                                                                                 
                   
  - Register 2 routes in secretaryRoutes.tsx                                                                                                                                                                 
  - Pass real classId as a prop through SecretaryClassDashboard → BulkResultEntry
  - Add a success toast on submit                                                                                                                                                                            
  - Default Qualification to "Qualified" (most entries are Q)
