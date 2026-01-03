/**
 * Shared hooks for EntryList and CombinedEntryList components.
 *
 * These hooks extract common logic to reduce code duplication while
 * keeping the components focused on their specific use cases.
 */

export { useEntryListData } from './useEntryListData';
export type { ClassInfo, EntryListData } from './useEntryListData';

export { useEntryListActions } from './useEntryListActions';

export { useEntryListFilters } from './useEntryListFilters';
export type { TabType, SortType, SectionFilter } from './useEntryListFilters';

export { useEntryListSubscriptions } from './useEntryListSubscriptions';

export { useDragAndDropEntries } from './useDragAndDropEntries';

export { useEntryNavigation, parseOrganizationData } from './useEntryNavigation';

export { useResetScore } from './useResetScore';
