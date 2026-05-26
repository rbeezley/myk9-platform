// Re-export shim — implementation moved to @myk9/ringside in PR D.
// See packages/ringside/src/stores/entryStore.ts and
// docs/plans/phase-0-ringside-package.md for the extraction plan.
export { useEntryStore } from '@myk9/ringside';
export type { Entry, EntryStatus } from '@myk9/ringside';
