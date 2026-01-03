import React, { useState, useEffect } from 'react';
import { Filter, X, ChevronDown } from 'lucide-react';
import type { StatsFilters as FiltersType } from '../types/stats.types';

/**
 * Format ISO date string (YYYY-MM-DD) to locale date string without timezone conversion
 * Avoids the issue where new Date('2023-09-16') gets converted to local timezone
 */
const formatDateWithoutTimezone = (isoDate: string): string => {
  const [year, month, day] = isoDate.split('T')[0].split('-');
  const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
};

interface StatsFiltersProps {
  filters: FiltersType;
  onFilterChange: (filters: Partial<FiltersType>) => void;
  availableBreeds: string[];
  availableJudges: string[];
  availableTrialDates: string[];   // ISO date strings
  availableTrialNumbers: number[]; // Trial numbers
  availableElements: string[];     // Container, Handler Discrimination, etc.
  availableLevels: string[];       // Novice, Advanced, Excellent, Masters
}

const StatsFilters: React.FC<StatsFiltersProps> = ({
  filters,
  onFilterChange,
  availableBreeds,
  availableJudges,
  availableTrialDates,
  availableTrialNumbers,
  availableElements,
  availableLevels
}) => {
  const [isBottomSheetOpen, setIsBottomSheetOpen] = useState(false);
  const [tempFilters, setTempFilters] = useState(filters);
  const isMobile = window.innerWidth < 640;

  // Update temp filters when props change
  useEffect(() => {
    setTempFilters(filters);
  }, [filters]);

  // Count active filters
  const activeFilterCount = [
    filters.breed,
    filters.judge,
    filters.trialDate,
    filters.trialNumber,
    filters.element,
    filters.level,
    filters.classId
  ].filter(Boolean).length;

  // Apply filters
  const handleApplyFilters = () => {
    onFilterChange(tempFilters);
    setIsBottomSheetOpen(false);
  };

  // Clear all filters
  const handleClearAll = () => {
    const clearedFilters = {
      breed: null,
      judge: null,
      trialDate: null,
      trialNumber: null,
      element: null,
      level: null,
      classId: null
    };
    setTempFilters(clearedFilters);
    onFilterChange(clearedFilters);
    setIsBottomSheetOpen(false);
  };

  // Mobile Bottom Sheet
  if (isMobile) {
    return (
      <>
        {/* Filter Button */}
        <button
          onClick={() => setIsBottomSheetOpen(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--token-space-md)',
            padding: 'var(--token-space-lg) var(--token-space-xl)',
            backgroundColor: activeFilterCount > 0 ? 'var(--primary)' : 'var(--muted)',
            color: activeFilterCount > 0 ? 'white' : 'var(--foreground)',
            border: 'none',
            borderRadius: 'var(--token-space-md)',
            fontSize: '0.875rem',
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            minHeight: 'var(--min-touch-target)'
          }}
        >
          <Filter className="h-4 w-4" />
          <span>Filters</span>
          {activeFilterCount > 0 && (
            <span style={{
              backgroundColor: 'white',
              color: 'var(--primary)',
              padding: '0.125rem 0.375rem',
              borderRadius: '9999px',
              fontSize: '0.75rem',
              fontWeight: 600
            }}>
              {activeFilterCount}
            </span>
          )}
        </button>

        {/* Bottom Sheet Overlay */}
        {isBottomSheetOpen && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              zIndex: 100,
              animation: 'fadeIn 0.2s ease'
            }}
            onClick={() => setIsBottomSheetOpen(false)}
          />
        )}

        {/* Bottom Sheet */}
        {isBottomSheetOpen && (
          <div style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: 'var(--card)',
            borderTopLeftRadius: 'var(--token-space-xl)',
            borderTopRightRadius: 'var(--token-space-xl)',
            padding: 'var(--token-space-2xl)',
            zIndex: 101,
            animation: 'slideUp 0.2s ease',
            maxHeight: '80vh',
            overflowY: 'auto'
          }}>
            {/* Header */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 'var(--token-space-2xl)'
            }}>
              <h3 style={{
                fontSize: '1.25rem',
                fontWeight: 600,
                color: 'var(--foreground)'
              }}>
                Filters
              </h3>
              <button
                onClick={() => setIsBottomSheetOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 'var(--token-space-md)',
                  cursor: 'pointer'
                }}
              >
                <X className="h-5 w-5" style={{ color: 'var(--muted-foreground)' }} />
              </button>
            </div>

            {/* Filter Options */}
            <div style={{ marginBottom: 'var(--token-space-2xl)' }}>
              {/* Breed Filter */}
              <div style={{ marginBottom: 'var(--token-space-xl)' }}>
                <label style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  color: 'var(--muted-foreground)',
                  marginBottom: 'var(--token-space-md)'
                }}>
                  Breed
                </label>
                <select
                  value={tempFilters.breed || ''}
                  onChange={(e) => setTempFilters({ ...tempFilters, breed: e.target.value || null })}
                  style={{
                    width: '100%',
                    padding: 'var(--token-space-lg)',
                    backgroundColor: 'var(--background)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--token-space-md)',
                    fontSize: '0.9375rem',
                    color: 'var(--foreground)',
                    minHeight: 'var(--min-touch-target)'
                  }}
                >
                  <option value="">All Breeds</option>
                  {availableBreeds.map(breed => (
                    <option key={breed} value={breed}>{breed}</option>
                  ))}
                </select>
              </div>

              {/* Judge Filter */}
              <div style={{ marginBottom: 'var(--token-space-xl)' }}>
                <label style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  color: 'var(--muted-foreground)',
                  marginBottom: 'var(--token-space-md)'
                }}>
                  Judge
                </label>
                <select
                  value={tempFilters.judge || ''}
                  onChange={(e) => setTempFilters({ ...tempFilters, judge: e.target.value || null })}
                  style={{
                    width: '100%',
                    padding: 'var(--token-space-lg)',
                    backgroundColor: 'var(--background)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--token-space-md)',
                    fontSize: '0.9375rem',
                    color: 'var(--foreground)',
                    minHeight: 'var(--min-touch-target)'
                  }}
                >
                  <option value="">All Judges</option>
                  {availableJudges.map(judge => (
                    <option key={judge} value={judge}>{judge}</option>
                  ))}
                </select>
              </div>

              {/* Trial Date Filter */}
              <div style={{ marginBottom: 'var(--token-space-xl)' }}>
                <label style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  color: 'var(--muted-foreground)',
                  marginBottom: 'var(--token-space-md)'
                }}>
                  Trial Date
                </label>
                <select
                  value={tempFilters.trialDate || ''}
                  onChange={(e) => setTempFilters({ ...tempFilters, trialDate: e.target.value || null })}
                  style={{
                    width: '100%',
                    padding: 'var(--token-space-lg)',
                    backgroundColor: 'var(--background)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--token-space-md)',
                    fontSize: '0.9375rem',
                    color: 'var(--foreground)',
                    minHeight: 'var(--min-touch-target)'
                  }}
                >
                  <option value="">All Dates</option>
                  {availableTrialDates.map(date => (
                    <option key={date} value={date}>
                      {formatDateWithoutTimezone(date)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Trial Number Filter */}
              <div style={{ marginBottom: 'var(--token-space-xl)' }}>
                <label style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  color: 'var(--muted-foreground)',
                  marginBottom: 'var(--token-space-md)'
                }}>
                  Trial Number
                </label>
                <select
                  value={tempFilters.trialNumber?.toString() || ''}
                  onChange={(e) => setTempFilters({ ...tempFilters, trialNumber: e.target.value ? parseInt(e.target.value) : null })}
                  style={{
                    width: '100%',
                    padding: 'var(--token-space-lg)',
                    backgroundColor: 'var(--background)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--token-space-md)',
                    fontSize: '0.9375rem',
                    color: 'var(--foreground)',
                    minHeight: 'var(--min-touch-target)'
                  }}
                >
                  <option value="">All Trials</option>
                  {availableTrialNumbers.map(num => (
                    <option key={num} value={num}>Trial {num}</option>
                  ))}
                </select>
              </div>

              {/* Element Filter */}
              <div style={{ marginBottom: 'var(--token-space-xl)' }}>
                <label style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  color: 'var(--muted-foreground)',
                  marginBottom: 'var(--token-space-md)'
                }}>
                  Element
                </label>
                <select
                  value={tempFilters.element || ''}
                  onChange={(e) => setTempFilters({ ...tempFilters, element: e.target.value || null })}
                  style={{
                    width: '100%',
                    padding: 'var(--token-space-lg)',
                    backgroundColor: 'var(--background)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--token-space-md)',
                    fontSize: '0.9375rem',
                    color: 'var(--foreground)',
                    minHeight: 'var(--min-touch-target)'
                  }}
                >
                  <option value="">All Elements</option>
                  {availableElements.map(element => (
                    <option key={element} value={element}>{element}</option>
                  ))}
                </select>
              </div>

              {/* Level Filter */}
              <div style={{ marginBottom: 'var(--token-space-xl)' }}>
                <label style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  color: 'var(--muted-foreground)',
                  marginBottom: 'var(--token-space-md)'
                }}>
                  Level
                </label>
                <select
                  value={tempFilters.level || ''}
                  onChange={(e) => setTempFilters({ ...tempFilters, level: e.target.value || null })}
                  style={{
                    width: '100%',
                    padding: 'var(--token-space-lg)',
                    backgroundColor: 'var(--background)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--token-space-md)',
                    fontSize: '0.9375rem',
                    color: 'var(--foreground)',
                    minHeight: 'var(--min-touch-target)'
                  }}
                >
                  <option value="">All Levels</option>
                  {availableLevels.map(level => (
                    <option key={level} value={level}>{level}</option>
                  ))}
                </select>
              </div>

            </div>

            {/* Action Buttons */}
            <div style={{
              display: 'flex',
              gap: 'var(--token-space-lg)'
            }}>
              <button
                onClick={handleClearAll}
                style={{
                  flex: 1,
                  padding: 'var(--token-space-lg)',
                  backgroundColor: 'var(--muted)',
                  color: 'var(--foreground)',
                  border: 'none',
                  borderRadius: 'var(--token-space-md)',
                  fontSize: '0.9375rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                  minHeight: 'var(--min-touch-target)'
                }}
              >
                Clear All
              </button>
              <button
                onClick={handleApplyFilters}
                style={{
                  flex: 1,
                  padding: 'var(--token-space-lg)',
                  backgroundColor: 'var(--primary)',
                  color: 'white',
                  border: 'none',
                  borderRadius: 'var(--token-space-md)',
                  fontSize: '0.9375rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                  minHeight: 'var(--min-touch-target)'
                }}
              >
                Apply Filters
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  // Desktop Inline Filters
  return (
    <div style={{
      display: 'flex',
      gap: 'var(--token-space-lg)',
      alignItems: 'center',
      justifyContent: 'center',
      flexWrap: 'wrap'
    }}>
      {/* Breed Dropdown */}
      <div style={{ position: 'relative' }}>
        <select
          value={filters.breed || ''}
          onChange={(e) => onFilterChange({ breed: e.target.value || null })}
          style={{
            appearance: 'none',
            padding: '0.5rem 2.5rem 0.5rem 1rem',
            paddingRight: '2.5rem',
            backgroundColor: 'var(--background)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--token-space-md)',
            fontSize: '0.875rem',
            color: 'var(--foreground)',
            cursor: 'pointer',
            minWidth: '150px'
          }}
        >
          <option value="">All Breeds</option>
          {availableBreeds.map(breed => (
            <option key={breed} value={breed}>{breed}</option>
          ))}
        </select>
        <ChevronDown className="h-4 w-4" style={{
          position: 'absolute',
          right: '0.75rem',
          top: '50%',
          transform: 'translateY(-50%)',
          pointerEvents: 'none',
          color: 'var(--muted-foreground)'
        }} />
      </div>

      {/* Judge Dropdown */}
      <div style={{ position: 'relative' }}>
        <select
          value={filters.judge || ''}
          onChange={(e) => onFilterChange({ judge: e.target.value || null })}
          style={{
            appearance: 'none',
            padding: '0.5rem 2.5rem 0.5rem 1rem',
            backgroundColor: 'var(--background)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--token-space-md)',
            fontSize: '0.875rem',
            color: 'var(--foreground)',
            cursor: 'pointer',
            minWidth: '150px'
          }}
        >
          <option value="">All Judges</option>
          {availableJudges.map(judge => (
            <option key={judge} value={judge}>{judge}</option>
          ))}
        </select>
        <ChevronDown className="h-4 w-4" style={{
          position: 'absolute',
          right: '0.75rem',
          top: '50%',
          transform: 'translateY(-50%)',
          pointerEvents: 'none',
          color: 'var(--muted-foreground)'
        }} />
      </div>

      {/* Trial Date Dropdown */}
      <div style={{ position: 'relative' }}>
        <select
          value={filters.trialDate || ''}
          onChange={(e) => onFilterChange({ trialDate: e.target.value || null })}
          style={{
            appearance: 'none',
            padding: '0.5rem 2.5rem 0.5rem 1rem',
            backgroundColor: 'var(--background)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--token-space-md)',
            fontSize: '0.875rem',
            color: 'var(--foreground)',
            cursor: 'pointer',
            minWidth: '150px'
          }}
        >
          <option value="">All Dates</option>
          {availableTrialDates.map(date => (
            <option key={date} value={date}>
              {formatDateWithoutTimezone(date)}
            </option>
          ))}
        </select>
        <ChevronDown className="h-4 w-4" style={{
          position: 'absolute',
          right: '0.75rem',
          top: '50%',
          transform: 'translateY(-50%)',
          pointerEvents: 'none',
          color: 'var(--muted-foreground)'
        }} />
      </div>

      {/* Trial Number Dropdown */}
      <div style={{ position: 'relative' }}>
        <select
          value={filters.trialNumber?.toString() || ''}
          onChange={(e) => onFilterChange({ trialNumber: e.target.value ? parseInt(e.target.value) : null })}
          style={{
            appearance: 'none',
            padding: '0.5rem 2.5rem 0.5rem 1rem',
            backgroundColor: 'var(--background)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--token-space-md)',
            fontSize: '0.875rem',
            color: 'var(--foreground)',
            cursor: 'pointer',
            minWidth: '150px'
          }}
        >
          <option value="">All Trials</option>
          {availableTrialNumbers.map(num => (
            <option key={num} value={num}>Trial {num}</option>
          ))}
        </select>
        <ChevronDown className="h-4 w-4" style={{
          position: 'absolute',
          right: '0.75rem',
          top: '50%',
          transform: 'translateY(-50%)',
          pointerEvents: 'none',
          color: 'var(--muted-foreground)'
        }} />
      </div>

      {/* Element Dropdown */}
      <div style={{ position: 'relative' }}>
        <select
          value={filters.element || ''}
          onChange={(e) => onFilterChange({ element: e.target.value || null })}
          style={{
            appearance: 'none',
            padding: '0.5rem 2.5rem 0.5rem 1rem',
            backgroundColor: 'var(--background)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--token-space-md)',
            fontSize: '0.875rem',
            color: 'var(--foreground)',
            cursor: 'pointer',
            minWidth: '150px'
          }}
        >
          <option value="">All Elements</option>
          {availableElements.map(element => (
            <option key={element} value={element}>{element}</option>
          ))}
        </select>
        <ChevronDown className="h-4 w-4" style={{
          position: 'absolute',
          right: '0.75rem',
          top: '50%',
          transform: 'translateY(-50%)',
          pointerEvents: 'none',
          color: 'var(--muted-foreground)'
        }} />
      </div>

      {/* Level Dropdown */}
      <div style={{ position: 'relative' }}>
        <select
          value={filters.level || ''}
          onChange={(e) => onFilterChange({ level: e.target.value || null })}
          style={{
            appearance: 'none',
            padding: '0.5rem 2.5rem 0.5rem 1rem',
            backgroundColor: 'var(--background)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--token-space-md)',
            fontSize: '0.875rem',
            color: 'var(--foreground)',
            cursor: 'pointer',
            minWidth: '150px'
          }}
        >
          <option value="">All Levels</option>
          {availableLevels.map(level => (
            <option key={level} value={level}>{level}</option>
          ))}
        </select>
        <ChevronDown className="h-4 w-4" style={{
          position: 'absolute',
          right: '0.75rem',
          top: '50%',
          transform: 'translateY(-50%)',
          pointerEvents: 'none',
          color: 'var(--muted-foreground)'
        }} />
      </div>

      {/* Clear Filters Button */}
      {activeFilterCount > 0 && (
        <button
          onClick={handleClearAll}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--token-space-sm)',
            padding: '0.5rem 1rem',
            backgroundColor: 'var(--muted)',
            color: 'var(--foreground)',
            border: 'none',
            borderRadius: 'var(--token-space-md)',
            fontSize: '0.875rem',
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
        >
          <X className="h-4 w-4" />
          Clear Filters
        </button>
      )}
    </div>
  );
};

export default StatsFilters;