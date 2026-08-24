## Why

The table-grant contract declares narrow per-table `service_role` CRUD while the hosted database intentionally grants the role all table privileges through platform defaults, so audits and migrations-only tests report a false security contract. Making the deployed ACL check authoritative for this hosted-role behavior removes that blind spot before fall 2026 launch readiness depends on the contract.

Original request (verbatim):

> Read docs/plan-linear-backlog-batches.md, the "[HANDOFF 2026-08-24]" section
> under Batch 3.5, before doing anything else.
>
> Your work is MYK9-236 (Lane 3.5A). Follow the plan's normal workflow:
> worktree, one PR, Codex review as a gate, merge from the main checkout.
>
> Do NOT touch MYK9-243 — another agent has it In Progress.

## What Changes

- Record the current platform decision: `service_role` keeps the hosted default table privileges, including `TRUNCATE`, `TRIGGER`, `REFERENCES`, and `MAINTAIN`; this PR does not revoke them platform-wide.
- Make the SQL grant contract's `service_role` declarations match the applied hosted ACLs and cross-reference the repository lesson that a narrower `GRANT` cannot narrow an existing broader grant.
- Extend the existing `system_health_probe()` and `applied_acl_grants` evaluator to compare deployed `service_role` table privileges against that contract and fail on future divergence.
- Add focused source and evaluator tests, including deliberate `sms_proximity_sends` drift coverage, then verify the migration and deployed database through the established ACL workflow.
- No new page, dialog, or operator affordance is introduced. This belongs in the existing `/admin/health` ACL check; linking to another surface would not make the deployed database self-verifying.

Non-goals: revoke hosted `service_role` defaults, redesign Supabase's trusted server role, change anon/authenticated ACLs, alter RLS, or touch MYK9-243.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `admin-system-health`: The applied-ACL health check also verifies every deployed public-table `service_role` grant against the declared hosted contract.

## Impact

- `supabase/tests/pre_rule_table_grants_test.sql` grant declarations and environment-specific assertions.
- A new migration replacing `public.system_health_probe()` with `service_role` table ACL facts included.
- `apps/myk9show/supabase/functions/_shared/appliedAclChecks.ts` and focused tests/fixtures.
- The daily/full `/admin/health` `applied_acl_grants` result after the migration and health runner are deployed; no user-facing navigation or offline replication changes.
