## 1. Contract and focused tests

- [x] 1.1 Update the SQL grant contract so `service_role` declarations match hosted applied privileges, preserve deliberate exceptions, cross-reference the narrower-`GRANT` lesson, and keep migrations-only assertions environment-honest.
- [x] 1.2 Write assertion-first evaluator/source tests that fail for `service_role` drift, missing/extra/duplicate/malformed rows, SQL↔TypeScript contract disagreement, and the deliberate `sms_proximity_sends` expectation.

## 2. Deployed drift detection

- [x] 2.1 Add a migration replacing the latest `system_health_probe()` definition with a complete ordered `service_role_tables` fact array while preserving every existing fact and execute grant.
- [x] 2.2 Extend the shared applied-ACL evaluator and fixture to compare deployed service-role facts with the declared contract and surface precise failures through `applied_acl_grants`.

## 3. Verification

- [x] 3.1 Run focused Vitest files at least six shuffled times, the relevant database contract registration checks, and mutation/source checks for the load-bearing service-role assertions. — 6 shuffled seeds passed (17 tests each); health/registry tests 66 passed; behavioural-SQL allowlist tests 8 passed; assertion-first run failed before implementation as expected.
- [x] 3.2 Run `pnpm openspec validate --change myk9-236-service-role-grant-contract`, targeted app tests, `pnpm typecheck`, `pnpm lint`, and `git diff --check`; record any environment-limited behavioural SQL coverage honestly. — strict OpenSpec validation, typecheck, lint, diff check, and Supabase dry-run passed. Behavioural SQL cannot execute locally without a container runtime. The first full Vitest attempt produced no progress for 60 seconds and was stopped per the repository hang rule; a second run with the default reporter completed with 1,846 files and 17,734 tests passing (1 file and 9 tests skipped).
- [x] 3.3 Run the repository's migration/ACL second-opinion review and the required Codex review gate; fix all blocking findings and rerun affected checks. — Parallel standards/security/migration and MYK9-236/OpenSpec reviews completed against `origin/main...d6c21d4ce`; both returned no findings.

## 4. Ship and evidence

- [x] 4.1 Update `docs/plan-linear-backlog-batches.md` with the completed lane evidence, then commit and push the single MYK9-236 branch. — Completed on the implementation branch and finalized on `main` with the deployed evidence.
- [x] 4.2 With shared-system approval, open one PR containing `Tracked in openspec change: myk9-236-service-role-grant-contract`, monitor required CI, and resolve actionable failures. — PR #1779 passed every required check, including behavioural SQL, and the Codex review gate returned no findings.
- [x] 4.3 With shared-system approval and green CI/review, merge from the primary checkout; sync main and record the PR/merge evidence. — Squash-merged as `3bcc031bcdda92f96e522d1359d9944f9a8cdc5e`; primary `main` was synced and the evidence was recorded.
- [x] 4.4 With shared-system approval, apply the migration, deploy the changed health runner if required, read back live `service_role` ACL facts, and record whether a site-admin full “Run now” remains an operator evidence gate. — Migration `20260824210000` was applied and `cron-health-check` v31 deployed. Live read-back returned 130 rows with zero drift, the expected full `sms_proximity_sends` grant, the `entry_status_history` no-`INSERT` exception, and service-role-only boolean probe execution; no additional operator gate remained.
- [x] 4.5 Update MYK9-236 with implementation, checks, PR/merge, live evidence, risks, and acceptance-criteria status; move it to Done only when its evidence gate passes. — Linear MYK9-236 is Done with completion comment `859a1952-8773-42a7-8b80-f6e7c2f0690e` and the full acceptance evidence.
- [ ] 4.6 Archive the OpenSpec change after merge and required evidence, then sync main, prune refs, delete the feature branch, and remove the worktree as the final cleanup command.

## Validation Profile

- Risk: high
- Validation: full
- Rationale: This changes a database security contract, a `SECURITY DEFINER` health probe, and deployed ACL monitoring across every public table.
