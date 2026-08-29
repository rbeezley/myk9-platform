## 1. Replication Read Contract

- [x] 1.1 Add assertion-first tests for successful empty/data/license-filtered reads, failed status-bearing reads, subscription failure suppression/recovery, and the judge-assignment redaction override while proving legacy `getAll()` still returns `[]` on failure; verify the focused tests are red before implementation and green afterward.
- [x] 1.2 Implement and export the discriminated `getAllWithStatus()` result through the query manager and `ReplicatedTable`, migrate cache notifications to suppress failed snapshots, and preserve the judge-assignment transformation; verify logging plus database failure reset/recording occur once per read.

## 2. Trial Store Migration

- [x] 2.1 Add focused Trial store tests for independent Trial/Class loading states, confirmed-empty snapshot evidence, failed-read snapshot preservation, and successful retry recovery; verify assertions fail against the legacy store first.
- [x] 2.2 Migrate `loadTrials` and `loadTrialClasses` to the status-bearing API without changing mutation error behavior; verify the focused store tests pass.

## 3. Show Desk Truthfulness

- [x] 3.1 Add Show Desk component tests proving initial read failure suppresses empty/status claims and wires retry, while a failed refresh retains a previously confirmed schedule with a warning.
- [x] 3.2 Gate the existing Show Desk schedule on Trial/Class read availability and add calm inline initial/refresh failure states without introducing a new page, dialog, or workflow; verify the focused Show Desk tests pass.

## 4. Verification and Tracking

- [x] 4.1 Run focused replication, Trial store, and Show Desk tests; run relevant package and myK9Show typechecks; fix all change-caused failures.
- [x] 4.2 Run `pnpm openspec validate "myk9-252-replicated-read-status" --type change --strict --no-interactive`, inspect the final diff for unrelated changes, and record the 85-occurrence/36-file caller audit plus deferred migrations in the PR or tracking update.
- [ ] 4.3 Open the implementation PR with MYK9-252 acceptance evidence and `Tracked in openspec change: myk9-252-replicated-read-status`; verify required CI and review pass before merge.
- [ ] 4.4 After merge, update MYK9-252 with the implementation summary, checks, PR/merge commit, risks, and acceptance result; move it to Done only when its evidence gate is satisfied, then archive the OpenSpec change and clean up the branch/worktree.
