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
