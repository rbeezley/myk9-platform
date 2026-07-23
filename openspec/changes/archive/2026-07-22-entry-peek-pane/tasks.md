## 1. Inventory and URL contract

- [ ] 1.1 Grep both `EntryEditDialog` call sites (`pages/secretary/EntryManagementPage.tsx`, `pages/MyEntriesPage/modules/MyEntriesDialogs.tsx`) and confirm the exhibitor path stays on the dialog.
- [ ] 1.2 Add an `entry` param to `normalizeEntryManagementSearchParams` (`components/entries/management/entryManagementFilters.ts`): valid-id + show-scope validation, invalid values dropped.
- [ ] 1.3 Extend `useEntryManagementFilters` to expose the open entry id and open/close setters that write through the normalizer.

## 2. Peek pane component

- [ ] 2.1 Build an `EntryPeekPane` on top of `components/ui/sheet.tsx`: right-anchored on desktop, full-width on tablet — one component, breakpoint-driven, no second hidden copy.
- [ ] 2.2 Render the existing entry-detail content inside the pane; wire actions/inline status editing through the shared MYK9-47 contract (or the current per-entry actions behind that interface if MYK9-47 has not landed) — no new mutation path.
- [ ] 2.3 Implement previous/next over the surface's current ordered result set; disable at ends, no wrap, no re-fetch.
- [ ] 2.4 Focus management: focus into pane on open, trap while open, return to originating row on close/Escape, keep focus in pane across prev/next.

## 3. Integrate and retire dialog on Entry Management

- [ ] 3.1 Replace the `EntryEditDialog` render in `EntryManagementPage` with `EntryPeekPane` driven by the `entry` param; preserve list, filters, scroll, and bulk selection behind it.
- [ ] 3.2 Confirm `EntryEditDialog` is no longer imported by Entry Management; leave the component in place for My Entries (do not delete).

## 4. Tests

- [ ] 4.1 Normalizer unit tests: `entry` round-trip, invalid/out-of-scope values dropped, no cross-show leak (extend existing `entryManagementFilters` tests).
- [ ] 4.2 Component tests: open preserves list/filter/selection; prev/next matches visible order and disables at ends; offline prev/next; single detail node on tablet; Escape returns focus to originating row.
- [ ] 4.3 Assertion that Entry Management does not render `EntryEditDialog` and that My Entries still does.

## 5. Verification

- [ ] 5.1 `pnpm typecheck` and `pnpm lint` clean for touched code.
- [ ] 5.2 OpenSpec validation passes for this change.
- [ ] 5.3 Secretary browser walk on desktop and tablet: open from a filtered queue, walk prev/next, refresh restores the entry, copy-link restores it, Escape returns focus; capture evidence.
