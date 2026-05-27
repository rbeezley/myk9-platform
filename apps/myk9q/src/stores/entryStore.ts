// Re-export shim — implementation moved to @myk9/ringside in PR D.
// See packages/ringside/src/stores/entryStore.ts and
// docs/plans/phase-0-ringside-package.md for the extraction plan.
//
// We instantiate via `createEntryStore(import.meta.env.DEV)` rather than
// re-exporting the package's default singleton so Redux DevTools is enabled
// for myK9Q developers in dev builds (the package default leaves it off to
// keep prod bundles clean and match the `@myk9/scoring` precedent). Safe
// because no app code imports `useEntryStore` directly from `@myk9/ringside`
// — every callsite resolves through this shim, so there is only one runtime
// store instance per host.
import { createEntryStore } from '@myk9/ringside';

export const useEntryStore = createEntryStore(import.meta.env.DEV);
export type { Entry, EntryStatus } from '@myk9/ringside';
