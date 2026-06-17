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
5. **UX Journey Audit Phase 6 — time-to-task re-measure**; record deltas in `SUMMARY.md`.
6. **Scorecard close-out** — flip Secretary + Exhibitor rows with evidence links; sweep remaining
   scorecard dimensions.
7. **Phase 3 — real-user testing** (after the app is coherent end-to-end).

## Lane 2 — Secretary Operational UX  *(after Lane 1 has evidence; may overlap)*
1. **Standardize the shared 3-dot row-action menu** (primitive first).
2. **Entry Management checkbox multi-select** for bulk editing — *after* #1, or the interaction
   pattern gets touched twice.
3. **Print testing on venue hardware.**

## Lane 3 — Pre-Launch Hardening  *(safe to parallelize)*
1. **Fix `--success` token** — fails WCAG AA as small text.
2. **E2E suite stability** (flake fix; `codex/fix-qa-test-flake-021` in flight) — gates #4.
3. **Rotate + lock down E2E test accounts.**
4. **Make E2E CI jobs blocking** — *only after #2 + #3* (blocking a flaky suite blocks every PR).
5. **CI-gated Vercel deploys** — after #4.
6. **Pre-load AKC & UKC Judge Directory.**
7. **Replication-leak sweep — now a VERIFICATION pass** (mostly subsumed). The recurring pattern
   (#753 TV display, #768 styled landings, finding B class results) was attacked at the root by
   **#779**, which moved the public entries/classes/results/TV reads onto a direct, server-gated
   `publicReads.ts` path. Remaining: a short audit confirming no *other* public/anon route still
   reads entries/classes/**trials** from the replication store (the trials read path wasn't part of
   #779's results scope) — switch any stragglers to a direct PostgREST read. Likely small.
   - Watch-item: ~30 wall-clock perf asserts — reactive only, do not chase proactively.

## Lane 4 — Payments Go-Live  *(isolated; one owner; no casual parallel Stripe/live-mode writes)*
1. **Treasurer guide.**
2. **Go-live live-mode tasks.**
3. **Verified manual payout run.**
4. **`cron.schedule` migration for payouts** — *after* the manual payout proof (#3).

## Lane 5 — Architecture / Data Model  *(parallel, below show-day launch work)*
1. **Architecture Phase 6** (flatten `judges/reads.ts` per ADR-008).
2. **Non-atomic dog creation + child registration** → RPC.
3. **Split Pull Management** local pull state from refund/accounting metadata.
4. **Remove completed kill-switch flags** — *only after the first live shows*.

---

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
