/**
 * @myk9/ringside — shared ringside experience for myK9 platform.
 *
 * Mounted by apps/myk9q today and (from Phase 1 onward) apps/myk9show's
 * /at-show route. See docs/plans/phase-0-ringside-package.md for the
 * extraction plan and PR sequencing.
 *
 * Public surface — keep this file as the single barrel re-export.
 * Subpath imports (e.g. `from '@myk9/ringside/utils/timeInputParsing'`)
 * are intentionally NOT supported; consumers always import from the
 * package root so internal layout can change without breaking them.
 */

// ── Auth ─────────────────────────────────────────────────────────────────
export type { UserRole, UserPermissions, PasscodeResult } from './auth/passcodes';
export { parsePasscode, getPermissionsForRole } from './auth/passcodes';

// ── Context (Q5 DI surface) ──────────────────────────────────────────────
export type {
  RingsideAuth,
  RingsideShowContext,
  RingsideReplication,
  RingsidePrefetch,
  RingsideContextValue,
  RingsideProviderProps,
  ClassStatusUpdateFields,
  ClassStatusValue,
} from './context';
export {
  RingsideProvider,
  useRingside,
  useRingsideAuth,
  useRingsideReplication,
  useRingsidePrefetch,
  useRingsidePermission,
  useShowOrg,
} from './context';

// ── Utils ────────────────────────────────────────────────────────────────
export {
  parseSmartTime,
  isValidTimeFormat,
  timeToSeconds,
  secondsToTime,
  compareTime,
} from './utils/timeInputParsing';

// Class-status detection + display (moved from apps/myk9q statusUtils in PR E1a)
export type {
  ClassStatus,
  ClassDog,
  ClassStatusInput,
  FormattedStatus,
} from './utils/classStatus';
export {
  getClassDisplayStatus,
  getClassStatusColor,
  getFormattedClassStatus,
} from './utils/classStatus';

// Level sort + stale-data helpers (moved from apps/myk9q in PR E1a)
export { getLevelSortOrder } from './utils/levelSort';
export type { StaleDataStatus } from './utils/staleDataUtils';
export {
  getStaleDataStatus,
  formatStaleTime,
} from './utils/staleDataUtils';

// ── Stores ───────────────────────────────────────────────────────────────
export { useEntryStore, createEntryStore } from './stores/entryStore';
export type { Entry, EntryStatus } from './stores/entryStore';

// ── Pages: ClassList ─────────────────────────────────────────────────────
export type {
  ClassEntry,
  TrialInfo,
  ClassListData,
  SortOrder,
  CombinedFilter,
  PrintDialogState,
  SortOption,
} from './pages/ClassList';
export { SORT_OPTIONS } from './pages/ClassList';

// Section grouping (PR E0)
export {
  shouldCombineAllSections,
  findPairedNoviceClass,
  findPairedSectionedClass,
  groupNoviceClasses,
  groupSectionedClasses,
  isCombinedNoviceEntry,
  isCombinedEntry,
  getClassIds,
} from './pages/ClassList';

// Status formatting + sort/filter helpers (PR E1a)
export {
  getContextualPreview,
  getFormattedStatus,
  getStatusColor,
  getStatusLabel,
  isMaxTimeSet,
  shouldShowMaxTimeWarning,
  isEmptyDataError,
  filterClasses,
  sortClasses,
} from './pages/ClassList';

// Presentational + hook surface (PR E1b)
export { ClassCardSkeleton, ClassCardSkeletonList } from './pages/ClassList';
export {
  useClassDialogs,
  type PopupPosition,
  type UseClassDialogsReturn,
} from './pages/ClassList';

// Favorites hook (PR E1c — dedupe + move)
export {
  useFavoriteClasses,
  type UseFavoriteClassesReturn,
} from './pages/ClassList';

// Class-status + realtime hooks (PR E1d — already-DI'd; no RingsideProvider needed)
export {
  useClassStatus,
  useClassRealtime,
  type StatusDependencies,
  type StatusOperationResult,
  type UseClassStatusReturn,
} from './pages/ClassList';

// ── Pages: EntryList (PR E2a + E2b) ──────────────────────────────────────
// E2a moved pure helpers + state hooks. E2b moved `useEntryListData` (the
// React Query data orchestrator) using the direct-arg DI pattern from
// PR E1d (`StatusDependencies`). The fetcher implementations
// (useEntryListDataHelpers.ts) stay app-side as the host's binding for
// `EntryListDataDependencies` — see the design note in
// `pages/EntryList/types.ts`.
export type {
  SortOrder as EntryListSortOrder,
  PrintDialogType as EntryListPrintDialogType,
  PrintDialogState as EntryListPrintDialogState,
  ResetConfirmState,
  OrgData,
  // PR E2b
  ClassInfo,
  EntryListData,
  EntryListDataDependencies,
} from './pages/EntryList';

export type { StatusBorderClass, StatusConfig } from './pages/EntryList';
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
} from './pages/EntryList';

