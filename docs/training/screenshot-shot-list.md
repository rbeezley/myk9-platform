# Screenshot and Demo Asset Shot List

**Status:** `drafted`

Every screenshot and diagram in final documentation and training materials must have a row here. No screenshot without a shot-list entry should appear in published materials.

**Status values:**

- `ready` — UI is stable; this shot can be taken now
- `blocked: flag` — _(retired 2026-06-23)_ formerly gated on `unified_ringside_enabled`; that flag was removed, so these shots are now `ready`. See [`docs/plan-remove-unified-ringside-flag.md`](../archive/plan-remove-unified-ringside-flag.md).
- `blocked: stripe` — needs a fresh sandbox Stripe onboarding walkthrough
- `blocked: seed` — needs a specific seed fixture not yet in staging
- `blocked: not-built` — the feature is not yet built
- `blocked: date` — only renders on show day (date-controlled UI)

**Seeded accounts (staging):**

| Role            | Account                       |
| --------------- | ----------------------------- |
| Secretary       | `secretary@myk9t.com` |
| Exhibitor       | `exhibitor@myk9t.com` |
| Judge           | `judge@myk9t.com`             |
| Club admin      | `club@myk9t.com`              |
| Site admin      | `admin@myk9t.com`             |
| Unauthenticated | (no sign-in)                  |

**Canonical seed show:** Heritage Scent Work show (32 classes seeded; see `supabase/seed-demo.sql`). Use this show for all secretary and exhibitor screenshots unless noted.

**Viewport sizes:**

| Label   | Size       | Use for                                 |
| ------- | ---------- | --------------------------------------- |
| Desktop | 1280 × 800 | Secretary, admin, club admin surfaces   |
| Mobile  | 390 × 844  | Exhibitor on show day; at-show ringside |
| Tablet  | 768 × 1024 | Ringside — judge/steward                |

**Sensitive Content Rule:** Every screenshot must use seeded fixture accounts only. No real customer names, emails, dog registrations, or payment data. If staging data shows anything from a real account, re-seed before shooting.

---

## Part 1 — Secretary Guide Screenshots

> **Rewritten 2026-08-30.** The guide was restructured from numbered `§` sections into
> 23 task cards, so the old section column pointed at headings that no longer exist. The
> set is also deliberately smaller: the guide is text-first, and a shot earns its place
> only where a picture settles *which screen am I on* faster than a sentence can. Words
> survive a UI change; pictures do not — the previous set went stale the moment the
> workbench collapsed into Show Desk, and sixteen files were deleted rather than left to
> be reused by mistake.

| Shot ID | Description | Route | Account | Viewport | Expected state | Guide card | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| S-01 | Secretary dashboard | `/secretary/dashboard` | `secretary@myk9t.com` | Desktop | Managed shows listed with the needs-attention summary | Before you start | `captured 2026-08-30` |
| S-02 | Create Show wizard — Step 1 | `/secretary/create-show/wizard` | `secretary@myk9t.com` | Desktop | Four-step tracker; clone option; starred required fields | 1 · Create a show | `captured 2026-08-30` |
| S-07 | Entry Management — Needs review queue | `/shows/:showId/entry-management` | `secretary@myk9t.com` | Desktop | Queue chips with counts; rows offering Review registration | 3 · Approve entries | `captured 2026-08-30` |
| S-10 | Entry Management — Exceptions / Waitlist | `/shows/:showId/entry-management?tab=exceptions&exception=waitlist` | `secretary@myk9t.com` | Desktop | Exceptions tab with the waitlist selected | 6 · Manage the wait list | `captured 2026-08-30` |
| S-12 | Reports — Check-in Sheet | `/shows/:showId/reports` | `secretary@myk9t.com` | Desktop | Report / Trial / Class / Sort controls and Print | 11 · Print check-in sheets | `captured 2026-08-30` |
| S-15 | Show Desk — focused class | `/shows/:showId/show-desk` | `secretary@myk9t.com` | Desktop | Focused class with the Run order control and Move up per entry | 10 · Run order, 15 · Move up | `captured 2026-08-30` |
| S-20 | Results — visibility presets | `/shows/:showId/results-control` | `secretary@myk9t.com` | Desktop | Readiness panel; Immediately / After Class / After Review | 19 · Release results | `captured 2026-08-30` |
| S-22 | Submit Results | `/shows/:showId/submit-results` | `secretary@myk9t.com` | Desktop | Send to AKC, Download XML, Mark as submitted; closeout guidance | 20 · Submit to the registry | `captured 2026-08-30` |

