## Why

`view_authenticated_entry_results` repeats the same role, judge-assignment, and
ringside-passcode authorization subplans across its wide projection. On the
linked 50 MB database, one representative ringside read caused 45 sequential
and 5,001 index scans of `user_roles`, 41 sequential scans of
`judge_assignments`, and 1,108 sequential scans of `show_passcodes`; cumulative
statistics since December 2025 therefore reached hundreds of millions of scans
despite only 12–41 live rows in each relation.

This is a fall 2026 launch-readiness blocker because the entry-results view is
the replicated read surface for show-day scoring. Repeating its authorization
work for every poll and projected field wastes database CPU exactly when many
ringside devices are active.

## What Changes

- Materialize caller-level and assignment-level authorization inputs once per
  `view_authenticated_entry_results` statement, then reuse those results across
  the view's existing field-visibility decisions.
- Preserve the current manager, assigned-judge, steward, exhibitor, ownership,
  passcode-generation, and result-release semantics byte-for-byte at the
  observable view boundary.
- Add database contract tests that pin the statement-scoped authorization shape
  and the existing security-definer grants/revokes.
- Add a reproducible before/after measurement query covering scan deltas,
  execution plans, the statistics-reset timestamp, and the post-reset evidence
  required by MYK9-114 and the MYK9-109 load rehearsal.
- Record the other identified sources and their disposition:
  - the 60-second `AuthContext` RBAC refresh invokes three RBAC RPCs per cycle,
    but its roughly 77k calls per RPC since January is not the hundreds-of-
    millions multiplier;
  - PostgREST class/show reads embed `judge_assignments`, where sequential scans
    are currently cost-optimal for a 12-row relation and existing lookup indexes
    are already present;
  - broad unwrapped RLS-helper cleanup remains MYK9-112, and index hygiene
    remains MYK9-113.

No user-facing page, dialog, or affordance is added. This does not duplicate an
existing product surface; a link cannot solve a database execution-plan defect.

### Non-goals

- No new UI or workflow surface.
- No authorization widening, role-model redesign, or broad permissive-policy
  consolidation.
- No removal of zero-scan indexes before MYK9-109 supplies representative
  traffic.
- No rebuild of the existing load harness or change to its acceptance targets.
- No database statistics reset or linked-project migration push without the
  required shared-system approval.

## Capabilities

### New Capabilities

- `entry-access-query-efficiency`: Entry-result reads reuse statement-scoped
  authorization context while preserving the existing caller-visible access
  contract and producing reproducible scan evidence.

### Modified Capabilities

None.

## Impact

- `supabase/migrations/`: recreate the latest
  `view_authenticated_entry_results` definition with statement-scoped access
  inputs, copied from its latest defining migration.
- `apps/myk9show/src/test/database/`: add migration/view contract coverage and
  retain the existing ringside, exhibitor, co-owner, and result-visibility
  contracts.
- [ADDED] `supabase/tests/myk9_114_entry_access_context_test.sql`: add a
  transaction-rolled-back fixture matrix that pins the current role/claim
  behavior before the migration and reruns unchanged afterward.
- [CORRECTED] `packages/supabase/src/types/database.types.ts`: verify the
  canonical public-schema types remain unchanged because the helper lives in a
  non-exposed `private` schema rather than becoming a generated PostgREST RPC.
- [ADDED] `scripts/qa/db-drift/myk9-114-scan-evidence.sql` and its TypeScript
  runner: provide mutually exclusive snapshot/read/plan modes and attributable
  separate-session deltas without any statistics-reset capability.
- `docs/launch/go-live-2026-07-26.md` and MYK9-114: record sources, measurements,
  deferred work, and the handoff to MYK9-109.
- Linked Supabase database: migration deployment and `pg_stat_reset()` are
  approval-gated; post-reset scan ratios are an evidence gate, not an assumed
  result.
