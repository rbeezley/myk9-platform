# Exhibitor Golden Path Checklist

## Phase 2.5 Testing — myK9Show (exhibitor journey)

**Tester:** _____________________ **Date:** _____________ **URL:** localhost:5173

**Instructions:** Walk every step in order. Check the box when the step completes
without a blocker. Log any issue in the Issue Log — include expected vs. actual.
Bring the log back to Claude to triage and fix.

**Last updated:** 2026-06-02 — first authored during the initial exhibitor walk.
Parallel to `secretary-golden-path-checklist.md`. Seed data + credentials in
`docs/testing/exhibitor-walk-seed.md`.

**Status legend:** ✅ walked & passing · 🔧 bug found + fixed this session ·
🐞 bug found, still open · ⬜ not yet walked

---

## Pre-Flight

### Environment
- [ ] `pnpm dev:show` running at localhost:5173 (use `preview_start` / launch.json `myK9Show`)
- [ ] Signed in as **exhibitor1@myk9t.com** / `TestPass4567!`
- [ ] App loads with no console errors

**Note:** the dev server points at the shared staging Supabase
(`sojmvhhwsjxmfistvzbe`). Entering a show writes real rows. Use timestamped data
and clean up extras; leave one entry behind.

---

## Part 1 — Sign In (unified SmartSignInPage) ✅

- [x] Open `/sign-in` — single "Email or show passcode" field
- [x] Enter exhibitor email → **Continue** → password step appears with **Edit** affordance
- [x] Enter password → **Sign in** → lands on `/exhibitor/entries`

**Result:** ✅ Email classifier correctly routes a known email to the password step.

---

## Part 2 — Exhibitor Dashboard / My Entries ✅ 🔧

`/exhibitor/entries` is the landing page (HomeRedirect sends authed exhibitors here).

- [x] Greeting + "Enter a Show" CTA render
- [x] **Show today** banner renders for a show running today (Heritage), "At the show" → `/at-show/:id`
- [x] Summary cards: Active Entries / Upcoming Shows / Past Shows / Dogs Registered
- [x] Stat grid: Total Entries / Accepted / Needs Action / Past Shows / Total Fees
- [x] My Dogs strip + My Entries list with status tabs (All / Pending / Accepted / Waitlist / Upcoming / Completed)

