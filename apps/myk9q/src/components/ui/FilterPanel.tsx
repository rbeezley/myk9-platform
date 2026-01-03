import React, { useEffect, useRef } from 'react';
import { X, Search, SlidersHorizontal } from 'lucide-react';
import './FilterPanel.css';

export interface SortOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
}

export interface FilterPanelProps {
  isOpen: boolean;
  onClose: () => void;
  // Search
  searchTerm: string;
  onSearchChange: (term: string) => void;
  searchPlaceholder?: string;
  // Sort
  sortOptions: SortOption[];
  sortOrder: string;
  onSortChange: (order: string) => void;
  // Results info
  resultsLabel?: string;
  // Optional title
  title?: string;
  // Optional custom content (e.g., action buttons)
  children?: React.ReactNode;
}

export const FilterPanel: React.FC<FilterPanelProps> = ({
  isOpen,
  onClose,
  searchTerm,
  onSearchChange,
  searchPlaceholder = 'Search...',
  sortOptions,
  sortOrder,
  onSortChange,
  resultsLabel,
  title = 'Search & Sort',
  children
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus search input when panel opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      // Small delay to allow animation to start
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Handle Escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Prevent body scroll when panel is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const handleClearSearch = () => {
    onSearchChange('');
    inputRef.current?.focus();
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="filter-panel-backdrop"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <aside
        className="filter-panel"
        role="complementary"
        aria-label={title}
      >
        {/* Header */}
        <div className="filter-panel-header">
          <div className="filter-panel-title">
            <SlidersHorizontal size={20} />
            <h2>{title}</h2>
          </div>
          <button
            className="filter-close-btn"
            onClick={onClose}
            title="Close"
            aria-label="Close filter panel"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="filter-panel-content">
          {/* Results Label */}
          {resultsLabel && (
            <div className="filter-results-label">
              {resultsLabel}
            </div>
          )}

          {/* Search Input */}
          <div className="filter-search-wrapper">
            <Search size={18} className="filter-search-icon" />
            <input
              ref={inputRef}
              type="text"
              className="filter-search-input"
              placeholder={searchPlaceholder}
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
            />
            {searchTerm && (
              <button
                className="filter-clear-btn"
                onClick={handleClearSearch}
                title="Clear search"
                aria-label="Clear search"
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* Sort Options */}
          {sortOptions.length > 0 && (
            <div className="filter-sort-section">
              <label className="filter-sort-label">Sort by</label>
              <div className="filter-sort-buttons">
                {sortOptions.map((option) => (
                  <button
                    key={option.value}
                    className={`filter-sort-btn ${sortOrder === option.value ? 'active' : ''}`}
                    onClick={() => onSortChange(option.value)}
                  >
                    {option.icon}
                    <span>{option.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Custom Content */}
          {children}
        </div>
      </aside>
    </>
  );
};

export default FilterPanel;
