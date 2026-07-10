# Judge Responsibility Verification Plan

> **Status:** Active
> Tracked in openspec change: judge-responsibility-verification

**Date:** 2026-07-10
**Source matrix:** [`judge-responsibility-coverage.md`](judge-responsibility-coverage.md)
**Precedent:** [`secretary-responsibility-verification-plan.md`](secretary-responsibility-verification-plan.md) (all 44 rows verified 2026-07-09; 6 defects remediated in PR #1242)

## Purpose

Verify every judge responsibility row against the actual codebase and fall
2026 launch expectations, using the same evidence standard and verification
states as the secretary plan. The judge is not a primary fall role — this plan
scopes verification to the ringside `/at-show` experience plus judge-adjacent
secretary artifacts, and explicitly does not propose a judge portal.

## Ground Rules

Same as the secretary plan, plus:

- Do not expand fall scope. If a row's remediation implies judge login,
  dashboards, or notifications, it is Deferred, not a gap.
- Ringside write paths must preserve OCC (`ringside_update_entry`) and
  offline-first replication semantics.
- Registry correctness (AKC SW / UKC NW / ASCA SD qual codes and scoring
  fields) is verified against rulebooks, not assumptions.

## Verification States And Evidence Standard

Identical to the secretary plan (`Not started` → `Inventory complete` →
`Verified covered` / `Evidence partial` / `Implementation partial` /
`Potential gap` / `Verified gap` / `Deferred accepted` / `Remediation planned`
/ `Remediation complete`), with the same evidence-type table.

## Row Audit Backlog

Phase 1 code-inventory sweep completed 2026-07-10 (five parallel auditors,
orchestrated per the openspec change). Statuses below updated from sweep
evidence; see "Phase 1 Results" for confirmed gaps.

| Row  | Responsibility                                            | Status after Phase 1 sweep (2026-07-10)  | Verification focus                                                                                                     |
| ---- | ---------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------ |
| J1.1 | Passcode entry into ringside, no account.                 | Inventory complete (Evidence partial) | `SmartSignInPage` → `validate-passcode` edge fn → claim stamp confirmed; QR/print slip in `ShowAccessCodesCard`. **Finding:** `check_login_rate_limit`/`record_login_attempt` RPCs have no tracked migration — confirm they exist in the live DB. Judge-code cold session still pending. |
| J1.2 | Judge-level write permissions via claim.                  | Verified covered (code) | Four-tier authz (migrations 20260621171500 + 20260624163000), explicit 42501/40001/P0002 errors, deny-by-default grants, contract test `ringsidePasscodeClaimAuthzRlsContract.test.ts`. Remaining: live staging session per the coverage-matrix checklist. |
| J1.3 | Show scoping + session expiry/regeneration.               | Potential gap    | Show scoping enforced by `AtShowAccessGate`/`ringsideGrantStore` (tested). **Finding:** `regenerate_show_passcodes` only invalidates unused codes — it does not revoke already-stamped anon-session claims (no expiry on `RingsideGrant` or the claim). Live regeneration walk needed. |
| J2.1 | Class list for the ring.                                  | Inventory complete (Evidence partial) | `AtShowClassListPage` replication-backed; page tests are AKC-only — UKC/ASCA behavior inferred from shared mappers. Registry-persona walk pending. |
| J2.2 | Entry list / run order with live check-ins.               | Inventory complete (Evidence partial) | Entry/combined lists read via `atShowDataAdapter` → replicated tables (no direct reads). #1242 fixes verified secretary-side; judge-side reactivity walk pending. |
| J2.3 | Search-area parameters visible (hides/distractions/time). | Potential gap (reframed) | Correction to prior framing: `classes.hides_known`/`distraction_count` HAVE existed since migration 033, but are never read by `buildClassInfo`/ringside display (only time limits + area count surface), and the schema is class-aggregate, not per-area. Gap = display wiring + granularity, not absence. |
| J3.1 | Registry-correct scoring inputs and result codes.         | Inventory complete (Evidence partial) | Per-registry `RESULT_OPTIONS` in `packages/scoring-ui` scoresheets, constrained to Q/NQ/EX/ABS; AKC chip test pins them. Rulebook cross-check (docs/rulebooks PDFs vs constants) still pending. |
| J3.2 | Authoritative, duplicate-free score writes (OCC).         | Verified covered (code) | OCC with conflict-version surfacing (migration 20260625190000) + `mutation-occ.ts` client handling; unit/contract/e2e tests. Live two-device walk remains a rehearsal item, not a code gap. |
| J3.3 | Offline scoring durability.                               | Inventory complete (Evidence partial) | Durable-first `updateEntry` ordering confirmed at `ReplicatedEntriesTable.ts` with tests. Offline→reconnect rehearsal remains the long-lead gate (shared with S9.1/S9.2). |
| J3.4 | Minimal exhibitor data exposure ringside.                 | Inventory complete (Evidence partial) | Claims never widen `can_view_admin` (migration 20260624163000); financial/PII columns stay gated. Phase E leftovers still open: anon hard-delete FK-blocked, CAPTCHA operator TODO. |
| J4.1 | Class completion → placements.                            | Verified covered | No scoring/placement migrations since the 2026-07-09 verification; trigger chain + contract tests unchanged. |
| J4.2 | Ringside↔paper verification rhythm with secretary.        | Inventory complete (Evidence partial) | No in-app checklist exists (confirmed); shared `entries` row is the single source. Live-rehearsal gate, not a code gap. |
| J4.3 | Official paper signature artifacts.                       | Verified covered (digital) | Signature blocks render in `JudgesCertification`/`AKCJudgeReport` etc. with tests. Print-hardware gate shared with S7.4. |
| J5.1 | Correct a score at the ring pre-completion.               | Verified covered | `handleResetScore` clears scored fields via `ringside_update_entry` (judge-writable) and the placement trigger recalcs; test asserts the reset. |
| J5.2 | Absences/scratches visible at the ring.                   | Inventory complete (Evidence partial) | Single replicated status source; #1242 secretary fixes propagate through it. No distinct ringside scratch indicator beyond generic status rendering — visual walk pending. |
| J5.3 | Concurrent-edit conflict resolution.                      | Inventory complete (Evidence partial) | Conflict toast (keep-mine/take-theirs) + resolution path tested, but the Playwright spec uses synthetic conflict events (OCC hold descoped in #602). True two-device walk pending. |
| J5.4 | Escalation path to secretary in-app.                      | Verified gap     | Announcements/messages exist app-side but have ZERO wiring into the `/at-show` route tree — no escalation surface reaches the ringside anon context. Remediation: link/mount existing surfaces, don't build new ones. |
| J6.1 | Assignment + workload (secretary-owned).                  | Verified covered | S1.3 remediation confirmed in code (`ReplicatedJudgeAssignmentsTable` + tests, #1242). |
| J6.2 | Judge schedule report adequacy.                           | Inventory complete (Evidence partial) | Reports render (grouped by trial; Class/Judge/Entries/Est. Time — no per-ring grouping or wall-clock times). Judge-reader adequacy pass pending. |
| J6.3 | Credentials/qualifications records.                       | Inventory complete (Evidence partial) | `judge_qualifications` (migration 049) + creation panel exist; importer built but CSV header-only pending real data. `JUDGE_ORGANIZATIONS` omits ASCA (AKC/UKC/FCI/Other only) — confirm intentional. |
| J6.4 | Self-service judge experience.                            | Potential gap (doc/scope conflict) | Deferral does NOT hold as documented: `/judge/dashboard`, `/judge/stats`, `/judge/check-in` are implemented, routed in `App.tsx`, nav-registered, role-gated, and tested. Decide: un-defer (own it) or delete per the consolidation rule. |

## Phase 1 Results (2026-07-10)

Every row is now at least Inventory complete. Five rows upgraded to
code-verified (J1.2, J3.2, J4.1, J4.3, J5.1, J6.1). Confirmed findings, in
rough severity order:

1. **J5.4 — Verified gap.** No announcement/message surface is mounted
   anywhere under `/at-show`; a judge has no in-app escalation path. Fix by
   linking/mounting the existing announcement surface into the ringside
   context (consolidation rule: no new UI).
2. **J1.3 — Potential gap.** Regenerating show passcodes does not revoke
   already-stamped anon-session claims, and claims carry no expiry. A
   secretary cutting off a compromised device mid-show would not actually cut
   it off. Needs a live regeneration walk, then likely a revocation mechanism.
3. **J1.1 — Tracked-schema drift.** `check_login_rate_limit` /
   `record_login_attempt` are called by `validate-passcode` but defined in no
   tracked migration. Confirm they exist on the live DB and backfill a
   migration so the throttle is reproducible.
4. **J2.3 — Reframed.** Hides/distractions columns exist (migration 033) but
   are never wired into ringside display, and are class-aggregate rather than
   per-area. The prior "not persisted anywhere" framing was wrong.
5. **J6.4 — Doc/scope conflict.** A judge self-service dashboard
   (`/judge/dashboard`, `/judge/stats`, `/judge/check-in`) is shipped, routed,
   and nav-registered despite the documented deferral. Requires an owner
   decision: un-defer or delete the surface.
6. **Minor:** J2.1 page tests are AKC-only; J6.3 `JUDGE_ORGANIZATIONS` omits
   ASCA (confirm intentional); J3.1 rulebook cross-check still outstanding.

Items 1–4 are candidates for a `judge-verification-remediation` OpenSpec
change; item 5 blocks its scoping and needs the owner's call first. Phase 2
(live walks) covers the remaining Evidence-partial rows.

## Execution Phases

1. **Phase 0 — J1.2 first.** The write-permission row is the only Potential
   gap that would be a show-day P0; verify it before anything else via a live
   staging judge-passcode session plus RLS/RPC code trace.
2. **Phase 1 — Code inventory sweep.** Parallel auditors over J1–J6 recording
   routes, components, RPCs, RLS policies, tests, and offline-safety, exactly
   as the secretary sweep did.
3. **Phase 2 — Workflow verification.** Judge-persona walks per registry on
   seeded shows; two-device OCC checks; report-adequacy review.
4. **Phase 3/4 — Remediation.** Focused OpenSpec change(s) per confirmed
   defect cluster, small PRs with tests, statuses updated in the matrix.

Long-lead items (offline rehearsal, print hardware) are shared gates with the
secretary plan — schedule them as combined events, not duplicates.

## Completion Criteria

Same as the secretary plan, applied to J-rows: every row at least
`Inventory complete`; every Potential gap resolved; every fall-required row
verified or carrying a remediation plan or evidence gate; matrix updated;
launch blockers represented in `OPEN-TODOS.md`.
