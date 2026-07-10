## 1. Planning Artifacts

- [x] 1.1 Create OpenSpec proposal, design, and requirement spec for judge responsibility verification.
- [x] 1.2 Add `docs/roles/judge-responsibility-coverage.md` (coverage matrix, fall-scoped).
- [x] 1.3 Add `docs/roles/judge-responsibility-verification-plan.md` (row audit backlog, J1.2 first).
- [x] 1.4 Register both docs in `docs/README.md` per the docs-index convention.
- [x] 1.5 Validate OpenSpec artifacts (`pnpm openspec validate judge-responsibility-verification`).

## 2. Verification Kickoff (execution tracked by the plan doc)

- [ ] 2.1 Phase 0: verify J1.2 — code trace DONE 2026-07-10 (gap closed in code: RPC four-tier authz, explicit errors, correct grants); live staging judge-passcode session still pending per checklist.
- [x] 2.2 Phase 1: run the code-inventory sweep over J1–J6 rows (routes, components, RPCs, RLS, tests, offline-safety) and update row states to Inventory complete. — DONE 2026-07-10: five parallel auditors; every row now ≥ Inventory complete; 6 rows code-verified; findings recorded in the plan doc's "Phase 1 Results" section.
- [ ] 2.3 Record confirmed gaps/defects and open the follow-up remediation OpenSpec change(s) if any are found. — Gaps RECORDED 2026-07-10 (J5.4 verified gap, J1.3 claim-revocation, J1.1 untracked throttle SQL, J2.3 display wiring). Remediation change NOT yet opened: J6.4 (shipped judge dashboard vs documented deferral) needs an owner scope decision that shapes the remediation set.

## 3. Verification And Merge Gate

- [ ] 3.1 Markdown/link sanity check on touched docs; `pnpm lint` if any code is touched (none expected).
- [ ] 3.2 Open PR, pass CI and review, merge; archive this change once the planning artifacts land and the sweep is underway per plan.
