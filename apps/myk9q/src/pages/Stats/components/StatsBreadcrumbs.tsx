import React from 'react';
import type { StatsFilters } from '../types/stats.types';

interface StatsBreadcrumbsProps {
  filters: StatsFilters;
}

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

const StatsBreadcrumbs: React.FC<StatsBreadcrumbsProps> = ({ filters }) => {
  // Check if any filters are active
  const hasActiveFilters = filters.breed || filters.judge || filters.trialDate ||
                           filters.trialNumber || filters.element || filters.level;

  // Only show breadcrumbs when filters are active
  if (!hasActiveFilters) {
    return null;
  }

  return (
    <nav style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 'var(--token-space-md)',
      fontSize: '0.875rem',
      flexWrap: 'wrap'
    }}>
      <div style={{
        display: 'flex',
        gap: 'var(--token-space-sm)',
        flexWrap: 'wrap'
      }}>
        {filters.breed && (
          <span style={{
            padding: '0.25rem 0.75rem',
            backgroundColor: 'var(--accent)',
            borderRadius: '9999px',
            fontSize: '0.75rem',
            color: 'var(--primary)',
            fontWeight: 500
          }}>
            Breed: {filters.breed}
          </span>
        )}
        {filters.judge && (
          <span style={{
            padding: '0.25rem 0.75rem',
            backgroundColor: 'var(--accent)',
            borderRadius: '9999px',
            fontSize: '0.75rem',
            color: 'var(--primary)',
            fontWeight: 500
          }}>
            Judge: {filters.judge}
          </span>
        )}
        {filters.trialDate && (
          <span style={{
            padding: '0.25rem 0.75rem',
            backgroundColor: 'var(--accent)',
            borderRadius: '9999px',
            fontSize: '0.75rem',
            color: 'var(--primary)',
            fontWeight: 500
          }}>
            Date: {formatDateWithoutTimezone(filters.trialDate)}
          </span>
        )}
        {filters.trialNumber && (
          <span style={{
            padding: '0.25rem 0.75rem',
            backgroundColor: 'var(--accent)',
            borderRadius: '9999px',
            fontSize: '0.75rem',
            color: 'var(--primary)',
            fontWeight: 500
          }}>
            Trial: {filters.trialNumber}
          </span>
        )}
        {filters.element && (
          <span style={{
            padding: '0.25rem 0.75rem',
            backgroundColor: 'var(--accent)',
            borderRadius: '9999px',
            fontSize: '0.75rem',
            color: 'var(--primary)',
            fontWeight: 500
          }}>
            Element: {filters.element}
          </span>
        )}
        {filters.level && (
          <span style={{
            padding: '0.25rem 0.75rem',
            backgroundColor: 'var(--accent)',
            borderRadius: '9999px',
            fontSize: '0.75rem',
            color: 'var(--primary)',
            fontWeight: 500
          }}>
            Level: {filters.level}
          </span>
        )}
      </div>
    </nav>
  );
};

export default StatsBreadcrumbs;
