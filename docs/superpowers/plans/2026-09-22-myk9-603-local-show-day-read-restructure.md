# MYK9-603 local show-day read restructure

Status: in progress. Continues the canonical handler identity plan after whole-branch review of `381a9e1a9`.

## Goal and boundaries

Use the entry's assigned handler on show-day and printed check-in surfaces, with owner fallback only for truly unassigned entries. Preserve offline availability and existing queue state. This changes existing reads and report mapping; it adds no new UI surface. The new worktree branch replaces PR #2363 rather than extending its broad diff.

## Tasks

1. Add a dedicated local projected show-day read for show and class scopes. Read replicated entries, dogs, and cached people without awaiting financial, release, or online sync requests. Preserve `isInRing`, check-in status, run order, score state, dog name/breed, and canonical `handler_identity`. Keep people refresh in the existing generation-guarded hydrator; expose a completion signal that cannot be lost before the initial query publishes. Test offline, cold cache, deferred refresh, and in-ring state with real replicated shapes.
2. Migrate at-show class list and quick advance to that read. Remove the broad DB-row normalization where typed replicated rows suffice. Keep live subscriptions for entry writes and person changes. Update existing page mocks to the new import boundary. Test initial render and refresh for both screens, including an in-ring entry and a registered entry with an unresolved enrollment request.
3. Migrate the actual Reports check-in print path (`reportRegistry` -> `toScoresheetModel` -> `reportDataMapping`) to `handler_identity`. Verify assigned text/person precedence, owner-only fallback, and assigned-but-unresolved behavior through a real projection fixture. Retain score-recording packet behavior unless it shares the same intended identity rule.
4. Remove the two tracked `.superpowers/sdd` reports, then run focused tests, app typecheck, lint, changed-file format and quality ratchet. Run one shuffled app suite; stop if it hangs for 30 seconds. Verify OpenSpec artifacts if present, or record which are absent. Request a whole-branch adversarial review with at least two distinct lenses before shipping.

## Acceptance

- Show-day reads render locally without waiting on PostgREST enrichment and preserve queue fields.
- A people refresh that finishes during initial loading results in visible fresh identity.
- The printed check-in sheet uses the canonical identity, including unknown when an assigned person cannot be resolved.
- Focused tests and required local checks pass, and review findings are addressed before PR creation.
