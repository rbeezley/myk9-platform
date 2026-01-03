import React from 'react';
import { Search, X, ArrowUpDown, ChevronDown } from 'lucide-react';
import './shared-ui.css';

export interface SortOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
}


export interface SearchSortControlsProps {
  /** Current search term */
  searchTerm: string;
  /** Search term change handler */
  onSearchChange: (term: string) => void;
  /** Placeholder text for search input */
  searchPlaceholder?: string;
  /** Available sort options */
  sortOptions?: SortOption[];
  /** Current sort order */
  sortOrder?: string;
  /** Sort order change handler */
  onSortChange?: (order: string) => void;
  /** Whether controls are collapsed */
  isCollapsed?: boolean;
  /** Toggle collapse state */
  onToggleCollapse?: () => void;
  /** Results count display (e.g., "10 of 25 classes") */
  resultsLabel?: string;
  /** Additional CSS class */
  className?: string;
}

/**
 * Reusable search and sort controls component
 * Provides collapsible search input with clear button and sort options
 *
 * @example
 * <SearchSortControls
 *   searchTerm={searchTerm}
 *   onSearchChange={setSearchTerm}
 *   searchPlaceholder="Search classes..."
 *   sortOptions={[
 *     { value: 'class_order', label: 'Class Order' },
 *     { value: 'element_level', label: 'Element' }
 *   ]}
 *   sortOrder={sortOrder}
 *   onSortChange={setSortOrder}
 *   isCollapsed={isCollapsed}
 *   onToggleCollapse={() => setIsCollapsed(!isCollapsed)}
 *   resultsLabel="10 of 25 classes"
 * />
 */
export const SearchSortControls: React.FC<SearchSortControlsProps> = ({
  searchTerm,
  onSearchChange,
  searchPlaceholder = 'Search...',
  sortOptions = [],
  sortOrder,
  onSortChange,
  isCollapsed = false,
  onToggleCollapse,
  resultsLabel,
  className = ''
}) => {
  return (
    <div className={`search-sort-controls-wrapper ${className}`.trim()}>
      {/* Collapse Toggle Header */}
      {onToggleCollapse && (
        <div className={`search-controls-header ${isCollapsed ? 'collapsed' : ''}`}>
          <button
            className={`search-controls-toggle ${isCollapsed ? 'collapsed' : 'expanded'}`}
            onClick={onToggleCollapse}
            aria-label={isCollapsed ? 'Show search and sort options' : 'Hide search and sort options'}
            title={isCollapsed ? 'Show search and sort options' : 'Hide search and sort options'}
          >
            <ChevronDown className="h-4 w-4" />
          </button>

          <span className="search-controls-label">
            {searchTerm ? resultsLabel : 'Search & Sort'}
          </span>
        </div>
      )}

      {/* Search Results Summary */}
      {searchTerm && resultsLabel && (
        <div className="search-results-header">
          <div className="search-results-summary">
            {resultsLabel}
          </div>
        </div>
      )}

      {/* Collapsible Container */}
      <div className={`search-sort-container ${isCollapsed ? 'collapsed' : 'expanded'}`}>
        {/* Search Input */}
        <div className="search-input-wrapper">
          <Search className="search-icon" size={18}  style={{ width: '18px', height: '18px', flexShrink: 0 }} />
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="search-input-full"
          />
          {searchTerm && (
            <button
              className="clear-search-btn"
              onClick={() => onSearchChange('')}
              aria-label="Clear search"
            >
              <X size={16}  style={{ width: '16px', height: '16px', flexShrink: 0 }} />
            </button>
          )}
        </div>

        {/* Sort Controls */}
        {sortOptions.length > 0 && onSortChange && (
          <div className="sort-controls">
            {sortOptions.map((option) => (
              <button
                key={option.value}
                className={`sort-btn ${sortOrder === option.value ? 'active' : ''}`}
                onClick={() => onSortChange(option.value)}
              >
                {option.icon || <ArrowUpDown size={16}  style={{ width: '16px', height: '16px', flexShrink: 0 }} />}
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
