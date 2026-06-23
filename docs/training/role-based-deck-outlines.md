# Role-Based Deck Outlines

**Status:** `drafted`

Short slide-deck outlines for role-specific onboarding and training sessions. Each deck runs 10–15 minutes. Where slides are reusable from `myk9show-overview-deck-outline.md`, that is noted — the overview deck is the source of truth; role decks pull slides from it, never duplicate.

No PowerPoint, PDF, or video assets are created here yet. These outlines are the planning layer.

**Leave-behind links** in each deck are placeholders until the docs site is live at `help.myk9show.com`. In the interim, use GitHub-rendered paths or email the guide as a PDF.

---

## Deck A — Secretary Onboarding

**Audience:** First-time trial secretaries; mySWT migrants; club members taking over a secretary role.
**Goal:** "I know how to create my show and run show day without asking anyone."
**Length:** ~10 slides, 10–15 minutes + Q&A.
**Context:** Use at a club meeting, secretary onboarding session, or one-on-one walkthrough.

### Slides

| # | Title | Key message | Screenshot | Source |
|---|---|---|---|---|
| 1 | Running your show on myK9Show | Opening frame — what this session covers | None | Unique |
| 2 | What this replaces | Spreadsheets → wizard; email entry forms → online entry; manual AKC report → XML download | None | Unique |
| 3 | Create a show in four steps | One wizard covers show details, trials, classes, and judges | S-02, S-04 | **Reuse:** Overview slide 6 |
| 4 | Entry Management | Approve, reject, waitlist, add mail-in entries | S-07, S-09 | **Reuse:** Overview slide 7 |
| 5 | The Show Desk | Everything on show day in one place | S-15, S-19 | **Reuse:** Overview slide 8 |
| 6 | Show Map — check-in, scratch, move-up | Row-level actions on every entry in the Show Map; no separate page to navigate | S-15, S-16, S-17 | Unique (extends slide 5) |
| 7 | Communications | Announce to all; message one exhibitor from entry card | S-11 (if captured) | Unique |
| 8 | Results + AKC submission | Verify → release → download XML → email to AKC | S-20, S-22 | **Reuse:** Overview slide 9 |
| 9 | When something goes wrong | Support path: docs site, show-day triage runbook, escalation | None | Unique |
| 10 | Leave-behind links | Bookmark list | None | Unique |

### Leave-Behind Links

| Resource | Link |
|---|---|
| Secretary Guide | `docs/user-guides/secretary-guide.md` |
| KB: create-a-show | (target article) |
| KB: approve-entries | (target article) |
| KB: handle-a-scratch | (target article) |
| KB: handle-move-up | (target article) |
| Show-day triage runbook | `docs/support/show-day-triage-outline.md` |
| Support contact | [placeholder] |

### Slides shared with Overview Deck

Slides 3, 4, 5, 8 are direct reuses of Overview slides 6, 7, 8, 9. Keep in sync when the overview deck is updated.

---

## Deck B — Exhibitor Onboarding

**Audience:** Dog sport exhibitors entering online for the first time; club members explaining the process to their exhibitors.
**Goal:** "I entered a show, know what the status means, and know what to do on show day."
**Length:** ~8 slides, 10 minutes.
**Context:** Use at a club meeting, pre-show exhibitor Q&A, or as a companion to the exhibitor guide.

### Slides

| # | Title | Key message | Screenshot | Source |
|---|---|---|---|---|
| 1 | Entering a show online | Opening frame | None | Unique |
| 2 | What you need to start | Two things: an account + a dog profile | E-04, E-05 | Unique |
| 3 | Find a show → enter online | Browse shows (no account needed) → wizard → pay by card | E-01, E-06, E-08 | **Reuse:** Overview slide 10 |
| 4 | Your entry status | Pending → Accepted → Waitlisted — what each means and when it changes | E-09, E-10 | Unique |
| 5 | Getting ready for show day | Run order in Classes tab; Show Today banner; check-in | E-12, E-14 | **Reuse:** Overview slide 11 |
| 6 | Your results | Q/NQ badge and placement appear after the secretary releases results | E-16 | Unique |
| 7 | Getting help | What to do if your entry isn't showing, payment issue, or need to withdraw | None | Unique |
| 8 | Leave-behind links | Bookmark list | None | Unique |

### Leave-Behind Links

| Resource | Link |
|---|---|
| Exhibitor Guide | `docs/user-guides/exhibitor-guide.md` |
| KB: enter-a-show | (target article) |
| KB: entry-status | (target article) |
| KB: find-run-order | (target article) |
| KB: check-in | (target article) |
| KB: view-results | (target article) |
| Support contact | [placeholder] |

### Slides shared with Overview Deck

Slides 3 and 5 are direct reuses of Overview slides 10 and 11.

---

## Deck C — Club and Treasurer Setup

**Audience:** Club presidents, treasurers, and any club member who controls the club's bank account or payment account.
**Goal:** "I set up our Stripe account, understand when we get paid, and know the difference between a Stripe request and a myK9Show request."
**Length:** ~8 slides, 10 minutes + Q&A.
**Context:** Use at initial club onboarding; also useful as a leave-behind after Stripe questions.

**Important:** The Stripe payment screenshots are blocked until a sandbox walkthrough is captured. Do not use production account screenshots. See `screenshot-shot-list.md` shots C-04, C-05.

### Slides

