## Context

See `proposal.md` for motivation. `RoleAssignmentsPanel` is the canonical read-only-plus-revoke ledger. Its `UserRole` rows currently carry `club_id` but no club label, so both the scope cell and pending-revoke state lack the human identity needed for a safe cross-club action.

## Goals / Non-Goals

**Goals:**

- Resolve club identity once in the existing `RoleManager.getAllUserRoles()` query and expose it through the existing `UserRole` view model.
- Use one scope-label helper for table search/sort, visible rendering, accessible naming, and confirmation state so those representations cannot drift.
- Preserve the Site Admin intent of “The platform is healthy” by making revoke context explicit without adding workflow steps beyond the existing confirmation.

**Non-Goals:**

- No new assignment or club-management surface.
- No changes to authorization, revoke semantics, role assignment, routing, database schema, or bulk-role workflows.
- No requirement to resolve show names; show scope remains explicitly distinguishable from club and global scope.

## Decisions

### Join club identity in the existing assignment read

Extend the existing `user_roles` PostgREST select with its `clubs` relationship and map `{ id, name }` into `UserRole.club`. This keeps the canonical service result self-contained and avoids a component-owned second query or an N+1 lookup. Alternative considered: load all clubs in the panel, as role-edit dialogs do. Rejected because this ledger already owns an assignment query and should receive each row’s identity atomically.

### Derive one complete scope descriptor per row

A pure helper will return a visible label for all scope types: `Club: <exact name>`, `Show`, or `Global`, with an explicit unresolved club fallback that includes the identifier. The same descriptor feeds the Scope cell accessor, link text, and revoke payload. Alternative considered: pass only `clubName` to revoke. Rejected because a complete descriptor prevents global/show confirmations from becoming ambiguous and keeps the destructive prompt uniform.

### Keep the existing dialog and mutation path

The existing `AlertDialog` and `rbacService.revokeUserRole(id)` remain unchanged. Only the pending confirmation context expands. This preserves the established authorization and audit path and avoids duplicating the ledger or revoke workflow.

### Offline-first and replication impact

None. The site-admin permissions ledger is an authenticated, online-only administrative surface using the established RBAC service. No core show-day persistent read or mutation is moved away from replication.

## Risks / Trade-offs

- **[Relationship is missing or soft-deleted]** → Render an honest unresolved-club label with the club ID in both the row and confirmation; never silently fall back to Global.
- **[Joined club read changes the query shape]** → Add an assertion-first service test that checks both the select contract and mapped club identity.
- **[Visible and accessible names drift]** → Use the same exact text as the link’s accessible name and assert it via role query.
- **[Table search cannot find a club name]** → Feed the complete scope label through `accessorFn`, covered by focused component tests.

## Migration Plan

Deploy as an additive client/service change. Rollback is the feature commit; there is no schema or data migration. Browser closure remains post-merge because MYK9-163 explicitly requires desktop and tablet hosted evidence.

## Validation Profile

- Risk: medium
- Validation: app
- Rationale: this is a narrow authorization-adjacent UX and data-mapping change in one app; focused service/component tests plus app typecheck/lint and hosted browser replay cover its blast radius.
