## 1. Reconcile Already-Shipped Findings

- [x] 1.1 Verify MYK9-243 against its applied migration/RPC and rendered-packet closure evidence.
- [x] 1.2 Verify MYK9-236 against its applied service-role contract, deployed probe, and live drift count.
- [x] 1.3 Run the read-only MYK9-161 ACL replay and capture at least two consecutive green hosted snapshots for both ACL checks.

## 2. Correct Remaining Repository Drift

- [x] 2.1 Add a red source-contract assertion for the canonical `cleanup-ringside-anon` phase-2 cron identity, then correct the SQL predicate.
- [x] 2.2 Add a red migration-contract assertion for a leading `sms_proximity_sends.entry_id` index, then add one narrow additive migration.
- [x] 2.3 Review the email helper and affected function import graphs; preserve byte parity across deployment roots and add/update controlled-repeat assertions only if current coverage is insufficient.

## 3. Local And Read-Only Hosted Verification

- [x] 3.1 Run focused phase-2, index, email-idempotency, and affected Edge Function tests.
- [x] 3.2 Run `pnpm qa:db-drift:test`, relevant typechecks/lint, `git diff --check`, and strict OpenSpec validation.
- [x] 3.3 Run a linked Supabase migration dry-run, confirm the hosted catalog has no equivalent leading `entry_id` index, and run the current function inventory/source-drift check; record blocked Management coverage rather than inferring a pass.
- [x] 3.4 Verify the implementation against proposal/design/tasks and resolve all critical findings.

## 4. Ship Repository Changes

- [x] 4.1 Commit the verified implementation and OpenSpec artifacts on the feature branch.
- [x] 4.2 Push the branch and open one PR with Linear IDs, acceptance evidence, risks, non-goals, approval-gated commands, and `Tracked in openspec change: supabase-health-drift-remediation`.
- [x] 4.3 Obtain required second-opinion reviews and passing CI.
- [ ] 4.4 Obtain explicit merge approval, merge the PR, and confirm the exact merge SHA on current `main`.

## 5. Shared-System Approval Gates

- [x] 5.1 Obtain explicit approval, apply the additive index migration, and read back the live index/FK coverage.
- [x] 5.2 Obtain supported Supabase Management authentication plus explicit deployment approval, deploy only `send-waitlist-invite` and `cron-process-payouts` from their correct roots, and record rollback anchors.
- [x] 5.3 Verify downloaded live bundles match reviewed source and run credential-free fail-closed smokes without sending email or triggering payouts.
- [ ] 5.4 Obtain one Linear batch approval, then attach closure evidence to exact issues/findings without creating duplicates.

## 6. Archive And Cleanup

- [x] 6.1 Update the audit evidence ledger and automation memory only after each proof gate passes.
- [ ] 6.2 Archive the OpenSpec change after the implementation PR is merged and all required deployment evidence is recorded.
- [ ] 6.3 Sync `main`, prune merged branches, and remove the feature worktree as the final cleanup step.
