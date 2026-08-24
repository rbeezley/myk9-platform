## Context

See `proposal.md` for motivation. The existing grant contract is a four-column SQL `VALUES` table. Its anon/authenticated values are enforced against migrations-only CI, but hosted Supabase default privileges give `service_role` broader table ACLs that the rebuild cannot reproduce. `system_health_probe()` already emits applied authenticated ACL facts from the deployed catalog, and the health runner already judges them in `appliedAclCheck()`.

The existing owner surface is `/admin/health`; there is no UX or navigation change. This is an online operations check, not core show-day data, so offline replication and mutation paths are unaffected.

## Goals / Non-Goals

**Goals:**

- Make one readable contract accurately describe the hosted `service_role` table ACLs.
- Detect drift from that contract on the deployed database during the existing full health run.
- Preserve strong migrations-only enforcement for anon/authenticated grants.
- Keep table coverage mechanically complete and make malformed/missing facts fail visibly.

**Non-Goals:**

- Narrow or revoke trusted `service_role` privileges platform-wide.
- Reproduce Supabase-hosted default ACL setup in local migrations.
- Change RLS, client grants, health-board layout, or offline data behavior.

## Decisions

### Keep the hosted default privileges and declare them honestly

`service_role` remains a trusted server-side role that bypasses RLS. The current platform-wide `TRUNCATE`, `TRIGGER`, `REFERENCES`, and `MAINTAIN` privileges are accepted as intended hosted behavior for this launch-readiness cycle. The SQL contract will name all eight table privileges for normal tables and preserve explicit exceptions such as `entry_status_history` withholding `INSERT`.

Alternative: emit `REVOKE`s across every table. Rejected for this PR because it changes runtime authority across all Edge Functions and background jobs, far beyond the issue's truth-in-contract scope.

### Split enforcement by the environment that can prove it

The migrations-only SQL test will enforce anon/authenticated table privileges and retain the honest `service_role` declarations without pretending the rebuild can validate hosted defaults. The deployed full `system_health_probe(boolean)` path will emit all eight `service_role` table privileges for every public table; `appliedAclCheck()` will compare those facts with an independent TypeScript map synchronized to the SQL declarations by a source test.

Alternative: explicitly grant all hosted privileges in a migration so local and hosted databases converge. Rejected because it would turn an environment fact into repository-managed authority and materially widen any self-hosted/rebuilt deployment.

### Extend the existing applied ACL fact block and verdict

Add `service_role_tables` beside the existing authenticated `tables` array by enriching the boolean probe overload only when `p_include_expensive` is true. The existing zero-argument probe remains verbatim, and the five-minute continuous path remains cheap. This preserves snapshot compatibility: an old full probe without the field fails visibly after the updated runner ships, which correctly signals that deployed verification is incomplete. The check remains nightly/full and appears under the existing `applied_acl_grants` key.

Alternative: add a second health-check key. Rejected because authenticated, sequence, and service-role drift are one applied-ACL concern and a new key would duplicate cadence, ownership, and UI metadata.

### Use explicit ordered privilege names

Both the SQL probe and evaluator compare a stable order: `SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN`. This avoids ACL-code parsing differences and makes failures readable.

## Risks / Trade-offs

- [The trusted role retains broad destructive privileges] → Record that as an explicit platform decision; keep secrets server-only and detect any divergence rather than implying narrower protection.
- [SQL and TypeScript contract copies can drift] → Parse the SQL contract in a focused test and assert exact table coverage and values for both maps.
- [Updated runner could deploy before the probe migration] → Treat missing `service_role_tables` as a visible failure and deploy the database migration before/with the runner verification sequence.
- [A new migration could accidentally drop facts from the full or continuous path] → Re-emit only the latest boolean overload, preserve its cheap-path facts, delegate to the unchanged zero-argument probe for existing expensive facts, and add source-contract tests for that shape.
- [Eight privilege checks per public table add catalog work] → Run only in the existing nightly/full probe; the bounded ~130-table catalog scan is not on an app request path.

## Migration Plan

1. Add the contract/test changes and a migration that replaces `system_health_probe()` while preserving all current fact blocks.
2. Run focused tests, contract registration checks, typecheck/lint, OpenSpec verification, ACL/migration review, and the required Codex review gate.
3. Merge the single PR from the primary checkout only after required CI is green.
4. With explicit shared-system approval, apply the migration and deploy the health runner if its bundle changed.
5. Verify the live probe ACLs and request a site-admin full “Run now” if the updated nightly check needs immediate evidence.

Rollback: revert the runner/evaluator and replace the probe with the prior function definition. The change is read-only and adds no stored schema, so no data rollback is required.
