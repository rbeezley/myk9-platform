# AKC Hide-Count Visibility — Design (MYK9-127)

**Date:** 2026-08-27
**Issue:** [MYK9-127](https://linear.app/myk9-platform/issue/MYK9-127/protect-master-and-detective-hide-counts-from-exhibitors)
**Finding:** SA-2026-07-29-01
**Status:** Approved design, pre-implementation

## Problem

The current model treats AKC Interior Excellent as having an unknown total
hide count. Under the AKC Scent Work Regulations, Interior Excellent has
three total hides; only their distribution between the two search areas is
not communicated to the handler. The current security migration also
withholds `classes.num_hides` as a whole column from authenticated clients,
so exhibitors cannot receive rule-defined counts for classes where the total
is known.

The corrected product rule is registry-specific:

- AKC Odor Search Master classes and AKC Detective conceal the actual hide
  count from exhibitors.
- Other AKC classes may expose the rule-defined total, including Interior
  Excellent (3) and Handler Discrimination Master (3).
- UKC and ASCA continue to follow their own `sport_class_rules` rather than
  inheriting AKC's level-name policy.
- Judges, stewards, managers, and authorized show officials retain the true
  protected count through the existing authorized path, including offline
  replication.

## Governing evidence

The August 2025 AKC Scent Work Regulations define Interior Excellent as three
total hides split between two search areas, list known fixed counts for the
other Excellent odor-search elements, define variable unknown counts for the
Master odor-search elements, set Handler Discrimination Master to three, and
define Detective as five to ten unknown hides.

Repository intent requires reliable offline show-day operation and established
replication-backed reads. The fix therefore enriches already-visible replicated
class rows instead of creating a new UI or online-only data path.

## Decisions

1. **Keep the base-column security boundary.** Direct authenticated and
   anonymous access to `classes.num_hides` remains denied. PostgreSQL column
   grants cannot vary by row, and restoring direct access would expose
   protected values.
2. **Derive public counts from public rules.** For class rows already visible
   to the caller, replication resolves fixed counts from
   `sport_class_rules` when `hides_known = true`. This cannot reveal an
   unpublished class ID because it enriches rows returned through the
   existing class visibility query.
3. **Keep the official secret-count RPC authoritative.** The existing
   `get_show_class_hide_counts` authorization remains unchanged. Values it
   returns override public rule-derived values for authorized officials.
4. **Correct persisted AKC Interior Excellent data.** A migration changes its
   rule to fixed 3 / known and backfills existing AKC Interior Excellent
   classes to `num_hides = 3` and `hides_known = true`.
5. **Use registry rule data, not level names, for non-secret counts.** This
   preserves UKC/ASCA semantics and avoids accidentally exposing an unknown
   count merely because a class is not named Master or Detective.

## Data flow

```text
visible replicated class rows
    -> resolve trial registry/sport context
    -> fetch matching public sport_class_rules
    -> known + fixed rule: attach rule-defined count
    -> unknown/banded rule: attach nothing
    -> authorized hide-count RPC results override matching rows
    -> persist merged class in IndexedDB
```

The official RPC remains the only route by which a protected actual count can
reach a client. Existing auth-boundary cache scrubbing continues to remove all
cached hide counts on role or session changes; normal replication rehydrates
public fixed counts afterward.

## Database migration

The migration will:

- assert or narrowly identify the AKC Scent Work Interior Excellent rule;
- set `hide_count_fixed = 3`, clear the min/max band, and set
  `hides_known = true`;
- backfill existing AKC Interior Excellent classes through their trial/show
  registry context to `num_hides = 3` and `hides_known = true`;
- avoid modifying Master, Detective, Handler Discrimination, UKC, or ASCA
  rows;
- update comments only where they currently describe the blanket policy.

Before writing the migration, inventory the relevant template/rule/class rows
in one query pass as required by the repository database workflow.

## Application changes

- Correct the static AKC rule representation and user-facing descriptions for
  Interior Excellent.
- Extend hide-count resolution to match visible class rows to public known,
  fixed rules before merging authorized RPC results.
- Reuse the current replication query/table layer and existing class shape;
  do not add a page, dialog, or separate data store.
- Keep direct class select allowlists and the protected-count RPC authorization
  unchanged.

## Security invariants

- An exhibitor cannot select or predicate on the raw `num_hides` column.
- An exhibitor cannot obtain actual AKC Odor Search Master or Detective counts
  through the RPC, replication store, API payloads, or UI state.
- An exhibitor can receive only a fixed value that is already declared public
  by the matching registry rule.
- AKC Handler Discrimination Master remains fixed and visible at 3.
- Officials authorized by the existing RPC retain protected counts offline.
- Unpublished show/class visibility is unchanged.

## Testing

Implementation follows assertion-first test-driven development:

1. Add failing AKC rule tests proving Interior Excellent is fixed/known at 3
   and Handler Discrimination Master remains fixed/known at 3.
2. Add failing replication resolver tests proving:
   - visible fixed/known rows receive the rule-defined count;
   - unknown/banded Master and Detective rows receive no count for an
     exhibitor;
   - authorized RPC results override rule-derived data;
   - UKC/ASCA behavior follows their rule metadata.
3. Expand the behavioral SQL matrix for exhibitor, manager, assigned judge,
   AKC known-count, AKC Master, AKC Detective, Handler Discrimination Master,
   and non-AKC cases.
4. Add migration/parity coverage for AKC Interior Excellent and existing class
   backfill behavior.
5. Run focused Vitest suites, the hide-count behavioral SQL test when the local
   Supabase harness is available, typecheck for affected packages, and
   `git diff --check`.

No test may assert that an exhibitor receives a protected actual count through
the official RPC. Public fixed counts are derived from rules only after the
class row has passed normal visibility filtering.

## Rejected alternatives

### Return public and protected values from the security-definer RPC

This centralizes resolution but requires duplicating class/show RLS visibility
inside a `SECURITY DEFINER` function. A mistake could reveal unpublished class
metadata. The existing RPC has a narrow, auditable official-only contract and
should remain narrow.

### Move protected values to a separate table

Separating public and secret storage could be cleaner long term, but it would
touch creation, editing, scoring, replication, and offline persistence. That
is disproportionate to correcting the existing rule and visibility boundary.

## Rollout and closure proof

The application fix and migration ship together in one PR. Applying the
migration to the linked Supabase project is a separate shared-system action
requiring user confirmation. MYK9-127 remains open until the PR evidence shows
the matrix above passes and the linked environment has the corrected rule/data.

SA-2026-07-29-01 is no longer blocked on concealing every hide count. Closure
is proven when all protected AKC paths are denied to exhibitors, authorized
official access still works offline, and known fixed counts are available
without weakening the raw-column boundary.

## Out of scope

- Revealing the per-area distribution for AKC Interior Excellent.
- Changing UKC or ASCA competition rules.
- Adding a new UI surface.
- Broadly redesigning class secret storage.
- Deploying the migration without the shared-system approval gate.