**Capturing these again.** Two things bite, both discovered the hard way:

1. Show-scoped pages open on a tall header that fills a 1280×800 viewport, so a plain
   screenshot returns the header and none of the tab content. Scroll first.
2. Show Desk and Entry Management render a real `[role="tablist"]`; Reports, Results and
   Submit Results render tab-*looking* navigation with **no tablist role**, so a scroll
   anchored on that selector silently does nothing there. Anchor on the tablist when it
   exists, fall back to a fixed offset, and verify the page actually moved.

Cards without a shot are intentional, not missing.


## Part 2 — Exhibitor Guide Screenshots

| Shot ID | Description                                                          | Route                                                     | Account                       | Viewport | Expected state                                                                        | Guide section         | Status                                                                        |
| ------- | -------------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------- | -------- | ------------------------------------------------------------------------------------- | --------------------- | ----------------------------------------------------------------------------- |
| E-01    | Shows list — upcoming shows with entry status badges                 | `/shows`                                                  | none (unauthenticated)        | Desktop  | At least one show with "Accepting Entries" badge; one with "Closing Soon"             | § 1 Find a Show       | `ready (captured 2026-06-19 — staging, unauthenticated)`                      |
| E-02    | Show detail page — hero with "Enter This Show" CTA                   | `/shows/:showId`                                          | none                          | Desktop  | Heritage show detail; "Enter This Show" button prominent                              | § 1                   | `ready (captured 2026-06-19 — staging, unauthenticated)`                      |
| E-03    | Sign-up form                                                         | `/sign-up`                                                | none                          | Desktop  | Empty sign-up form                                                                    | § 2 Create an Account | `ready (captured 2026-06-19 — staging, unauthenticated)`                      |
| E-04    | My Dogs page — at least one dog card                                 | `/dogs`                                                   | `exhibitor@myk9t.com` | Desktop  | Dog list with at least one entry                                                      | § 3 Add a Dog         | `ready (captured 2026-06-19 — staging, exhibitor@myk9t.com)`          |
| E-05    | Add Dog form                                                         | `/dogs` (Add Dog dialog)                                  | `exhibitor@myk9t.com` | Desktop  | Add Dog form open with required fields visible                                        | § 3                   | `ready (captured 2026-06-19 — staging, exhibitor@myk9t.com)`          |
| E-06    | Registration wizard — Step 1 (class selection)                       | `/shows/:showId/register`                                 | `exhibitor@myk9t.com` | Desktop  | Class selection step; dog chip visible at top; classes grouped by element/level       | § 4 Enter a Show      | `ready (captured 2026-06-19 — staging, exhibitor@myk9t.com)`          |
| E-07    | Registration wizard — Step 1 with class selected + cart toast        | `/shows/:showId/register`                                 | `exhibitor@myk9t.com` | Desktop  | Class selection step; class chip checked; "Added to cart" toast visible               | § 4                   | `ready (captured 2026-06-19 — staging, exhibitor@myk9t.com)`          |
| E-08    | Confirmation receipt                                                 | `/checkout/success`                                       | `exhibitor@myk9t.com` | Desktop  | Success screen with entry confirmed                                                   | § 4                   | `ready (captured 2026-06-20 — staging, end-to-end sandbox payment)`           |
| E-09    | My Entries — Pending tab with entry card                             | `/exhibitor/entries`                                      | `exhibitor@myk9t.com` | Mobile   | At least one entry card in Pending status                                             | § 5 Track Your Entry  | `ready (captured 2026-06-19 — staging, exhibitor@myk9t.com)`          |
| E-10    | My Entries — Accepted tab with entry card                            | `/exhibitor/entries`                                      | `exhibitor@myk9t.com` | Mobile   | At least one entry card in Accepted status                                            | § 5                   | `ready (captured 2026-06-19 — staging, exhibitor@myk9t.com)`          |
| E-11    | My Entries — show card (unexpanded)                                  | `/exhibitor/entries`                                      | `exhibitor@myk9t.com` | Mobile   | Show card with date, club, and entry status                                           | § 5                   | `ready (captured 2026-06-19 — staging, exhibitor@myk9t.com)`          |
| E-12    | Class detail page — run order entry with dog name and armband number | `/shows/:showId/trials/:trialId/classes/:classId`         | `exhibitor@myk9t.com` | Mobile   | Class detail view; run order entry showing dog name, armband number, and position     | § 6 View Run Order    | `ready (captured 2026-06-19 — staging, exhibitor@myk9t.com)`          |
| E-13    | My Entries — Show Today banner                                       | `/exhibitor/entries`                                      | `exhibitor@myk9t.com` | Mobile   | "Show Today" banner visible at top (requires a show scheduled for today's date)       | § 7 Check In          | `ready (captured 2026-06-20 — staging, demo show temporarily dated to today)` |
| E-14    | My Entries — entry card with "Not Checked In" status pill            | `/exhibitor/entries`                                      | `exhibitor@myk9t.com` | Mobile   | Entry card showing "Not Checked In" status label; check-in must be open for the class | § 7                   | `ready (captured 2026-06-19 — staging, exhibitor@myk9t.com)`          |
| E-15    | My Entries — entry card "Checked In" state                           | `/exhibitor/entries`                                      | `exhibitor@myk9t.com` | Mobile   | Entry card with green Checked In badge                                                | § 7                   | `ready (captured 2026-06-19 — staging, exhibitor@myk9t.com)`          |
| E-16    | My Entries — Q result badge on entry card                            | `/exhibitor/entries`                                      | `exhibitor@myk9t.com` | Mobile   | Entry card with Q result badge and placement pill visible                             | § 8 View Results      | `ready (captured 2026-06-19 — staging, exhibitor@myk9t.com)`          |
| E-17    | Class results page — placement table                                 | `/shows/:showId/trials/:trialId/classes/:classId/results` | `exhibitor@myk9t.com` | Mobile   | Full results table with placements, times, Q/NQ                                       | § 8                   | `ready (captured 2026-06-19 — staging, exhibitor@myk9t.com)`          |

---

## Part 3 — Judge and Steward Quickstart Screenshots

**Unblocked 2026-06-23:** the `unified_ringside_enabled` flag was removed (see [`docs/plan-remove-unified-ringside-flag.md`](../archive/plan-remove-unified-ringside-flag.md)) — the at-show surface renders for every show, gated only by `AtShowAccessGate` (role / passcode). Capture these against staging once the removal PR merges + redeploys (no DB push required for capture). Note: the seed accounts below (`judge@myk9t.com`) are stale — staging named accounts have no `auth.users`; use the `@myk9t.com` accounts or a passcode grant.

| Shot ID | Description                            | Route                                             | Account                   | Viewport | Expected state                                                            | Quickstart section | Status                                                          |
| ------- | -------------------------------------- | ------------------------------------------------- | ------------------------- | -------- | ------------------------------------------------------------------------- | ------------------ | --------------------------------------------------------------- |
| J-01    | SmartSignInPage — passcode entry field | `/at-show`                                        | none (passcode flow)      | Mobile   | Passcode input visible; "Enter Passcode" CTA                              | § 1 Getting Access | `ready (captured 2026-06-25 — staging, unauthenticated mobile)` |
| J-02    | At-show class list                     | `/at-show/:showId`                                | `judge@myk9t.com` | Tablet   | All classes listed by trial; each row shows class name, entry count       | § 2 Class List     | `ready (captured 2026-06-25 — staging, tablet)`                 |
| J-03    | At-show entry list (run order)         | `/at-show/:showId/class/:classId`                 | `judge@myk9t.com` | Tablet   | Entries in run order with armband numbers and dog names                   | § 3 Entry List     | `ready (captured 2026-06-25 — staging, tablet)`                 |
| J-04    | Scoresheet — timer active              | `/at-show/:showId/class/:classId/score/:entryId`  | `judge@myk9t.com` | Tablet   | Timer counting; Stop button; result buttons visible below                 | § 4 Scoring        | `ready (captured 2026-06-25 — staging, tablet)`                 |
| J-05    | Scoresheet — Q/NQ/Absent buttons       | same                                              | `judge@myk9t.com` | Tablet   | Timer stopped (Resume); Q/NQ/Absent/Excused buttons ready; time filled in | § 4                | `ready (captured 2026-06-25 — staging, tablet)`                 |
| J-06    | Entry list — saved result visible      | `/at-show/:showId/class/:classId` (Completed tab) | `judge@myk9t.com` | Tablet   | Completed tab showing entries with Q badge, placement pill, and time      | § 4                | `ready (captured 2026-06-25 — staging, tablet)`                 |

---

## Part 4 — Club Admin Guide Screenshots

| Shot ID | Description                                           | Route                   | Account          | Viewport | Expected state                                                                                                                                                                               | Guide section         | Status                                                                                       |
| ------- | ----------------------------------------------------- | ----------------------- | ---------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------- |
| C-01    | Club Admin sidebar + Club Settings form               | Club settings page      | `club@myk9t.com` | Desktop  | Club name, AKC number, address, and contact fields visible                                                                                                                                   | § 2 Club Profile      | `ready`                                                                                      |
| C-02    | Club Admin → Shows list                               | Club admin shows page   | `club@myk9t.com` | Desktop  | Heritage show listed; secretary assignment visible                                                                                                                                           | § 3 Show Access       | `ready`                                                                                      |
| C-03    | Grant show access                                     | Club admin members page | `club@myk9t.com` | Desktop  | Member row with Show Manager badge (access confirmed)                                                                                                                                        | § 3                   | `ready`                                                                                      |
| C-04    | Club Admin → Payments — pre-onboarding                | `/club-admin/payments`  | `club@myk9t.com` | Desktop  | "Connect payment account" button; no Stripe account connected                                                                                                                                | § 4 Stripe Onboarding | `ready` (captured 2026-06-20 by temporarily removing the seeded account row, then restoring) |
| C-05    | Club Admin → Payments — connected with payout history | `/club-admin/payments`  | `club@myk9t.com` | Desktop  | "Payouts enabled" + Show payouts row (show name, date, amount, Paid). NOTE: this club page shows amount + status, not gross/fee/net — that breakdown is on the admin ledger `/admin/payouts` | § 5 Payout History    | `ready` (captured 2026-06-20 with a seeded show_payouts fixture, since removed)              |

---

## Part 5 — Diagram Assets

Diagram sources and exports live in `docs/diagrams/`. Each diagram is a separate `.drawio` source + `.svg` export. See `docs/diagrams/README.md` for the full candidate list and regeneration commands.

| Diagram                          | Serves                                             | Status                                                                |
| -------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------- |
| `exhibitor-entry-flow.drawio`    | Exhibitor Guide § 1–4; Overview Deck slide 10      | `qa-draft` — candidate                                                |
| `entry-lifecycle.drawio`         | Exhibitor Guide § 5; Secretary Guide § 4           | `qa-draft` — candidate                                                |
| `secretary-setup-flow.drawio`    | Overview Deck slide 5; Secretary Deck              | `qa-draft` — candidate                                                |
| `secretary-show-day-flow.drawio` | Overview Deck slide 8; Secretary Deck slides 5–6   | `qa-draft` — candidate                                                |
| `payment-flow.drawio`            | Club Admin Guide § 4–5; Overview Deck slides 14–15 | `blocked: stripe`                                                     |
| `at-show-access-paths.drawio`    | Quickstart § 1; Overview Deck slide 12             | `ready (drawn 2026-06-25 — hand-authored SVG; drawio source pending)` |
| `support-triage-flow.drawio`     | Triage outline; investigation cookbook             | `qa-draft` — candidate                                                |

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
