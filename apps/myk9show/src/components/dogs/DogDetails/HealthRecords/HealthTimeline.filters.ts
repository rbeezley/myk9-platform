/** Pure Health Timeline filtering — testable without rendering. */
import type { HealthEvent } from './HealthTimeline';

export interface HealthTimelineFilters {
  searchTerm: string;
  filterType: string;
  selectedYear: number | null;
}

export const defaultHealthTimelineFilters: HealthTimelineFilters = {
  searchTerm: '',
  filterType: 'all',
  selectedYear: null,
};

/**
 * Whether any filter differs from the baseline (i.e. filtering is active).
 *
 * `filterType`'s "no filter applied" value depends on context: it is `'all'`
 * normally, but `vaccinationsOnly` mode locks the baseline to `'vaccination'`
 * (see HealthTimeline.tsx). Pass that baseline explicitly so the check
 * doesn't treat the locked default as a user-applied filter.
 */
export function hasActiveHealthTimelineFilters(
  filters: HealthTimelineFilters,
  baselineFilterType: string = 'all'
): boolean {
  return (
    filters.searchTerm.trim() !== '' ||
    filters.filterType !== baselineFilterType ||
    filters.selectedYear !== null
  );
}

/** Search + type + year filters, ANDed together, applied to the loaded event set. */
export function filterHealthEvents(
  events: HealthEvent[],
  { searchTerm, filterType, selectedYear }: HealthTimelineFilters
): HealthEvent[] {
  let filtered = events;

  const term = searchTerm.trim().toLowerCase();
  if (term) {
    filtered = filtered.filter(
      event =>
        event.title.toLowerCase().includes(term) ||
        event.description?.toLowerCase().includes(term) ||
        event.vetName?.toLowerCase().includes(term) ||
        event.clinic?.toLowerCase().includes(term)
    );
  }

  if (filterType !== 'all') {
    filtered = filtered.filter(event => event.type === filterType);
  }

  if (selectedYear !== null) {
    filtered = filtered.filter(event => event.date.getFullYear() === selectedYear);
  }

  return filtered;
}
