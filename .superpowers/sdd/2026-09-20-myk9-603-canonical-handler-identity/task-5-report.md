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
