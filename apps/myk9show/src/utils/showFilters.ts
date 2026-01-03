import type { Show } from '@/types/show-types';

/**
 * Common date filtering utilities for shows
 */
export const getDateFilteredShows = (shows: Show[], dateRange: string) => {
  const now = new Date();
  
  switch (dateRange) {
    case 'upcoming':
      return shows.filter(show => new Date(show.startDate) >= now);
    
    case 'this_month': {
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();
      return shows.filter(show => {
        const showDate = new Date(show.startDate);
        return showDate.getMonth() === currentMonth && 
               showDate.getFullYear() === currentYear;
      });
    }
    
    case 'next_month': {
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
      return shows.filter(show => {
        const showDate = new Date(show.startDate);
        return showDate >= now && showDate <= nextMonth;
      });
    }
    
    default:
      return shows;
  }
};

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
    startDateObj: new Date(show.startDate)
  }));
  
  // Filter upcoming shows efficiently
  const upcoming = showsWithDates.filter(show => show.startDateObj >= now);
  
  return {
    total: shows.length,
    upcoming: upcoming.length,
    thisMonth: showsWithDates.filter(show => 
      show.startDateObj.getMonth() === currentMonth && 
      show.startDateObj.getFullYear() === currentYear
    ).length,
    registered: shows.filter(show => show.status === 'active').length
  };
};