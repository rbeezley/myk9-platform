/**
 * Public surface for the ClassList page in @myk9/ringside.
 *
 * Re-exported from the package root (`packages/ringside/src/index.ts`) —
 * consumers should always import from `@myk9/ringside`, not from a
 * subpath. Internal organization is free to evolve without breaking
 * downstream importers.
 */

export type {
  ClassEntry,
  TrialInfo,
  ClassListData,
  ClassStatusValue,
  SortOrder,
  CombinedFilter,
  PrintDialogState,
  SortOption,
} from './types';
export { SORT_OPTIONS } from './types';

export {
  shouldCombineAllSections,
  findPairedNoviceClass,
  findPairedSectionedClass,
  groupNoviceClasses,
  groupSectionedClasses,
  isCombinedNoviceEntry,
  isCombinedEntry,
  getClassIds,
} from './utils/noviceClassGrouping';

export {
  getContextualPreview,
  getFormattedStatus,
  getStatusColor,
  getStatusLabel,
} from './utils/statusFormatting';

export {
  isMaxTimeSet,
  shouldShowMaxTimeWarning,
  isEmptyDataError,
  filterClasses,
  sortClasses,
} from './ClassList.helpers';

// Presentational + hook surface (PR E1b)
export { ClassCardSkeleton, ClassCardSkeletonList } from './ClassCardSkeleton';
export {
  useClassDialogs,
  type PopupPosition,
  type UseClassDialogsReturn,
} from './hooks/useClassDialogs';

// Favorites hook (PR E1c — dedupe + move from apps/myk9q)
export {
  useFavoriteClasses,
  type UseFavoriteClassesReturn,
} from './hooks/useFavoriteClasses';
