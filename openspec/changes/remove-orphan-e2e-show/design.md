## Context

The published `f336...` show is outside the canonical seed and absent from its
reset scope. The title/UUID/MYK9-336 search across repository refs found audit
and credential references, but no creating test or recoverable creator. The
repository can therefore clean this exact known ID, while a future leak with a
different UUID remains an operational recurrence limitation.

## Goals / Non-Goals

**Goals:** document the unrecoverable creator search, keep the canonical seed
free of the orphan, provide deterministic owned-fixture teardown, and provide a
read-only preflight for the known ID. Task 1 hardens the existing permanent-show
delete RPC with payment and registration-FK guards; it does not by itself make
the RPC the only user-reachable delete path.

**Non-Goals:** execute a shared-database deletion from this branch, broadly delete all non-seed published shows, or add a cleanup UI. This has no offline/replication product-path impact.

## Decisions

- Prefer explicit fixture-ID lifecycle cleanup over name-pattern deletion. IDs are stable and do not risk deleting a legitimate show with similar text.
- Never run the orphan cleanup from the canonical seed or an automatic E2E
  lifecycle. The operator artifact is a read-only preflight: it never invokes a
  mutation and has no confirmation variable. An approved shared cleanup, after
  merge, uses the existing site-admin Show Details delete action.
- Survey dependent rows and the creator before the operator step; mirror
  payment-evidence signals, including entry payment links and enrollment
  references, in the read-only preflight. The RPC independently rechecks guards
  while holding the target show lock and owns child-delete ordering.
- Include entries reached through an orphan enrollment's registration_id in
  the RPC guard and refuse paid/refunded or payment-evidence rows.
- Treat preflight results as advisory and potentially stale; only the RPC's
  in-transaction checks protect the eventual mutation from concurrent writes.
- Qualify the RPC-only claim: hardDeleteShow in the application service still
  directly issues PostgREST DELETE until Task 1b routes it through the RPC.
  Separately, the authenticated shows_delete grant and RLS policy still permit
  direct table deletion (including for club admins). Removing that user-reachable
  path requires an explicit authorization decision and policy/grant migration.
- Treat live sibling enumeration as read-only evidence. Any actual shared cleanup waits for an approved reseed after merge.

## Risks / Trade-offs

- [The show carries payment-linked rows] → inspect every show-scoped money
  record; after Task 1b, let the reviewed hard-delete RPC own FK-safe deletion.
- [The original creator is unrecoverable] → protect only the known leaked ID and
  state explicitly that a different future UUID requires a new inventory/fix;
  this change does not claim to prevent arbitrary UUID leaks.
- [Over-broad cleanup removes tester-owned data] → scope by explicit fixture IDs/ranges, never by all published rows outside the seed.

## Migration Plan

Land the Task 1 migration and behavioral SQL regression, then route the
application service through the RPC in Task 1b. A normal reseed must not invoke
the orphan preflight or perform cleanup. The preflight is read-only and does not
call the RPC; an actual shared cleanup requires separate approval and the
existing site-admin Show Details delete action. The behavioral SQL runner was
inspected but not invoked because it requires the local migrated database.
Rollback of an applied migration requires a separately reviewed forward
migration; source-only rollback can revert the preflight and teardown wiring.

## Validation Profile

- Risk: high
- Validation: full
- Rationale: An approved shared cleanup deletes relational fixture data through
  the site-admin UI, so its guard behavior needs focused regression evidence.
