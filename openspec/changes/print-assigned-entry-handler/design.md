## Context

See `proposal.md`. `usePipelinePrint` currently constructs handler output from dog ownership even though entry rows carry the assigned handler. Several print consumers share the mapped print shape.

## Goals / Non-Goals

**Goals:** define one handler precedence rule at the mapping boundary and verify downstream templates receive truthful data.

**Non-Goals:** change entry ownership, handler assignment, print layout, or add a new report.

## Decisions

1. Resolve the handler while mapping the real entry row to the print type: assigned joined handler/person or entry handler text first, owner second. Keeping the rule at the boundary prevents templates from independently inventing fallbacks.
2. Reuse one small typed helper if multiple print/form projections need the same precedence; do not create a new state store or query.
3. Audit AKC and gazette outputs, changing them only if they reproduce the owner-as-handler assumption. Pin correct existing behavior with a focused assertion where practical.
4. The change only formats already-loaded operational data and does not alter offline replication or mutations.

## Risks / Trade-offs

- [Entry shapes expose joined handler and legacy text differently] → test both the real modern shape and the no-handler legacy fallback.
- [Owner fallback masks a partially loaded handler] → distinguish absent handler from an unresolved relationship and preserve existing loading/error handling.

## Validation Profile

- Risk: medium
- Validation: app
- Rationale: This is a focused show-day print projection change with no mutation or schema impact.
