# MYK9-603 Task 5 report

## Status

Implemented the at-show consumer migration. The class list and quick-advance
panel now read through the canonical projected entry boundaries, preserve
`handler_identity`, invalidate on replication changes, and invalidate on
authoritative handler-person hydration completion. All new listeners clean up
on unmount, and IndexedDB-backed queries use `networkMode: 'always'`.

Consumer-owned armband enrichment/write-back sequencing was removed; no second
enricher or write-back path was added.

## TDD evidence

The focused tests were run red before implementation. The initial-render test
failed because the class list did not call the canonical projected read, the
hydration completion listener was absent, and the offline quick-advance test
rendered no chip. After implementation, the focused suite passed:

```text
Test Files  2 passed (2)
Tests       17 passed (17)
```

## Verification

- `pnpm vitest run src/features/at-show/useAtShowClassList.test.tsx src/features/at-show/quickAdvanceReplicated.test.ts` — passed (17 tests).
- `pnpm exec tsc --noEmit --project tsconfig.app.json` — passed.
- `pnpm qa:code-quality-ratchet` — passed; metrics remained below baseline.
- `git diff --check` — passed.

An adjacent four-file class-list run passed 39 of 40 tests; the one failure was
the existing `AtShowClassListPage.yourRing.test.tsx` ordering assertion
(`expected 4, received 2`) outside the task's allowed file set. It was not
modified or adjudicated here.

## Commit

The implementation is committed on `codex/myk9-603-handler-identity`.

## Fix round 1

Completed the shared-boundary follow-up that was blocked from the original
consumer patch. Handler-person completion now compares authoritative values to
the local snapshot before persisting or emitting, including present-to-missing
deletions; generation checks and listener error isolation remain in place.
Replicated entry mapping now retains denormalized `dog_call_name` and
`dog_breed` when the dog cache row is unavailable. The Your Ring fixture now
feeds its scored entry through the canonical `getEntriesByShow` read boundary.

Exact verification:

```text
pnpm vitest run src/services/database/entries/handlerHydration.test.ts src/features/at-show/useAtShowClassList.test.tsx src/features/at-show/quickAdvanceReplicated.test.ts src/features/at-show/AtShowClassListPage.yourRing.test.tsx src/services/mappers/__tests__/entryMappers.test.ts
Test Files  5 passed (5)
Tests       49 passed (49)

pnpm exec tsc --noEmit --project tsconfig.app.json
passed (exit 0)

git diff --check
passed (exit 0)

pnpm qa:code-quality-ratchet
passed; oversizedSourceFiles=157, anyCasts=21, todoMarkers=17, directSupabaseCoreBypasses=3

pnpm format:check:changed
blocked by the pre-existing branch change in apps/myk9show/src/services/database/entries/secretary.replication.test.ts; the touched fix-round files pass `pnpm exec prettier --check`.
```

## Review round 1 evidence

The review-fix pass added real canonical-boundary fixtures and bounded-read
coverage. The class-list suite is green:

```text
Test Files  1 passed (1)
Tests       10 passed (10)
```

The quick-advance bounded fast/deferred subset is green:

```text
Test Files  1 passed (1)
Tests       2 passed | 9 skipped (11)
```

The full quick-advance file remains red until the shared canonical mapper
preserves denormalized `dogCallName`/`dogBreed` when no dog cache row exists:

```text
Test Files  1 failed (1)
Tests       1 failed | 9 passed (10)
Failure: expected "#12 Scout — Beagle", received "#12"
```

The shared `handlerHydration.ts` changed-only emission and the adjacent
`AtShowClassListPage.yourRing.test.tsx` canonical-read fixture remain for the
root agent to apply because this subtask's patch guard rejects those
cross-consumer files.
