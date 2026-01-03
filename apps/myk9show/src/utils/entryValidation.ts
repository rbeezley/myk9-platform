/**
 * Enhanced validation utilities for entry data
 * Supports advanced time formats, scoring validation, and comprehensive error handling
 */

export interface ValidationResult {
  isValid: boolean;
  error?: string;
  normalizedValue?: string;
}

export interface FieldValidationError {
  field: string;
  message: string;
}

// Time format patterns
export const TIME_PATTERNS = {
  FULL_FORMAT: /^(\d{1,2}):([0-5]\d)\.(\d{2})$/, // MM:SS.HH
  BASIC_FORMAT: /^(\d{1,2}):([0-5]\d)$/, // MM:SS
  SECONDS_ONLY: /^\d+(\.\d+)?$/ // Seconds with optional decimals
};

/**
 * Convert various time formats to standard MM:SS.HH format
 */
export const convertTimeToStandardFormat = (timeStr: string): string => {
  if (!timeStr || !timeStr.trim()) return '';
  
  const trimmed = timeStr.trim();
  
  // Already in MM:SS.HH format
  if (TIME_PATTERNS.FULL_FORMAT.test(trimmed)) {
    return trimmed;
  }
  
  // MM:SS format - add hundredths
  if (TIME_PATTERNS.BASIC_FORMAT.test(trimmed)) {
    return `${trimmed}.00`;
  }
  
  // Seconds only - convert to MM:SS.HH
  const numericValue = parseFloat(trimmed);
  if (!isNaN(numericValue) && numericValue >= 0) {
    const totalSeconds = Math.floor(numericValue);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const hundredths = Math.floor((numericValue % 1) * 100);
    
    return `${minutes}:${seconds.toString().padStart(2, '0')}.${hundredths.toString().padStart(2, '0')}`;
  }
  
  return trimmed;
};

/**
 * Validate time format and values
 */
export const validateTimeFormat = (timeStr: string): ValidationResult => {
  if (!timeStr || !timeStr.trim()) {
    return { isValid: false, error: 'Time is required' };
  }
  
  const standardTime = convertTimeToStandardFormat(timeStr);
  const match = standardTime.match(TIME_PATTERNS.FULL_FORMAT);
  
  if (!match) {
    return { 
      isValid: false, 
      error: 'Invalid time format. Use MM:SS, MM:SS.HH, or seconds (e.g., 2:30, 2:30.45, or 150.45)' 
    };
  }
  
  const [, minutes, seconds, hundredths] = match;
  const minutesNum = parseInt(minutes);
  const secondsNum = parseInt(seconds);
  const hundredthsNum = parseInt(hundredths);
  
  if (minutesNum > 59) {
    return { isValid: false, error: 'Minutes cannot exceed 59' };
  }
  
  if (secondsNum > 59) {
    return { isValid: false, error: 'Seconds cannot exceed 59' };
  }
  
  if (hundredthsNum > 99) {
    return { isValid: false, error: 'Hundredths cannot exceed 99' };
  }
  
  // Check for unrealistic times (over 30 minutes)
  const totalSeconds = minutesNum * 60 + secondsNum + hundredthsNum / 100;
  if (totalSeconds > 1800) { // 30 minutes
    return { 
      isValid: false, 
      error: 'Time seems unusually long. Please verify the entry.' 
    };
  }
  
  return { 
    isValid: true, 
    normalizedValue: standardTime 
  };
};

/**
 * Validate score field
 */
export const validateScore = (scoreStr: string): ValidationResult => {
  if (!scoreStr || !scoreStr.trim()) {
    return { isValid: true }; // Score is optional
  }
  
  const score = parseFloat(scoreStr.trim());
  
  if (isNaN(score)) {
    return { isValid: false, error: 'Score must be a valid number' };
  }
  
  if (score < 0) {
    return { isValid: false, error: 'Score cannot be negative' };
  }
  
  if (score > 500) {
    return { isValid: false, error: 'Score seems unusually high. Please verify the entry.' };
  }
  
  return { 
    isValid: true, 
    normalizedValue: score.toString() 
  };
};

/**
 * Validate placement field
 */
export const validatePlacement = (placementStr: string): ValidationResult => {
  if (!placementStr || !placementStr.trim()) {
    return { isValid: true }; // Placement is optional
  }
  
  const placement = parseInt(placementStr.trim());
  
  if (isNaN(placement)) {
    return { isValid: false, error: 'Placement must be a whole number' };
  }
  
  if (placement < 1) {
    return { isValid: false, error: 'Placement must be 1 or higher' };
  }
  
  if (placement > 999) {
    return { isValid: false, error: 'Placement seems unusually high' };
  }
  
  return { 
    isValid: true, 
    normalizedValue: placement.toString() 
  };
};

/**
 * Validate status/qualification field
 */
export const validateStatus = (status: string): ValidationResult => {
  if (!status || !status.trim()) {
    return { isValid: false, error: 'Status is required' };
  }
  
  const validStatuses = ['Qualified', 'Not Qualified', 'Absent', 'Withdrawn', 'Excused'];
  
  if (!validStatuses.includes(status)) {
    return { 
      isValid: false, 
      error: `Status must be one of: ${validStatuses.join(', ')}` 
    };
  }
  
  return { isValid: true, normalizedValue: status };
};

/**
 * Validate a single field based on field type
 */
export const validateField = (field: string, value: string): ValidationResult => {
  switch (field) {
    case 'time':
      return validateTimeFormat(value);
    case 'score':
      return validateScore(value);
    case 'placement':
      return validatePlacement(value);
    case 'status':
      return validateStatus(value);
    default:
      return { isValid: true };
  }
};

/**
 * Validate all fields for an entry
 */
export const validateEntryData = (data: {
  time: string;
  status: string;
  score: string;
  placement: string;
}): FieldValidationError[] => {
  const errors: FieldValidationError[] = [];
  
  // Validate each field
  Object.entries(data).forEach(([field, value]) => {
    const validation = validateField(field, value);
    if (!validation.isValid && validation.error) {
      errors.push({ field, message: validation.error });
    }
  });
  
  // Cross-field validation
  if (data.status === 'Qualified' && !data.time.trim()) {
    errors.push({ 
      field: 'time', 
      message: 'Time is required for qualified entries' 
    });
  }
  
  if (data.placement.trim() && !data.time.trim()) {
    errors.push({ 
      field: 'time', 
      message: 'Time is required when placement is specified' 
    });
  }
  
  return errors;
};

/**
 * Convert time string to milliseconds for calculations
 */
export const timeStringToMs = (timeStr: string): number => {
  const standardTime = convertTimeToStandardFormat(timeStr);
  const match = standardTime.match(TIME_PATTERNS.FULL_FORMAT);
  
  if (!match) return 0;
  
  const minutes = parseInt(match[1]);
  const seconds = parseInt(match[2]);
  const hundredths = parseInt(match[3]);
  
  return (minutes * 60 + seconds) * 1000 + hundredths * 10;
};

/**
 * Format milliseconds back to time string
 */
export const formatTimeFromMs = (ms: number): string => {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const hundredths = Math.floor((ms % 1000) / 10);
  
  return `${minutes}:${seconds.toString().padStart(2, '0')}.${hundredths.toString().padStart(2, '0')}`;
};