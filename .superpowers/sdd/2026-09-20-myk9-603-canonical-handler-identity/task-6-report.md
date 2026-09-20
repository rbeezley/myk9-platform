# MYK9-603 Task 6 report

## Status

Implemented and committed on `codex/myk9-603-handler-identity`.

## Changes

- Migrated pipeline run-order printing to `handler_identity.name` and
  `handler_identity.source`; unknown projections use the existing `Unknown
  Handler` placeholder and no longer derive a handler from dog-owner fields.
- Migrated replicated check-in rows to collect the explicit handler/owner
  dependency IDs, load the canonical people snapshot once, and use
  `projectEntryHandlerIdentity` before formatting the report fields.
- Added acceptance coverage for an ID-only assigned handler (`Harper Handler`)
  versus owner (`Olivia Owner`) on both run-order and check-in output.
- Added legacy owner fallback coverage when handler text and handler ID are
  absent.
- AKC and Gazette owner/handler audit passed with existing focused assertions;
  no production changes were needed. AKC preserves `Sarah Johnson` as owner
  and `Bob Handler` as handler. The shared Gazette/Heritage builder preserves
  `Sarah Nakamura` as owner and `Jamie Smith` as designated handler.

The named `usePipelinePrint.test.ts` path does not exist on current main, so
the print acceptance tests were added to the existing focused
`print-service.test.ts` surface rather than creating a parallel test module.

## TDD evidence

The new print and check-in acceptance tests were run red before the consumer
changes. The old print mapper emitted `Olivia Owner`/`Unknown Handler`, and the
old check-in mapper never called canonical identity hydration. After the
minimal consumer changes, the same focused tests passed.

## Verification

```text
cd apps/myk9show && pnpm vitest run \
  src/features/pipeline/print/print-service.test.ts \
  src/hooks/queries/__tests__/useCheckInReport.replication.test.ts
Test Files 2 passed; Tests 6 passed

cd apps/myk9show && pnpm vitest run \
  src/hooks/queries/__tests__/useCheckInReport.test.ts \
  src/features/pipeline/print/__tests__/print-utils.test.ts \
  src/features/pipeline/print/print-service.test.ts \
  src/hooks/queries/__tests__/useCheckInReport.replication.test.ts
Test Files 4 passed; Tests 44 passed

cd apps/myk9show && pnpm vitest run \
  src/features/pipeline/print/print-service.test.ts \
  src/hooks/queries/__tests__/useCheckInReport.replication.test.ts \
  src/features/organization-forms/__tests__/akcScentWorkEntryForm.test.ts \
  src/features/gazette/entry-blank/__tests__/GazetteEntryBlankDocument.test.tsx
Test Files 4 passed; Tests 30 passed

cd apps/myk9show && pnpm exec tsc --noEmit --project tsconfig.app.json
passed

cd apps/myk9show && pnpm exec tsc --noEmit --project tsconfig.test.json
passed

pnpm qa:code-quality-ratchet
passed; metrics remained below baseline

pnpm exec prettier --check \
  apps/myk9show/src/features/pipeline/print/print-service.test.ts \
  apps/myk9show/src/features/pipeline/print/usePipelinePrint.ts \
  apps/myk9show/src/hooks/queries/__tests__/useCheckInReport.replication.test.ts \
  apps/myk9show/src/hooks/queries/useCheckInReportReplication.ts
passed

git diff --check
passed
```

## Scope and concerns

- No AKC or Gazette production code changed because the owner/handler audit
  assertions passed.
- The check-in consumer uses the existing ID-based hydration path and renders
  the allowed unknown placeholder when that ancillary identity is unavailable;
  it does not add a local owner fallback.

## Commit

- `fix(paperwork): print canonical assigned handler identity`

## Fix round 1/5 — deferred hydration, cold-dog owner, and Gazette audit

### Changes

