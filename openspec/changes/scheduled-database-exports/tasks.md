## 1. Export implementation

- [x] Add TypeScript export utility with safe environment validation, `pg_dump`/`pg_dumpall`, AES-256-GCM encryption, manifest generation, and redacted errors.
- [x] Add TypeScript object-store adapter/CLI boundary for upload, remote digest verification, and stale detection.
- [x] Add provider-neutral retention inventory with dry-run default and explicit confirmation for deletion; do not activate deletion in this change.
- [x] Add focused unit tests for cadence, encryption/decryption, manifests, redaction, stale detection, CLI decrypt validation, `pg_dumpall` argument safety, and command-boundary failure handling.

## 2. Scheduled operation

- [x] Add disabled-until-configured export and independently scheduled freshness workflows with UTC cadence, configurable timezone/weekend days, separate concurrency, timeout, issue-write permissions, secret wiring, and failure reporting.
- [x] Add operator runbook covering measured database size, dump scope, provider/cost decision, retention, credentials, show-date exceptions, restore rehearsal, and rollback.
- [ ] Add a separate restore verification script/test harness and record whether an actual isolated restore was run.
- [x] Add local decrypt/validate command that performs no database writes; external Supabase restore remains an activation gate.

## 3. Verification and handoff

- [x] Run focused tests, TypeScript checks, formatting, OpenSpec validation, and review the diff for secret/data leakage. Parent verification: 17 tests across six files, six shuffled seeds; targeted TypeScript check and strict OpenSpec validation passed.
- [x] Run `qa:code-quality-ratchet` if existing files gain lines and record any unrelated blocker. Passed via `node --import tsx scripts/qa/code-quality-ratchet.ts` after the tsx CLI hit sandbox IPC restrictions.
- [x] Obtain stronger-model review before shipping; update this change and the tracking runbook with findings/evidence. Parent review fixed dump arguments, byte verification, success publication, alert permissions, scheduling/grace, manual dispatch and retention safety. This is not the repository's other-harness PR review gate.
- [ ] Open the PR and complete the independent review gate, CI, and merge before archive; leave MYK9-110 open until owner activation evidence exists.
