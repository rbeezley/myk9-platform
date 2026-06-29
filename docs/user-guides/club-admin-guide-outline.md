# Club Admin and Treasurer Guide Outline

**Status:** `qa-draft` — outline phase; final guide gated on Phase 0 readiness.

**Audience:** Club administrators and treasurers. Role intent: "The platform is healthy." Factual, reassuring, numbers and status at a glance.

**Canonical sources:** `docs/roles/club-admin.md`, `docs/operations/stripe-treasurer-guide.md`

**Guide target:** `docs/user-guides/club-admin-guide.md` (create in Phase 6)

---

## Important Scope Note

The Club Admin role in fall 2026 is deliberately minimal (see `docs/roles/club-admin.md`):
- **In scope:** Club profile setup, show access, secretary assignment, payment account (Stripe), and payout visibility.
- **Out of scope for fall:** Full membership roster management, training classes, club-wide dashboards, analytics, self-service club creation.

Do not document deferred features. If a club asks about them, the answer is "coming later" — no workaround to document.

---

## Readiness Summary

| Section | Route | Screenshot needed | Stable? | Notes |
|---|---|---|---|---|
| Club profile setup | Club profile page (via club-admin sidebar) | yes | stable | Site admin creates the club; this is edit-only |
| Show access and secretary assignment | Club Admin → Shows | yes | stable | |
| Stripe Express onboarding | `/club-admin/payments` | yes | **partial** | Cataloged in pageDirectory (#1014); sandbox walkthrough still needed |
| View payouts | `/club-admin/payments` | yes | partial | Same route as onboarding |
| Club members | `/club-admin/members` | yes | stable | Cataloged in pageDirectory (#1014) |

---

## What myK9Show Does / What Stripe Does

Include this boundary clearly near the front of the guide. Clubs get confused when Stripe asks for information and they think it's myK9Show asking.

| myK9Show does | Stripe does |
|---|---|
| Hosts the show and collects entries | Processes exhibitor credit card payments |
| Calculates the amount owed to the club | Holds the money during the show period |
| Initiates the transfer to the club after closeout | Deposits the money into the club's bank account |
| Shows payout history and status | Sends identity verification requests directly to the treasurer |
| Charges a platform fee per entry (deducted before payout) | Deducts their own fees (Stripe's standard rate) |

**Why Stripe contacts the treasurer directly:** Stripe is legally required to verify the identity of account holders before releasing money (U.S. financial regulations). They send emails directly to the treasurer. This is not a myK9Show request.

---

## Section 1 — What myK9Show Does for Your Club

**Purpose:** Orientation for a club deciding whether to use the platform.

**Key points:**
- Your club hosts shows; myK9Show handles exhibitor registration, payment collection, show-day operations, results, and AKC submission — all in one place.
- No paper entry forms, no check-depositing, no manual AKC report assembly.
- Exhibitors pay online via Stripe; the club receives a net payout after each show.

**KB articles:** `platform-fee.md` (T-09), blog: "How show payouts work for clubs using myK9Show"

---

## Section 2 — Club Profile Setup

**User outcome:** Club admin ensures the club's profile data is correct — this flows into every show and every AKC submission.

**Who creates the club:** Site admins create clubs via the landing-page request form. Club admins can edit but not create.

**Rough steps (qa-draft):**
1. Sign in as a Club Admin → the Club Admin area appears in the sidebar.
2. Open **Club Settings** (or the club profile page).
3. Review and update:
   - Club name
   - AKC/UKC club numbers
   - Mailing address
   - Contact email and phone
4. Save — these values propagate to all shows this club hosts.

**Screenshots:** Club settings form.

**Stability notes:**
- Club profile edit is stable. The exact page label and sidebar entry should be verified during the live walk.

---

## Section 3 — Show Access and Secretary Assignment

**User outcome:** Club admin grants a secretary account access to manage a specific show.

**Rough steps (qa-draft):**
1. From the Club Admin sidebar, open **Shows** → your club's shows are listed.
2. Click a show → find the secretary assignment section.
3. Select the secretary account to assign → Save.

**Screenshots:** Shows list; secretary assignment section.

**Stability notes:**
- Stable for fall 2026. Only the club admin can assign a secretary to a show — secretaries cannot self-assign.

---

## Section 4 — Set Up Club Payment Account (Stripe Express Onboarding)

**User outcome:** Treasurer connects the club to receive show payouts via Stripe.

**Canonical route:** `/club-admin/payments`

**Note:** Cataloged in `pageDirectory.ts` (#1014).

**Defer this section to the existing guide:** Most of this section is already written in full in `docs/operations/stripe-treasurer-guide.md`. Link to it from this guide instead of duplicating steps.

**Rough steps (qa-draft):**
1. From the Club Admin sidebar, open **Payments**.
2. Click **Set Up Payment Account**.
3. You are redirected to Stripe's onboarding flow.
4. Provide the club's EIN and the club treasurer's information as prompted by Stripe.
5. Add the club's bank account for deposits.
6. Complete onboarding → return to myK9Show.

**Link:** [Full treasurer payment setup guide](../operations/stripe-treasurer-guide.md) — this is the detailed walkthrough with screenshots.

**Screenshots:** Payments page before onboarding (showing "Set Up Payment Account" button); after onboarding (showing connected status). Gate screenshots on a fresh sandbox walkthrough — do not use production account screenshots.

**KB articles this section generates:**
- `stripe-onboarding.md` — high priority (T-01, T-03)

**Support macros:** M-08 (Stripe asking for SSN), M-11 (onboarding start)

---

## Section 5 — Payout Timing and History

**User outcome:** Treasurer understands when they get paid and can track past payouts.

**Canonical route:** `/club-admin/payments` (same page as onboarding; payouts section below)

**Rough steps (qa-draft):**
1. From the Club Admin sidebar, open **Payments**.
2. The Payments page shows:
   - Current account status (Connected / Under Review / Not Connected)
   - Payout schedule (typically 2–7 business days after show closes)
   - Per-show payout history: gross amount, platform fee, net payout, transfer status

**Screenshots:** Payments page with payout history table.

**KB articles this section generates:**
- `payout-timing.md` — high priority (T-02: "When will we get paid?")
- `platform-fee.md` — medium priority (T-09: "What does the platform fee cover?")
- `refunds-and-payouts.md` — medium priority (T-10: "We did a refund — how does that affect our payout?")

**Support macros:** M-09 (Stripe under review), M-10 (payout timing)

---

## Section 6 — Common Treasurer Questions

This section maps to KB articles, not app steps. Each item is a standalone KB article from the question bank.

| Question | Article | Priority |
|---|---|---|
| "Stripe is asking for my SSN — is this normal?" | `stripe-onboarding.md` | high (T-03) |
| "When will we get paid for the show?" | `payout-timing.md` | high (T-02) |
| "Stripe says our account is under review — what do we do?" | KB: investigation cookbook recipe | high (T-04) |
| "A club member needs to be removed" | `club-admin-guide.md` § Club Members | low (T-06) |
| "How do we update our bank account info in Stripe?" | `stripe-onboarding.md` (link to Stripe Express dashboard) | medium (T-07) |
| "What does the platform fee cover?" | `platform-fee.md` | medium (T-09) |
| "We did a refund — how does that affect our payout?" | `refunds-and-payouts.md` | medium (T-10) |

---

## Section 7 — Club Members

**User outcome:** Club admin views or updates the list of people with club-level access.

**Canonical route:** `/club-admin/members`

**Note:** Cataloged in `pageDirectory.ts` (#1014).

**Rough steps (qa-draft):**
1. From the Club Admin sidebar, open **Members**.
2. Existing club members are listed with their role (Club Admin / Secretary).
3. To add a member: click **Add Member** → search for their account by email → assign a role → Save.
4. To remove a member: open the member row → **Remove** → confirm.

**Screenshots:** Members list; add member dialog.

**Status:** `walkthrough-needed` — verify route and page structure before screenshotting.

---

## Cross-References

- Workflow source map: `docs/user-guides/workflow-source-map.md` §21–23
- Role definition: `docs/roles/club-admin.md`
- Stripe treasurer guide (full walkthrough): `docs/operations/stripe-treasurer-guide.md`
- Investigation cookbook: `docs/support/investigation-cookbook.md` (payout, Stripe Connect recipes)
- Support macros: M-08, M-09, M-10, M-11, M-16

## QA-Draft Friction Findings

| Finding | Section | Backlog action |
|---|---|---|
| `/club-admin/payments` cataloged in pageDirectory.ts (#1014) | §4, §5 | Resolved — section can be documented |
| `/club-admin/members` cataloged in pageDirectory.ts (#1014) | §7 | Resolved — section can be documented |
| Stripe onboarding screenshots need a fresh sandbox run | §4 | Don't reuse any existing screenshots; re-walk in sandbox before publishing |
| Club Admin role is minimal in fall 2026 (by design) | All | Don't expand scope; link to role doc for what's deferred |
| Site admin creates clubs — club admin only edits | §2 | Explicit note in guide: "If your club is not in myK9Show yet, contact us" |
