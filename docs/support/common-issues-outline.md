# Common Issues Taxonomy

Troubleshooting index organized by user symptom, not by feature. Each entry names what support should ask first, links to the answer artifact, and flags when admin investigation is required.

**Design rule:** Link to user-guide sections and KB articles rather than duplicating their content here.

---

## Cannot Sign In

**Who reports this:** Exhibitors (most common), secretaries, treasurers.

**What to ask first:**
- What email address do you use? (Common issue: wrong email.)
- Did you sign up before, or is this your first time?
- Are you trying a magic link (email) or a password?
- Did the email arrive? Check spam.

**Answer paths:**

| Situation | Artifact |
|---|---|
| First time, never confirmed signup | Resend confirmation from Supabase Auth (cookbook) |
| Magic link email not received | Cookbook: Cannot sign in |
| Existing account, correct email, still blocked | Cookbook: Cannot sign in → reset |
| User doesn't know which email they used | Ask them to try each address; Supabase Auth search as last resort |

**KB target:** `cant-sign-in.md`

---

## Cannot Find a Show

**Who reports this:** Exhibitors, mainly.

**What to ask first:**
- Are they looking for a show they already entered, or a new show to enter?
- Do they have the show name or date?

**Answer paths:**

| Situation | Artifact |
|---|---|
| Looking for an already-entered show | My Shows (`/exhibitor/entries`) → search or filter |
| Looking for a show to enter | Find Shows (`/shows`) → date filter |
| Show closed entry window | Explain; direct to contact show secretary for waitlist |
| Show exists but not visible | Check show's published/active status (secretary: Show Setup) |

**KB target:** `find-run-order.md` (covers show-day location); separate `enter-a-show.md` for discovery.

---

## Entry Not Visible After Payment

**Who reports this:** Exhibitors.

**What to ask first:**
- Which show and class?
- What email did they use for checkout?
- When did they pay? (within last hour — webhook delay likely)

**Answer paths:**

| Situation | Artifact |
|---|---|
| Paid within last 5–15 minutes | KB: `entry-not-showing.md` (webhook delay explanation) |
| Paid hours ago, still missing | Cookbook: Payment processed, entry missing |
| Entry shows but secretary cannot see it | Common Issues: Entry visibility mismatch |

**KB target:** `entry-not-showing.md`
**Macro:** M-03

---

## Entry Status Questions

**Who reports this:** Exhibitors ("What does Pending mean?"), secretaries ("Why does it show the wrong count?").

**What to ask first:**
- What does the entry say right now: Pending, Accepted, Waitlisted, or something else?
- Is the question about an individual entry or the total count on the dashboard?

**Answer paths:**

| Situation | Artifact |
|---|---|
| "What does Pending mean?" | KB: `entry-status.md` |
| "Dashboard count doesn't match Entry Management" | KB: `entry-count-mismatch.md` (known root cause) |
| "My entry says Withdrawn but I didn't withdraw" | Check secretary action log; secretary may have pulled |

**KB target:** `entry-status.md`

---

## Payment Not Confirmed / Stripe Questions

**Who reports this:** Exhibitors (payment), treasurers (Stripe onboarding, payouts).

**What to ask first (exhibitor):**
- Was the card charged? Check their bank app.
- Did they receive a Stripe receipt email?

**What to ask first (treasurer):**
- Are they asking about setup, or about a missing payout?
- Are they seeing a message from Stripe or from myK9Show?

**Answer paths:**

| Situation | Artifact |
|---|---|
| Card charged, entry missing | Cookbook: Payment processed, entry missing |
| Stripe asking for SSN / bank info | Macro M-08; KB: `stripe-onboarding.md` |
| Stripe account "under review" | Macro M-09; Cookbook: Stripe Connect account under review |
| Payout not received | Cookbook: Club payout not received; KB: `payout-timing.md` |
| "What does the platform fee cover?" | KB: `platform-fee.md` |

