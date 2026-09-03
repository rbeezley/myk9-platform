# @myk9/scoring

Internal scoring-session state and shared scoring types for myK9Show.

## API

- `useScoringStore`: the default persisted Zustand store.
- `createScoringStore`: creates a store with optional `enableDevtools` and `storageName` settings.
- `ScoringState`, `Score`, `ScoringSession`, and competition/timer types: see [the package barrel](src/index.ts).

The store starts and ends sessions, records scores, tracks score sync status, navigates entries, and supports undo. It does not submit database mutations itself; consumers retain their established mutation workflow.

The unused standalone timer store and calculation/nationals helpers were removed in the internal-package cleanup. Live timing belongs to `@myk9/scoring-ui`; its mounted consumers remain unchanged.

## Verification

Run from this package directory:

```sh
pnpm build
pnpm typecheck
pnpm test --run
```
