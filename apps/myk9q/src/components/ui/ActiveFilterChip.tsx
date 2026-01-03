import React from 'react';
import { X, Search } from 'lucide-react';
import './ActiveFilterChip.css';

export interface ActiveFilterChipProps {
  /** The search term being displayed */
  searchTerm: string;
  /** Number of matching results */
  matchCount?: number;
  /** Total number of items */
  totalCount?: number;
  /** Callback when clear button is clicked */
  onClear: () => void;
  /** Optional className for additional styling */
  className?: string;
}

/**
 * A chip/banner that shows the active search filter with a clear button.
 * Displayed when a search filter is active, allows one-tap clearing.
 */
export const ActiveFilterChip: React.FC<ActiveFilterChipProps> = ({
  searchTerm,
  matchCount,
  totalCount,
  onClear,
  className = '',
}) => {
  if (!searchTerm) return null;

  const hasCountInfo = matchCount !== undefined && totalCount !== undefined;

  return (
    <div className={`active-filter-chip ${className}`}>
      <Search size={14} className="active-filter-chip-icon" />
      <span className="active-filter-chip-term">"{searchTerm}"</span>
      {hasCountInfo && (
        <span className="active-filter-chip-count">
          {matchCount} of {totalCount}
        </span>
      )}
      <button
        className="active-filter-chip-clear"
        onClick={onClear}
        aria-label="Clear search filter"
        title="Clear search"
      >
        <X size={14} />
      </button>
    </div>
  );
};

export default ActiveFilterChip;
