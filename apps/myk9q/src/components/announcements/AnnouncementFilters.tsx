import React from 'react';
import { Filter, RotateCcw } from 'lucide-react';

export interface AnnouncementFilterState {
  priority?: 'normal' | 'high' | 'urgent';
  author_role?: 'admin' | 'judge' | 'steward';
  searchTerm?: string;
  showExpired?: boolean;
}

interface AnnouncementFiltersProps {
  filters: AnnouncementFilterState;
  onFiltersChange: (filters: Partial<AnnouncementFilterState>) => void;
  onClearFilters: () => void;
}

export const AnnouncementFilters: React.FC<AnnouncementFiltersProps> = ({
  filters,
  onFiltersChange,
  onClearFilters
}) => {
  const hasActiveFilters = Object.keys(filters).some(
    key => key !== 'searchTerm' && filters[key as keyof AnnouncementFilterState]
  );

  return (
    <div className="announcement-filters">
      <div className="filters-header">
        <div className="header-left">
          <Filter className="filter-icon" />
          <span className="filter-title">Filters</span>
        </div>
        <div className="header-right">
          {hasActiveFilters && (
            <button
              onClick={onClearFilters}
              className="clear-filters-btn"
              title="Clear all filters"
            >
              <RotateCcw />
              <span>Clear</span>
            </button>
          )}
        </div>
      </div>

      <div className="filters-content">
        {/* Priority Filter */}
        <div className="filter-group">
          <label className="filter-label">Priority</label>
          <div className="filter-options priority-options">
            <button
              className={`filter-option ${!filters.priority ? 'active' : ''}`}
              onClick={() => onFiltersChange({ priority: undefined })}
            >
              All
            </button>
            <button
              className={`filter-option urgent ${filters.priority === 'urgent' ? 'active' : ''}`}
              onClick={() => onFiltersChange({ priority: 'urgent' })}
            >
              🚨 Urgent
            </button>
            <button
              className={`filter-option high ${filters.priority === 'high' ? 'active' : ''}`}
              onClick={() => onFiltersChange({ priority: 'high' })}
            >
              ⚠️ High
            </button>
            <button
              className={`filter-option normal ${filters.priority === 'normal' ? 'active' : ''}`}
              onClick={() => onFiltersChange({ priority: 'normal' })}
            >
              📢 Normal
            </button>
          </div>
        </div>

        {/* Author Role Filter */}
        <div className="filter-group">
          <label className="filter-label">Posted by</label>
          <div className="filter-options role-options">
            <button
              className={`filter-option ${!filters.author_role ? 'active' : ''}`}
              onClick={() => onFiltersChange({ author_role: undefined })}
            >
              All
            </button>
            <button
              className={`filter-option admin ${filters.author_role === 'admin' ? 'active' : ''}`}
              onClick={() => onFiltersChange({ author_role: 'admin' })}
            >
              👑 Admin
            </button>
            <button
              className={`filter-option judge ${filters.author_role === 'judge' ? 'active' : ''}`}
              onClick={() => onFiltersChange({ author_role: 'judge' })}
            >
              ⚖️ Judge
            </button>
            <button
              className={`filter-option steward ${filters.author_role === 'steward' ? 'active' : ''}`}
              onClick={() => onFiltersChange({ author_role: 'steward' })}
            >
              📋 Steward
            </button>
          </div>
        </div>

        {/* Show Expired Toggle */}
        <div className="filter-group">
          <label className="filter-label">Options</label>
          <div className="filter-toggle">
            <label className="toggle-option">
              <input
                type="checkbox"
                checked={filters.showExpired || false}
                onChange={(e) => onFiltersChange({ showExpired: e.target.checked })}
              />
              <span className="toggle-slider"></span>
              <span className="toggle-text">Show expired announcements</span>
            </label>
          </div>
        </div>
      </div>

      {/* Filter Summary */}
      {hasActiveFilters && (
        <div className="filter-summary">
          <span className="summary-text">
            {Object.entries(filters).filter(([key, value]) =>
              key !== 'searchTerm' && value
            ).length} filter{Object.entries(filters).filter(([key, value]) =>
              key !== 'searchTerm' && value
            ).length === 1 ? '' : 's'} active
          </span>
        </div>
      )}
    </div>
  );
};