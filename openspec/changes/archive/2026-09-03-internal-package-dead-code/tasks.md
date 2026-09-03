## 1. Compatibility and inventory

- [x] 1.1 Record the owner's internal-only decision and existing MYK9-328 scope in proposal/design; verify both artifacts exist.
- [x] 1.2 Record fresh per-symbol counts, deleted clusters, and retained live consumers in the existing package inventory; verify with whole-repository symbol/path searches. 167 removed declarations are recorded against d5a495862; homonyms are distinguished from imports.

## 2. Package slices

- [x] 2.1 Remove dead scoring timer/calculation/nationals implementations and barrels; verify retained scoring-store tests and package build. Build/typecheck and 66 retained tests pass.
- [x] 2.2 Remove unreachable scoring-ui entry sheets and hooks, preserving live registry dispatch and shared helpers; verify live scoresheet/time/registry tests and package build. Build/typecheck and 198 tests pass. Retain useElementTimer: UKCNoseworkLiveScoresheet uses it.
- [x] 2.3 Remove verified ringside and ui dead clusters, retaining mounted `/at-show` consumers. Complete locally: residual helpers and unused novice aliases removed; builds, 371 ringside tests, 249 UI tests and 521 at-show/email-prop app tests pass.
- [x] 2.4 Complete core/notifications/secretary/email cleanup. Removed unused logger config and formatter lookup/reset APIs while retaining live tests. Email is types-only; production-content assertions preserved. Eight package builds, core 253, notifications 54, secretary 140 and production email 174 tests pass.
- [x] 2.5 With explicit test-boundary approval, removed inert replication TTL plumbing without modifying data or sync policy. Four public-boundary retention tests and all 536 replication tests pass; aged online/offline reads, subscriptions, dirty rows, reconciliation and read-error recovery remain intact.

## 3. Verification and handoff

- [x] 3.0 Investigate and fix the mutation test blockers in a separate commit (owner: "please investigate and fix", 2026-09-03). Reproduced 499/500 under coverage/background scheduling; traced an already-running automatic retry racing the test's manual flush. Control time at the existing public upload-to-Supabase boundary, without production changes or queue-record surgery. Also isolate startup-drain fixtures that reused pending mutations across shuffled tests. Six shuffled stress runs and all 536 replication tests with coverage pass; no-drop/no-duplicate assertions retained and strengthened. See verification.md.

- [x] 3.1 Run affected package builds/tests, `pnpm typecheck`, `pnpm lint`, `pnpm qa:code-quality-ratchet`, and diff/format checks; record failures without weakening gates. Typecheck/lint/ratchet and replication suite pass after TTL removal; full app suite passes 18,717 tests (9 existing skips). See verification.md.
- [x] 3.2 Update existing batch plan and inventories with actual implementation/verification, and validate this OpenSpec change. Implementation is complete and remaining shipping gates are explicit; see verification.md.
- [x] 3.3 Publication and merge approved; PR #1990 passed independent review and every required CI check, then merged as `04be609371769d5f8089f7900c30d4abf7523bed` on 2026-09-03.
- [x] 3.4 Reconciled MYK9-328 to Done with merge and verification evidence. No delta specs require sync; archive this completed change in the tracking-only follow-up PR and clean only this task's branch/worktree after merge.

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
