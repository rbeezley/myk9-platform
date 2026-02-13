import type { ShowStatus } from './types';

/** Get club initials for logo fallback display */
export const getClubInitials = (name: string): string => {
  return name
    .split(' ')
    .filter(Boolean)
    .map(word => word[0].toUpperCase())
    .join('')
    .slice(0, 2);
};

/** Determine show status based on date and whether it is upcoming */
export const getShowStatus = (date: string, isUpcoming: boolean): ShowStatus => {
  const showDate = new Date(date);
  const today = new Date();
  const daysUntil = Math.ceil((showDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (!isUpcoming) return { status: 'completed', label: 'Completed' };
  if (daysUntil > 30) return { status: 'registration', label: 'Registration Open' };
  if (daysUntil > 0) return { status: 'upcoming', label: 'Upcoming' };
  return { status: 'upcoming', label: 'This Week' };
};
