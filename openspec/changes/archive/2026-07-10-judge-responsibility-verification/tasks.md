## 1. Planning Artifacts

- [x] 1.1 Create OpenSpec proposal, design, and requirement spec for judge responsibility verification.
- [x] 1.2 Add `docs/roles/judge-responsibility-coverage.md` (coverage matrix, fall-scoped).
- [x] 1.3 Add `docs/roles/judge-responsibility-verification-plan.md` (row audit backlog, J1.2 first).
- [x] 1.4 Register both docs in `docs/README.md` per the docs-index convention.
- [x] 1.5 Validate OpenSpec artifacts (`pnpm openspec validate judge-responsibility-verification`).

## 2. Verification Kickoff (execution tracked by the plan doc)

- [ ] 2.1 Phase 0: verify J1.2 — code trace DONE 2026-07-10 (gap closed in code: RPC four-tier authz, explicit errors, correct grants); live staging judge-passcode session still pending per checklist.
- [x] 2.2 Phase 1: run the code-inventory sweep over J1–J6 rows (routes, components, RPCs, RLS, tests, offline-safety) and update row states to Inventory complete. — DONE 2026-07-10: five parallel auditors; every row now ≥ Inventory complete; 6 rows code-verified; findings recorded in the plan doc's "Phase 1 Results" section.
- [x] 2.3 Record confirmed gaps/defects and open the follow-up remediation OpenSpec change(s) if any are found. — DONE 2026-07-10: gaps recorded (J5.4, J1.3, J1.1, J2.3); J6.4 resolved by owner decision (un-defer, own the shipped dashboard); follow-up change `judge-verification-remediation` opened and validated.

## 3. Verification And Merge Gate

- [x] 3.1 Markdown/link sanity check on touched docs; `pnpm lint` if any code is touched (none expected). — DONE 2026-07-10: relative links verified resolvable; no code touched.
- [x] 3.2 Open PR, pass CI and review, merge; archive this change once the planning artifacts land and the sweep is underway per plan. — DONE 2026-07-10: PR #1248 (sweep results) + PR #1249 (J6.4 un-defer decision, judge-verification-remediation change opened) both merged to main.

Note: task 2.1's live staging judge-passcode session is a Phase 2 rehearsal
item, not a planning/sweep blocker — tracked ongoing in
`docs/roles/judge-responsibility-verification-plan.md`, not re-opened here.
