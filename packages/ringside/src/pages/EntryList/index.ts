/**
 * Public surface for the EntryList page in @myk9/ringside.
 *
 * Re-exported from the package root (`packages/ringside/src/index.ts`) —
 * consumers should always import from `@myk9/ringside`, not from a
 * subpath. Internal organization is free to evolve without breaking
 * downstream importers.
 *
 * PR E2a — pure helpers + hooks. The data-fetching hooks
 * (`useEntryListData`, `useEntryListDataHelpers`) stay app-side until
 * PR E2b adds a services slot to RingsideProvider for the supabase
 * client, entryService, and visibility service.
 */

// ── Types (moved from CombinedEntryList.types.ts) ────────────────────────
export type {
  SortOrder,
  PrintDialogType,
  PrintDialogState,
  ResetConfirmState,
  OrgData,
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
