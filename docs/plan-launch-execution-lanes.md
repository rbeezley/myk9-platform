# Plan: Fall Launch — Execution Lanes (canonical to-do)

> **Status:** Active

**Reconciled:** 2026-06-16. This is the single source for launch sequencing. Each **lane step**
(not each inventory line) is the unit that becomes its own fresh conversation — that keeps one
session from re-deriving context another already established.

Pre-launch, no real users yet. Direction: consolidate into a smooth role workflow; close the
launch gate with *evidence* before more speculative UI lands.

## Current state (so fresh sessions don't redo)
- **Exhibitor golden path:** steps 1–8 re-walked; coherent. Findings A (My Entries placement)
  **merged** ([#775](https://github.com/rbeezley/myk9-platform/pull/775) + [#776](https://github.com/rbeezley/myk9-platform/pull/776)); P1-01/P1-02/P1-03 cleared. Scorecard row → **Yellow**.
- **Finding B (public results) — DONE:** [#779](https://github.com/rbeezley/myk9-platform/pull/779) merged + mig `20260616120000` applied (2026-06-16). Server-side per-field visibility-cascade gate + direct `publicReads.ts` path; resolves the stale class-results read **and** closes a pre-existing anon over-broad `entries` SELECT (withheld scored columns + payment/PII on public detail routes).
- **In flight (other sessions):** [#773](https://github.com/rbeezley/myk9-platform/pull/773) anon-RBAC trial page (management chrome on public trial page).
- **Secretary golden path:** **re-walked 2026-06-17** against the canonical seed — see
  [`docs/audits/2026-06-ux-journeys/04-secretary-rewalk-2026-06-17.md`](audits/2026-06-ux-journeys/04-secretary-rewalk-2026-06-17.md).
  Stays **Yellow** — workbench is strong and three prior High findings resolved, but **two blockers
  gate Green:**
  - **F1 (CRITICAL):** no account holds the `secretary`/`club_admin` role — the Lane 1.1 reseed
    restored accounts but not role grants, so `/secretary/dashboard` 403s with the demo account.
    Durable fix = add club-scoped role grants to `seed-demo.sql` (SQL in the audit doc). A manual
    grant was applied to unblock the walk; **codify it.**
  - **F2 (HIGH):** Entry Management badges scored/`completed` + `move-up-requested` entries as
    "Pending," over-counting the review queue 7 vs the true 3 (Dashboard + Show Desk both show 3).
    Root cause: `mapEntryStatus` (`entryManagementUtils.ts:14`) lacks `completed`/`move-up-requested`
    cases → `default: PENDING`.
  - Announcement time-to-task baseline recorded (2 clicks to compose, 3–4 to send) and the move-up
    **decision** walk completed (decision dialog is good; target-class picker offers invalid lower/
    cross-element targets — F3).
- **Show-day walk (Step 4):** **walked 2026-06-17** (Phase A–F, secretary ↔ steward ↔ judge) —
  see [`docs/audits/2026-06-ux-journeys/05-showday-walk-2026-06-17.md`](audits/2026-06-ux-journeys/05-showday-walk-2026-06-17.md).
  Secretary half is coherent; **ringside golden path stays Yellow** — judge/steward phases are
  **unverified, not passing**. Three blockers:
  - **S1 (HIGH, app bug):** public `/results` deep link dead-ends for a true guest ("No Classes
    Available"). `ClassDetailsPage` reads the class via the **replication layer only**; the released
    results *view* returns 200 but the page bails at `index.tsx:273` (`!currentClass`).
    `getPublicClassById` doesn't exist — add it (mirror `getPublicShows`) + cold fallback. Twin leak
    to check: `/trials/:trialId`.
  - **S2 (HIGH, fixture):** no `judge_assignments` seeded → judge dashboard has no route to a ring,
    and a judge admitted to ringside directly sees **0 entries everywhere** (entry-visibility RLS).
    Seed a Heartland judge assignment (+ role grant), mirroring §10's secretary grant.
  - **S3 (HIGH, fixture):** no ringside passcode seeded → the `SmartSignInPage` passcode branch
    (steward entry) can't be walked. Seed a Heartland passcode/`ringside_session`.
  - Also: S4 withdrawn entry counted as live across Show Map (9 vs 8 entries; Exterior "1/2
    complete") **and** ringside picker ("0/2"); S5 Saturday trial badges contradict ("Not started" +
    "Needs wrap-up" + "1/3 complete"); S6 stale `INTENT.md:152` (judges now land on `/judge/dashboard`).

---

## Lane 1 — Evidence + Launch Gate  *(do first; this is ONE arc, not 8 todos)*
Goal: flip the scorecard Secretary + Exhibitor golden-path rows to Green with linked evidence.
Establishes what's actually broken before more UI changes land.

1. **Establish the canonical seed fixture set** *(prerequisite — unblocks steps 2–4 + P1-04)*.
   Not just "clean clutter": seed the *gaps* too — one accepting show **with classes**, one class
   with **released results**, a **pending move-up** request, and a **refunded/withdrawn entry**
   (for the P1-04 seam). One fixture investment replaces several separate seed todos.
2. **Secretary golden-path re-walk** (11 steps) — explicit launch-gate row. Folds in: announcement
   time-to-task baseline from the Message Center, and the move-up *decision* walk (not just the
   empty state).
3. **Exhibitor remaining → just P1-04** (finding B resolved by #779). Walk **P1-04**
   (refund/withdrawn state agreement across exhibitor ↔ secretary) using the seeded refunded entry;
   while there, confirm the exhibitor results display renders correctly against #779's gated read.
4. **Manual show-day walk** (full Phase A–F arc) against the seed fixtures.
5. **UX Journey Audit Phase 6 — time-to-task re-measure** — **DONE 2026-06-18.** Live read-only
   re-walk (secretary + exhibitor) against the Heartland seed; delta tables recorded in
   [`SUMMARY.md`](audits/2026-06-ux-journeys/SUMMARY.md#phase-6--time-to-task-re-measure-lane-15).
   Numbers moved as intended: 3 secretary tasks now measurable (approve / move-up / announcement),
   check-in 1-click + human labels (F5), closeout de-risked (F4-XML + P1-06 send gated); exhibitor
   entry dead end gone (UX-P1-01), own placed result now 0-click on the hub (Finding A PlacementPill).
   Verified live: F2 (pending count 3 not 7), F3 (constrained move-up picker), UX-P2-04/P2-05.
   At-show tasks (ring status, dogs-ahead) deferred to the Lane 1.4 show-day walk (doc `05`).
6. **Scorecard close-out** — **DONE 2026-06-18.** Flipped Secretary + Exhibitor golden-path rows to
   **Green** (gated on real-user test) with evidence links, and swept all 10 primary dimensions in
   [`fall-2026-launch-readiness-scorecard.md`](goals/fall-2026-launch-readiness-scorecard.md#scorecard-close-out--2026-06-18-lane-16).
   Result: 3 Green (both golden paths + Test/CI health), 6 Yellow, 1 Unknown (Admin), **0 Red, no
   open P0/P1**. The launch gate is not yet met — remaining work is the Yellow gaps + Admin
   walkthrough; the biggest single gate is **real-user testing (step 7)**, which also supplies the
   missing UX-clarity evidence.
7. **Phase 3 — real-user testing** — **DEFERRED to the final pre-launch gate (decision 2026-06-18).**
   Moved out of the Lane 1 arc to run *after* Lanes 2–4 (and the launch-affecting parts of Lane 5) so
   real users test a near-final product, not a surface about to change under them. Lanes 1.1–1.6
   already supply the internal evidence that de-risks getting there; this is the last gate before
   launch. See **"Final pre-launch gate"** below. (It remains the sole closer for the overall launch
   criterion "real-user testing completed" + the UX-clarity scorecard dimension.)

   With step 7 deferred, **Lane 1's internal arc is complete** (1.1–1.6 done). The next active work is
   Lane 2 onward; the only remaining non-real-user Lane 1 thread is the **Admin functional walkthrough**
   (scorecard "Admin minimum" Unknown), which can run any time and is not gated on Lanes 2–5.

## Lane 2 — Secretary Operational UX  *(after Lane 1 has evidence; may overlap)*
1. **Standardize the shared 3-dot row-action menu** (primitive first). — **DONE 2026-06-18**
   ([#825](https://github.com/rbeezley/myk9-platform/pull/825)). New canonical `RowActionMenu`
   primitive (`components/ui/RowActionMenu`); destructive items use the themed `text-destructive` /
   `--destructive-strong` tokens (WCAG-AA) instead of hard-coded reds; `ui/ThreeDotMenu` now a thin
   adapter, dead `users/ThreeDotMenu` deleted, EntryActionsMenu + ClassRowActionsMenu + admin
   RowActions migrated. **Follow-up DONE 2026-06-18:** `common/ThreeDotMenu` (12 consumers, the last
   parallel impl) folded onto `RowActionMenu` — there is now a single menu implementation behind two
   thin prop-preserving adapters.
2. **Entry Management checkbox multi-select** for bulk editing — *after* #1, or the interaction
   pattern gets touched twice. — **DONE 2026-06-18**
   ([#827](https://github.com/rbeezley/myk9-platform/pull/827)). Table-view checkbox multi-select +
   sticky bulk-action bar (Approve / Reject / Check-In) reusing existing bulk mutations; selection
   prunes on filter/tab change. Waitlist bulk action deferred (needs the real `waitlist_entries`
   workflow).
3. **Print testing on venue hardware.** *(hardware task — not code)*

## Lane 3 — Pre-Launch Hardening  *(safe to parallelize)*
1. **Fix `--success` token** — fails WCAG AA as small text. — **DONE 2026-06-18**
   ([#832](https://github.com/rbeezley/myk9-platform/pull/832)). Bumped light-mode to green-800
   (`22 101 52`); dark-mode `--success-foreground` overridden to green-900 (`20 83 45`);
   `EntryStatusStepper` updated from `text-white`; regression tests in `success-token.test.ts` +
   `semanticStatusTokens.test.ts`.
2. **E2E suite stability** — **DONE 2026-06-18 (Lane 3.2).** Nightly Active suite (20 Playwright +
   4 Vitest specs) green: fixed 3 exhibitor failures (exhibitor restore migration
   `20260618140000`), loosened UTC-midnight date-picker assertion. Scoped `playwright.ci.config.ts`
   to 2 PR Smoke specs; re-enabled `e2e-myk9show` CI job (runs on every PR/push, not yet a
   required check — see #4). Payout cron migration `20260618130000` idempotency-fixed. — gates #4.
3. **Rotate + lock down E2E test accounts.**
4. **Make E2E CI jobs blocking** — *only after #2 + #3* (blocking a flaky suite blocks every PR).
5. **CI-gated Vercel deploys** — after #4.
6. **Pre-load AKC & UKC Judge Directory.** — **Tooling DONE 2026-06-18**
   ([#833](https://github.com/rbeezley/myk9-platform/pull/833)). `supabase/seed-data/akc-ukc-judges.csv`
   template + `scripts/import-judges.ts` converter (CSV → idempotent SQL migration). Data rows
   pending: populate CSV with real AKC/UKC exports, run `npx tsx scripts/import-judges.ts > migration.sql`.
7. **Replication-leak sweep — DONE 2026-06-18.** Audit confirmed **clean** — no stragglers.
   All public/anon routes use direct PostgREST reads (`publicReads.ts`) or replication-with-fallback
   (trials/shows self-fall-through on cold guest store). `getPublicClassById` exists and is integrated.
   - Watch-item: ~30 wall-clock perf asserts — reactive only, do not chase proactively.

## Lane 4 — Payments Go-Live  *(isolated; one owner; no casual parallel Stripe/live-mode writes)*
1. **Treasurer guide** — **DONE 2026-06-18.**
   [`docs/operations/stripe-treasurer-guide.md`](operations/stripe-treasurer-guide.md) — written for
   club treasurers (non-technical); covers Express onboarding, payout timing, FAQ.
2. **Sandbox pre-flight** — fix `STRIPE_WEBHOOK_SECRET` on the unified project (`sojmvhhwsjxmfistvzbe`).
   Per the operator runbook (Step 0 note, 2026-06-09): the webhook 500s on every event because this
   secret is missing. Set it in Supabase dashboard secrets → redeploy `stripe-webhook` function →
   confirm events arrive in the Stripe dashboard log.
3. **Sandbox end-to-end walkthrough** — full loop in test mode: entry payment (card `4242…`) →
   webhook fires and entry flips to `paid` → secretary issues a refund → manual `curl` of
   `cron-process-payouts` with the test `PAYOUT_CRON_SECRET` → transfer appears in Stripe Connect
   sandbox → payout row in `show_payouts` marked `completed`. Screenshot each step (becomes evidence
   for #5 and backup reference for the treasurer guide). Do not proceed to live mode without this proof.
4. **Go-live live-mode tasks** — *after #3 passes.* Dashboard toggle: live mode ON. Three things:
   (a) Enable Connect in live mode (may require a short Stripe review — plan a few days of buffer);
   (b) live webhook endpoint + `supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_<live>`;
   (c) `supabase secrets set STRIPE_SECRET_KEY=sk_live_...` + purge sandbox Stripe IDs from DB
   (`stripe_customers`, `exhibitor_profiles.stripe_customer_id`, `club_stripe_accounts`).
   Full click-by-click in [`docs/operations/stripe-platform-setup.md`](operations/stripe-platform-setup.md)
   under "Go-live — Task 6.3."
5. **Verified manual payout run** — real low-value entry payment + refund + confirm payout transfer
   lands in the connected club's bank. This is the last proof before the cron takes over.
6. **`cron.schedule` migration for payouts** — **migration written 2026-06-18**
   ([`supabase/migrations/20260618130000_payout_cron_schedule.sql`](../supabase/migrations/20260618130000_payout_cron_schedule.sql)).
   Fill in `REPLACE_WITH_PAYOUT_CRON_SECRET` from `supabase secrets list`, then push. *After* #5.

## Lane 5 — Architecture / Data Model  *(parallel, below show-day launch work)*
1. **Architecture Phase 6** (flatten `judges/reads.ts` per ADR-008).
2. **Non-atomic dog creation + child registration** → RPC.
3. **Split Pull Management** local pull state from refund/accounting metadata.
4. **Remove completed kill-switch flags** — *only after the first live shows*.

---

## Final pre-launch gate  *(runs last — after Lanes 2–4 + launch-affecting Lane 5)*
**Real-user testing (was Lane 1.7 / North Star Phase 3).** Deferred here 2026-06-18 so 2–3
non-technical users (one secretary, one or two exhibitors) test a **near-final** product. Watch
silently, log every hesitation, fix each one. This is the sole closer for two launch criteria:
- the overall gate "real-user testing completed with no confusion-level findings outstanding", and
- the scorecard **UX clarity** dimension (currently Yellow — its primary missing evidence *is* this).

**Entry condition:** Lanes 2–4 done and the launch-affecting parts of Lane 5 settled. *Not* gated on
Lane 5 #4 (kill-switch removal — itself post-first-live-shows). The two golden-path rows stay
**Green-gated-on-real-user-test** until this passes. Plan: `docs/plans/strategy/2026-04-11-north-star-fall-2026.md`.

## Defer for now
- **Result Reveal + Share Card**, **AI natural-language access / MCP / BYOK** (planning underway in
  a parallel session; defer the build), **Multi-registry config layer**.
- **User documentation & support library** — outline/structure may start now; final screenshots and
  step instructions wait until UX remediation (Lanes 1–2) settles.

## Post-Fall parked
Prevent duplicate rows in core tables · configurable exhibitor convenience fee · role-mode icon
switcher for sidebar nav · queue-based offline dog create · review `awesome-design-md` · research
Claude Code managed agents for AskQ · unify "Add Entries" with whose-dog branching · scope the entry
wizard dog picker by audience.

---

*Reconciliation notes vs. the prior flat list: the eight UX-audit-cluster items collapsed into
Lane 1 (they were sub-steps, not peers); "clean test-data" reframed as "build the canonical seed";
the replication-leak sweep added (Lane 3.7); Lane 3 re-ordered so E2E-blocking follows stability,
not just account rotation; the Secretary re-walk made explicit (Lane 1.2).*
