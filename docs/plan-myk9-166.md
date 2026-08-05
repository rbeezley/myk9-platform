# MYK9-166: Replace hand-rolled popups

## Scope

Replace the five `absolute top-full` popups with the existing portaled, collision-aware Popover primitive. Keep typed suggestion surfaces input-focused and expose their options as listbox suggestions; keep the conflict notification widget as a normal popover panel.

## Implementation slices

1. Migrate `ArmbandLookup` to a controlled Popover anchored by its input.
2. Migrate handler autocomplete results to a controlled Popover per dog card, preserving freeform typing and selection behavior.
3. Migrate the conflict notification widget to Popover.
4. Migrate AdvancedSearch and SearchSuggestions to Popover-based suggestion panels.
5. Migrate RecentSearches' suggestion panel and remove all five files from the architecture ratchet.

## Testing

- Run existing focused component tests and add/adjust assertions for the Popover surfaces and input focus contract where practical.
- Run `noHandRolledDropdowns.test.ts` to prove the ratchet shrinks and no new hand-rolled popup remains.
- Run TypeScript checks for `apps/myk9show` and the focused Vitest files.
- Verify short-viewport, bottom-trigger geometry with the app's browser QA tooling for the migrated surfaces; record any environment limitation in the handoff.
