/**
 * Public surface for the EntryList page in @myk9/ringside.
 *
 * Re-exported from the package root (`packages/ringside/src/index.ts`) —
 * consumers should always import from `@myk9/ringside`, not from a
 * subpath. Internal organization is free to evolve without breaking
 * downstream importers.
 *
 * PR E2a — pure helpers + hooks (useResetScore, useDragAndDropEntries,
 * useEntryListFilters, sortableEntryCardUtils, types).
 *
 * PR E2b — `useEntryListData` (the React Query data orchestrator) plus
 * its data-shape and DI-surface types. The helpers file
 * (`useEntryListDataHelpers.ts`) stays app-side as the host's
 * implementation of the `EntryListDataDependencies` slot.
 *
 * PR E2c — `EntryListDialogSlots`: dialog DI surface for the 10
 * dialogs ringside's EntryList page renders. Slot types ship ahead
 * of the page itself (E2d) so the interface can be reviewed in
 * isolation. Host components stay physically in apps/myk9q.
 *
 * PR E2d-1 — `EntryListHandlers` + `EntryListActions` contracts
 * (return shapes of the host's `useEntryListHandlers` and
 * `useEntryListActions` hooks) plus the `EntryListPageProps` and
 * `CombinedEntryListPageProps` controlled-render bags. E2d-2 will
 * fill in `EntryListLayoutSlots` and move the actual page tree.
 */

// ── Types (moved from CombinedEntryList.types.ts) ────────────────────────
export type {
  SortOrder,
  PrintDialogType,
  PrintDialogState,
  ResetConfirmState,
  OrgData,
  // PR E2b — data shape + DI surface for useEntryListData
  ClassInfo,
  EntryListData,
  EntryListDataDependencies,
} from './types';

// ── Sortable card utilities (moved from sortableEntryCardUtils.ts) ───────
export type { StatusBorderClass, StatusConfig } from './sortableEntryCardUtils';
export {
  normalizeResultText,
  getResultClassName,
  isNonQualifyingResult,
  getStatusBorderClass,
  getPlacementEmoji,
  getPlacementText,
  getStatusConfig,
  isNationalsCompetition,
  getDisplayTime,
} from './sortableEntryCardUtils';

// ── Hooks ────────────────────────────────────────────────────────────────
export { useEntryListFilters } from './hooks/useEntryListFilters';
export type { TabType, SortType, SectionFilter } from './hooks/useEntryListFilters';

export { useResetScore } from './hooks/useResetScore';

export { useDragAndDropEntries } from './hooks/useDragAndDropEntries';

// PR E2b — entry list data orchestrator (React Query + replication subs).
// `useEntryListDataHelpers` (the fetcher implementations) stays app-side
// as the host's binding for the `EntryListDataDependencies` slot.
export { useEntryListData } from './hooks/useEntryListData';
export type { UseEntryListDataOptions } from './hooks/useEntryListData';

// ── Hook DI contracts (PR E2d-1) ────────────────────────────────────────
// `EntryListHandlers` and `EntryListActions` mirror the return shapes
// of the host's `useEntryListHandlers` and `useEntryListActions`. The
// hooks stay host-side (they pull reportService, runOrderService,
// entryService, supabase, etc.) but their return values become typed
// props ringside's page (E2d-2) will consume.
export type {
  EntryListHandlers,
  EntryListActions,
  ReportSortOrder,
  EntryStatusChange,
  EntryStatusCheckIn,
  LongPressHandlers,
} from './hookContracts';

// ── Page-level controlled-render props (PR E2d-1) ───────────────────────
// `EntryListPageProps` and `CombinedEntryListPageProps` are the wide
// bags the host shim hands to ringside's pages in E2d-2. The pages
// own no state and call no hooks — they render from these props.
// `EntryListLayoutSlots` is a TODO placeholder; E2d-2 fills it with
// concrete ComponentType slots for the ~10 host UI primitives the
// page tree currently imports directly.
export type {
  EntryListPageProps,
  CombinedEntryListPageProps,
  EntryListUiState,
  EntryListUiActions,
  CombinedEntryListUiState,
  CombinedEntryListUiActions,
  CombinedEntryHandlers,
  EntryListLayoutSlots,
} from './pageProps';

// ── Dialog DI surface (PR E2c) ──────────────────────────────────────────
// `EntryListDialogSlots` is the shape ringside's EntryList page (PR E2d)
// will accept from the host. Per-dialog Props interfaces are co-located
// so the contract is single-sourced; supporting unions (RunOrderPreset,
// PrintSortOrder, etc.) live alongside.
export type {
  EntryListDialogSlots,
  // Per-dialog prop interfaces
  CheckinStatusDialogProps,
  ClassOptionsDialogProps,
  ClassStatusDialogProps,
  ClassRequirementsDialogProps,
  ClassSettingsDialogProps,
  MaxTimeDialogProps,
  RunOrderDialogProps,
  ScoresheetPrintDialogProps,
  NoStatsDialogProps,
  AreaCountSelectionDialogProps,
  // Supporting types
  RunOrderPreset,
  RunOrderScope,
  RenumberMode,
  PrintSortOrder,
  CheckInStatus,
  AreaCountRequirements,
  ClassOptionsData,
  MaxTimeClassData,
} from './dialogSlots';
