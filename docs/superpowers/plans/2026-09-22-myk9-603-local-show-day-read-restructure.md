# MYK9-603 printed handler identity restructure

Status: in progress. Continues the canonical handler identity plan after whole-branch review of `381a9e1a9`.

## Review ruling, 2026-09-22

The two-lens review of `f5ff11e5` found that the at-show class cards and quick-advance chips do not display handler identity. Their new local identity read added an entry-notification race and extra dog/people work. Remove that migration rather than guarding an unused feature. Keep the canonical projection in the actual paperwork paths. The print lens also found deferred Reports hydration, ID-only AKC assignments, and the scheduled emergency packet RPC.

## Goal and boundaries

Correct the handler printed on check-in sheets, run orders, AKC forms, gazettes, and scheduled emergency packets, with owner fallback only for truly unassigned entries. Preserve offline availability and existing print/report state. This changes existing print paths and adds no UI surface. Interactive Secretary Run Sheet behavior and the Show Desk people roster are explicitly deferred follow-up; no claim is made that this work changes either live surface. The new worktree branch replaces PR #2363 rather than extending its broad diff.

## Tasks

1. Route the actual printed check-in and run-order paths (`reportRegistry` -> `toScoresheetModel` -> `reportDataMapping`) through canonical `handler_identity`. Verify assigned text/person precedence, owner fallback only for unassigned entries, and assigned-but-unresolved behavior through real projections.
2. Audit the existing AKC entry form and gazette handler sections; use the same assigned-handler rule while preserving distinct owner and handler fields.
3. Update the scheduled emergency packet RPC in a new timestamped migration using the actual `entries.handler`, `entries.handler_id`, `dogs.owner_id`, and `people` schema. Preserve service-role-only EXECUTE, security-definer search path, and all existing filters. Add SQL contract and behavioral fixture coverage. Do not push the migration to the shared database from this branch.
4. Keep interactive Secretary Run Sheet behavior and the Show Desk people roster out of scope; track them as follow-up work if their live handler identity needs correction.
5. Run focused tests, app typecheck, lint, changed-file format and quality ratchet. Run one shuffled app suite and stop if it produces no useful result for 30 seconds. Validate the OpenSpec change. Request two distinct adversarial review lenses on the final branch before shipping.

## Acceptance

- Printed check-in sheets, run orders, AKC forms, gazettes, and scheduled emergency packets use the assigned handler, with owner fallback only when unassigned.
- A people refresh that finishes during initial report loading results in visible fresh identity on affected printouts.
- A printout remains unknown when an assigned person cannot be resolved; this does not define interactive Secretary Run Sheet or Show Desk roster behavior.
- Focused tests and required local checks pass, and review findings are addressed before PR creation.

## Corrective tasks after adversarial review

5. Restore at-show class list and quick advance to their existing replica-backed queue reads; delete `localShowDayRead` and its tests. Verify no production at-show consumer renders `handlerIdentitiesByClassId`. Run focused at-show tests.
6. Make `useReportData` update the existing report query when authoritative handler people arrive, including a completion during initial query loading. Test the real query-to-print path. In the AKC form data mapper, use the same assigned-text/person/owner precedence for ID-only handlers while preserving the no-cross-entry junior rule. Test an entry with a different assigned handler and blank text.
7. Correct the scheduled `emergency_packet_input` RPC in a new timestamped migration using the actual `entries.handler`, `entries.handler_id`, `dogs.owner_id`, and `people` schema. Check the latest function definition and linked database/migration version before writing. Preserve service-role-only EXECUTE, security-definer search path, and all existing filters. Add SQL contract/output coverage. Do not push the migration to the shared database from this branch.
8. Run focused unit/SQL contract tests, typecheck, lint, formatting, quality ratchet, and one shuffled app suite with the repository hang limit. Re-run two distinct adversarial review lenses on the final branch. The migration raises the review floor to independent; with Claude unavailable, record a truthful owner override and a deferred review issue if authorized, or keep the PR draft.
