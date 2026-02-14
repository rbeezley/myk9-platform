import type { BulkEntryData } from './types';

// Helper function to format time from milliseconds to MM:SS format
export const formatSearchTimeFromMs = (ms: number): string => {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}.00`;
};

// Helper function to convert various time formats to MM:SS.HH format expected by input
export const convertTimeToInputFormat = (timeStr: string): string => {
  // If already in MM:SS.HH format, return as-is
  if (/^\d{1,2}:\d{2}\.\d{2}$/.test(timeStr)) {
    return timeStr;
  }

  // If in MM:SS format, add .00 for hundredths
  if (/^\d{1,2}:\d{2}$/.test(timeStr)) {
    return `${timeStr}.00`;
  }

  // If it's just a number (seconds), convert to MM:SS.HH
  const numericValue = parseFloat(timeStr);
  if (!isNaN(numericValue)) {
    const minutes = Math.floor(numericValue / 60);
    const seconds = Math.floor(numericValue % 60);
    const hundredths = Math.floor((numericValue % 1) * 100);
    return `${minutes}:${seconds.toString().padStart(2, '0')}.${hundredths.toString().padStart(2, '0')}`;
  }

  return timeStr;
};

// Convert time string to milliseconds
export const timeStringToMs = (timeStr: string): number => {
  const match = timeStr.match(/^(\d{1,2}):([0-5]\d)\.(\d{2})$/);
  if (!match) return 0;

  const minutes = parseInt(match[1]);
  const seconds = parseInt(match[2]);
  const hundredths = parseInt(match[3]);

  return (minutes * 60 + seconds) * 1000 + hundredths * 10;
};

// Validate individual entry
export const validateEntry = (data: BulkEntryData): { isValid: boolean; error?: string } => {
  if (!data.hasChanges) {
    return { isValid: false };
  }

  // Check required fields
  if (!data.searchTime || !data.qualification) {
    return { isValid: false, error: 'Time and qualification required' };
  }

  // Validate time format (MM:SS.HH)
  const timePattern = /^(\d{1,2}):([0-5]\d)\.(\d{2})$/;
  if (!timePattern.test(data.searchTime)) {
    return { isValid: false, error: 'Invalid time format (MM:SS.HH)' };
  }

  // Additional validation for logical time values
  const match = data.searchTime.match(timePattern);
  if (match) {
    const minutes = parseInt(match[1]);
    const seconds = parseInt(match[2]);
    const hundredths = parseInt(match[3]);

    if (minutes > 59 || seconds > 59 || hundredths > 99) {
      return { isValid: false, error: 'Invalid time values' };
    }
  }

  // Validate faults
  const faultCount = parseInt(data.faults);
  if (isNaN(faultCount) || faultCount < 0) {
    return { isValid: false, error: 'Invalid fault count' };
  }

  return { isValid: true };
};
