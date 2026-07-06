## Context

Phase 4 can only close after Phases 1-3 are complete and users test a near-final product. Agent-owned work is therefore preparation: make the evidence checklist exact, confirm supporting docs/tests exist, and keep unchecked items unchecked.

## Goals / Non-Goals

**Goals:**

- Provide a tested TypeScript verifier for Phase 4 evidence readiness.
- Add a concise operator checklist for the show-day re-walk, offline rehearsal, hardware print test, real-user testing, and scorecard close-out.
- Update trackers with prepared commands and blockers.

**Non-Goals:**

- Do not perform staging/hardware/real-user evidence unattended.
- Do not mutate shared systems.
- Do not modify UX or app behavior.

## Decisions

1. Treat live evidence as blocked unless explicit artifact links are recorded.
   - Rationale: Phase 4 is about proof, not source readiness.

2. Keep the verifier local/source-only.
   - Rationale: staging and hardware evidence need human/operator context.

## Risks / Trade-offs

- The verifier will not close Phase 4 by itself -> this is intentional.
- Checklist evidence can go stale -> morning run should paste links/screenshots/logs into the tracker after execution.

## Migration Plan

1. Add verifier, tests, checklist, and OpenSpec artifacts.
2. Run focused tests, local verifier, OpenSpec validation, and diff hygiene.
3. Open a PR and keep evidence gates open until the actual walks/tests run.
