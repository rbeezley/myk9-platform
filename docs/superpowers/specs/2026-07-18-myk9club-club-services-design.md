# myK9Club — Club Services Design (CRM, Training Courses, Dues)

> **Status:** Draft — awaiting user review
> **Date:** 2026-07-18

## Decision: not a separate application

"myK9Club" is a **brand name**, not a new codebase. Club services are built as an
expansion of myK9Show in the existing monorepo, database, and Supabase project.

Rationale:

- ~60% already exists: `clubs`, `club_members` (with `dues_paid_through`),
  `club_officers`, per-club `club_admin` RBAC, club access-request onboarding,
  public `/clubs` pages, and one Stripe Connect Express account per club
  (`club_stripe_accounts`) with payout plumbing.
- The users overlap almost completely (Thursday training student = Saturday
  exhibitor; club admin = show organizer). One login, one dog roster, one
  payment method.
- Precedent: myK9Q started separate and was absorbed back at significant cost.
- Conflicts avoided: the word **"course"** is used everywhere; "class" remains
  reserved for show-competition classes.

**Not offline-first.** Club CRM has no show-day connectivity requirement. All new
tables are plain React Query + Supabase — no `@myk9/replication`. This boundary
is deliberate; do not add these tables to the sync engine.

## Scope decisions (agreed)

| Question              | Decision                                                                 |
| --------------------- | ------------------------------------------------------------------------ |
| Primary slice         | Classes-first (training director), then dues CRM, then member portal     |
| Course shape          | Multi-week courses only in v1; drop-ins/punch-cards deferred             |
| Payment at enrollment | Online preferred, offline recordable ("pay club directly") — like shows  |
| Who can enroll        | Per-course setting; default open-to-all with member/non-member pricing   |
| Capacity              | Hard cap + manual waitlist ("Offer spot" button); no auto-promotion v1   |
| Dues                  | Ledger + online payment + full renewal automation (reminders, auto-lapse) |
| Volunteer hours       | Self-reported entries, admin-verifiable; no approval workflow v1          |
| Meeting minutes       | Future Phase 5 — out of scope for this build                              |

## Revenue model

1. **v1: pass-through convenience fee** on online payments (course enrollment,
   dues) via Stripe application fee on the club's Connect account — small flat
   fee + small percentage (e.g., $1 + 2–3%) so low-dollar dues still earn.
   Payer-side fee: the club experiences online payments as free.
2. **Later: club subscription tier** for the CRM/automation itself, using the
   existing premium-subscription machinery billed to the club. Introduce after
   the CRM proves sticky; pre-launch is the time to experiment.

## Architecture & placement

- **Club admin** (`/club-admin`, existing `ClubAdminRoute` gate): grows from
  Members + Payments into the CRM workspace — Members (roster + dues ledger),
  **Courses** (create/schedule/roster/waitlist), Payments (existing).
- **Public** (`/clubs/:id`): new **Classes** tab listing open courses with
  Enroll. This is the non-member recruiting funnel.
- **Member portal**: "My Club(s)" section for logged-in users — dues status +
  pay button, my enrollments, my volunteer hours.
- **Money**: all payments via each club's existing Stripe Connect Express
  account; same checkout/webhook/refund patterns as show entries. Refunds via
  the existing platform-balance refund architecture.

## Data model

Six new `public` tables. Every table gets explicit GRANTs (post-Oct-2026
Supabase rule) **and** RLS. Migration prefix pattern `NNN_description.sql`;
each migration reviewed by the migration-auditor agent before push.

### Courses

- **`club_courses`** — `club_id`, `title`, `description`,
  `instructor_person_id` FK → `people` (instructors are people; no instructor
  table in v1), `location`, `capacity`, `member_price_cents`,
  `nonmember_price_cents` (NULL ⇒ members-only pricing not offered),
  `members_only` bool, `start_date`, `num_weeks`, `meeting_day`,
  `meeting_time`, `enrollment_opens_at`, `enrollment_closes_at`,
  `status` ∈ draft / open / full / in_progress / completed / cancelled.
- **`club_course_meetings`** — one row per meeting date, generated from the
  course pattern, individually editable (holiday skips, weather). Future anchor
  for attendance (not built in v1).

### Enrollment

