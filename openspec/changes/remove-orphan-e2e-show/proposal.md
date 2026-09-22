## Why

An E2E-created show remains published outside the canonical seed scope, so every reseed leaves internal test vocabulary visible in Find Shows. Preventing and cleaning orphaned published fixtures is required for a trustworthy October readiness environment and fall 2026 launch preparation.

## What Changes

- Search all repository refs for the MYK9-336 title, UUID, and issue references;
  record that the creating test/author is not recoverable from repository
  evidence.
- Keep the known orphan out of the canonical seed and provide a read-only
  operator preflight with exact identity and complete money-record inventory,
  including entry payment links. The preflight performs no mutation; an
  approved shared cleanup after merge uses the existing site-admin Show Details
  delete action.
- Harden the existing hard-delete RPC with payment-evidence and registration-FK
  guards. Route the remaining application service's direct PostgREST delete
  through the RPC in follow-up Task 1b. The existing authenticated DELETE grant
  and shows_delete RLS policy still permit direct table deletion, so the RPC is
  not yet the only user-reachable permanent-delete path; changing that policy
  requires an explicit authorization decision.
- Make future E2E-created shows register exact owned IDs and hard-delete them in
  deterministic teardown, even when assertions fail.
- Add source-level coverage that proves the canonical seed cannot reach the
  orphan or an intentional other-show enrollment.
- Record the read-only sibling inventory and leave any shared-database deletion for an explicitly approved post-merge reset.
- Non-goal: delete shared staging data from an unmerged branch or add a new admin cleanup surface.

This does not duplicate an existing surface; it repairs fixture lifecycle behavior. A link cannot prevent leaked test data.

## Capabilities

### New Capabilities

None. This is test-fixture lifecycle maintenance.

### Modified Capabilities

None.

## Impact

Expected impact includes E2E fixture teardown, a read-only operator preflight,
an additive database migration that hardens the existing RPC, and focused
regression evidence. Task 1 does not change delete authorization or make the
RPC the sole user-reachable path. The cleanup is exact-ID only and does not
claim to prevent future arbitrary UUID leaks when the creator is unknown.

## Investigation evidence and limitation

The exhaustive repository-ref search found the fixture title in the audit
records and the UUID in the existing per-show credential contract, but no test,
factory, seed path, or commit that created the show. Therefore this change can
clean only `f3360000-0000-0000-0000-000000000001`; it cannot prove or prevent a
future leak with a different UUID. A shared-database sibling inventory and any
approved reseed remain post-merge operational work.

The repository's behavioral SQL runner executes against a migrated local
loopback database. The linked project could not be inventoried from this
worktree, and no shared DB is written. The Task 1 behavioral regression is
registered for that runner; whether it can execute locally depends on the
available migrated database.

The operator artifact is read-only and does not invoke the RPC. Its results are
advisory and may become stale; the RPC performs its own locked preflight at
mutation time. A live cleanup requires separate approval through the existing
site-admin Show Details delete action.
