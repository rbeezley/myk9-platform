## 1. Identity Contract Tests

- [x] 1.1 Add assertion-first queue tests proving a new mutation persists the exact authenticated owner and unauthenticated enqueue fails without writing.
- [x] 1.2 Add upload-runner tests proving foreign-owner and legacy rows remain unchanged while independent current-owner rows upload.
- [x] 1.3 Add failed-mutation and backup round-trip tests proving owner metadata survives recovery and another user cannot list, retry, or discard the row.
- [x] 1.4 Add myK9Show integration coverage proving the shared manager resolves the current local Supabase session and the existing sign-in/startup path drains only that owner's work.
- [x] 1.5 Add fail-closed tests for resolver errors/empty ids, mid-pass account changes, cross-owner dependencies, and malformed backup owner metadata.

## 2. Owner-Bound Replication Implementation

- [x] 2.1 Add additive auth-owner metadata and an injected current-identity resolver to the replication contract.
- [x] 2.2 Stamp owner metadata before durable queue persistence and reject new unowned application mutations.
- [x] 2.3 Hold foreign-owner and legacy rows in the upload runner, re-check identity before execution, and preserve dependency ordering for mixed-owner queues.
- [x] 2.4 Restrict failed-mutation listing, retry, and discard actions to the active owner without deleting other owners' rows.
- [x] 2.5 Wire the myK9Show shared mutation manager to the existing offline-capable Supabase session resolver.
- [x] 2.6 Preserve global queue-capacity/cache-safety counts while logging separate foreign-owner and legacy-held totals for diagnosability.

## 3. Verification

- [x] 3.1 Run focused replication package and myK9Show provider tests covering queue, upload, recovery, and account-switch behavior.
- [x] 3.2 Run replication package build/typecheck, myK9Show typecheck, focused lint, and `pnpm openspec validate --change "bind-queued-mutations-to-auth-owner"`.
- [x] 3.3 Review the diff against MYK9-214, the delta spec, offline-first guarantees, security boundaries, file-size limits, and unrelated-change exclusion; fix all critical findings.

## 4. Delivery and Tracking

- [ ] 4.1 Commit the verified change and update MYK9-214 with implementation, tests, branch/PR, risks, and acceptance-criteria evidence.
- [ ] 4.2 Push the feature branch, open a PR containing `Tracked in openspec change: bind-queued-mutations-to-auth-owner`, and obtain required independent security/replication review.
- [ ] 4.3 Confirm required CI passes, merge the PR, move MYK9-214 to Done with the PR and merge commit, then archive the OpenSpec change before branch/worktree cleanup.

## Validation Profile

- Risk: high
- Validation: full
- Rationale: This changes authentication boundaries in the shared offline replication queue, including durable recovery, mixed-account behavior, and show-day write attribution.
