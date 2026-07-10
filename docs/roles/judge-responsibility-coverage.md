# Judge Responsibility Coverage

## Purpose

This document maps the real-world responsibilities of the trial judge to myK9
coverage for fall 2026 launch readiness, following the pattern of
[`secretary-responsibility-coverage.md`](secretary-responsibility-coverage.md).

It is a best-current-evidence snapshot, seeded from:

- [`docs/roles/judge.md`](judge.md) (fall scope decision: judge is not a primary role)
- [`docs/roles/steward.md`](steward.md)
- [`docs/goals/fall-2026-launch-readiness-scorecard.md`](../goals/fall-2026-launch-readiness-scorecard.md)
- Existing OpenSpec specs: `offline-scoring-durability`, `exhibitor-show-day-access`, `ringside-passcode-throttle`
- The 2026-07-09 secretary verification sweep (judge-adjacent rows S1.3, S4.5, S6.2, S7.1)

It is not a fresh code audit. Rows that need a new walkthrough, ringside
rehearsal, or registry check say so in the evidence column.

## Scope

**In scope:** what a judge must be able to do on show day for fall 2026 —
which, per the fall scope decision, happens inside the ringside `/at-show`
experience (passcode access, no judge login) plus the judge-adjacent artifacts
the secretary produces (assignments, schedules, judge books, certification).

**Out of scope (deferred post-fall):** judge login/dashboard, self-service
assignment viewing, schedule-update notifications, cross-club judging history,
and any dedicated steward experience.

## Status Labels

Same labels as the secretary matrix: Covered, Evidence partial,
Implementation partial, Potential gap, Gap, Deferred.

## Coverage Matrix

### J1. Ring Access And Identity

| Responsibility                                                                    | Fall scope | Current myK9 coverage                                                                | Status           | Evidence / verification needed                                                                                                                                                                    |
| --------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------ | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Get into the ringside scoring experience with a show passcode, no account needed. | Required   | `/at-show` SmartSignInPage → `validate-passcode` edge fn → anon session with claim   | Evidence partial | Inventory complete 2026-07-10: sign-in → `validate-passcode` → claim stamp traced; QR/print slip confirmed. **Finding:** throttle RPCs (`check_login_rate_limit`) exist in no tracked migration — confirm live DB + backfill. Judge-device cold-session walk still pending. |
| Act with judge-level permissions once signed in (score, not administer).          | Required   | `ringside_update_entry` SECURITY DEFINER RPC + `ringside_role` claim in `app_metadata` | Evidence partial | **Code-verified CLOSED 2026-07-10 (J1.2 Phase 0):** ringside writes auto-route to the RPC (`ringsideEntryRpc.ts`), which authorizes manager/assigned-judge/steward/passcode-claim tiers and raises explicit 42501 errors — no silent 0-row path; grants deny-by-default. Remaining: live staging checklist (claim propagation via `refreshSession`, end-to-end score persist, OCC toast, steward column filtering UX). |
| Stay scoped to the correct show and survive session expiry gracefully.            | Required   | `RingsideShowBoundary`, `RingsideSessionHeartbeat`, `AtShowAccessGate`               | Potential gap    | Inventory 2026-07-10: show scoping enforced by `AtShowAccessGate` (tested). **Finding:** `regenerate_show_passcodes` does not revoke already-stamped session claims and claims carry no expiry — a mid-show revocation would not cut off a signed-in device. Live regeneration walk needed. |

### J2. Ring Preparation

| Responsibility                                                             | Fall scope | Current myK9 coverage                                             | Status           | Evidence / verification needed                                                                                          |
| --------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------ | ---------------- | ------------------------------------------------------------------------------------------------------------------------ |
| See the classes assigned to the ring, in order, with class-level details.  | Required   | `AtShowClassListPage`, class info incl. time limits/visibility     | Evidence partial | Pages and adapter tests exist (`buildClassInfo` time-limit/visibility tests). Needs judge-persona walk per registry.     |
| See the entry list / run order for the current class as check-ins happen.  | Required   | `AtShowEntryListPage`, `AtShowCombinedEntryListPage`, run order    | Evidence partial | `applyCombinedRunOrder` + persist tests exist; run-order writes replicated (S1.4 sweep). Needs live check-in-flow walk. |
| Know the search-area parameters for the class (hides, distractions, time). | Required   | Class detail data on ringside pages                                | Potential gap    | Corrected 2026-07-10: `classes.hides_known`/`distraction_count` HAVE existed since migration 033 but are never wired into ringside display (`buildClassInfo` surfaces only time limits + area count), and are class-aggregate, not per-area. Gap = display wiring + granularity.             |

### J3. Scoring

