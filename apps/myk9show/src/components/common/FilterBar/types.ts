/** Supported filter value types */
export type FilterType = 'text' | 'select' | 'multi-select' | 'boolean';

/** Definition of a single filter field — declared by the consuming page */
export interface FilterDefinition {
  /** Unique key for this filter (used in URL params) */
  key: string;
  /** Display label */
  label: string;
  /** Filter type */
  type: FilterType;
  /** Options for select/multi-select types */
  options?: Array<{ label: string; value: string }>;
  /** Placeholder text for text filters */
  placeholder?: string;
  /** Icon component (Lucide) */
  icon?: React.ComponentType<{ className?: string }>;
}

/** Sort direction */
export type SortDirection = 'asc' | 'desc';

/** Sort definition */
export interface SortDefinition {
  /** Unique key for this sort field */
  key: string;
  /** Display label */
  label: string;
}

/** Active filter value */
export type FilterValue = string | string[] | boolean;

/** Check whether a filter value represents an active (non-empty) filter */
export function isFilterActive(value: FilterValue | undefined): boolean {
  if (value === '' || value === false || value === undefined) return false;
  if (Array.isArray(value) && value.length === 0) return false;
  return true;
}

/** State shape for filter bar */
export interface FilterBarState {
  filters: Record<string, FilterValue>;
  sortKey: string | null;
  sortDirection: SortDirection;
}

/** Props for the FilterBar component */
export interface FilterBarProps {
  /** Available filter definitions */
  filterDefs: FilterDefinition[];
  /** Available sort options */
  sortDefs?: SortDefinition[];
  /** Current filter state */
  state: FilterBarState;
  /** Called when any filter changes */
  onStateChange: (state: FilterBarState) => void;
  /** Optional className */
  className?: string;
}