| # | Title | Key message | Screenshot | Source |
|---|---|---|---|---|
| 1 | Getting your club paid | Opening frame | None | Unique |
| 2 | What myK9Show does / what Stripe does | The boundary table — this is the most important slide | None (table slide) | Unique |
| 3 | Setting up your payment account | Stripe Express onboarding from the Club Admin Payments page | C-04 (blocked) | Unique |
| 4 | Why Stripe contacts you directly | Legal identity verification — not a myK9Show request | None | Unique |
| 5 | When you get paid | Payout timing: 2–7 business days after show window closes | C-05 (blocked) | **Overlaps** Overview slides 14–15 (different frame) |
| 6 | How to read your payout history | Per-show gross, platform fee, net payout, transfer status | C-05 (blocked) | Unique |
| 7 | Common treasurer questions | SSN, bank account change, under review, refund impact on payout | None | Unique |
| 8 | Leave-behind links | Bookmark list | None | Unique |

### What myK9Show Does / What Stripe Does (Slide 2)

This slide is unique to the Club deck. It answers the #1 club question: "Why is Stripe contacting us?" Use a two-column table:

| myK9Show does | Stripe does |
|---|---|
| Hosts the show | Processes the card payment |
| Shows the fee | Holds the money |
| Calculates the payout | Deposits to the club's bank |
| Shows payout history | Sends identity verification emails |

### Leave-Behind Links

| Resource | Link |
|---|---|
| Club Admin & Treasurer Guide | `docs/user-guides/club-admin-guide.md` |
| Stripe Treasurer Guide (full steps) | `docs/operations/stripe-treasurer-guide.md` |
| KB: stripe-onboarding | (target article) |
| KB: payout-timing | (target article) |
| KB: stripe-under-review | (target article) |
| KB: platform-fee | (target article) |
| Support contact | [placeholder] |

### Slides shared with Overview Deck

Slides 5–6 content overlaps with Overview slides 14–15 but frames the information from the club/treasurer perspective rather than the platform perspective. They are separate slides, not direct reuses.

---

## Deck D — Judge and Steward Show-Day

**Audience:** Guest judges, gate stewards, and ringside volunteers — no prior app experience assumed.
**Goal:** "Get to the right ring, score a dog, know what to do if the tablet loses signal."
**Length:** ~8 slides, 10 minutes.
**Context:** Use at a pre-show judge/steward briefing; the printable `judge-steward-quickstart.md` is the one-page leave-behind for ringside (planned; ready to capture once staging redeploys).

**Screenshots are no longer flag-blocked** — they can be captured against staging once the removal PR redeploys. (Updated 2026-06-23: `unified_ringside_enabled` flag removed — see [`../plan-remove-unified-ringside-flag.md`](../plan-remove-unified-ringside-flag.md). The at-show surface now renders for every show.) Use numbered steps as slide content until the shots land.

### Slides

| # | Title | Key message | Screenshot | Source |
|---|---|---|---|---|
| 1 | At the ring — Judge & Steward | Opening frame | None | Unique |
| 2 | Two ways in | Staff account or passcode — passcode needs no account | J-01 (blocked) | **Reuse:** Overview slide 12 content |
| 3 | How to get the passcode | Secretary generates from Show Desk → Tools → Show Access Codes → share QR or text | J-01 (blocked) | Unique |
| 4 | Your class list | All trials and classes for today's show | J-02 (blocked) | Unique |
| 5 | The entry list | Run order: dog name, armband, handler | J-03 (blocked) | Unique |
| 6 | Scoring a dog | Timer → Q or NQ → Save (five taps) | J-04, J-05 (blocked) | Unique |
| 7 | When you lose signal | "Offline ready" = expected; scores save locally and sync on reconnect; don't refresh | None | **Reuse:** Overview slide 13 content |
| 8 | Leave-behind links | Bookmark list + the one-page quickstart | None | Unique |

### Leave-Behind Links

| Resource | Link |
|---|---|
| Ringside Quickstart (printable) | `docs/user-guides/judge-steward-quickstart.md` (planned) |
| KB: (TBD — from quickstart outline friction findings) | |
| Secretary: Share Show Access Codes | Show Desk → Tools panel → Show Access Codes |
| Support contact | [placeholder] |

### Slides shared with Overview Deck

Slides 2 and 7 content derives from Overview slides 12 and 13 but is simplified and audience-adapted for non-technical ringside volunteers.

### Capture Reminder

No longer flag-blocked — the final Judge/Steward Deck can be produced once the at-show screenshots are captured against staging post-redeploy. (Updated 2026-06-23: `unified_ringside_enabled` flag removed — see [`../plan-remove-unified-ringside-flag.md`](../plan-remove-unified-ringside-flag.md).) The quickstart outline (`judge-steward-quickstart-outline.md`) carries the same updated notice.

---

## Cross-Deck Shot Reuse Summary

| Shot | Used in decks |
|---|---|
| S-02, S-04 | Overview, Secretary |
| S-07, S-09 | Overview, Secretary |
| S-15, S-16, S-17, S-19 | Overview, Secretary |
| S-20, S-22 | Overview, Secretary |
| S-11 | Secretary |
| E-01, E-06, E-08 | Overview, Exhibitor |
| E-04, E-05 | Exhibitor |
| E-09, E-10, E-12, E-14, E-16 | Exhibitor |
| C-04, C-05 | Club/Treasurer (blocked) |
| J-01–J-06 | Overview, Judge/Steward (all blocked) |
