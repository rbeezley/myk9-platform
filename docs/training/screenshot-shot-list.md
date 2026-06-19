# Screenshot and Demo Asset Shot List

**Status:** `drafted`

Every screenshot and diagram in final documentation and training materials must have a row here. No screenshot without a shot-list entry should appear in published materials.

**Status values:**
- `ready` — UI is stable; this shot can be taken now
- `blocked: flag` — gated on `unified_ringside_enabled` flag removal
- `blocked: stripe` — needs a fresh sandbox Stripe onboarding walkthrough
- `blocked: seed` — needs a specific seed fixture not yet in staging
- `blocked: not-built` — the feature is not yet built
- `blocked: date` — only renders on show day (date-controlled UI)

**Seeded accounts (staging):**

| Role | Account |
|---|---|
| Secretary | `secretary@myk9t.com` |
| Exhibitor | `e2e-exhibitor@test.myk9.com` |
| Judge | `judge@myk9t.com` |
| Club admin | `club@myk9t.com` |
| Site admin | `admin@myk9t.com` |
| Unauthenticated | (no sign-in) |

**Canonical seed show:** Heritage Scent Work show (32 classes seeded; see `supabase/seed-demo.sql`). Use this show for all secretary and exhibitor screenshots unless noted.

**Viewport sizes:**

| Label | Size | Use for |
|---|---|---|
| Desktop | 1280 × 800 | Secretary, admin, club admin surfaces |
| Mobile | 390 × 844 | Exhibitor on show day; at-show ringside |
| Tablet | 768 × 1024 | Ringside — judge/steward |

**Sensitive Content Rule:** Every screenshot must use seeded fixture accounts only. No real customer names, emails, dog registrations, or payment data. If staging data shows anything from a real account, re-seed before shooting.

---

## Part 1 — Secretary Guide Screenshots

