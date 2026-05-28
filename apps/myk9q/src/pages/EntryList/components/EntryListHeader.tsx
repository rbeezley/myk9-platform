/**
 * Host re-export shim for `EntryListHeader`.
 *
 * The component moved into `@myk9/ringside` in PR E2d-2b. Six host UI
 * primitives (HamburgerMenu, CompactOfflineIndicator, SyncIndicator,
 * RefreshIndicator, FilterTriggerButton, ClassDetailsPopover) are now
 * required slot props on the ringside component — the host shims at
 * apps/myk9q/src/pages/EntryList/EntryList.tsx and CombinedEntryList.tsx
 * (also rewritten in this PR) thread them in.
 *
 * Once all callers import from `@myk9/ringside` directly, this shim
 * can be deleted.
 */
export { EntryListHeader } from '@myk9/ringside';
export type { EntryListHeaderProps } from '@myk9/ringside';
