# Exhibitor Guide Outline

**Status:** `qa-draft` — outline phase; final guide gated on Phase 0 readiness.

**Audience:** Dog sport exhibitors — anyone entering a show online. Role intent: "This respects my time." Pre-filled context wherever possible; no re-explaining what they already know.

**Canonical source:** `docs/journeys/exhibitor.md`, `docs/testing/exhibitor-golden-path-checklist.md`

**Guide target:** `docs/user-guides/exhibitor-guide.md` (create in Phase 6 once gated sections pass Phase 0)

---

## Readiness Summary

| Section | Route | Screenshot needed | Stable? | Notes |
|---|---|---|---|---|
| Find a show (unauthenticated) | `/shows` | yes | mostly stable | Browse counts inconsistent (BUG-EX-07 open) |
| Create an account | `/sign-up` | yes | stable | Golden path § Part 1 |
| Add a dog | `/dogs` | yes | stable | Golden path § Part 6 |
| Enter a show (wizard) | `/shows/:showId/register` | yes | **partial** | Multi-dog discount bug open (BUG-EX-03); enum label bug (BUG-EX-06) |
| Track entry status | `/exhibitor/entries` | yes | stable | My Entries tabs stable; Summary counts fixed |
| View the run order | `/shows/:showId` (Classes tab) | yes | stable | |
| Check in on show day | My Entries card check-in dialog | yes | stable | Golden path § Part 7 (fixed BUG-EX-11) |
| View results | `/exhibitor/entries` result badges, `/shows/:showId/trials/:trialId/classes/:classId/results` | yes | **partial** | Result display not walked (no released fixture); see golden path § Part 8 |
| My Payments | `/exhibitor/payments` | yes | stable | Cataloged in pageDirectory (#1014); reachable via the My Payments sidebar entry |
| Dog profiles | `/dogs`, `/dogs/:id` | yes | stable | |
| Personal analytics | `/exhibitor/analytics` | yes | lower priority | |

---

## Guest vs. Signed-In

| Capability | Guest (no account) | Signed in |
|---|---|---|
| Browse shows | yes | yes |
| View show detail | yes | yes |
| Enter a show | no — prompted to sign in | yes |
| View entry status | no | yes |
| Check in | no | yes |
| View results | no (unless show is public-release) | yes |

The sign-in/sign-up gate is triggered only by "Enter This Show" — not by browsing. Never prompt a guest to log in just to look at a show.

---

## Section 1 — Find a Show

**User outcome:** Exhibitor finds an upcoming show with an open entry window without needing an account.

**Canonical route:** `/shows`

**Rough steps (qa-draft):**
1. Open myK9Show — no sign-in needed.
2. Browse the list of upcoming shows. Each card shows the show name, dates, entry fee, club, and entry status (Accepting Entries / Closing Soon / Closed).
3. Filter by date if needed.
4. Click a show card → the show detail page opens with the trial schedule, classes, and entry deadline.
5. "Accepting Entries" badge is visible → click **Enter This Show** to begin.

**Screenshots:** Shows list with entry status badges; show detail page hero.

**KB articles this section generates:**
- `enter-a-show.md` — high priority (E-01); this section is the first step in that article

**Stability notes:**
- Browse is stable, but count display has inconsistencies (BUG-EX-07 — "All Shows (5)" vs "Browse All 9"). Do not mention counts in the guide until fixed. The per-card entry status is stable.
- Browse counts for "My Entries" tab show 0 despite entries existing — do not document the "My Entries" filter tab on the browse page until fixed.

**Friction findings:**
- The "Find Shows" nav link in the sidebar goes to `/shows`; the "Enter a Show" CTA on the exhibitor dashboard also goes to `/shows` — consistent. Document only `/shows` as the entry point.

---

## Section 2 — Create an Account

**User outcome:** First-time exhibitor creates an account so they can enter shows.

**Canonical routes:** `/sign-up`, then `/dogs`

**Rough steps (qa-draft):**
1. From the show detail page, click **Enter This Show**.
2. The sign-in page appears → click **Create an account**.
3. Enter your email and create a password → confirm your email via the link sent to you.
4. You are now signed in.
5. Before entering a show, you need to add at least one dog (see Section 3).

**Screenshots:** Sign-up form; email confirmation prompt.

**KB articles this section generates:**
- `create-account.md` — moderate priority (E-07 in question bank for "can't sign in"; onboarding is its own article)

**Stability notes:**
- Sign-up flow is stable. Email confirmation goes through Resend → see gap P-01 if confirmation email does not arrive.

---

## Section 3 — Add a Dog

**User outcome:** Exhibitor adds their dog's profile before entering a show.

**Canonical routes:** `/dogs` → **Add Dog**

**Rough steps (qa-draft):**
1. Go to **My Dogs** in the navigation.
2. Click **Add Dog**.
3. Fill in: call name (required), gender (required), date of birth (required).
4. Under Additional: enter the AKC or UKC registration number, registered name, and breed.
5. Click **Create Dog** → the dog appears in your list.
6. You can now enter this dog in a show.

**Screenshots:** My Dogs list; Add Dog form.

**KB articles this section generates:**
- `add-a-dog.md` — high priority (E-04)

**Stability notes:**
- Add Dog is stable. My Dogs page shows all dogs associated with the account — scope is global (BUG-EX-12 open: may show more dogs than expected). Do not mention the count or "N dogs registered" in the guide until scoping is fixed.

---

## Section 4 — Enter a Show

**User outcome:** Exhibitor submits an entry and pays (or is set up to pay) via Stripe.

**Canonical routes:** `/shows/:showId/register` → (Stripe checkout) → `/checkout/success`

**Rough steps (qa-draft):**

**Step 1 — Select a class:**
1. From the show detail page, click **Enter This Show** (or from My Shows, open the show → **Enter**).
2. The registration wizard opens. Your dog is shown at the top.
3. Select the class you want to enter. Classes are grouped by trial, element, and level.
4. Click **Next**.

**Step 2 — Review and pay:**
1. Review your entry: dog, class, and entry fee.
2. Read and accept the entry agreement.
3. Select your payment method → click **Next** (or **Pay with Card**).
4. Complete checkout in the Stripe payment screen.

**Step 3 — Confirmation:**
1. After payment, you are returned to myK9Show with a confirmation receipt.
2. Your entry is now **Pending** — it will move to **Accepted** once the secretary reviews it.

**Screenshots:** Wizard step 1 (class selection with dog chip); wizard step 2 (payment step); confirmation receipt.

**KB articles this section generates:**
- `enter-a-show.md` — high priority (E-01); full guide for this flow
- `entry-not-showing.md` — high priority (E-02); link from confirmation page

**Stability notes:**
- Wizard is stable. Two open bugs to note:
  - **Multi-dog discount (BUG-EX-03):** discount may appear incorrectly on single-dog entries. Do not document the discount until the bug is fixed.
  - **Raw enum label (BUG-EX-06):** trial header may show `scent_work` instead of "Scent Work". If still visible when the guide is drafted, file to backlog first.
  - Wizard payment step currently shows a deferred-payment message in dev ("Online payment coming soon") — confirm live Stripe checkout is wired before screenshotting.
  - Order confirmation shows a UUID not a human-readable MK9 number — see journey doc note; verify before screenshotting.

**Friction findings:**
- After account creation, the exhibitor must add at least one dog before the wizard can proceed — the wizard blocks silently if no dog exists. Add a clear call-out in the guide: "Make sure you've added your dog first (Section 3)."

---

## Section 5 — Track Your Entry

**User outcome:** Exhibitor sees whether their entry is Pending, Accepted, or Waitlisted.

**Canonical route:** `/exhibitor/entries` (My Shows / My Entries page)

**Rough steps (qa-draft):**
1. Go to **My Shows** (or **My Entries**) in the navigation.
2. Your entries are listed with a status badge:
   - **Pending** — received; awaiting secretary review
   - **Accepted** — approved; you're in
   - **Waitlisted** — class is full; you're in queue
3. Tap a show card to see the show details, class, and run order once published.

**Screenshots:** My Entries page with status tabs and entry cards in each state.

**KB articles this section generates:**
- `entry-status.md` — high priority (E-03)

**Support macros:** M-05 (entry status explanation), M-03 (entry not showing)

**Stability notes:**
- Stable. Summary counts (Active Entries / Upcoming Shows / Past Shows) are fixed (BUG-EX-01 resolved). My Entries tabs (All / Pending / Accepted / Waitlist / Upcoming / Completed) are stable.

---

## Section 6 — View the Run Order

**User outcome:** Exhibitor knows when their class runs, their ring, and their armband number.

**Canonical routes:** `/exhibitor/entries` (show card) → `/shows/:showId` (Classes tab)

**Rough steps (qa-draft):**
1. On My Shows, tap the show card.
2. The show detail page opens → click the **Classes** tab.
3. Find your class → see the run order, ring assignment, and your armband number.
4. Armband numbers are assigned by the secretary and may not appear until closer to show day.

**Screenshots:** Show detail page Classes tab with run order; armband number visible on entry.

**KB articles this section generates:**
- `find-run-order.md` — high priority (E-09)

**Stability notes:**
- Run order view is stable. Ring assignment is not yet persisted — ring labels may not appear (known skip per golden path § 4.9). Do not document ring numbers until that field is implemented.

**Friction finding:**
- Run order is not surfaced directly in My Entries — exhibitor must navigate through the show detail page. This is a navigation gap flagged in the journey doc (Phase 3 current-state note). Document the actual path, not the ideal path.

---

## Section 7 — Check In on Show Day

**User outcome:** Exhibitor marks themselves present for a class on show day.

**Entry point:** My Shows → **Show Today** banner → entry card check-in dialog

**Rough steps (qa-draft):**
1. On show day, open myK9Show → a **Show Today** banner appears at the top of My Shows.
2. Tap **At the show** → opens the entry for that show.
3. On the entry card, tap **Not Checked In** → the check-in dialog opens.
4. Confirm check-in → the card updates to **Checked In**.

**Screenshots:** Show Today banner; entry card with check-in button; Checked In state.

**KB articles this section generates:**
- `check-in.md` — high priority (E-05)

**Stability notes:**
- Check-in is stable (BUG-EX-11 fixed; check-in status persists across reload). Self check-in must be enabled by the secretary per class — if the button is not visible, the secretary has not yet opened check-in for that class.
- No separate `/exhibitor/check-in` route — legacy redirects go to `/exhibitor/entries`. Document only the My Entries card path.

**Friction finding:**
- The check-in dialog labels the armband as "Armband #MK9-…" when no armband is assigned yet (falls back to confirmation number). Minor display nit (golden path § Part 7 note) — do not document the fallback behavior; just show a screenshot when a real armband is assigned.

---

## Section 8 — View Results

**User outcome:** Exhibitor sees their dog's placement, Q/NQ, and time after the class is complete.

**Canonical routes:**
- `/exhibitor/entries` — result badge on entry card (after secretary releases results)
- `/shows/:showId/trials/:trialId/classes/:classId/results` — public class results page

**Rough steps (qa-draft):**
1. After the class, the secretary enters and releases results.
2. On My Shows, the entry card shows a result badge: **Q** or **NQ**.
3. Tap the badge → the class results page opens with placement, score, and time.

**Screenshots:** Entry card with Q result badge; class results table.

**KB articles this section generates:**
- `view-results.md` — high priority (E-06)
- `qualifying-codes.md` — medium priority (E-13: "My result says NQ — what does that mean?")
- `title-progress.md` — medium priority (E-14: "I got a Q — does it count toward my title?")

**Stability notes:**
- Results display surfaces exist and are verified in golden path § Part 8, but result display was not exercised with a live scored fixture. Re-verify against a scored + released class before screenshotting.
- Known gap P-04: exhibitors may see own result before secretary releases it (RLS gap). Do not promise results are hidden until released — that gap is in the backlog.

---

## Section 9 — Withdraw an Entry

**User outcome:** Exhibitor requests to withdraw from a show.

**Rough steps (qa-draft):**
1. Withdrawal is handled by the trial secretary — you cannot withdraw directly in the app.
2. From your entry on My Shows, use **Messages** to contact the secretary.
3. Let them know you need to withdraw and which class. The secretary will pull the entry and handle any refund.

**Note:** This is a secretary-only action. Documenting the workaround (contact secretary) is correct and intentional — do not document a self-serve withdraw path that does not exist.

**KB articles:** None (covered by macro M-13)

---

## Section 10 — Payments and Receipts

**User outcome:** Exhibitor reviews what they paid and can reference their payment history.

**Canonical route:** `/exhibitor/payments`

**Note:** This route is not yet in `pageDirectory.ts` — add before documenting. See workflow source map gap.

**Rough steps (qa-draft):**
1. Go to **My Payments** in the navigation.
2. See a list of payments for each show entry — amount, date, status (Paid / Refunded).
3. Tap a payment for details.

**KB articles this section generates:**
- `my-payments.md` — medium priority (E-10: "How do I see what I paid?")

**Status:** `walkthrough-needed` — verify route is wired and data is correctly scoped before screenshotting.

---

## Section 11 — Manage Dog Profiles

**User outcome:** Exhibitor updates registration numbers, adds a photo, or views competition history.

**Canonical routes:** `/dogs`, `/dogs/:id`

**Rough steps (qa-draft):**
1. Go to **My Dogs** in the navigation.
2. Click a dog's name → the dog detail page opens.
3. Edit call name, registration numbers, or breed → **Save**.
4. View past competition results in the **History** tab.

**Screenshots:** Dog detail page with edit affordances; registration numbers section.

**KB articles:** Inline with `add-a-dog.md`; no separate article needed.

---

## Cross-References

- Workflow source map: `docs/user-guides/workflow-source-map.md` §1–11
- Role intent: `docs/INTENT.md` § Exhibitor
- Exhibitor journey: `docs/journeys/exhibitor.md`
- Golden path checklist: `docs/testing/exhibitor-golden-path-checklist.md`
- Support macros that reference this guide: M-03, M-04, M-05, M-06, M-07, M-13, M-15

## QA-Draft Friction Findings

| Finding | Section | Backlog action |
|---|---|---|
| Browse counts inconsistent (BUG-EX-07) | § 1 | Don't document counts; track in OPEN-TODOS |
| Multi-dog discount bug (BUG-EX-03) | § 4 | Don't document discount; track in OPEN-TODOS |
| Raw enum "scent_work" in wizard (BUG-EX-06) | § 4 | Fix before screenshotting |
| Run order not in My Entries (journey § Phase 3) | § 6 | **RESOLVED** — PR #845 added "View run order" deep-link on entry card → `/shows/:showId?tab=classes` |
| ShowTodayBanner only on show day | § 7 | Explain clearly — exhibitors checking early won't see it |
| My Payments not in pageDirectory.ts | § 10 | Add route before documenting section |
| Results release RLS gap (P-04) | § 8 | Don't promise withholding; gap in backlog |
| UUID on confirmation receipt (not MK9 number) | § 4 | Fix before screenshotting receipt |
