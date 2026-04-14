import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getInitials(name1?: string, name2?: string): string {
  if (name1 && name2) {
    // Both first and last name provided (human)
    const first = name1.charAt(0).toUpperCase();
    const last = name2.charAt(0).toUpperCase();
    return `${first}${last}`;
  } else if (name1) {
    // Single name string provided (e.g., dog name or person with single name field)
    const parts = name1.trim().split(/\s+/);
    if (parts.length > 1 && parts[0] && parts[1]) {
      // If it's like "Max Power", take "MP"
      const first = parts[0].charAt(0).toUpperCase();
      const second = parts[1].charAt(0).toUpperCase();
      return `${first}${second}`;
    } else if (parts.length > 0 && parts[0]) {
      // If it's like "Buddy", take "B"
      return parts[0].charAt(0).toUpperCase();
    }
  }
  return '?'; // Fallback for no names or empty strings
}

export function formatCurrency(amount: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
  }).format(amount);
}

export function formatDate(
  date: Date | string | number,
  options?: Intl.DateTimeFormatOptions
): string {
  const dateObj = date instanceof Date ? date : new Date(date);

  if (isNaN(dateObj.getTime())) {
    return 'Invalid Date';
  }

  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  };

  return dateObj.toLocaleDateString('en-US', { ...defaultOptions, ...options });
}

/** Format a class element + level + section into a display label, with fallback to full class name. */
export function formatClassLabel(
  element: string | null,
  level: string | null,
  fallback: string,
  section?: string | null
): string {
  return [element, level, section].filter(Boolean).join(' ') || fallback;
}
