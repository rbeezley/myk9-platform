// src/pages/Results/components/ResultsFilters.tsx
import type { ResultsFilters as Filters, TrialOption } from '../hooks/useResultsData';
import './ResultsFilters.css';

const ELEMENTS = ['Container', 'Interior', 'Exterior', 'Buried', 'Handler Discrimination'];
const LEVELS = ['Novice A', 'Novice B', 'Advanced', 'Excellent', 'Masters'];

interface ResultsFiltersProps {
  filters: Filters;
  trials: TrialOption[];
  onFilterChange: (filters: Filters) => void;
  resultCount: number;
}

/**
 * Format trial date for display
 * Converts ISO date to readable format like "Sat, Sep 9"
 */
function formatTrialDate(dateStr: string): string {
  try {
    const date = new Date(dateStr + 'T00:00:00'); // Add time to avoid timezone issues
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

export function ResultsFilters({
  filters,
  trials,
  onFilterChange,
  resultCount,
}: ResultsFiltersProps) {
  return (
    <div className="results-filters">
      {/* Trial Filter - only show if there are multiple trials */}
      {trials.length > 1 && (
        <div className="results-filters__group">
          <label htmlFor="trial-filter">Trial</label>
          <select
            id="trial-filter"
            value={filters.trial || ''}
            onChange={(e) =>
              onFilterChange({
                ...filters,
                trial: e.target.value ? parseInt(e.target.value, 10) : null,
              })
            }
          >
            <option value="">All Trials</option>
            {trials.map((trial) => (
              <option key={trial.id} value={trial.id}>
                {trial.name} ({formatTrialDate(trial.date)})
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="results-filters__group">
        <label htmlFor="element-filter">Element</label>
        <select
          id="element-filter"
          value={filters.element || ''}
          onChange={(e) => onFilterChange({ ...filters, element: e.target.value || null })}
        >
          <option value="">All Elements</option>
          {ELEMENTS.map((el) => (
            <option key={el} value={el}>
              {el}
            </option>
          ))}
        </select>
      </div>

      <div className="results-filters__group">
        <label htmlFor="level-filter">Level</label>
        <select
          id="level-filter"
          value={filters.level || ''}
          onChange={(e) => onFilterChange({ ...filters, level: e.target.value || null })}
        >
          <option value="">All Levels</option>
          {LEVELS.map((lvl) => (
            <option key={lvl} value={lvl}>
              {lvl}
            </option>
          ))}
        </select>
      </div>

      <div className="results-filters__count">
        Showing {resultCount} class{resultCount !== 1 ? 'es' : ''}
      </div>
    </div>
  );
}