// PR E2d-2b — SortableEntryCard + narrow permission union +
// EntryListContent drag-and-drop grid wrapper.
// DogCard is now a required slot prop on SortableEntryCard (and on
// EntryListContent, which passes it through), and hasPermission is
// typed against the narrow EntryListPermission union (host's
// `keyof UserPermissions` superset satisfies it directly).
export type { EntryListPermission } from './pages/EntryList';
export { SortableEntryCard } from './pages/EntryList';
export type { SortableEntryCardProps } from './pages/EntryList';
export { EntryListContent } from './pages/EntryList';
export type { EntryListContentProps } from './pages/EntryList';
export { EntryListHeader } from './pages/EntryList';
export type { EntryListHeaderProps } from './pages/EntryList';
export { EntryListDialogs } from './pages/EntryList';
export type { EntryListDialogsProps } from './pages/EntryList';
export { CombinedEntryListDialogs } from './pages/EntryList';
export type { CombinedEntryListDialogsProps } from './pages/EntryList';
export { EntryListPage } from './pages/EntryList';
export { CombinedEntryListPage } from './pages/EntryList';

// PR E2d-2a — leaf components + sortable-card sub-components.
// Pure-presentational React pieces with no host coupling beyond
// `Entry` (already in ringside) and `formatTimeForDisplay` (already in
// `@myk9/core`). External consumers (CompetitorCard,
// DogDetailsClassCard) re-import from here.
export {
  FloatingDoneButton,
  ResetConfirmDialog,
  ResetMenuPopup,
  SelfCheckinDisabledDialog,
  SuccessToast,
  PlacementBadge,
  NationalsResultBadges,
  RegularResultBadges,
  ResultBadges,
  StatusBadgeContent,
  // Header helper components. `TrialInfo` is aliased to
  // `EntryListTrialInfo` to avoid collision with the ClassList type
  // of the same name (exported on line 76). Matches the handoff's
  // documented pattern for cross-page name collisions (precedent:
  // `SortOrder` → `EntryListSortOrder`).
  ActionsDropdownMenu,
  TrialInfo as EntryListTrialInfo,
  ClassStatusBadge,
  SectionsBadge,
  getStatusBadge,
  // Combined-page pure helpers
  parseOrganizationData,
  compareEntries,
  parseTimeLimit,
  getScoresheetNavigationRoute,
  PRINT_DIALOG_TITLES,
  useEntryHandlers,
} from './pages/EntryList';
export type {
  FloatingDoneButtonProps,
  ResetConfirmDialogProps,
  ResetMenuPopupProps,
  SelfCheckinDisabledDialogProps,
  SuccessToastProps,
  PrintOption,
  ActionsMenuConfig,
} from './pages/EntryList';

export { useEntryListFilters } from './pages/EntryList';
export type { TabType, SortType, SectionFilter } from './pages/EntryList';

export { useResetScore } from './pages/EntryList';

export { useDragAndDropEntries } from './pages/EntryList';

// PR E2b
export { useEntryListData } from './pages/EntryList';
export type { UseEntryListDataOptions } from './pages/EntryList';

// PR E2c — dialog DI surface for the EntryList page (consumed by E2d).
// All slot types ship as `type` exports — no runtime symbols yet, the
// page components arrive in E2d.
export type {
  EntryListDialogSlots,
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
  RunOrderPreset,
  RunOrderScope,
  RenumberMode,
  PrintSortOrder,
  // CheckInStatus is intentionally NOT re-exported here — it's just an
  // alias for `EntryStatus` which is already exported above. Consumers
  // should use `EntryStatus`. The page-level barrel keeps the alias
  // accessible for callers who want the name to match the dialog prop
  // type.
  AreaCountRequirements,
  ClassOptionsData,
  MaxTimeClassData,
} from './pages/EntryList';

// PR E2d-1 — hook DI contracts + page-level controlled-render props.
// The host's `useEntryListHandlers` / `useEntryListActions` stay where
// they are; their return shapes are formalized as `EntryListHandlers`
// and `EntryListActions` so the host shim's wiring fails at compile
// time if the hook drifts from the contract.
//
// `EntryListPageProps` and `CombinedEntryListPageProps` are the wide
// bags ringside's page (PR E2d-2b) will consume from the host shim.
//
// PR E2d-2a — `EntryListLayoutSlots` resolved from TODO placeholder
// into 10 concrete `ComponentType` slots for the host UI primitives
// the page tree imports (HamburgerMenu, FilterPanel, DogCard,
// PullToRefresh, etc.). `TabBar` is intentionally NOT slotted —
// it's a direct import from `@myk9/ui`, which is already a ringside
// dep. Same for the date/time formatters from `@myk9/core`.
export type {
  EntryListHandlers,
  EntryListActions,
  ReportSortOrder,
  EntryStatusChange,
  EntryStatusCheckIn,
  LongPressHandlers,
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
  // PR E2d-2a — per-primitive Props interfaces. apps/myk9q will switch
  // its component-side interfaces to these during/after E2d-2b for
  // single-sourcing.
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
  // PR E2d-2a — supporting unions / sub-types referenced by the Props
  // interfaces. Aliased at the root barrel to avoid name collisions
  // with any future package-level types (matches the pattern E2a used
  // for `SortOrder` → `EntryListSortOrder`).
  DogCardStatusBorder,
  HamburgerMenuPage,
  PopoverPosition as EntryListPopoverPosition,
  PullToRefreshState,
  SyncIndicatorStatus,
  FilterPanelSortOption,
  ClassDetailsData,
} from './pages/EntryList';