**KB targets:** `stripe-onboarding.md`, `payout-timing.md`
**Macros:** M-08, M-09, M-10

---

## Check-In Problems

**Who reports this:** Exhibitors, judges, stewards.

**What to ask first:**
- Are they trying to check in before or during the show?
- Did the ShowTodayBanner appear on My Shows? (It only shows on show day.)
- Are they at the venue or remote?

**Answer paths:**

| Situation | Artifact |
|---|---|
| Banner not showing | Only appears on show day; confirm date |
| App showing offline at venue | KB: `offline-mode.md`; then Cookbook: Offline or sync issue |
| Check-in completes but not visible to secretary | Sync delay at venue (expected); confirm manually |

**KB target:** `check-in.md`

---

## Results Not Visible or Confusing

**Who reports this:** Exhibitors ("where are my results?"), secretaries ("how do I release results?").

**What to ask first (exhibitor):**
- Which show, which class, which run date?
- Do they see a result badge or nothing at all?

**What to ask first (secretary):**
- Have results been recorded? Or not yet released?

**Answer paths:**

| Situation | Artifact |
|---|---|
| Results not recorded yet | Explain: secretary enters scores after each run |
| Scores recorded, not visible to exhibitor | Secretary Guide § Closeout → Release Results |
| Result shows NQ, exhibitor asks what it means | KB: `qualifying-codes.md` |
| Result shows Q, exhibitor asks about title | KB: `title-progress.md` |
| Exhibitor sees result before secretary releases | Known gap P-04 in question bank; do not document workaround |

**KB targets:** `view-results.md`, `qualifying-codes.md`

---

## Sync / Offline Concerns

**Who reports this:** Anyone at the venue; judges and stewards most often.

**What to ask first:**
- Is the offline banner showing?
- Did the data appear later?
- Is everyone at the show having this, or just one person?

**Answer paths:**

| Situation | Artifact |
|---|---|
| Banner shows, data appears later | KB: `offline-mode.md` (expected behavior) |
| Persistent offline at home | Cache clear instructions in KB: `offline-mode.md` |
| Server-side outage suspected | Check status.supabase.com; Cookbook: Offline or sync issue |

**KB target:** `offline-mode.md`
**Macro:** M-12 ("We are checking this")

---

## Secretary — Setup and Configuration

**Who reports this:** Secretaries.

**What to ask first:**
- Which step in setup are they on? (Show creation wizard / class setup / officials / publishing?)
- Are they getting an error, or is something just confusing?

**Answer paths:**

| Situation | Artifact |
|---|---|
| "How do I create a show?" | KB: `create-a-show.md` |
| "How do I add classes?" | Secretary Guide § Setup |
| "How do I publish?" | Secretary Guide § Setup |
| Class count or entry fee wrong after publishing | Secretary Guide § Setup — edits after publish |
| Judge or official wrong | Secretary Guide § Setup → Edit Officials |

**KB target:** `create-a-show.md`

---

## Secretary — Show Day

**Who reports this:** Secretaries (show day is the highest-stress window).

**Answer paths:**

| Situation | Artifact |
|---|---|
| Scratch a dog | KB: `handle-a-scratch.md` |
| Move up | KB: `handle-move-up.md` |
| Late entry / walk-in | Secretary Guide § Show Day |
| Entry count wrong | KB: `entry-count-mismatch.md` |
| Send announcement | KB: `send-announcement.md` |
| AKC submission missing dogs | Cookbook: AKC submission file |

**Show-day escalation:** `docs/support/show-day-triage-outline.md`

---

## Other Common Issues to Track

These have not yet been documented but belong in the taxonomy once stable:

| Symptom | Target artifact (planned) |
|---|---|
| Run order not showing | `find-run-order.md` |
| Scoresheet won't print | Secretary Guide § Reports |
| Waitlist spot management | Secretary Guide § Entry Management |
| Club member access / permission | Club Admin Guide § Members |
| Report generation fails | Secretary Guide § Reports (edge cases) |
