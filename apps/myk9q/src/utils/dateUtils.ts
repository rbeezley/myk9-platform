/**
 * Date utility functions for myK9Q application
 */

/**
 * Format a trial date string with optional trial number
 * @param dateStr - Date string in YYYY-MM-DD format
 * @param trialNumber - Optional trial number to display
 * @returns Formatted date string like "Mon, Jan 15, 2024 • Trial 1" or "Mon, Jan 15, 2024"
 */
export const formatTrialDate = (dateStr: string, trialNumber?: number): string => {
  // Parse date components manually to avoid timezone issues
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day); // month is 0-indexed

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const dayName = days[date.getDay()];
  const monthName = months[date.getMonth()];
  const dayNumber = date.getDate();
  const yearNumber = date.getFullYear();

  const baseDate = `${dayName}, ${monthName} ${dayNumber}, ${yearNumber}`;
  return trialNumber ? `${baseDate} • Trial ${trialNumber}` : baseDate;
};
