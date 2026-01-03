import React from 'react';
import { SlidersHorizontal } from 'lucide-react';
import './FilterTriggerButton.css';

export interface FilterTriggerButtonProps {
  onClick: () => void;
  hasActiveFilters?: boolean;
  activeFilterCount?: number;
  className?: string;
}

export const FilterTriggerButton: React.FC<FilterTriggerButtonProps> = ({
  onClick,
  hasActiveFilters = false,
  activeFilterCount,
  className = ''
}) => {
  return (
    <button
      className={`filter-trigger-btn ${hasActiveFilters ? 'has-filters' : ''} ${className}`.trim()}
      onClick={onClick}
      title="Search & Sort"
      aria-label="Open search and sort panel"
    >
      <SlidersHorizontal size={18} />
      {activeFilterCount !== undefined && activeFilterCount > 0 && (
        <span className="filter-trigger-badge">{activeFilterCount}</span>
      )}
    </button>
  );
};

export default FilterTriggerButton;
