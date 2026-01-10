// Utility to format ISO date strings (YYYY-MM-DD) to mm/dd/yyyy
export function formatDateMMDDYYYY(dateStr: string): string {
  if (!dateStr) return '';

  // Parse as local date, not UTC
  const [year, month, day] = dateStr.split('-');
  if (!year || !month || !day) {
    return dateStr;
  }

  // Direct string manipulation to avoid any timezone issues
  return `${parseInt(month, 10)}/${parseInt(day, 10)}/${year}`;
}

// Utility to format time from Date object or time string
export function formatTime(date: Date | string, options?: {
  hour12?: boolean;
  includeSeconds?: boolean;
}): string {
  const { hour12 = true, includeSeconds = false } = options || {};
  
  let dateObj: Date;
  if (typeof date === 'string') {
    dateObj = new Date(date);
  } else {
    dateObj = date;
  }
  
  if (isNaN(dateObj.getTime())) {
    return 'Invalid Time';
  }
  
  const formatOptions: Intl.DateTimeFormatOptions = {
    hour: 'numeric',
    minute: '2-digit',
    hour12
  };
  
  if (includeSeconds) {
    formatOptions.second = '2-digit';
  }
  
  return dateObj.toLocaleTimeString('en-US', formatOptions);
}

// Converts a Date or date string to YYYY-MM-DD for input[type="date"]
export function toYYYYMMDD(date: string | Date): string {
  if (!date) return '';
  if (typeof date === 'string') {
    // If already in YYYY-MM-DD, return as is
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
    // If in ISO format with time, extract date part
    const match = date.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
    // Otherwise, try to parse as Date
    date = new Date(date);
  }
  if (date instanceof Date && !isNaN(date.getTime())) {
    // Get local date components
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return '';
}

// Calculate show status based on start and end dates
export function calculateShowStatus(startDate: string, endDate: string): 'Upcoming' | 'In Progress' | 'Completed' {
  if (!startDate || !endDate) return 'Upcoming';
  
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Reset to start of day for accurate comparison
  
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999); // Set to end of day
  
  if (today < start) {
    return 'Upcoming';
  } else if (today >= start && today <= end) {
    return 'In Progress';
  } else {
    return 'Completed';
  }
}
