## Why

Original request: "can you create a remediation plan using the opsx skills"

The secretary Setup and Show Desk audit found trust-breaking guidance defects on the canonical show details workbench: the same show can report conflicting entry/premium state, and recommended actions can land on empty or non-fixing destinations. This is a fall 2026 launch-readiness issue because secretary/show-day reliability depends on the workbench feeling calm, correct, and hard to mess up for elderly and non-technical volunteers.

## What Changes

- Make Show Desk entry and closeout counts derive from one show-scoped source of truth across hero cards, Show Map, closeout, and the existing People at show tool.
- Make pending signals and next-best actions land on destinations that contain the specific thing to fix, or suppress/replace actions when no useful target exists.
- Reconcile Setup premium readiness so `ready`, `published`, `stale`, and `not published` states cannot contradict each other.
- Clarify Setup schedule row affordances so class-looking rows either open class-level setup/details or plainly disclose that they open the trial.
- Improve mobile/tablet discovery of the existing show management sections without adding duplicate pages.
- Keep the Show Desk Tools copy aligned with its actual sections.

## Non-Goals

- No new Show Desk, Entry Management, Reports, Results & Check-In, or Submit Results page.
- No duplicated report/check-in/result workflows inside Show Desk.
- No broad redesign of the secretary dashboard, show creation wizard, registration wizard, or entry management surface beyond deep-link targets needed to clear the audited findings.
- No database schema or RLS change unless implementation evidence proves the existing replicated/read models cannot produce consistent show-scoped counts.

## Duplication Question

This change does not duplicate an existing page. The audited tabs already live in the canonical show details workbench, and the remediation should tighten their shared data, copy, and deep-links. A link alone is not enough for the high-priority findings because the current links either land on empty state (`Print Check-In Sheet`, pending closeout) or expose contradictory state (`0` entries versus People at show rows).

## Capabilities

### New Capabilities

- `secretary-show-workbench-guidance`: Secretary Setup and Show Desk guidance, readiness signals, section navigation, and next-action routing stay consistent, actionable, and consolidated inside the canonical show workbench.

### Modified Capabilities

- `show-desk-people-roster`: The existing People at show tool must agree with Show Desk entry/count state and continue routing full work to canonical owner surfaces.

## Impact

- Affects myK9Show secretary show details surfaces under `/shows/:showId/setup` and `/shows/:showId/show-desk`.
- Likely touched areas include `ShowManagementShell`, `ShowWorkbenchSetupPage`, `SetupAdaptiveHeader`, `PublishReadinessBlock`, `setupReadinessSignals`, `ShowWorkbenchShowDeskPage`, `ShowDeskPanel`, `ShowDeskAdaptiveHeader`, Show Map status/action helpers, and `ShowDeskPeopleRoster` derivation.
- Testing impact includes focused unit/component tests for readiness and action derivation, People roster/count consistency tests, and a manual multi-viewport re-walk against the audit path.
