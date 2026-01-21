// src/pages/Results/components/ResultsFilters.tsx
import type { ResultsFilters as Filters, TrialOption } from '../hooks/useResultsData';
import { cn } from '@/lib/utils';

/** Tailwind styles for ResultsFilters */
const styles = {
  filters: cn(
    "flex flex-wrap items-end justify-center",
    "gap-[var(--token-space-xl)]",
    "py-[var(--token-space-lg)] px-[var(--token-space-xl)]",
    "bg-gradient-to-b from-[rgba(30,30,35,0.95)] to-[rgba(20,20,25,0.98)]",
    "border-b border-[rgba(212,175,55,0.2)]",
    "sticky top-0 z-[100] backdrop-blur-md",
    // Light mode
    "theme-light:bg-gradient-to-b theme-light:from-[rgba(245,240,232,0.95)] theme-light:to-[rgba(250,248,245,0.98)]",
    "theme-light:border-[rgba(153,101,21,0.2)]",
    // Mobile
    "max-sm:flex-col max-sm:items-stretch max-sm:gap-[var(--token-space-lg)] max-sm:p-[var(--token-space-lg)]"
  ),
  group: cn(
    "flex flex-col gap-[var(--token-space-xs)]"
  ),
  label: cn(
    "font-['Montserrat',_'Segoe_UI',_sans-serif]",
    "text-[10px] font-bold tracking-[0.15em] uppercase",
    "text-[rgba(212,175,55,0.8)]",
    "theme-light:text-[#996515]"
  ),
  select: cn(
    "appearance-none",
    "py-2.5 pl-4 pr-10",
    "border border-[rgba(212,175,55,0.3)] rounded-lg",
    "bg-[rgba(30,30,35,0.9)]",
    "bg-[url('data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20width=%2712%27%20height=%2712%27%20viewBox=%270%200%2012%2012%27%3E%3Cpath%20fill=%27%23d4af37%27%20d=%27M2%204l4%204%204-4%27/%3E%3C/svg%3E')]",
    "bg-no-repeat bg-[position:right_14px_center]",
    "font-['Montserrat',_'Segoe_UI',_sans-serif]",
    "text-sm font-medium text-white",
    "min-w-[180px] cursor-pointer",
    "transition-all duration-200",
    // Hover
    "hover:border-[rgba(212,175,55,0.6)] hover:bg-[rgba(40,40,45,0.95)]",
    // Focus
    "focus:outline-none focus:border-[#d4af37] focus:shadow-[0_0_0_3px_rgba(212,175,55,0.15)]",
    // Light mode
    "theme-light:bg-white theme-light:border-[rgba(153,101,21,0.3)]",
    "theme-light:text-[#2D2A26]",
    "theme-light:bg-[url('data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20width=%2712%27%20height=%2712%27%20viewBox=%270%200%2012%2012%27%3E%3Cpath%20fill=%27%23996515%27%20d=%27M2%204l4%204%204-4%27/%3E%3C/svg%3E')]",
    "theme-light:shadow-[0_2px_8px_rgba(153,101,21,0.08)]",
    "theme-light:hover:border-[rgba(153,101,21,0.5)] theme-light:hover:bg-[#FDFCFA]",
    "theme-light:focus:border-[#B8860B] theme-light:focus:shadow-[0_0_0_3px_rgba(184,134,11,0.15)]",
    // Mobile
    "max-sm:w-full"
  ),
  count: cn(
    "flex items-center gap-[var(--token-space-sm)]",
    "font-['Montserrat',_'Segoe_UI',_sans-serif]",
    "text-[13px] font-semibold text-white/70",
    "py-2.5 px-4",
    "bg-[rgba(212,175,55,0.1)] border border-[rgba(212,175,55,0.2)] rounded-lg",
    // Light mode
    "theme-light:text-[#5C574F]",
    "theme-light:bg-[rgba(184,134,11,0.1)] theme-light:border-[rgba(153,101,21,0.2)]",
    // Mobile
    "max-sm:ml-0 max-sm:justify-center"
  ),
};

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
    <div className={styles.filters}>
      {/* Trial Filter - only show if there are multiple trials */}
      {trials.length > 1 && (
        <div className={styles.group}>
          <label htmlFor="trial-filter" className={styles.label}>Trial</label>
          <select
            id="trial-filter"
            className={styles.select}
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

      <div className={styles.group}>
        <label htmlFor="element-filter" className={styles.label}>Element</label>
        <select
          id="element-filter"
          className={styles.select}
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

      <div className={styles.group}>
        <label htmlFor="level-filter" className={styles.label}>Level</label>
        <select
          id="level-filter"
          className={styles.select}
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

      <div className={styles.count}>
        🏆 Showing {resultCount} class{resultCount !== 1 ? 'es' : ''}
      </div>
    </div>
  );
}
