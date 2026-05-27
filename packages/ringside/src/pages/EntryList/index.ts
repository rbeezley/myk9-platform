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