- **`club_course_enrollments`** — `course_id`, `person_id`, optional `dog_id`,
  `status` ∈ enrolled / waitlisted / dropped, `waitlist_position`,
  `payment_status` ∈ paid_online / paid_offline / unpaid, `amount_cents`,
  `price_tier` ∈ member / nonmember — **snapshotted at enrollment** (a later
  membership lapse never retro-changes price), Stripe payment intent id,
  `offline_payment_note`, `recorded_by`.

### CRM

- **`club_dues_payments`** — ledger: `club_member_id`, `amount_cents`,
  `method` ∈ stripe / check / cash / other, `period_start`, `period_end`,
  `recorded_by`, Stripe ids. Each payment extends
  `club_members.dues_paid_through`, which remains the derived current-status
  column the rest of the app reads.
- **`club_dues_reminders`** — send log (member, type ∈ upcoming / overdue /
  lapsed, sent_at). Guarantees the cron is idempotent — never double-sends.
- **`club_volunteer_hours`** — `club_id`, `person_id`, `date`, `hours`,
  `activity`, `notes`, `verified_by`. Deliberately separate from show-scoped
  `volunteers` tables; a later report may join both.

### RLS shape

- Club admins: full CRUD within `is_club_admin(club_id)`.
- Members: read/insert own rows (own enrollments, own volunteer hours, own
  dues history).
- Public/anon: read only `open` courses whose club allows non-member
  enrollment. Verify anon behavior in a cold session (per standing feedback).

## Key flows

**Enroll:** course page → Enroll → sign-in/up if needed (recruiting funnel) →
optional dog pick → price resolves live from `club_members` status → Stripe
Checkout (Connect, pass-through fee) or "I'll pay the club directly" if club
enables it → confirmed. Full course ⇒ `waitlisted` + position, no payment.

**Waitlist offer (manual):** drop occurs → director sees waitlist on roster →
"Offer spot" → email with enroll-and-pay link → director records outcome.

**Record offline payment:** shared component used from the course roster and
the member ledger — method, amount, note → flips `payment_status` or appends
to `club_dues_payments` and extends `dues_paid_through`.

**Dues automation (nightly cron, Vault-secret pattern):** per active member,
compare `dues_paid_through` to today → T-30: renewal email with pay link →
overdue: reminder → past grace (club-configurable, default 30 days): flip
`membership_status` → `lapsed`, notify member + treasurer. All sends logged in
`club_dues_reminders`; re-runs send nothing twice. Emails go through the
Resend edge-function path (not GoTrue — avoids the auth-email rate cap).
**Lapse is a status flip, not an access revoke** — lapsed members can log in
and fix it in one click. Un-lapsing must be frictionless.

**Edge cases:** delayed webhook ⇒ enrollment sits `unpaid` with intent
recorded, webhook reconciles (show-entry pattern). Course cancelled ⇒ refunds
via platform-balance architecture. Timezone-explicit date math for the cron
(follow the entry-close timestamptz precedent).

## Phasing & testing

Each phase is independently shippable and merges before the next starts. A
phase is not complete until its tests pass.

1. **Courses & rosters (no money):** course tables + CRUD in `/club-admin`,
   public Classes tab, enroll/waitlist (all `unpaid`), offline-payment
   recording. Clubs can run classes day one.
2. **Online payment:** Stripe Checkout on enrollment, pass-through fee,
   webhook reconciliation, refund-on-cancel.
3. **Dues CRM:** ledger + treasurer UI, online dues payment (reuses Phase 2
   checkout), nightly reminder/auto-lapse cron + send log.
4. **Member portal & volunteer hours:** "My Club" section, volunteer-hours
   self-reporting + admin verification.

**Testing per phase:** vitest unit tests for pure logic (price resolution,
waitlist positioning, reminder-date math — timezone-explicit); service tests
for enrollment/ledger mutations; RLS verification for every new table incl.
anon cold-session checks; Playwright e2e for the enroll happy path (Phase 1)
and Stripe test-mode checkout (Phase 2); cron idempotency test proving a
double-run sends zero duplicate emails.

## Future: Phase 5 — Club governance (out of scope)

Meeting minutes for the **club secretary** (distinct from show secretary):
draft → review → approve → publish workflow, member-visible minutes archive,
meeting attendance, motions (moved/seconded from the member roster). Competes
with Boardable/OnBoard-style tools clubs currently pay for. Zero overlap with
the payment/roster/cron spine built in Phases 1–4 — which is exactly why it is
deferred: it reuses nothing and would dilute v1. Nothing in the current data
model blocks it.
