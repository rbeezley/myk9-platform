# myK9Show Overview Deck Outline

**Status:** `drafted`

**Audience:** Club decision-makers (presidents, treasurers), trial secretaries attending a demo, early support users being onboarded.

**Format:** ~18 slides, ~30-minute session. No PowerPoint file yet — this is the slide-by-slide outline only. Create the actual deck after the Phase 0 readiness gate passes and role guides reach `verified` status.

**Shot list:** Screenshots marked 🖼️ below are planned shots. Route, account, and viewport are listed when the shot is ready; blocked shots note the gate. Full shot list: `screenshot-shot-list.md`.

**Role-based variants:** Shorter role-specific versions of this deck live in `role-based-deck-outlines.md`. Several slides can be shared directly.

---

## Slide 1 — Title

**Title:** myK9Show
**Subtitle:** Online show management — from entry to AKC submission
**Speaker notes:** Introduce the platform and frame what the next 30 minutes will demonstrate: a complete show running end-to-end, no paper.

---

## Slide 2 — The Problem Today

**Title:** How shows run today
**Key message:** Paper entry forms, manual check-depositing, spreadsheet management, and hand-assembled AKC submissions are the current standard for most AKC Scent Work clubs.
**Talking points:**
- Entries arrive by email and postal mail; secretaries transcribe them manually
- Entry fees require check-depositing; cash at the gate risks miscount
- Run orders and check-in sheets are built in spreadsheets
- AKC submission requires manually assembling results from paper scoresheets
- Exhibitors have no visibility into their entry status between submission and show day

*Screenshot:* None — this slide sets up the problem.

---

## Slide 3 — What myK9Show Does

**Title:** One platform — entry to submission
**Key message:** myK9Show replaces the paper stack with a single online system that handles exhibitor entry, show-day operations, scoring, and AKC electronic submission.
**Talking points:**
- Online entry and Stripe payment — no paper forms, no check-depositing
- Secretary dashboard for managing entries, communications, and show day
- Show Desk for real-time check-in, scratches, and move-ups
- Electronic AKC XML results submission generated from scored data

*Screenshot:* None.

---

## Slide 4 — Three Roles, One System

**Title:** Three roles, one platform
**Key message:** Secretaries, exhibitors, and ringside volunteers all access the same platform — no separate tools for different parts of the show.
**Talking points:**
- **Secretary** — set up shows, manage entries, run show day, submit results
- **Exhibitor** — browse shows, enter and pay online, track status, see results
- **Ringside** — judge and steward access via passcode (no account required), offline-first scoring

*Screenshot:* None. Candidate diagram: `at-show-access-paths.drawio` (blocked — see below).

---

## Slide 5 — A Show in Three Phases

**Title:** A show in three phases
**Key message:** Every show moves through Setup → Show Day → Closeout. The secretary's dashboard guides them through each phase.
**Talking points:**
- **Setup:** Create the show, configure trials and classes, assign judges, open the entry window
- **Show Day:** Check-in, scratch, move-up, ringside scoring, announcements
- **Closeout:** Release results, submit to AKC, generate judge and secretary reports

*Screenshot:* None. Candidate diagrams: `secretary-setup-flow.drawio` and `secretary-show-day-flow.drawio` once stable.

---

## Slide 6 — Secretary: Create a Show

**Title:** Create a show in four steps
**Key message:** The wizard handles show details, trials, classes, and judges in one flow — no separate configuration pages.
**Talking points:**
- Step 1: Show name, sanctioning org (AKC / UKC / Other), dates, entry fee, entry open/close window
- Step 2: Add trials with date, time, and AKC event number
- Step 3: Select classes per trial and assign a judge to each
- Step 4: Review and publish — show goes live and accepting entries immediately

🖼️ **Screenshots needed:** Wizard Step 1 (shot S-02), Step 3 class selection (shot S-04).
**Account:** `secretary@myk9t.com` | **Viewport:** 1280 × 800

*Reused in:* Secretary Onboarding Deck (slide 3)

---

## Slide 7 — Secretary: Entry Management

**Title:** Approve entries — or add them manually
**Key message:** Online entries arrive ready to review. One click to approve; bulk-select for batches. Mail-in and walk-in entries can be added manually with payment recorded.
**Talking points:**
- Pending tab shows all entries awaiting decision
- Approve, reject, or waitlist in one click (or bulk-select for mass approval)
- Add a mail-in entry: find exhibitor, pick class, enter check number
- Waitlist moves to offer a spot when someone scratches

🖼️ **Screenshots needed:** Entry Management Pending tab (shot S-07), bulk action bar (shot S-09).
**Account:** `secretary@myk9t.com` | **Viewport:** 1280 × 800