**🔧 BUG-EX-01 [P1] — summary counts wrong (was OPEN-TODOS todo #6). FIXED.**
Counts showed "0 Upcoming Shows / 6 Past Shows" while the Show Today banner showed
a current show. Two root causes: (a) "Shows" cards counted *entries*, not distinct
*shows*; (b) "past" used a live-timestamp compare on `start_date` only, so a
multi-day show running *today* was bucketed past and never upcoming; plus two
parallel derivations (`statistics` vs `entryStats`) drifted (`>` vs `>=`).
Fix: single date-range-aware, distinct-show helper
(`MyEntriesPage/modules/myEntriesStats.helpers.ts`). Now: 2 Active / 2 Upcoming /
2 Past, dynamically correct. Unit tests added.

**🔧 BUG-EX-02 [Minor] — "First class 8:00 AM AM" doubled meridiem. FIXED.**
`ShowTodayBanner` `formatTime` assumed raw 24h "HH:MM" but one of its 3 upstream
sources already carries a meridiem. Fix: robust `formatClassTime`
(`show-today/showTodayBanner.helpers.ts`) + tests.

---

## Part 3 — Find a Show (public browse) ✅ 🐞

- [x] `/shows` (via "Enter a Show" or "Find Shows" nav) loads
- [x] Search box, filter chips, Browse All / Past Shows / My Entries tabs
- [x] Show cards show date, "Closes in N days" / "Accepting Entries", club, fee, org
- [x] Click a card → show detail page

**🐞 BUG-EX-07 [P2] — browse count inconsistencies (open).** "All Shows (5)" vs
"Browse All 9" vs "5 of 9 shows"; and the **"My Entries" tab shows 0** despite the
account having entries. Investigate `useBrowseShowsData` / `useBrowseShowsFilters`
and the My-Entries tab derivation.

**🐞 HYGIENE — 4 leftover "Update Test Show …" rows** pollute the public browse.
Clean test data before real-user testing.

---

## Part 4 — Show Detail + Entry Form ✅ 🐞

- [x] Detail page renders (premium "Headline" style); "Enter" → `#enter` section
- [x] `#enter` section: closing date, "Submit Entry" → `/shows/:id/register`

**🐞 BUG-EX-04 [P2] — premium landing date off-by-one (open).** Detail page (and
footer) show **Jun 11–13**, but the browse card and the confirmation receipt show
**Jun 12–14** for the same show. Likely a UTC-parse off-by-one in the premium
landing date renderer. Confirm with the secretary's stored show dates.

---

## Part 5 — Registration Wizard (enter a show) ✅ 🐞

3 steps: **Classes → Payment → Confirmation**.

### 5.1 Classes ✅
- [x] Dog chips (Dog 1 / Dog 2 / …); pick a dog
- [x] Classes grouped by trial → element (Container/Interior/…) → level (Novice A/B, Advanced, Excellent, Master)
- [x] Check a class → "N selected" updates, `aria-checked` syncs, Next enables

**🐞 BUG-EX-05 [Minor a11y] (open).** Class checkboxes are Base UI
`span[role="checkbox"]` with **no accessible name**; dog chips have **no
`aria-pressed`/selected state**. A screen-reader user can't tell which class a
checkbox is for, or which dog is active. (Also blocks clean Playwright locators —
the committed spec needs test ids or accessible names here.)

**🐞 BUG-EX-06 [Minor] (open).** Trial header renders the raw enum **`scent_work`**
instead of "Scent Work" (a `formatTrialTypeLabel` exists on the secretary side).

### 5.2 Payment ✅ 🐞
- [x] Registration summary (dog · class · fee), subtotal, total, payment method, AKC Entry Agreement, Next
- [x] Select "Credit/Debit Card" payment method (required) + check the agreement → Next enables
- [x] "Online payment coming soon — entry submitted, payment collected later" (expected; no Stripe yet)

**🐞 BUG-EX-03 [P2] — multi-dog discount on a single-dog entry (open).** A
"10% multi-dog discount (3+ dogs) −$3.00" applied to a **one-dog, one-class**
registration. It appears keyed to dogs the account *owns* (4), not dogs *entered
in this registration* (1). Verify the fee calculator's dog-count source.

**🐞 BUG-EX-08 [Minor UX] (open).** On the payment step, **Next is disabled with no
inline reason** until a payment method is selected; the only cue is a blank
"Selected Payment Method:". Add a hint or inline validation.

### 5.3 Confirmation ✅ 🔧 🐞
- [x] Receipt (#MK9-…), dog, class, total, "Complete Registration"
- [x] **Complete Registration** persists the entry (verified: it appears in My Entries and bumps Upcoming Shows)

**🔧 BUG-EX-09 [P1] — exhibitor self-entry fires staff-only `assign_armband` RPC → 400. FIXED.**
On submit, `submitShowRegistration` always called `assignArmbandsForEntries` →
`claimNextArmband` → `assign_armband` RPC, which rejects non-staff with
`P0001 "Not authorized to assign armbands for this show"`. The 400 was silently
swallowed (`claimNextArmband` returns `{armband:null}`), so every exhibitor
self-entry created a guaranteed-failing request and the entry persisted with no
armband. Fix: gate the armband claim on a new `canAssignArmbands` param
(`submitShowRegistration`), sourced from `useRegistrationPermissions().canAssignArmbands`
in `RegistrationWizardPage` — false for exhibitors (skip the call), true for
secretary/club-admin/site-admin (mail-in roles keep auto-armbands). Behavior-
preserving for the persisted entry; removes the doomed call. Unit test added.
*(Live re-verification of the absent 400 is unit-test-proven; the wizard's Base UI
"Next" resisted synthetic clicks during the walk — re-verify in the committed spec
with real Playwright clicks.)*

**🐞 BUG-EX-10 [P2] — premature "CONFIRMED" / "FEES RECEIVED" (open).** The
confirmation step shows "CONFIRMED" and "TOTAL · FEES RECEIVED $27.00" **before**
"Complete Registration" is clicked and while payment is explicitly deferred
("collected later"). Misleading — fees are not received and it isn't yet saved.

**ℹ️ Not a bug:** receipt shows the dog's *registered* name ("E2E Dog A …") while
the selector/list show the *call* name ("Dog 1"). Same dog; minor cross-surface
name-display inconsistency.

---

## Part 6 — Add a Dog ⬜ (not yet walked)

- [ ] From My Dogs strip ("New Dog") or `/dogs` — open Add Dog panel/page
- [ ] Fill call name, registered name, breed, registry/org, owner
- [ ] Save → dog appears in My Dogs and is selectable in the registration wizard
- [ ] (Offline create behavior — see OPEN-TODOS "Queue-based Offline Dog Create")

---

## Part 7 — Check In to a Class ⬜ (not yet walked)

- [ ] Self check-in path: `/exhibitor/check-in/:entryId` and/or `/exhibitor/show-day`
- [ ] Reads `entries.check_in_status` (written by `self_checkin_entry` RPC)
- [ ] Toggle check-in status; confirm it persists and reflects in My Entries / Show Day
- [ ] Confirm RLS allows an exhibitor to check in their **own** entry only

---

## Part 8 — View Results ⬜ (not yet walked)

- [ ] After the secretary releases results, exhibitor sees them
- [ ] `useExhibitorResults` / results surface (placement, Q/NQ, time)
- [ ] TV/mobile results view (`TVDisplay/TVMobileResults`) if linked
- [ ] Confirm results hidden until released

---

## Issue Log

| # | ID | Sev | Step | Issue | Status |
|---|----|-----|------|-------|--------|
| 1 | BUG-EX-01 | P1 | 2 | My Entries counts: entries-not-shows + multi-day-today bucketed past → 0 upcoming / 6 past; two derivations drift | ✅ Fixed |
| 2 | BUG-EX-02 | Minor | 2 | Show Today banner "8:00 AM AM" double meridiem | ✅ Fixed |
| 3 | BUG-EX-09 | P1 | 5.3 | Exhibitor self-entry calls staff-only `assign_armband` → 400 (swallowed); no armband | ✅ Fixed (unit) |
| 4 | BUG-EX-03 | P2 | 5.2 | Multi-dog discount applied to single-dog entry (keyed to dogs owned, not entered) | 🐞 Open |
| 5 | BUG-EX-04 | P2 | 4 | Premium landing show dates off-by-one (Jun 11–13 vs 12–14) | 🐞 Open |
| 6 | BUG-EX-10 | P2 | 5.3 | "CONFIRMED / FEES RECEIVED" shown before completion & with deferred payment | 🐞 Open |
| 7 | BUG-EX-07 | P2 | 3 | Browse counts inconsistent (5 vs 9); "My Entries" tab shows 0 despite entries | 🐞 Open |
| 8 | BUG-EX-05 | Minor | 5.1 | Class checkboxes lack accessible name; dog chips lack aria-pressed | 🐞 Open |
| 9 | BUG-EX-08 | Minor | 5.2 | Disabled "Next" on payment with no inline reason | 🐞 Open |
| 10 | BUG-EX-06 | Minor | 5.1 | Raw enum "scent_work" in wizard trial header | 🐞 Open |
| 11 | HYGIENE | — | 3 | Leftover "Update Test Show …" rows + E2E dogs pollute browse/My Dogs | 🐞 Open |

---

## Golden Path Exit Criteria

- [ ] Parts 1–8 all walked & passing (Parts 6–8 not yet walked)
- [ ] All P1 issues fixed (3/3 fixed; armband fix needs spec-level live re-verify)
- [ ] P2/Minor issues triaged (fix or defer with rationale)
- [ ] A committed Playwright spec covers the journey; unit tests cover extracted logic
- [ ] Test-data clutter cleaned before real-user testing

**Sign-off:** _____________________ **Date:** _____________
