# Plan: UX Journey Audit — Phase 6 (Remediation Verification & Golden-Path Sign-off)

> **Status:** Active

**Date opened:** 2026-06-15
**Parent plan:** [`plan-ux-journey-audit.md`](plan-ux-journey-audit.md) (Phase 6)
**Synthesis source:** [`audits/2026-06-ux-journeys/SUMMARY.md`](audits/2026-06-ux-journeys/SUMMARY.md)
**Launch contract:** [`goals/fall-2026-launch-readiness-scorecard.md`](goals/fall-2026-launch-readiness-scorecard.md)
**Intent targets:** Exhibitor — "This respects my time"; Trial Secretary — "That was easy"

## What this phase is

The remediation *code* from Waves 1–4 has merged (#732–#735, #737, #739, #741, #759, #763).
Phase 6 is the audit's **exit criterion**, and at this point it is mostly **verification +
measurement + sign-off**, not new feature work:

- **Re-walk** both golden paths in a real browser to confirm the merged fixes clear the path
  end to end.
- **Re-measure** time-to-task — the audit's stated success metric is the *delta*, not a finding
  count.
- **Flip the scorecard rows** from their current status to the earned one, with evidence
  (the scorecard requires evidence; "If evidence does not exist, the status should remain
  Yellow or Unknown").
- Close the **2 leftover measurement findings** that were always Phase 6 work.

## Starting status (from SUMMARY launch-gate, 2026-06-14)

| Golden path | Status | Blocker at synthesis |
| --- | --- | --- |
| Exhibitor | Red | `UX-P1-01` (accepting show had no classes) blocked enter→pay→confirm |
| Secretary | Yellow | Wrong-route recovery, closeout submit safety, stale counts, raw labels |
| Cross-role seams | Red | Post-deadline pull/scratch, direct messages, refund/withdraw disagreement; live latency unverified |

`UX-P1-01` is now data-unblocked (the tested show has classes), so the exhibitor path is the
highest-value Red→Yellow/Green candidate and is walked first.

## Finding / task list

### A. Open measurement findings (`OPEN-TODOS.md`)
- **UX-P2 — Re-run day-of announcement baseline** from the Message Center (announcements moved
  there from the workbench). Measure time-to-task from the canonical entry point.
- **UX-P2 — Seed a pending move-up request** so the secretary move-up *decision* workflow can be
  walked (Phase 3 only observed the empty state).

### B. Exhibitor golden-path re-walk (scorecard, 8 steps)
Confirm in-browser that the merged fixes clear the path, and capture time-to-task:
- P1-01 (classes seeded), P2-04 (See classes), P2-05 (Browse Shows on mobile + desktop),
  P2-01 (pay/retry path), P2-02 (history labels), P2-03/06 (at-show menu + offline badge),
  P2-12/P3-01/02 (results clarity).
- **Target:** flip Exhibitor row Red → Yellow/Green (Green needs the seam evidence in D).

### C. Secretary golden-path re-walk (scorecard, 11 steps)
Confirm: P1-05 (legacy route), P1-06 (AKC submit gating), P2-07 (attention count), P2-08
(sidebar), P2-09 (report labels), UX-Low (pull/scratch vocabulary). Absorbs the two measurement
findings (announcement baseline = step 4/5; seeded move-up = step 4).
- **Target:** flip Secretary row Yellow → Green.

### D. Cross-role seams — partially deferred
State-agreement + write-safety are already proven by the Phase 4 fixture harness (#756). The
**live latency** question ("does role B see it without a refresh") is **deferred** pending a
read-strategy decision (A: IndexedDB seeding / B: local Supabase). Until then the seams dimension
stays Yellow/Red on real-time evidence.

### E. Synthesis update
Record the time-to-task deltas in `SUMMARY.md`; update the three launch-gate rows and the
scorecard's Secretary/Exhibitor rows with evidence links.

## Suggested execution order

| # | Step | Why this order | Blocked? |
| --- | --- | --- | --- |
| 1 | Seed the move-up fixture (measurement finding) | Prereq for the secretary show-day re-walk step 4 | Decide local vs approved-staging seed first |
| 2 | **Exhibitor re-walk + time-to-task** (B) | Highest-stakes path; now data-unblocked; independent of secretary | No |
| 3 | Secretary re-walk + announcement baseline (C + measurement) | Absorbs both measurement findings; needs step 1's fixture | Needs step 1 |
| 4 | Decide seam live-walk strategy (D) | The one genuinely deferred item; gates the seams dimension | User decision (A / B / accept harness evidence) |
| 5 | Update SUMMARY + scorecard rows (E) | Consumes evidence from 2–4 | Needs 2–4 |

**Started:** Step 2 (exhibitor re-walk) — unblocked, highest value, and the merged fixes most
need browser confirmation.

## Step 2 re-walk results (2026-06-15)

Walked as `exhibitor1@myk9t.com` against staging; discovery checked logged-out.

| Step | Finding | Status |
| --- | --- | --- |
| 1 · Discovery (P2-05) | "Browse shows" → `/shows`, visible logged-out at desktop **and** mobile, outside `.l-hdr-nav` | ✅ Confirmed |
| 2 · Understand fit (P2-04) | "See classes" exists on `ShowDetailsPage`, but published-experience shows render a styled landing (e.g. MonogramLandingPage) with no per-class detail / See classes link | ⚠️ New finding (P2-04-EXP) |
| 3 · Enter classes (P1-01) | Seeded 32 classes; wizard shows all 4 trials × Container/Interior × Novice–Master @ $30; reached class selection | ✅ Resolved end-to-end |
| 4 · Pay | Payment step: "Container Novice A $30.00 · Total Due $30.00 · Credit/Debit Card"; did **not** submit (would create a real entry/charge) | ✅ Confirmed to payment |
| 5–8 · Confirm/results | Require a completed entry; not walked this pass | ⏳ Pending |

**Fixes applied this pass:**
- **P1-01 (data):** the prior "already 32 classes, no write made" note was a mis-query — both anon and the authenticated secretary saw 0 classes for Monogram, and it was the only show with an open entry window. User-approved staging seed inserted 32 classes (HTTP 201; UI badge "Classes 32"); full enter→pay verified.
- **NoClassesAlert recovery (code):** [PR #767](https://github.com/rbeezley/myk9-platform/pull/767) — entrants get "contact the organizer", organizers get "add classes in show management"; +2 tests; typecheck/lint green.

**New finding P2-04-EXP** (styled-landing class fit): published-experience shows route entrants to a bespoke styled landing (8 styles, each its own `use<Style>LandingData` + themed `ParticularsSection`; no shared builder) that omits the class/level summary the "See classes" fix added to `ShowDetailsPage`. Duplication answer: no new surface — link to the existing public trial details page. **Fixed in [PR #768](https://github.com/rbeezley/myk9-platform/pull/768):** shared `SeeClassesLink` next to the primary CTA on all 8 styled landings, pointing at `/shows/:id/trials/:trialId` via a `publicClassesHref` helper (review catch: the registration wizard is auth-gated and would redirect signed-out visitors to `/sign-in`). +7 tests.

## PRs in flight

| PR | Scope | Verification |
| --- | --- | --- |
| [#767](https://github.com/rbeezley/myk9-platform/pull/767) | `NoClassesAlert` recovery path (empty class step) | 16 tests, typecheck 24/24, lint |
| [#768](https://github.com/rbeezley/myk9-platform/pull/768) | `SeeClassesLink` → public trial page on all 8 styled landings (P2-04-EXP; review-fixed twice: off the auth-gated wizard, then off the guest-empty replication store via `getTrialsByShow` direct read) | 10 + 21 regression tests, typecheck 24/24, lint |
| docs → `main` (`e1283174a`) | Plan doc, SUMMARY + scorecard Exhibitor → Yellow, OPEN-TODOS | n/a (docs) |

**Launch-gate movement:** Exhibitor Red → **Yellow** (enter→pay walkable; Green pending confirmation/results leg + P2-04-EXP).

## Confirmation/results leg re-walk (2026-06-16)

Walked steps 5–8 as `exhibitor1` against `/my-entries`.

| Step | Finding | Status |
| --- | --- | --- |
| 5 · Confirmation + show-day updates | Past, never-completed entries correctly show **historical** badges ("Review incomplete" / "Payment unresolved" via the `isPastShow`-aware `myEntriesUtils` badges) instead of the actionable "Pending Review" / "Payment Due"; `getContextualStatusMessage` + status stepper coherent | ✅ Coherent, no defects |
| 6 · Where/when | Trial + date + judge surfaced on the card | ✅ Present |
| 7 · Check-in / scratch / move-up | Check-in status ("Not Checked In" / "✓ Checked In") shown; post-deadline scratch/contact via "Message the show team" (`/messages/:showId`) | ✅ Present |
| 8 · View results | **VERIFIED** — approved seed scored exhibitor1's Heritage entry (`is_scored`, `result_status='qualified'`, `scoring_completed_at`) + released class `91de30d7` (`results_released_at`, `is_scoring_finalized`); My Entries renders the **"Q"** result badge for the exhibitor | ✅ Verified (seeded) |

**Correction to my own process:** I initially suspected a status-coherence contradiction (a "Paid date + Payment unresolved" card), but that was a misread of flattened `innerText` — the "6/3/2026" was the show date, and the badges are the intended historical labels. Lesson: for status-coherence claims, read the render logic / discrete DOM nodes, not the text blob.

**Minor (non-blocking) observations:** `canFinishPayment` isn't gated on past shows (defensible — accepted-but-unpaid entries still owe); the My Entries filter tabs mix a status axis (Pending/Accepted/Waitlist) with a time axis (Upcoming/Completed), so one entry can match both "Pending" and "Completed".

**Result:** Exhibitor golden-path **steps 1–8 all verified walkable.** Step 8 closed via an approved staging seed (scored + released exhibitor1's Heritage Container Novice A → "Q" badge renders). P1-01/P1-02/P1-03 cleared. **Residual for full Green: `P1-04`** (refund/withdrawn entry state agreement across exhibitor/secretary surfaces) — needs a refunded entry, deferred to the cross-role seam-walk. Also clear the minor "Unknown" message-sender label on `/messages/:showId`.

## Two decisions that shape the rest

1. **Seed approach** for the move-up fixture (step 1) and any mutating walk — local fixtures vs an
   approved scoped staging seed.
2. **Seam live-latency** (step 4) — pick read strategy A/B, or accept the harness's unit-proven
   state-agreement as sufficient for fall and leave real-time latency a documented post-launch check.

## Testing / evidence per step

- Each re-walk produces screenshots + a click/screen/seconds time-to-task note recorded in
  `SUMMARY.md`.
- Any bug surfaced during a walk is fixed at root with a committed Playwright spec (per the parent
  plan's Phase 6 rule) before the row can go Green.
- INTENT regression: preserve every `// INTENT:` behavior touched during remediation.

## Exit criterion

Both golden-path scorecard rows carry an earned status backed by linked evidence, the two
measurement findings are closed, and the seam live-latency decision is recorded (resolved or
explicitly deferred to post-launch).
