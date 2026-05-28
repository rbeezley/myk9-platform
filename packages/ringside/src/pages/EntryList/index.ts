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

// ── Sortable card sub-components (PR E2d-2a) ────────────────────────────
// React components for result badges (placement, qualification, time,
// faults, nationals stats grid) and the status-icon-plus-text content
// renderer. SortableEntryCard itself arrives in E2d-2b — these are
// already movable because they only depend on the ringside-local
// sortableEntryCardUtils + @myk9/core's `formatTimeForDisplay`.
export {
  PlacementBadge,
  NationalsResultBadges,
  RegularResultBadges,
  ResultBadges,
  StatusBadgeContent,
} from './SortableEntryCardComponents';

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

// ── Page-level controlled-render props (PR E2d-1 / E2d-2a) ──────────────
// `EntryListPageProps` and `CombinedEntryListPageProps` are the wide
// bags the host shim hands to ringside's pages in E2d-2b. The pages
// own no state and call no hooks — they render from these props.
//
// `EntryListLayoutSlots` is the concrete UI-primitive slot bag (PR
// E2d-2a) — 10 host-supplied components covering header chrome, the
// filter panel, the dog card, the pull-to-refresh wrapper, the error
// state, and the class-details popover. `TabBar` (from `@myk9/ui`)
// and the date/time formatters (from `@myk9/core`) are intentionally
// NOT slotted — ringside imports them directly from already-installed
// peer packages.
export type {
  EntryListPageProps,
  CombinedEntryListPageProps,
  EntryListUiState,
  EntryListUiActions,
  EntryListDerived,
  EntryListDrag,
  CombinedEntryListUiState,
  CombinedEntryListUiActions,
  CombinedEntryListDerived,
  CombinedEntryHandlers,
  EntryListLayoutSlots,
  // Per-primitive Props interfaces (PR E2d-2a)
  HamburgerMenuProps,
  CompactOfflineIndicatorProps,
  SyncIndicatorProps,
  RefreshIndicatorProps,
  FilterTriggerButtonProps,
  ErrorStateProps,
  PullToRefreshProps,
  FilterPanelProps,
  DogCardProps,
  ClassDetailsPopoverProps,
  // Supporting unions / sub-types
  DogCardStatusBorder,
  HamburgerMenuPage,
  PopoverPosition,
  PullToRefreshState,
  SyncIndicatorStatus,
  FilterPanelSortOption,
  ClassDetailsData,
} from './pageProps';

// ── Combined-page pure helpers (PR E2d-2a) ──────────────────────────────
// Moved from apps/myk9q/.../CombinedEntryList.helpers.ts. The
// supabase-coupled `fetchClassRequirements` stays host-side; everything
// else (org parsing, sort comparator, scoresheet routing, the
// useEntryHandlers hook for status/reset) moves here.
export {
  parseOrganizationData,
  compareEntries,
  parseTimeLimit,
  getScoresheetNavigationRoute,
  PRINT_DIALOG_TITLES,
  useEntryHandlers,
} from './combinedEntryListHelpers';

// ── Permissions (PR E2d-2b) ─────────────────────────────────────────────
// Narrow permission union the EntryList page tree consumes. The host's
// `usePermission().hasPermission` is typed over `keyof UserPermissions`
// (a much wider union); the function signature is compatible because
// `EntryListPermission extends keyof UserPermissions`.
export type { EntryListPermission } from './permissions';

// ── SortableEntryCard (PR E2d-2b) ───────────────────────────────────────
// Moved from apps/myk9q. `DogCard` is now a required slot prop; the
// sub-components (`StatusBadge`, `ResetButton`) are module-private.
export { SortableEntryCard } from './SortableEntryCard';
export type { SortableEntryCardProps } from './SortableEntryCard';

// ── CombinedEntryListDialogs (PR E2d-2b) ────────────────────────────────
// Moved from apps/myk9q. Four dialog/panel components are required
// slot props (CheckinStatusDialog, RunOrderDialog,
// ScoresheetPrintDialog, FilterPanel). Leaf components imported
// directly from siblings.
export { CombinedEntryListDialogs } from './CombinedEntryListDialogs';
export type { CombinedEntryListDialogsProps } from './CombinedEntryListDialogs';

// ── Page orchestrators (PR E2d-2b) ──────────────────────────────────────
// Pure controlled-render pages — own no useState, call no host-coupled
// hooks. The shim at apps/myk9q/src/pages/EntryList/{EntryList,
// CombinedEntryList}.tsx assembles all bags and renders these.
export { EntryListPage } from './EntryListPage';
export { CombinedEntryListPage } from './CombinedEntryListPage';

// ── Component sub-tree (PR E2d-2a) ──────────────────────────────────────
// Leaf components moved from apps/myk9q. Pure-presentational React
// pieces with no host couplings beyond the ringside `Entry` type.
// EntryListHeader / EntryListContent / EntryListDialogs arrive in E2d-2b.
export {
  FloatingDoneButton,
  ResetConfirmDialog,
  ResetMenuPopup,
  SelfCheckinDisabledDialog,
  SuccessToast,
  ActionsDropdownMenu,
  TrialInfo,
  ClassStatusBadge,
  SectionsBadge,
  getStatusBadge,
  // PR E2d-2b — drag-and-drop grid wrapper + page header + dialog cluster
  EntryListContent,
  EntryListHeader,
  EntryListDialogs,
} from './components';
export type {
  FloatingDoneButtonProps,
  ResetConfirmDialogProps,
  ResetMenuPopupProps,
  SelfCheckinDisabledDialogProps,
  SuccessToastProps,
  PrintOption,
  ActionsMenuConfig,
  // PR E2d-2b
  EntryListContentProps,
  EntryListHeaderProps,
  EntryListDialogsProps,
} from './components';

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
