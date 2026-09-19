## Context

See `proposal.md`. The transformer substitutes string sentinels for missing registry metadata, while clone-plus-organization changes can preserve incompatible selected class state. Registry identity is intentionally read-only in the class editor.

## Goals / Non-Goals

**Goals:** fail before persistence, keep one class-definition workflow, and make cloned organization changes recoverable without database surgery.

**Non-Goals:** infer cross-registry mappings, make registry identity editable in Class Management, or repair live rows automatically.

## Decisions

1. Make the transformer return an explicit validation failure (or throw the existing typed wizard validation error) when a selected class lacks a resolved triple. The wizard boundary converts it to calm class-specific copy; the persistence layer never sees `Unknown`.
2. Block organization changes while cloned classes remain instead of re-deriving by label. Registry templates are not one-to-one, so automatic conversion could silently change scoring semantics. The existing Classes step is the canonical repair path.
3. Keep `ClassEditForm` registry fields read-only. Adding an alternate repair surface would duplicate setup and bypass template constraints.
4. This is online show setup, not a new show-day replicated read path. Existing persistence/mutation APIs remain unchanged except for preflight validation.

## Risks / Trade-offs

- [Legacy custom class legitimately omits a field] → validate against registry-specific required fields and name the exact class; do not blanket-require section where the registry does not.
- [Partial show rows created before validation fails] → validate the complete selected class set before the first persistence mutation.
- [Blocking organization change traps the user] → include direct guidance to clear cloned classes in the existing step and test the recovery path.

## Validation Profile

- Risk: high
- Validation: full
- Rationale: Invalid class identity can block registry result submission and spans wizard persistence and clone behavior.
