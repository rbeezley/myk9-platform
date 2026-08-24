## Why

MYK9-211's code fix shipped in PR #1716, but the issue was correctly reopened because tests and a read-only audit could not prove that scoped grants and revocations write accurate events in the deployed staging system. Closing that evidence gap supports fall 2026 launch readiness by proving the site-admin access trail can be trusted during an authorization investigation.

## What Changes

- Exercise one explicitly approved, scoped role grant and revoke against named seeded staging fixtures.
- Prove successful events retain actor, target person, role, exact scope, and timestamp.
- Prove failed or no-op grant and revoke attempts do not add successful audit events.
- Replay the existing `/admin/permissions` Recent access changes surface and record private browser evidence.
- Fix the audit table and CSV export to display a revoke event's role/scope context from `old_value` when `new_value` is absent; the applied proof exposed this missing fallback.
- Revoke the temporary role, retain the append-only audit evidence, update the Batch 4 tracker and Linear closure proof, and ship the verification record through one reviewed PR.
- No new UI surface, database object, or authorization rule is introduced.

## Capabilities

### New Capabilities

None. This change verifies and repairs an existing audit-trail behavior.

### Modified Capabilities

The existing Permission Audit display/export behavior is repaired so a revoke event presents the role/scope context already stored in `old_value`. This enforces MYK9-211's existing acceptance contract rather than changing the capability contract, so the change opts out of delta specs.

## Impact

- Shared staging data: one temporary scoped `secretary` grant for `club@myk9t.com`, immediately soft-revoked after proof; the resulting `permission_audit_log` rows remain permanently by design.
- Existing surfaces: `/admin/permissions` keeps its current structure; the audit table, search value, and CSV export now fall back to `old_value` when `new_value` is absent. This does not duplicate another page; the acceptance criterion explicitly names the existing permissions surface, and adding a link or new surface would not prove its deployed behavior.
- Repository: one narrow audit-details fallback with regression coverage, OpenSpec evidence, and the existing Batch 4 tracking plan. No migration is needed.
- Non-goals: creating users, deleting audit history, redesigning permissions UI, changing role semantics, or touching MYK9-243.
