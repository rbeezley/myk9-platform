/**
 * Host re-export shim for `EntryListContent`.
 *
 * The component moved into `@myk9/ringside` in PR E2d-2b. This file
 * keeps the original import path stable for callers in
 * apps/myk9q/src/pages/EntryList/ (notably EntryList.tsx and
 * CombinedEntryList.tsx, which also move/become shims in the same PR).
 *
 * Once all callers import from `@myk9/ringside` directly, this shim
 * can be deleted. Not blocking E2d-2b.
 */
export { EntryListContent } from '@myk9/ringside';
export type { EntryListContentProps } from '@myk9/ringside';
