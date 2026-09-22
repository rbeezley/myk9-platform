# MYK9-603 local show-day read restructure

Status: in progress. Continues the canonical handler identity plan after whole-branch review of `381a9e1a9`.

## Review ruling, 2026-09-22

The two-lens review of `f5ff11e5` found that the at-show class cards and quick-advance chips do not display handler identity. Their new local identity read added an entry-notification race and extra dog/people work. Remove that migration rather than guarding an unused feature. Keep the canonical projection in the actual paperwork paths. The print lens also found deferred Reports hydration, ID-only AKC assignments, and the scheduled emergency packet RPC.

## Goal and boundaries

Use the entry's assigned handler on show-day and printed check-in surfaces, with owner fallback only for truly unassigned entries. Preserve offline availability and existing queue state. This changes existing reads and report mapping; it adds no new UI surface. The new worktree branch replaces PR #2363 rather than extending its broad diff.

## Tasks

1. Add a dedicated local projected show-day read for show and class scopes. Read replicated entries, dogs, and cached people without awaiting financial, release, or online sync requests. Preserve `isInRing`, check-in status, run order, score state, dog name/breed, and canonical `handler_identity`. Keep people refresh in the existing generation-guarded hydrator; expose a completion signal that cannot be lost before the initial query publishes. Test offline, cold cache, deferred refresh, and in-ring state with real replicated shapes.
2. Migrate at-show class list and quick advance to that read. Remove the broad DB-row normalization where typed replicated rows suffice. Keep live subscriptions for entry writes and person changes. Update existing page mocks to the new import boundary. Test initial render and refresh for both screens, including an in-ring entry and a registered entry with an unresolved enrollment request.
3. Migrate the actual Reports check-in print path (`reportRegistry` -> `toScoresheetModel` -> `reportDataMapping`) to `handler_identity`. Verify assigned text/person precedence, owner-only fallback, and assigned-but-unresolved behavior through a real projection fixture. Retain score-recording packet behavior unless it shares the same intended identity rule.
4. Remove the two tracked `.superpowers/sdd` reports, then run focused tests, app typecheck, lint, changed-file format and quality ratchet. Run one shuffled app suite; stop if it hangs for 30 seconds. Verify OpenSpec artifacts if present, or record which are absent. Request a whole-branch adversarial review with at least two distinct lenses before shipping.

## Acceptance

- At-show queues retain their established replicated read and do not gain an unused identity dependency.
- A people refresh that finishes during initial report loading results in visible fresh identity.
- The printed check-in sheet uses the canonical identity, including unknown when an assigned person cannot be resolved.
- Focused tests and required local checks pass, and review findings are addressed before PR creation.

## Corrective tasks after adversarial review

5. Restore at-show class list and quick advance to their existing replica-backed queue reads; delete `localShowDayRead` and its tests. Verify no production at-show consumer renders `handlerIdentitiesByClassId`. Run focused at-show tests.
6. Make `useReportData` update the existing report query when authoritative handler people arrive, including a completion during initial query loading. Test the real query-to-print path. In the AKC form data mapper, use the same assigned-text/person/owner precedence for ID-only handlers while preserving the no-cross-entry junior rule. Test an entry with a different assigned handler and blank text.
7. Correct the scheduled `emergency_packet_input` RPC in a new timestamped migration using the actual `entries.handler`, `entries.handler_id`, `dogs.owner_id`, and `people` schema. Check the latest function definition and linked database/migration version before writing. Preserve service-role-only EXECUTE, security-definer search path, and all existing filters. Add SQL contract/output coverage. Do not push the migration to the shared database from this branch.
8. Run focused unit/SQL contract tests, typecheck, lint, formatting, quality ratchet, and one shuffled app suite with the repository hang limit. Re-run two distinct adversarial review lenses on the final branch. The migration raises the review floor to independent; with Claude unavailable, record a truthful owner override and a deferred review issue if authorized, or keep the PR draft.
