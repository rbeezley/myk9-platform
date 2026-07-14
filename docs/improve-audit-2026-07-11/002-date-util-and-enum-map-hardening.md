# 002 — Harden `toLocalDateOnly` and unguarded status/eventType map lookups

> Written against commit `15897d862` (2026-07-11). If cited code has moved materially, STOP and report drift.

## Why this matters

Two small fail-soft gaps, both confirmed by reading:

**(a)** `apps/myk9show/src/utils/date-format.ts:14-23` — `toLocalDateOnly` uses **local** getters (`getFullYear/getMonth/getDate`) after `new Date(isoStr)`. Its `if (!isoStr.includes('T')) return isoStr` guard saves bare `"YYYY-MM-DD"` inputs, but a timestamptz-midnight-UTC string (`"2026-05-15T00:00:00+00:00"`, the shape a DATE column can round-trip as) returns `"2026-05-14"` for US users — silently writing the wrong show date back on edit. Used on show fields in `pages/secretary/ShowCreationWizard/buildCreateShowPayload.ts:251-257`. The function's docstring says it exists for picker-local datetimes ("May 14 11:59 PM CDT" → `"2026-05-14"`), so the local-getter behavior is CORRECT for picker input — the fix is to make the UTC-midnight shape safe too, not to change picker semantics.

**(b)** Unguarded map lookups that throw and blank the component if the DB enum gains a value ahead of the frontend:
- `apps/myk9show/src/components/entries/PaymentPendingIndicator.tsx:174-175`: `const config = statusConfig[status]; const IconComponent = config.icon;`
- `apps/myk9show/src/components/dogs/DogDetails/HealthRecords/HealthTimeline.tsx:186,212`: `eventTypeConfig[event.type].label`

Exemplars that already do this right: `adminStatusPresentation.ts` and `entryStatusUtils.getEntryStatusBadgeStyle` (default fallbacks). Project memory also records a production crash from exactly this pattern (unguarded `MAP[dbStatus]`).

## Steps

1. **Assertion-first tests for (a)** in `date-format.test.ts` (created by plan 001 — if 001 hasn't run, create it):
   - `toLocalDateOnly("2026-05-15T00:00:00+00:00")` → `"2026-05-15"` (red today for TZ-west-of-UTC runs; note vitest runs in the machine's local TZ — set `TZ=America/New_York` via `vi.stubEnv`-independent means: run assertions on the parsed shape, or construct expectations from the same Date; simplest robust approach: detect a trailing `Z`/`+00:00` midnight-UTC shape and slice the date part).
   - `toLocalDateOnly("2026-05-15T04:59:00Z")` when local is CDT → `"2026-05-14"` (existing picker behavior — must stay).
2. **Fix (a):** in `toLocalDateOnly`, before the general path, handle the UTC-midnight shape: if the string matches `/T00:00:00(\.0+)?(Z|\+00:?00)$/`, return `isoStr.split('T')[0]`. Keep everything else unchanged.
3. **Fix (b):** add a `?? <default entry>` fallback to both lookup sites (pattern: define a `defaultConfig` entry in the same object/file; `const config = statusConfig[status] ?? defaultConfig;`). Match each file's existing style. Then run each component's colocated test if present; add a minimal render test asserting an unknown status string renders the fallback instead of throwing (use the custom render from `src/test/utils/testUtils.tsx`).
4. Sweep for siblings: `grep -rn "Config\[.*\]\.\(icon\|label\|color\)" apps/myk9show/src/components/ | grep -v "??"` — fix any additional unguarded direct-property-access-on-lookup hits the same way (audit found these two; the sweep is the completeness check). Do NOT refactor guarded ones.

## Out of scope

- The show past/active classification (plan 001). `toLocalDate` (correct as is). Any DB/enum change.

## Done criteria

- New tests red-then-green as described. `pnpm typecheck && pnpm lint` green; `cd apps/myk9show && pnpm test` green.
- The step-4 grep returns no unguarded hits.

## Maintenance note

New status/enum presentation maps must ship with a default entry; new DB enum values should land frontend-first or with the fallback proving graceful degradation.
