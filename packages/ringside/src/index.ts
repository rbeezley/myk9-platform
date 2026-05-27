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
