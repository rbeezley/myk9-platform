/**
 * Host re-export shim for `SortableEntryCard`.
 *
 * The component moved into `@myk9/ringside` in PR E2d-2b. This file
 * keeps the original import path stable for in-tree consumers
 * (currently only `./components/EntryListContent.tsx`, which moves
 * into ringside in the same PR) and any future apps/myk9q callers
 * that haven't migrated to the package import.
 *
 * Once all consumers import from `@myk9/ringside` directly, this
 * shim can be deleted. Not blocking E2d-2b — tracked in cleanup.
 */
export { SortableEntryCard } from '@myk9/ringside';
export type { SortableEntryCardProps } from '@myk9/ringside';
