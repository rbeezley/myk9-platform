import type { TimeRange } from './MaxTimeDialog.types';

export const parseTimeRange = (timeText: string): { min: number; max: number } => {
  // Handle formats like "1 - 3 minutes", "4 minutes", "1-3 minutes", "2:30", "3:00"
  const cleanText = timeText
    .toLowerCase()
    .replace(/minutes?/g, '')
    .trim();

  // Check for MM:SS format (e.g., "2:30", "3:00")
  if (cleanText.match(/^\d+:\d{2}$/)) {
    const [mins, secs] = cleanText.split(':').map(p => parseInt(p));
    const totalMinutes = mins + secs / 60;
    return { min: totalMinutes, max: totalMinutes };
  }

  // Handle range format (e.g., "1 - 3", "1-3")
  if (cleanText.includes('-')) {
    const parts = cleanText.split('-').map(p => parseInt(p.trim()));
    return { min: parts[0] || 1, max: parts[1] || parts[0] || 3 };
  } else {
    const single = parseInt(cleanText) || 3;
    return { min: single, max: single };
  }
};

export const formatTimeInput = (value: string): string => {
  // Remove non-digits and colons
  const cleaned = value.replace(/[^\d:]/g, '');

  // If empty, return empty
  if (!cleaned) return '';

  // Handle MM:SS format
  if (cleaned.includes(':')) {
    const parts = cleaned.split(':');
    let minutes = parseInt(parts[0]) || 0;
    let seconds = parseInt(parts[1]) || 0;

    // Handle seconds overflow (convert to minutes)
    if (seconds >= 60) {
      minutes += Math.floor(seconds / 60);
      seconds = seconds % 60;
    }

    // Cap at display maximum (99 minutes) - actual validation done by validateTime()
    if (minutes > 99) {
      minutes = 99;
      seconds = 0;
    }

    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  // Handle just numbers - interpret based on length and context
  const numValue = parseInt(cleaned);
  if (isNaN(numValue)) return '';

  if (cleaned.length <= 2) {
    // 1-2 digits: treat as minutes
    const minutes = Math.min(numValue, 99); // Cap at display max - actual validation done by validateTime()
    return `${minutes.toString().padStart(2, '0')}:00`;
  } else if (cleaned.length === 3) {
    // 3 digits: first digit as minutes, last two as seconds (e.g., 130 = 1:30)
    const minutes = Math.floor(numValue / 100);
    const seconds = numValue % 100;
    if (seconds < 60) {
      return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    } else {
      // Invalid seconds, treat as minutes
      const totalMinutes = Math.min(Math.floor(numValue / 60), 99);
      return `${totalMinutes.toString().padStart(2, '0')}:00`;
    }
  } else {
    // 4+ digits: treat as MMSS format
    const minutes = Math.floor(numValue / 100);
    const seconds = numValue % 100;
    const finalMinutes = Math.min(minutes, 99);
    const finalSeconds = seconds < 60 ? seconds : 0;
    return `${finalMinutes.toString().padStart(2, '0')}:${finalSeconds.toString().padStart(2, '0')}`;
  }
};

export const validateTime = (timeStr: string, timeRange: TimeRange | null): string => {
  if (!timeRange || !timeStr) return '';

  const timeMinutes = convertToMinutes(timeStr);

  if (timeMinutes < timeRange.min) {
    return `Minimum ${timeRange.min} minute${timeRange.min !== 1 ? 's' : ''}`;
  }

  if (timeMinutes > timeRange.max) {
    return `Maximum ${timeRange.max} minute${timeRange.max !== 1 ? 's' : ''}`;
  }

  return '';
};

export const convertToMinutes = (timeStr: string): number => {
  if (timeStr.includes(':')) {
    const [minutes, seconds] = timeStr.split(':').map(p => parseInt(p) || 0);
    return minutes + seconds / 60;
  }
  return parseInt(timeStr) || 0;
};

export const generateTimePresets = (timeRange: TimeRange | null): string[] => {
  if (!timeRange) return [];

  const presets: string[] = [];
  const { min, max } = timeRange;

  // Generate presets for each minute and half-minute increment within range
  for (let minute = min; minute <= max; minute++) {
    // Add full minute (e.g., 1:00, 2:00, 3:00)
    presets.push(`${minute.toString().padStart(2, '0')}:00`);

    // Add half minute if not at max (e.g., 1:30, 2:30)
    if (minute < max) {
      presets.push(`${minute.toString().padStart(2, '0')}:30`);
    }
  }

  return presets;
};

export const getAreaLabel = (areaIndex: number, timeRange: TimeRange | null): string => {
  if (!timeRange || timeRange.areas === 1) return 'Max Time';
  return `Area ${areaIndex + 1} Max Time`;
};

export const secondsToTimeString = (seconds?: number | string): string => {
  if (!seconds || seconds === 0) return '';
  const totalSeconds = typeof seconds === 'string' ? parseInt(seconds) : seconds;
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

export const timeStringToSeconds = (timeStr: string): number => {
  if (!timeStr) return 0;
  const [minutes, seconds] = timeStr.split(':').map(p => parseInt(p) || 0);
  return minutes * 60 + seconds;
};

export const canSave = (
  timeRange: TimeRange | null,
  saving: boolean,
  times: string[],
  errors: string[],
  showWarning: boolean
): boolean => {
  if (!timeRange || saving) return false;

  // Check all required areas have times
  const requiredAreas = timeRange.areas;
  const filledTimes = times.slice(0, requiredAreas).filter(time => time !== '');

  const allFilled = filledTimes.length === requiredAreas;
  const allEmpty = filledTimes.length === 0;

  // If showWarning is true (max time required), must fill all areas - can't save empty
  if (showWarning && allEmpty) return false;

  // Otherwise: all areas must be filled (or all must be empty for clearing)
  if (!allFilled && !allEmpty) return false;

  // No validation errors
  const hasErrors = errors.slice(0, requiredAreas).some(error => error !== '');
  if (hasErrors) return false;

  return true;
};
