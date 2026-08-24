## Context

See `proposal.md` for motivation. PR #1716 already added the production audit calls and focused tests. MYK9-211 began as an applied-evidence-only closure, but its authenticated replay exposed that the full audit table and CSV export ignore revoke context stored in `old_value`. This change now includes the narrow display/export fallback needed for the evidence surface to be trustworthy. `permission_audit_log` is append-only operational evidence: its rows must not be deleted after the test.

Read-only staging inventory on 2026-08-24 identified these seeded fixtures:

- actor: `testadmin@myk9t.com` / Test Admin, active `site_admin`; this is the corrected canonical E2E admin credential. The superseded `e2e-admin@test.myk9.com` auth identity no longer exists.
- target: `club@myk9t.com` / Test Club, currently active only as `exhibitor`
- scope: club `dededede-0000-0000-0000-000000000001` / Heartland Scent Work Club
- temporary grant: `secretary` scoped to that club

The repository plan requires Richard to confirm this exact fixture before the first mutation. Richard confirmed the target, role, scope, and permanent audit residue, then completed the fixture-account remediation: corrected the MYK9-211 worktree configuration, reset and verified all seven fixture passwords, updated eleven GitHub E2E secrets, confirmed live roles, and confirmed zero `test.myk9.com` auth users. A refreshed read-only baseline confirmed the corrected actor and unchanged target/scope before resuming.

## Goals / Non-Goals

**Goals:**

- Exercise the exact deployed `RoleManager.assignRole` and `RoleManager.revokeRole` code while authenticated as the seeded site admin.
- Establish database baselines before mutation and prove the exact two successful audit events afterward.
- Prove a failed grant and a repeated/no-op revoke do not create successful audit entries.
- Confirm the existing Recent access changes rail renders readable targets and the full audit view renders role/scope details for both applied events.
- Leave the target without the temporary active role and retain immutable audit history.

**Non-Goals:**

- Changing authorization code, audit schema, RLS, replication, or adding UI surface.
- Creating or deleting a staging person, club, or show.
- Cleaning append-only audit rows.
- Testing MYK9-243 or any unrelated Batch 3.5 work.

## Decisions

### Execute the application service through the browser, not direct SQL

Run a local Vite build connected to staging, sign in through the canonical Playwright helper, and dynamically import the source `rbacService` inside the authenticated browser page. This exercises the same Supabase client session and production service implementation as the UI while allowing precise duplicate-grant and repeated-revoke calls.

Direct SQL was rejected because it would bypass `RoleManager` and `AuditLogger`, proving only database writes rather than the deployed application contract. Adding a temporary admin UI control was rejected because it expands product surface solely for verification.

### Use one club-scoped grant on a seeded non-admin fixture

Grant `secretary` to Test Club for Heartland. Club scope is editable through the current User Management workflow and is explicitly represented in the audit payload as `club_id`. The target has no active secretary grant, so the first mutation is unambiguous. A system-wide grant was rejected because it gives broader temporary authority than the proof needs; a show-scoped grant was rejected because the current management dialog deliberately treats show-scoped grants as read-only.

### Prove each state transition against a captured baseline

Before mutation, record the target's matching active/inactive assignments, audit count, latest audit timestamp, and a UTC evidence-start timestamp. Then execute, in order:

1. successful scoped grant
2. failed grant for a valid-format but nonexistent `people.id`, expected to fail before insert
3. successful scoped revoke
4. repeated revoke expected to return `false`

After each step, query the audit rows newer than the evidence-start timestamp. The final assertion requires exactly one `role_assigned` and one `role_revoked` event for the target and scope, with the site-admin actor, expected role ID/name, and timestamps. No successful audit event may appear for the nonexistent target or after the no-op revoke.

The deployed four-column unique constraint on `(user_id, role_id, club_id, show_id)` uses ordinary PostgreSQL NULL semantics, so it does not reject duplicate rows when either scope column is NULL. A duplicate-grant attempt is therefore unsafe for this closure proof: it could create a second active authority row and a second legitimate audit event. Use a nonexistent `people.id` to exercise the required failed-grant path instead, and record the nullable-uniqueness defect as separate follow-up rather than expanding MYK9-211.

### Keep screenshots private and durable evidence textual

Capture the overview rail and full audit view at the issue-required viewport. Store screenshots under a private local evidence directory, calculate SHA-256 checksums, and record filenames/checksums plus the route, role, deployed commit, timestamps, event IDs, and assertions in Linear. Do not upload screenshots without separate authorization.

### Render the populated side of an audit change

The full audit table and CSV export use `new_value` when present and fall back to `old_value`. Grants describe the new assignment in `new_value`; revokes describe the removed assignment in `old_value`. Keeping that choice in one helper preserves existing grant/update behavior while making revoke role and scope context visible. Duplicating the payload into both columns or changing the append-only audit schema was rejected because the stored events are already correct.

### No replication impact

RBAC administration and its audit log are online-only admin data paths already implemented through Supabase. This verification does not touch core show-day replicated data or introduce an offline contract.

## Risks / Trade-offs

- **[The target temporarily gains secretary authority for Heartland]** → Use the seeded Test Club person, keep the interval bounded, and revoke in the same controlled run even if a later assertion fails.
- **[Cleanup can fail after the grant]** → Record the inserted assignment ID immediately; the cleanup path explicitly revokes by the scoped role and verifies `is_active = false` before any closure claim.
- **[A duplicate grant could match an older inactive row]** → Baseline the exact target/role/club tuple first and stop before mutation if any matching row exists; do not guess around fixture drift.
- **[A duplicate grant is not safely rejected by the deployed nullable unique constraint]** → Do not attempt a duplicate grant. Exercise failure with a valid-format nonexistent person ID, which fails before mutation and audit logging, and keep the uniqueness defect out of this verification-only closure scope.
- **[Other admin activity can add concurrent audit rows]** → Filter proof by target person, action, role payload, scope, and evidence-start timestamp instead of relying on global row counts.
- **[The local source could differ from deployed staging]** → Start from current `origin/main`, record its SHA, and confirm staging serves that commit before calling the proof complete. If commit identity cannot be established, record the limitation and do not close the issue.
- **[The audit rail only shows five newest entries]** → Navigate immediately after the mutations and also verify the full audit tab; database event IDs remain the authoritative correlation.
- **[The authenticated cleanup path is unavailable after a crash]** → Retry cleanup through `RoleManager.revokeRole`; if that remains unavailable, deactivate the captured assignment directly as an emergency containment step, record that the expected revoke event is missing, and leave MYK9-211 open.