*Reused in:* Secretary Onboarding Deck (slide 4)

---

## Slide 8 — Secretary: Show Desk

**Title:** Show Desk — everything on show day in one place
**Key message:** The Show Desk replaces the secretary's clipboard: check-in, scratch, move-up, late entries, and announcements are all accessible from one screen.
**Talking points:**
- Show Map: hierarchical view of trials → classes → entries
- Tap any entry: check in, scratch, or move up from the row actions
- Tools panel side sheet: announcements, access codes, incident log, late entry
- Guided next-action card at the top tells you what needs attention

🖼️ **Screenshots needed:** Show Map with class rows (shot S-15), Tools panel (shot S-19).
**Account:** `secretary@myk9t.com` | **Show:** Heritage Scent Work (seeded) | **Viewport:** 1280 × 800

*Reused in:* Secretary Onboarding Deck (slide 5)

---

## Slide 9 — Secretary: Results and AKC Submission

**Title:** Results control + AKC submission
**Key message:** The secretary verifies results in Results Control, releases them to exhibitors with a toggle, and downloads the AKC XML file — no manual data entry.
**Talking points:**
- Results Control: every class must show all entries scored (no blanks) before release
- Release Results toggle → exhibitors see Q/NQ, placement, and time immediately
- AKC XML generated automatically from scored data, with a preflight for missing registration numbers
- Email the XML to `eresults@akc.org` — no manual AKC report to build

🖼️ **Screenshots needed:** Results Control page (shot S-20), Submit Results preflight summary (shot S-22).
**Account:** `secretary@myk9t.com` | **Viewport:** 1280 × 800

*Reused in:* Secretary Onboarding Deck (slide 8)

---

## Slide 10 — Exhibitor: Enter Online

**Title:** Exhibitor self-service — no more paper forms
**Key message:** An exhibitor finds a show, creates an account, adds their dog, and enters in a few minutes — and pays by card through Stripe.
**Talking points:**
- Browse shows at myK9Show.com — no account needed to look
- "Enter This Show" → registration wizard (select class, review, pay)
- Confirmation receipt immediately; entry status visible in My Shows
- Exhibitor knows they're in before the secretary even reviews the entry

🖼️ **Screenshots needed:** Shows list (shot E-01), Registration wizard Step 1 (shot E-06), Confirmation receipt (shot E-08).
**Account:** `e2e-exhibitor@test.myk9.com` | **Viewport:** 1280 × 800

*Reused in:* Exhibitor Onboarding Deck (slides 3–4)

---

## Slide 11 — Exhibitor: Show Day

**Title:** Exhibitors on show day
**Key message:** The exhibitor sees when and where they run, checks themselves in, and reads their results — without calling the secretary.
**Talking points:**
- "Show Today" banner on My Shows links directly to their entries for that show
- Run order and armband visible in the show detail Classes tab once the secretary publishes it
- Check-in button on the entry card (enabled class-by-class by the secretary)
- Results appear as Q/NQ + placement as soon as the secretary releases them

🖼️ **Screenshots needed:** My Entries show-card → Classes tab with run order (shot E-12), Check-in button (shot E-14).
**Account:** `e2e-exhibitor@test.myk9.com` | **Viewport:** 390 × 844 (mobile — this is where exhibitors live on show day)

*Reused in:* Exhibitor Onboarding Deck (slide 5)

---

## Slide 12 — At the Ring: Judge and Steward

**Title:** At the ring — offline-first, passcode access
**Key message:** Judges and stewards enter via show passcode (no account required) and score dogs on a phone or tablet — even without signal.
**Talking points:**
- Secretary generates and shares the passcode from Show Desk → Tools → Show Access Codes
- Judge or steward scans QR code or types the passcode → instant ringside access
- Class list → entry list in run order → tap to open scoresheet → timer → Q/NQ → Save
- Scores go to the secretary's results view when signal returns

🖼️ **Screenshots needed:** J-01 through J-06 — no longer flag-blocked; capturable against staging once the removal PR redeploys. (Updated 2026-06-23: `unified_ringside_enabled` flag removed — see [`../archive/plan-remove-unified-ringside-flag.md`](../archive/plan-remove-unified-ringside-flag.md).) Use diagram `at-show-access-paths.drawio` as placeholder until shots land.

*Reused in:* Judge/Steward Deck (slides 2–5)

---

## Slide 13 — Show-Day Reliability

**Title:** It works at the venue
**Key message:** Dog show venues have spotty signal. myK9Show is built offline-first — the whole platform continues working without internet and syncs when connection restores.
**Talking points:**
- Scoring, check-in, and Show Map all continue offline
- "Offline ready" indicator (expected behavior, not an error)
- All actions queue locally and sync automatically when connection returns
- Conflict resolution built in — two people editing the same entry get a clear resolution prompt

