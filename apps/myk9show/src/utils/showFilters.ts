import type { Show } from '@/types/show-types';
import { toLocalDate } from '@/utils/date-format';

/**
 * Common date filtering utilities for shows
 */
/**
 * Get show statistics with optimized date calculations
 */
export const getShowStats = (shows: Show[]) => {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  // Pre-process show dates to avoid repeated Date creation
  const showsWithDates = shows.map(show => ({
    ...show,
    startDateObj: toLocalDate(show.startDate),
  }));

  // Filter upcoming shows efficiently
  const upcoming = showsWithDates.filter(show => show.startDateObj >= now);

  return {
    total: shows.length,
    upcoming: upcoming.length,
    thisMonth: showsWithDates.filter(
      show =>
        show.startDateObj.getMonth() === currentMonth &&
        show.startDateObj.getFullYear() === currentYear
    ).length,
    registered: shows.filter(show => show.status === 'active').length,
  };
};