| Responsibility                                                                          | Fall scope | Current myK9 coverage                                              | Status           | Evidence / verification needed                                                                                                                                  |
| ---------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------ | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Score each entry: time, faults, qualifying/NQ/EX/DQ result with reason, per registry.   | Required   | `AtShowScoresheetPage` + ringside scoring flow                     | Evidence partial | Scorecard: ringside judge/steward phases need full re-walk. Registry-specific result vocabularies (AKC/UKC/ASCA qual codes) need per-registry verification.      |
| Have scores land on the authoritative entry record without duplicates or lost writes.   | Required   | `ringside_update_entry` RPC (OCC) + replicated entry writes        | Evidence partial | OCC RPC exists (migration 2026-06-21); known prior conflict-storm incident on staging from stale demo clients. Needs current conflict-handling walk.             |
| Keep scoring when venue internet drops.                                                 | Required   | Offline-first replication; `offline-scoring-durability` spec       | Evidence partial | Durable-first updateEntry pattern shipped (#1230); strong unit evidence. The full offline→reconnect ringside rehearsal is still the open long-lead launch gate. |
| Not see or need exhibitor-private data while scoring.                                   | Required   | Ringside read RLS via passcode anon session (Phase E partly open)  | Evidence partial | Passcode anon-session read path done 2026-06-24; Phase E leftovers (anon hard-delete, CAPTCHA) recorded. Verify current read-surface minimality.                 |

### J4. Class Completion And Results Handoff

| Responsibility                                                                       | Fall scope | Current myK9 coverage                                                 | Status           | Evidence / verification needed                                                                                                                    |
| -------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Finish a class: all entries scored, placements computed, class marked complete.      | Required   | Server-authoritative `refresh_class_scoring_state` + placement recalc | Covered          | Verified in the 2026-07-09 sweep (S6.3): trigger-driven, only at 100% scored, qualified-only ranking. Judge-side completion walk still worthwhile. |
| Hand results to the secretary for verification against paper.                        | Required   | Shared `entries` row: ringside and paper scoring converge             | Evidence partial | One source of truth confirmed (S6.2). The judge/secretary verification rhythm needs a live rehearsal.                                              |
| Sign the official paper record (judge's book, AKC certification page).               | Required   | Secretary-printed official PDFs (AKC certification, UKC judges books) | Evidence partial | Forms wired and tested (S7.1/S7.2). Physical signature flow is paper; needs print-hardware evidence only.                                          |

### J5. Corrections And Exceptions

| Responsibility                                                             | Fall scope | Current myK9 coverage                                        | Status                 | Evidence / verification needed                                                                                                            |
| ----------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Correct a scoring mistake at the ring before the class closes.             | Required   | Re-select scored entry, re-save or clear (paper + ringside)   | Covered                | Code-verified 2026-07-10: `handleResetScore` clears scored fields via the judge-writable `ringside_update_entry` RPC and the placement trigger recalcs; test asserts the reset.       |
| Handle absent/excused/withdrawn dogs at the ring.                          | Required   | Entry status transitions visible ringside; secretary scratch  | Evidence partial       | Secretary side remediated 2026-07-09 (scratch undo, count coherence). Judge-side view of scratches/absences needs a walk.                   |
| Resolve conflicting concurrent edits (steward + judge, or two devices).    | Required   | OCC on `ringside_update_entry`; replication conflict manager  | Evidence partial       | Conflict machinery heavily unit-tested; live two-device conflict walk missing.                                                              |
| Escalate anything the judge cannot fix to the secretary without app-hopping. | Required   | Same-app: `/at-show` and secretary surfaces in one myK9Show   | Gap                    | Verified 2026-07-10: announcements/messages have zero wiring into the `/at-show` route tree — no escalation surface reaches the ringside anon context. Remediate by mounting/linking the existing announcement surface (no new UI).      |

### J6. Assignments And Scheduling (Judge-Adjacent, Secretary-Owned)

| Responsibility                                                          | Fall scope | Current myK9 coverage                                            | Status           | Evidence / verification needed                                                                                                              |
| -------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------ | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Be assigned to classes with workload visible to the secretary.          | Required   | Wizard/setup judge assignment; `JudgesList` counts               | Covered          | Verified + remediated 2026-07-09 (S1.3): assignment writes replicated, tests green. Post-save workload counts verified.                     |
| Know their schedule (via the secretary-published Judge's Schedule).     | Required   | Judge Schedule / Judge Entry Counts reports                      | Evidence partial | Reports render per S4.3; judge-facing adequacy (est. times, per-ring grouping) needs one review pass with a real judge or proxy.            |
| Have judging credentials/qualifications on record where required.       | Required   | Judge records + `judge_qualifications`; import tooling (#833)    | Evidence partial | Importer done; real AKC/UKC directory data still not loaded (open OPEN-TODOS item). ASCA judge creation absent from JudgesPicker by design. |
| View own assignments, get schedule-change notifications, track history. | Post-fall  | `/judge/dashboard`, `/judge/stats`, `/judge/check-in` (shipped)  | Potential gap (doc/scope conflict) | Deferral contradicted by code (found 2026-07-10): a judge dashboard is implemented, routed in `App.tsx`, nav-registered, role-gated, and tested. Owner decision needed: un-defer and own it, or delete per the consolidation rule.                                                       |

## Launch-Risk Summary

### Highest-Risk Required Items

| Item                                       | Why it matters                                                                                     | Next evidence needed                                                                                       |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Judge write-permission verification (J1.2) | A judge who cannot save a score on show day is a P0; the historical RLS gap was silent.            | Live judge-passcode session on staging: score an entry, verify the write lands; check RLS path explicitly. |
| Full ringside judge/steward re-walk        | Scorecard has flagged this since June; every J2/J3 row leans on it.                                | End-to-end judge-persona walk per registry (AKC SW, UKC NW, ASCA SD) on seeded shows.                      |
| Offline→reconnect ringside rehearsal       | Same long-lead gate as secretary S9.1/S9.2 — one rehearsal covers both roles if planned together. | Two-device offline scoring → reconnect → verify no lost/duplicate scores.                                  |
| Registry result vocabularies at the ring   | Wrong qual-code options at the ring corrupt official results.                                       | Per-registry scoresheet walk comparing options against rulebook qual codes.                                |

### Deferred (Confirmed Out Of Fall Scope)

- Judge login, dashboard, self-service assignment view, notifications, history.
- Dedicated steward experience (volunteer roster covers fall needs).

## Maintenance Rules

Same as the secretary matrix: responsibilities stay phrased as real-world
obligations; Covered requires evidence, not just a route; gaps link to
`OPEN-TODOS.md` or a focused plan before implementation begins.
