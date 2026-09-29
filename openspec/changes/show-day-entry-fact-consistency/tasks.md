# Tasks

## 1. Exhibitor show schedule (MYK9-868)

- [x] 1.1 Add a failing mapper test for stored 09:00 time, implement mapping/formatting, and pass the targeted test.
- [x] 1.2 Add focused schedule tests for known time, stored position versus pending, and check-in/completed states; implement the existing row display and pass the tests.

## 2. Dog result (MYK9-869)

- [x] 2.1 Add failing dog-read and activity tests for a same-day Q with trial date and release gate; read own scored facts through the authorized result view and pass the tests.
- [x] 2.2 Add dog-page tests for preliminary result, class link, placement withheld/released, and unavailable read; update existing Overview/Past Results surfaces and pass the tests.

## 3. Secretary removal (MYK9-870)

- [x] 3.1 Add failing delete/read tests for a removed row in a warm replica and full sync; evict the row after successful soft-delete and reconcile stale rows on complete scoped sync; pass the tests.
- [x] 3.2 Verify one removed child preserves surviving registration counts and that an empty registration has no payment-due work in focused queue tests.

## 4. Integration and delivery

- [x] 4.0a Separate entry-list and scored-fact verification; resolve release as unknown, preliminary, or released; test failed and paused reads.
- [x] 4.0b Replace the deletion guard with a state retired by confirmed tombstone or complete absence; test racing sync and later restore.
- [x] 4.0c Add a manager-authorized independent entry count and offline empty-scope proof; test RLS-gap zero, legitimate zero, and offline reads.

- [x] 4.1 Run OpenSpec validation, focused suites, typecheck, lint, relevant app tests shuffled, and code-quality ratchet; record results.
- [ ] 4.2 Review diff and risk, commit the verified implementation, then push/open one PR with linked issues when the repository approval gate is satisfied; watch required CI and complete review gate before merge.
- [ ] 4.3 After merge, verify criteria and update Linear issue comments/status, archive the OpenSpec change, and perform worktree cleanup.

## Verification note

- 2026-09-28: Focused shuffled app suites passed (220 tests); TypeScript, lint, formatting, code-quality ratchet, and OpenSpec validation passed. The full shuffled app run produced no test progress for 45 seconds and was stopped under the repository runner rule, so task 4.1 remains open.
- 2026-09-29: Review-fix focused suites passed. Final shuffled app suite passed (2,463 files, 24,185 tests; 1 file and 9 tests skipped). Typecheck, lint, formatting, code-quality ratchet, and strict OpenSpec validation passed. The new SQL function has not been applied to the shared database; browser/SQL fixture re-walk remains pending.
