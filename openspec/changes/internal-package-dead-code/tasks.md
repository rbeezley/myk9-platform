## 1. Compatibility and inventory

- [x] 1.1 Record the owner's internal-only decision and existing MYK9-328 scope in proposal/design; verify both artifacts exist.
- [x] 1.2 Record fresh per-symbol counts, deleted clusters, and retained live consumers in the existing package inventory; verify with whole-repository symbol/path searches. 167 removed declarations are recorded against d5a495862; homonyms are distinguished from imports.

## 2. Package slices

- [x] 2.1 Remove dead scoring timer/calculation/nationals implementations and barrels; verify retained scoring-store tests and package build. Build/typecheck and 66 retained tests pass.
- [x] 2.2 Remove unreachable scoring-ui entry sheets and hooks, preserving live registry dispatch and shared helpers; verify live scoresheet/time/registry tests and package build. Build/typecheck and 198 tests pass. Retain useElementTimer: UKCNoseworkLiveScoresheet uses it.
- [x] 2.3 Remove verified ringside and ui dead clusters, retaining mounted `/at-show` consumers. Complete locally: residual helpers and unused novice aliases removed; builds, 371 ringside tests, 249 UI tests and 521 at-show/email-prop app tests pass.
- [x] 2.4 Complete core/notifications/secretary/email cleanup. Removed unused logger config and formatter lookup/reset APIs while retaining live tests. Email is types-only; production-content assertions preserved. Eight package builds, core 253, notifications 54, secretary 140 and production email 174 tests pass.
- [ ] 2.5 After test-boundary confirmation, remove inert replication TTL plumbing without modifying data or sync policy; verify aged online/offline reads, subscriptions, dirty rows, reconciliation, and error behavior through public table APIs and the replication suite.

## 3. Verification and handoff

- [ ] 3.1 Run affected package builds/tests, `pnpm typecheck`, `pnpm lint`, `pnpm qa:code-quality-ratchet`, and diff/format checks; record failures without weakening gates. Implemented-slice checks pass; repeat after remaining code slices. See verification.md.
- [x] 3.2 Update existing batch plan and inventories with actual implementation/verification, and validate this OpenSpec change. Partial implementation and remaining gates are explicit; see verification.md.
- [ ] 3.3 Obtain publication approval, publish PR, pass independent review and required CI, and confirm merge before completing the implementation gate.
- [ ] 3.4 Reconcile Linear and archive/sync only after the merged evidence gate; clean only this task's branch/worktree.

## Plan verification

| Requirement                                             | Status  | Evidence                                                                                      |
| ------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------- |
| Internal-only compatibility, live consumer protection   | Covered | Proposal owner quote; design decision 1; tasks 1.2 and 2.1–2.4                                |
| No activation of TTL or data loss                       | Covered | Design decisions 3–4 and migration plan; task 2.5                                             |
| Dedicated dead tests removed, live regressions retained | Covered | Design decision 2 and risks; tasks 2.1–2.5                                                    |
| Email consumer decision                                 | Covered | Proposal and design decision 5: types-only email; production assertions and builders retained |
| Failure/recovery and rollback                           | Covered | Design risks and migration plan; tasks 2.5 and 3.1                                            |
| Review, verification, tracking, approvals               | Covered | Tasks 3.1–3.4                                                                                 |

Coverage: 100/100 after adding explicit dynamic-registry and email parity checks, data-preserving rollback, and public test-boundary approval. The test-boundary confirmation gates new replication tests only, not independent pure-deletion slices. Validation profile: high risk / full verification, per design.md.
