/** Sort order for class list display */
export type SortOrder = 'class_order' | 'element_level' | 'level_element';

/** Combined filter for class list tabs */
export type CombinedFilter = 'pending' | 'favorites' | 'completed';

/** State for the print dialog (which report type and which class) */
export interface PrintDialogState {
  type: 'check-in' | 'results' | 'scoresheet' | null;
  classId: number | null;
}

/** Sort option for the FilterPanel */
export interface SortOption {
  value: SortOrder;
  label: string;
}

/** Predefined sort options for the FilterPanel */
export const SORT_OPTIONS: SortOption[] = [
  { value: 'class_order', label: 'Run Order' },
  { value: 'element_level', label: 'Element \u2192 Level' },
  { value: 'level_element', label: 'Level \u2192 Element' },
];
