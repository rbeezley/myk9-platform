## Why

Go Live Runbook Phase 2 still depends on manual, easy-to-skip data and access checks: judge preload readiness, seeded demo fixtures, ringside passcodes, and stale-anon cleanup. These checks directly affect show-day secretary and judge reliability, so they need repeatable evidence before Phase 4 rehearsals and real-user testing.

This supports fall 2026 launch readiness by turning silent data gaps into a short, runnable verification path. It does not add product UI or duplicate an existing surface; the work is operational validation and guardrails around existing runbooks.

## What Changes

- Add a launch-readiness seed/access verification capability for Phase 2.
- Add a read-only verification script/checklist for judge data, demo fixtures, passcodes, roles, and stale-anon cleanup.
- Add local/source checks that detect a header-only judge CSV before anyone generates a misleading preload migration.
- Update Go Live tracking docs with evidence and approval/operator gates.
- Leave real judge export acquisition, real database writes, dashboard toggles, and live cold-session walks as explicit approval/operator gates.

Non-goals:

- Do not invent AKC/UKC judge data.
- Do not add a new page, dialog, or user workflow.
- Do not run shared-system mutations such as `supabase db push`, seed repairs, dashboard updates, or production writes without explicit approval.

## Capabilities

### New Capabilities

- `go-live-phase-2-data-access-verification`: Covers repeatable verification of Phase 2 seed, judge preload, ringside passcode, role grant, and stale-anon cleanup readiness.

### Modified Capabilities

- None.

## Impact

- Affected docs: `docs/operations/go-live-runbook.md`, `docs/operations/go-live-opsx-batches.md`, and supporting operation notes as needed.
- Affected tooling: a repo-local read-only verification script or SQL artifact under `scripts/` or `docs/operations/`.
- Affected systems: Supabase staging/prod checks are read-only unless explicitly approved; real judge import migrations and seed repairs remain confirmation-gated.