- Wired `useCheckInReport` to `subscribeHandlerPeopleHydration`, retaining
  explicit identity dependency IDs through grouped report data. The hook filters
  completion events to IDs used by the current report, invalidates only the
  current report query, and returns the subscription cleanup function.
- Added the typed `withReplicatedDogOwner` boundary to the replicated check-in
  read before identity IDs are collected. A dog-only entry now finds its owner
  through the replicated dog row and uses that owner identity when no handler
  text or ID exists.
- Added a real Gazette document rendering assertion that distinguishes
  `Olivia Owner` in `Owner name` from `Harper Handler` in `Handler (if
  different)`. The assertion passed, so no Gazette production code changed.

### TDD evidence

The new focused assertions were red before the implementation: the check-in
rows omitted dependency IDs, the cold-dog fixture hydrated with `[]`, and the
hook had no hydration listener. After the minimal implementation, the same
suite passed.

### Verification

```text
pnpm vitest run \
  apps/myk9show/src/hooks/queries/__tests__/useCheckInReport.test.ts \
  apps/myk9show/src/hooks/queries/__tests__/useCheckInReport.replication.test.ts \
  apps/myk9show/src/components/checkin/__tests__/CheckInExhibitorCard.test.tsx \
  apps/myk9show/src/features/pipeline/print/print-service.test.ts \
  apps/myk9show/src/features/pipeline/print/__tests__/print-utils.test.ts \
  apps/myk9show/src/features/organization-forms/__tests__/akcScentWorkEntryForm.test.ts \
  apps/myk9show/src/features/gazette/entry-blank/__tests__/GazetteEntryBlankDocument.test.tsx \
  apps/myk9show/src/services/database/entries/handlerHydration.test.ts \
  apps/myk9show/src/features/at-show/useAtShowClassList.test.tsx \
  apps/myk9show/src/features/at-show/useAtShowClassList.realHydration.test.tsx
Test Files 10 passed; Tests 104 passed

pnpm exec tsc --noEmit --project apps/myk9show/tsconfig.app.json
passed (exit 0)

pnpm exec tsc --noEmit --project apps/myk9show/tsconfig.test.json
failed (exit 2) on existing unrelated errors in quickAdvancePanel.realHydration.test.tsx,
useAtShowClassList.realHydration.test.tsx, ShowDeskPeopleRoster.test.tsx,
entryHandlerProjection.test.ts, handlerHydration.test.ts,
and entryMappers.test.ts; no errors pointed at the touched check-in/Gazette files.

pnpm qa:code-quality-ratchet
passed; oversizedSourceFiles 158, anyCasts 21, todoMarkers 17, directSupabaseCoreBypasses 3

pnpm exec prettier --check \
  apps/myk9show/src/components/checkin/__tests__/CheckInExhibitorCard.test.tsx \
  apps/myk9show/src/features/gazette/entry-blank/__tests__/GazetteEntryBlankDocument.test.tsx \
  apps/myk9show/src/hooks/queries/__tests__/useCheckInReport.replication.test.ts \
  apps/myk9show/src/hooks/queries/useCheckInReport.ts \
  apps/myk9show/src/hooks/queries/useCheckInReportReplication.ts \
  .superpowers/sdd/2026-09-20-myk9-603-canonical-handler-identity/task-6-report.md
passed; all matched files use Prettier code style

git diff --check
passed
```

### Concerns

- The app typecheck and all focused runtime tests pass. The test-project
  typecheck remains blocked by the unrelated pre-existing errors listed above;
  this round does not broaden scope to repair them.
- The required shuffled whole-app run started with seed `1789926421853`, then
  reported one unrelated failure in
  `src/features/at-show/AtShowClassListPage.entryCounts.test.tsx` and produced
  no further progress for over 30 seconds; it was interrupted with exit 130.
- `pnpm qa:inflight` did not return within 60 seconds while checking the
  touched paths and was interrupted; it produced no ownership hit.