*Screenshot:* None. (Live demo of an offline state is impractical in a presentation.)

---

## Slide 14 — Payments: How Clubs Get Paid

**Title:** Stripe Express — exhibitors pay online, clubs get a payout
**Key message:** Exhibitors pay by card at entry checkout; Stripe holds the funds and pays them out to the club's bank account after the show closes.
**Talking points:**
- Club connects their bank account via Stripe Express (one-time setup, ~10 minutes)
- Stripe collects from exhibitors at entry; no manual invoicing or check-depositing
- After the show window closes, Stripe initiates a payout (typically 2–7 business days)
- Club sees per-show gross, platform fee, and net payout on the Payments page

🖼️ **Screenshots needed:** Payments page connected state with payout history (shot C-05). **Blocked** — needs sandbox Stripe onboarding walkthrough.

---

## Slide 15 — Platform Fee

**Title:** What it costs
**Key message:** A platform fee per entry is deducted from the payout. Stripe's standard card-processing fee is separate. No monthly subscription during the launch period.
**Talking points:**
- Platform fee per entry: [amount TBD — confirm before presenting]
- Stripe standard processing fee: ~2.9% + $0.30 per transaction (Stripe's rate, not ours)
- No monthly subscription during the launch period
- Club sees the full breakdown per show before payout is initiated

*Screenshot:* Payments page payout breakdown — **blocked** until sandbox walkthrough.

---

## Slide 16 — Support Model

**Title:** Getting help
**Key message:** Support is link-forward: most questions have a published answer. A one-person support team can answer common questions in under a minute by sending a link.
**Talking points:**
- Docs site at `help.myk9show.com` (planned): secretary guide, exhibitor guide, KB articles
- Support macros for common questions — reusable reply snippets
- Show-day triage runbook: prioritized steps for live incidents
- Engineering escalation path for issues the docs can't resolve

*Screenshot:* None. (Docs site not live yet.)

---

## Slide 17 — Fall 2026 Launch Readiness

**Title:** Where we are
**Key message:** Secretary and exhibitor workflows are confirmed green. Remaining gates are real-user testing, Club Admin polish, and the at-show ringside surface.
**Talking points:**
- Secretary + exhibitor golden paths: **Green** (June 2026)
- 9,000+ tests, shuffle-clean, full CI/CD pipeline with required checks
- Offline reliability tested end-to-end; conflict resolution proven
- At-show judge/steward surface: feature-complete, pending flag promotion to production
- Stripe: configuration complete, live-mode activation pending first club

*Note:* Trim or remove this slide for external club presentations; it is internal context.

---

## Slide 18 — After This Demo

**Title:** Leave-behind links
**Key message:** Everything discussed in this session has a written guide. Here is what to bookmark.

| Resource | Link |
|---|---|
| Secretary Guide | `docs/user-guides/secretary-guide.md` (interim: GitHub-rendered) |
| Exhibitor Guide | `docs/user-guides/exhibitor-guide.md` |
| Club Admin & Treasurer Guide | `docs/user-guides/club-admin-guide.md` |
| Ringside Quickstart | `docs/user-guides/judge-steward-quickstart.md` |
| KB: top 3 for secretaries | create-a-show · approve-entries · handle-a-scratch |
| KB: top 3 for exhibitors | enter-a-show · entry-status · find-run-order |
| Support contact | [placeholder — email or contact page] |

*Update all links when the docs site is live at `help.myk9show.com`.*

---

## Shot List Summary (this deck)

| Shot ID | Slide | Description | Status |
|---|---|---|---|
| S-02 | 6 | Wizard Step 1 (details) | ready |
| S-04 | 6 | Wizard Step 3 (class selection) | ready |
| S-07 | 7 | Entry Management Pending tab | ready |
| S-09 | 7 | Bulk select + approve action | ready |
| S-15 | 8 | Show Desk — Show Map with class rows | ready |
| S-19 | 8 | Show Desk — Tools panel | ready |
| S-20 | 9 | Results Control — all classes complete | ready |
| S-22 | 9 | Submit Results — preflight summary | ready |
| E-01 | 10 | Shows list with entry status badges | ready |
| E-06 | 10 | Registration wizard Step 1 | ready |
| E-08 | 10 | Confirmation receipt | ready |
| E-12 | 11 | My Entries → Classes tab with run order | ready |
| E-14 | 11 | My Entries — check-in button | ready |
| J-01–J-06 | 12 | At-show passcode + scoring flow | ready to capture (flag removed 2026-06-23; capture after staging redeploy) |
| C-05 | 14–15 | Payments — connected state with payout history | **blocked: Stripe sandbox walkthrough** |
