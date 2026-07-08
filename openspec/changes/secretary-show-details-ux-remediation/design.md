## Context

The audited surfaces are the canonical secretary show workbench routes:

- `/shows/:showId/setup` via `ShowWorkbenchSetupPage`
- `/shows/:showId/show-desk` via `ShowWorkbenchShowDeskPage`
- show-level chrome in `ShowManagementShell`

The role intent in `docs/INTENT.md` is secretary "That was easy": setup should feel like the software already knows what is needed, and show-day work should keep scratches, move-ups, changes, check-in, results, and closeout calm. The current implementation already follows the consolidation direction by linking to Entry Management, Reports, Results & Check-In, Submit Results, and secretary messages instead of duplicating those pages. The problem is that some links and signals do not land on a fix, and some show-day facts disagree across surfaces.

The audit source is `docs/ux-audits/secretary-elderly-novice-2026-07-08.md`. The buildable findings in scope are:

- Show Desk entry counts disagree between hero/Show Map/closeout and People at show.
- Pending closeout signal opens an empty Show Map filter.
- Next-best print action opens an empty report for a zero-entry class.
- Setup premium readiness contradicts itself.
- Setup schedule rows look class-specific but open trial details.
- Mobile section navigation hides later canonical sections behind horizontal scroll.

## Goals / Non-Goals

**Goals:**

- Make show-day counts and readiness facts consistent across the existing show workbench surfaces.
- Ensure each readiness chip, pending signal, and next-best action either lands on a resolving surface or is not shown as actionable.
- Preserve the existing owner pages: Entry Management owns broad entry work, Reports owns print/export, Results & Check-In owns result verification, Submit Results owns final filing, and secretary messages owns messaging.
- Keep mobile/tablet navigation discoverable without adding another page, sheet, or duplicate action set.
- Add focused automated coverage for pure derivation helpers and component behavior, plus a manual multi-viewport re-walk.

**Non-Goals:**

- No new secretary workbench page or duplicate show-day dashboard.
- No duplicate Reports, Entry Management, Results & Check-In, Submit Results, or messaging workflow inside Show Desk.
- No broad redesign of the show hero, dashboard, registration wizard, or Entry Management.
- No database migration unless implementation evidence proves the current replicated/query layers cannot produce consistent show-scoped state.

## Decisions

### 1. Normalize Show Desk counts before changing presentation

Use a single show-scoped derivation for the counts shown in the Show Desk hero/footer, Show Map summary, closeout summary, and People at show tool. Prefer an existing replicated/offline-safe read path for show-day data; do not introduce a direct Supabase read in the core flow if the data must work offline. If People at show intentionally includes rows outside the Show Map entry set, label the distinction plainly and cover it in tests.

Alternative considered: hide the People at show counts. Rejected because the roster is useful at the desk; the reliability issue is inconsistency, not the presence of the tool.

### 2. Treat signals and next actions as contracts, not hints

Pending signals and next-best actions should be emitted only when the target can resolve or inspect the specific condition. For `result pending closeout`, prefer a deep link to the relevant closeout or Results & Check-In target with trial/class context. For report actions, suppress or replace `Print Check-In Sheet` when the target class has zero entries.

Alternative considered: leave links generic and improve empty-state copy. Rejected because `docs/INTENT.md` says readiness chips must land on the fix; better empty states do not make a non-fixing action trustworthy.

### 3. Make premium readiness a single classifier

Centralize the status used by `SetupAdaptiveHeader`, `PublishReadinessBlock`, and the premium card in `ShowManagementShell` or a nearby helper. The classifier should distinguish at least `not-published`, `published-current`, and `published-stale`, then map each state to one visible message and one matching CTA.

Alternative considered: copy-edit each component separately. Rejected because local copy changes can drift again unless the state is shared.

### 4. Clarify schedule row destinations without adding a setup editor

Keep the existing route model. If a schedule row opens trial details, make the row label and accessible name say so. If implementation reveals a suitable class-level setup/detail target already exists, route class-looking rows there instead. Do not create a new class setup surface for this remediation.

Alternative considered: build inline class editing in Setup. Rejected because it would duplicate class management and expand surface area during consolidation.

### 5. Improve section discovery with a responsive selector or overflow affordance

Keep `SHOW_MANAGEMENT_SECTIONS` as the source of truth. On narrow widths, add a compact section selector or visible overflow affordance that exposes all six canonical sections. The UI should link to existing section routes and preserve `aria-current`/active state.

Alternative considered: duplicate important actions at the bottom of each tab. Rejected because that spreads navigation decisions across tabs and makes future consolidation harder.

## Risks / Trade-offs

- Count source mismatch is caused by seeded data shape or sync scope -> Inventory the involved show entry sources before coding, then cover the intended source in tests.
- Fixing counts through a direct online read could weaken show-day/offline reliability -> Prefer replicated/offline-safe query layers and document any online-only exception.
- Deep-linking pending closeout may require missing route params -> Keep the fallback explicit, such as a disabled signal with plain copy, instead of linking to an empty filter.
- Premium readiness refactor could regress public publishing actions -> Add tests for not-published, published-current, and published-stale states.
- Mobile section selector could duplicate the existing nav visually -> Use the same `SHOW_MANAGEMENT_SECTIONS` data and render only a responsive alternate control or explicit overflow treatment.
- Schedule row copy could reduce scan density -> Prefer short labels with clear accessible names, preserving 44px touch targets.
