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
- **In flight (other sessions):** [#773](https://github.com/rbeezley/myk9-platform/pull/773) anon-RBAC trial page; "Public Results Release Gate" (finding B), mig `20260616120000` pending push.
- **Secretary golden path:** still **Yellow**, not yet re-walked.

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
3. **Exhibitor remaining:** verify finding B (class-results) once it lands; walk **P1-04**
   (refund/withdrawn state agreement across exhibitor ↔ secretary) using the seeded refunded entry.
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
7. **Replication-leak sweep** *(NEW)* — audit every public/anon route that reads
   entries/classes/trials from the offline replication store and switch to a direct PostgREST read.
   Recurring pattern: #753 (TV display), #768 (styled landings), finding B (class results). Finding
   B fixes one instance; this tracks the rest.
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
