/**
 * Host re-export shim for `CombinedEntryListDialogs`.
 *
 * The component moved into `@myk9/ringside` in PR E2d-2b. Four
 * dialog/panel components are now required slot props on the ringside
 * component (CheckinStatusDialog, RunOrderDialog,
 * ScoresheetPrintDialog, FilterPanel) — the combined-view host shim
 * (apps/myk9q/src/pages/EntryList/CombinedEntryList.tsx) threads them
 * in.
 *
 * Once all callers import from `@myk9/ringside` directly, this shim
 * can be deleted.
 */
export { CombinedEntryListDialogs } from '@myk9/ringside';
export type { CombinedEntryListDialogsProps } from '@myk9/ringside';