| Shot ID | Description | Route | Account | Viewport | Expected state | Guide section | Status |
|---|---|---|---|---|---|---|---|
| S-01 | Secretary dashboard — one active show | `/secretary/dashboard` | `secretary@myk9t.com` | Desktop | Heritage show listed with entry count badge | § 1 Dashboard | `ready` |
| S-02 | Create Show wizard — Step 1 (show details) | `/secretary/create-show/wizard` | `secretary@myk9t.com` | Desktop | Form with name, org, dates, entry fee, entry window | § 2 Create a Show | `ready` |
| S-03 | Create Show wizard — Step 2 (trial config) | `/secretary/create-show/wizard` | `secretary@myk9t.com` | Desktop | At least one trial with date and event number | § 2 | `ready` |
| S-04 | Create Show wizard — Step 3 (class selection) | `/secretary/create-show/wizard` | `secretary@myk9t.com` | Desktop | Classes listed with judge assignment dropdowns | § 2 | `ready` |
| S-05 | Create Show wizard — Step 4 (review) | `/secretary/create-show/wizard` | `secretary@myk9t.com` | Desktop | Full review of show + trials + classes | § 2 | `ready` |
| S-06 | Show Workbench — Setup tab | `/shows/:showId` (Setup tab) | `secretary@myk9t.com` | Desktop | Show details visible; readiness signals | § 3 Show Setup | `ready` |
| S-07 | Entry Management — Pending tab | `/shows/:showId/entry-management` | `secretary@myk9t.com` | Desktop | At least one entry card in Pending tab | § 4 Entry Management | `ready` |
| S-08 | Entry Management — entry card with Accept / Reject / Waitlist actions visible | `/shows/:showId/entry-management` | `secretary@myk9t.com` | Desktop | Three-dot menu open on an entry card | § 4 | `ready` |
| S-09 | Entry Management — bulk select + action bar | `/shows/:showId/entry-management` | `secretary@myk9t.com` | Desktop | Two or more entries checked; sticky "Approve selected" bar visible | § 4 | `ready` |
| S-10 | Waitlist Management page | `/secretary/waitlist/:showId` | `secretary@myk9t.com` | Desktop | At least one waitlisted entry | § 4 | `blocked: seed` (needs a waitlisted entry) |
| S-11 | Message Center — compose form | `/secretary/messages` | `secretary@myk9t.com` | Desktop | New message compose panel open, show pre-selected | § 5 Communications | `ready` |
| S-12 | Reports page — Check-in Sheet selected | `/shows/:showId/reports` | `secretary@myk9t.com` | Desktop | Trial selector showing Heritage trial; Check-in Sheet selected | § 6 Reports | `ready` |
| S-13 | Reports page — Run Order preview | `/shows/:showId/reports` | `secretary@myk9t.com` | Desktop | Run Order report type selected; preview rendered | § 6 | `ready` |
| S-14 | Reports page — Armband Labels | `/shows/:showId/reports` | `secretary@myk9t.com` | Desktop | Armband Labels selected; preview visible | § 6 | `ready` |
| S-15 | Show Desk — Show Map with class rows | `/shows/:showId?phase=show-desk` | `secretary@myk9t.com` | Desktop | Show Map tab; at least one trial expanded with class rows | § 7 Show Desk | `ready` |
| S-16 | Show Desk — scratch / pull dialog | `/shows/:showId?phase=show-desk` | `secretary@myk9t.com` | Desktop | Scratch dialog open on an entry row | § 7 | `ready` |
| S-17 | Show Desk — move-up dialog | `/shows/:showId?phase=show-desk` | `secretary@myk9t.com` | Desktop | Move-up dialog open; target class picker visible | § 7 | `blocked: seed` (needs a move-up-requested entry) |
| S-18 | Show Desk — late entry dialog | `/shows/:showId?phase=show-desk` | `secretary@myk9t.com` | Desktop | Late Entry dialog open in Tools panel | § 7 | `ready` |
| S-19 | Show Desk — Tools panel side sheet | `/shows/:showId?phase=show-desk` | `secretary@myk9t.com` | Desktop | Tools panel open; Quick Broadcast, Access Codes, Tasks visible | § 7 | `ready` |
| S-20 | Results Control — all classes complete | `/shows/:showId/results-control` | `secretary@myk9t.com` | Desktop | Every class shows all entries with a result; no blank rows | § 8 Results Control | `blocked: seed` (needs a fully-scored show) |
| S-21 | Results Control — release toggle (Off → On) | `/shows/:showId/results-control` | `secretary@myk9t.com` | Desktop | Release Results toggle in Off position, ready to toggle | § 8 | `blocked: seed` (same as S-20) |
| S-22 | Submit Results — submission summary (preflight) | `/shows/:showId/submit-results` | `secretary@myk9t.com` | Desktop | Submission summary checklist showing entries ready count | § 9 Submit to AKC | `ready` |
| S-23 | Submit Results — XML download button | `/shows/:showId/submit-results` | `secretary@myk9t.com` | Desktop | "Download XML" button visible; no blocking warnings | § 9 | `ready` |
| S-24 | Submit Results — preflight warning (missing AKC numbers) | `/shows/:showId/submit-results` | `secretary@myk9t.com` | Desktop | Warning listing dogs without AKC registration numbers | § 9 | `blocked: seed` (needs dogs with null AKC numbers) |

---

## Part 2 — Exhibitor Guide Screenshots

