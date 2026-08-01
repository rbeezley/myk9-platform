## Why

The 2026-08-01 judge browser walk found that the assigned scoresheet can remain indefinitely on “Loading scoresheet,” judge-facing entry totals disagree across routes, and the primary ringside actions are not consistently touch- or keyboard-operable. These gaps interrupt the judge’s “invisible technology” workflow and leave the fall 2026 show-day evidence gate incomplete.

User request: “can you start working on these issues in a logical order. don't worry about priority or ompact. Do what ever makes the most sense from a coding point of view.”

## What Changes

- Add a guarded remote single-role judge fixture with assigned and unassigned subjects so authorization behavior is testable without broader roles masking defects.
- Restore bounded, replication-backed scoresheet hydration for assigned judges and retain clear denial for unassigned judges.
- Make the scheduled judge audit able to exercise intercepted/disposable offline scoring without starting an unsafe second server or writing shared staging.
- Reuse one canonical show-entry query and cache identity for dashboard, stats, check-in, class management, and ringside totals; cold or failed hydration must not render a confident zero.
- Make existing ringside entry cards expose an explicit keyboard-operable Score/Resume action and bring frequent judge actions to the 44px minimum touch target, preferring 48px on tablet.
- Replace raw class UUIDs in default judge UI with existing human-readable show, trial, ring, and class labels.
- Add focused unit, interaction, authorization, offline, and browser coverage for every changed contract.

This change does **not** duplicate an existing page, sheet, dialog, or scoring workflow. All work tightens the existing `/judge/*` and `/at-show` surfaces and reuses their current routing, replication, mutation, and display-name seams. A link is not sufficient because the defects are inside the canonical destination surfaces themselves.

### Non-goals

- No new judge dashboard, scoring page, modal, role, or navigation destination.
- No direct PostgREST reads in core show-day flows and no replacement of the established replicated scoring mutation path.
- No unapproved shared Supabase mutation; browser scoring writes remain intercepted unless an explicitly approved remote disposable fixture is in use.
- No redesign of secretary/exhibitor workflows beyond adopting the same canonical entry rows where MYK9-65 already requires it.

## Capabilities

### New Capabilities

- `judge-ringside-interaction`: Explicit, accessible, tablet-sized judge actions and human-readable ringside context on the existing judge and at-show surfaces.
- `class-entry-count-consistency`: One replication-backed staff entry contract supplies truthful class totals across all operational surfaces, including cold and partial hydration states.

### Modified Capabilities

- `judge-responsibility-verification`: Judge coverage must use a guarded remote single-role actor and prove assigned, unassigned, and no-assignment behavior.
- `offline-scoring-durability`: Assigned score routes must hydrate or fail recoverably, and the full offline scoring journey must be safely replayable without shared writes.
- `testing-e2e-ci`: Scheduled judge UX evidence must attach to an owned/existing server safely and fail closed before any stateful browser action when isolation is unavailable.

## Impact

- **Linear:** MYK9-6, MYK9-65, MYK9-140, MYK9-141, MYK9-142, MYK9-143, MYK9-144.
- **myK9Show:** judge dashboard/stats/check-in data hooks, at-show class list and scoresheet hydration, shared entry query adapters, E2E fixtures, and focused tests.
- **Replication:** public contracts and offline mutation semantics remain unchanged; consumers consolidate on existing show-scoped replicated entry reads.
- **CI/audits:** scheduled/intercepted judge scoring gains a safe server-ownership path and explicit shared-target guard.
- **UX:** preserves the Judge intent (“Invisible technology”), 44–48px touch targets, plain-language context, minimal scrolling, and one existing scoring workflow.