| Shot ID | Description | Route | Account | Viewport | Expected state | Guide section | Status |
|---|---|---|---|---|---|---|---|
| E-01 | Shows list — upcoming shows with entry status badges | `/shows` | none (unauthenticated) | Desktop | At least one show with "Accepting Entries" badge; one with "Closing Soon" | § 1 Find a Show | `ready` |
| E-02 | Show detail page — hero with "Enter This Show" CTA | `/shows/:showId` | none | Desktop | Heritage show detail; "Enter This Show" button prominent | § 1 | `ready` |
| E-03 | Sign-up form | `/sign-up` | none | Desktop | Empty sign-up form | § 2 Create an Account | `ready` |
| E-04 | My Dogs page — at least one dog card | `/dogs` | `e2e-exhibitor@test.myk9.com` | Desktop | Dog list with at least one entry | § 3 Add a Dog | `ready` |
| E-05 | Add Dog form | `/dogs` (Add Dog dialog) | `e2e-exhibitor@test.myk9.com` | Desktop | Add Dog form open with required fields visible | § 3 | `ready` |
| E-06 | Registration wizard — Step 1 (class selection) | `/shows/:showId/register` | `e2e-exhibitor@test.myk9.com` | Desktop | Class selection step; dog chip visible at top; classes grouped by element/level | § 4 Enter a Show | `ready` |
| E-07 | Registration wizard — Step 2 (review + payment) | `/shows/:showId/register` | `e2e-exhibitor@test.myk9.com` | Desktop | Review step; dog, class, and fee visible; entry agreement | § 4 | `ready` |
| E-08 | Confirmation receipt | `/checkout/success` | `e2e-exhibitor@test.myk9.com` | Desktop | Success screen with entry confirmed | § 4 | `blocked: seed` (needs a Stripe checkout completion) |
| E-09 | My Entries — Pending tab with entry card | `/exhibitor/entries` | `e2e-exhibitor@test.myk9.com` | Mobile | At least one entry card in Pending status | § 5 Track Your Entry | `ready` |
| E-10 | My Entries — Accepted tab with entry card | `/exhibitor/entries` | `e2e-exhibitor@test.myk9.com` | Mobile | At least one entry card in Accepted status | § 5 | `ready` |
| E-11 | My Entries — show card (unexpanded) | `/exhibitor/entries` | `e2e-exhibitor@test.myk9.com` | Mobile | Show card with date, club, and entry status | § 5 | `ready` |
| E-12 | Show detail page — Classes tab with run order | `/shows/:showId` (Classes tab) | `e2e-exhibitor@test.myk9.com` | Mobile | Classes tab active; entry listed with armband number (if assigned) | § 6 View Run Order | `ready` |
| E-13 | My Entries — Show Today banner | `/exhibitor/entries` | `e2e-exhibitor@test.myk9.com` | Mobile | "Show Today" banner visible at top (requires a show scheduled for today's date) | § 7 Check In | `blocked: date` |
| E-14 | My Entries — entry card with "Not Checked In" button | `/exhibitor/entries` | `e2e-exhibitor@test.myk9.com` | Mobile | Entry card showing check-in button (check-in must be open on the class) | § 7 | `ready` |
| E-15 | My Entries — entry card "Checked In" state | `/exhibitor/entries` | `e2e-exhibitor@test.myk9.com` | Mobile | Entry card with green Checked In badge | § 7 | `blocked: seed` (needs checked-in entry) |
| E-16 | My Entries — Q result badge on entry card | `/exhibitor/entries` | `e2e-exhibitor@test.myk9.com` | Mobile | Entry card with Q result badge and placement pill visible | § 8 View Results | `blocked: seed` (needs scored + released class) |
| E-17 | Class results page — placement table | `/shows/:showId/trials/:trialId/classes/:classId/results` | `e2e-exhibitor@test.myk9.com` | Mobile | Full results table with placements, times, Q/NQ | § 8 | `blocked: seed` (same as E-16) |

---

## Part 3 — Judge and Steward Quickstart Screenshots

All shots in this section are **blocked by `unified_ringside_enabled` flag** — the flag is DEV-only as of 2026-06-19. Do not attempt these shots until the flag is promoted.

| Shot ID | Description | Route | Account | Viewport | Expected state | Quickstart section | Status |
|---|---|---|---|---|---|---|---|
| J-01 | SmartSignInPage — passcode entry field | `/at-show` | none (passcode flow) | Mobile | Passcode input visible; "Enter Passcode" CTA | § 1 Getting Access | `blocked: flag` |
| J-02 | At-show class list | `/at-show/:showId` | passcode or `judge@myk9t.com` | Tablet | All classes listed by trial; each row shows class name, entry count | § 2 Class List | `blocked: flag` |
| J-03 | At-show entry list (run order) | `/at-show/:showId/class/:classId` | passcode or `judge@myk9t.com` | Tablet | Entries in run order with armband numbers and dog names | § 3 Entry List | `blocked: flag` |
| J-04 | Scoresheet — timer active | `/at-show/:showId/class/:classId/score/:entryId` | `judge@myk9t.com` | Tablet | Timer counting; no result selected yet | § 4 Scoring | `blocked: flag` |
| J-05 | Scoresheet — Q/NQ/Absent buttons | same | `judge@myk9t.com` | Tablet | Q, NQ, and Absent buttons visible; timer stopped | § 4 | `blocked: flag` |
| J-06 | Entry list — saved result visible | `/at-show/:showId/class/:classId` | `judge@myk9t.com` | Tablet | Entry list showing at least one entry with a saved Q or NQ badge | § 4 | `blocked: flag` |

---

## Part 4 — Club Admin Guide Screenshots

| Shot ID | Description | Route | Account | Viewport | Expected state | Guide section | Status |
|---|---|---|---|---|---|---|---|
| C-01 | Club Admin sidebar + Club Settings form | Club settings page | `club@myk9t.com` | Desktop | Club name, AKC number, address, and contact fields visible | § 2 Club Profile | `ready` |
| C-02 | Club Admin → Shows list | Club admin shows page | `club@myk9t.com` | Desktop | Heritage show listed; secretary assignment visible | § 3 Show Access | `ready` |
| C-03 | Secretary assignment section | Club admin show detail | `club@myk9t.com` | Desktop | Secretary field with current assignment shown | § 3 | `ready` |
| C-04 | Club Admin → Payments — pre-onboarding | `/club-admin/payments` | `club@myk9t.com` | Desktop | "Set Up Payment Account" button; no Stripe account connected | § 4 Stripe Onboarding | `blocked: stripe` |
| C-05 | Club Admin → Payments — connected with payout history | `/club-admin/payments` | `club@myk9t.com` | Desktop | Stripe account connected; per-show payout table with gross/fee/net | § 5 Payout History | `blocked: stripe` |

---

## Part 5 — Diagram Assets

Diagram sources and exports live in `docs/diagrams/`. Each diagram is a separate `.drawio` source + `.svg` export. See `docs/diagrams/README.md` for the full candidate list and regeneration commands.

| Diagram | Serves | Status |
|---|---|---|
| `exhibitor-entry-flow.drawio` | Exhibitor Guide § 1–4; Overview Deck slide 10 | `qa-draft` — candidate |
| `entry-lifecycle.drawio` | Exhibitor Guide § 5; Secretary Guide § 4 | `qa-draft` — candidate |
| `secretary-setup-flow.drawio` | Overview Deck slide 5; Secretary Deck | `qa-draft` — candidate |
| `secretary-show-day-flow.drawio` | Overview Deck slide 8; Secretary Deck slides 5–6 | `qa-draft` — candidate |
| `payment-flow.drawio` | Club Admin Guide § 4–5; Overview Deck slides 14–15 | `blocked: stripe` |
| `at-show-access-paths.drawio` | Quickstart § 1; Overview Deck slide 12 | `blocked: flag` |
| `support-triage-flow.drawio` | Triage outline; investigation cookbook | `qa-draft` — candidate |

---

## Training Clips and Animated Captures

No animated captures or screen-recording clips are planned at this stage. The Phase 0 gate applies here too — clips churn as the UI changes. Flag as a Phase 6 follow-up when guide sections reach `verified` status.

---

## Shot List Maintenance

When a shot changes status:
1. Update the `Status` column here.
2. If a shot is no longer needed (workflow changed), mark it `deprecated` and note why.
3. Re-verify any shot older than 30 days before using in published materials — UI labels and workflows change.
4. Run the shot list against `pageDirectory.ts` routes to catch renamed or removed routes before screenshotting.
