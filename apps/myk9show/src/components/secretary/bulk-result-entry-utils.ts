import type { QualificationStatus } from '@/types/scent-work-types';

export interface LocalCompetitionData {
  time?: string;
  qualified?: boolean;
  qualification?: string;
  faults?: number;
  judgeNotes?: string;
}

export interface BulkEntryData {
  entryId: string;
  armband: string;
  dogName: string;
  handlerName: string;
  searchTime: string;
  qualification: QualificationStatus | '';
  faults: string;
  notes: string;
  isValid: boolean;
  hasChanges: boolean;
}

export interface BulkEntrySummary {
  totalEntries: number;
  entriesWithData: number;
  validEntries: number;
  invalidEntries: number;
  canSubmit: boolean;
}

export const formatSearchTimeFromMs = (ms: number): string => {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}.00`;
};

export const convertTimeToInputFormat = (timeStr: string): string => {
  if (/^\d{1,2}:\d{2}\.\d{2}$/.test(timeStr)) {
    return timeStr;
  }

  if (/^\d{1,2}:\d{2}$/.test(timeStr)) {
    return `${timeStr}.00`;
  }

  const numericValue = parseFloat(timeStr);
  if (!isNaN(numericValue)) {
    const minutes = Math.floor(numericValue / 60);
    const seconds = Math.floor(numericValue % 60);
    const hundredths = Math.floor((numericValue % 1) * 100);
    return `${minutes}:${seconds.toString().padStart(2, '0')}.${hundredths.toString().padStart(2, '0')}`;
  }

  return timeStr;
};

export const timeStringToMs = (timeStr: string): number => {
  const match = timeStr.match(/^(\d{1,2}):([0-5]\d)\.(\d{2})$/);
  if (!match) return 0;

  const minutes = parseInt(match[1]);
  const seconds = parseInt(match[2]);
  const hundredths = parseInt(match[3]);

  return (minutes * 60 + seconds) * 1000 + hundredths * 10;
};

export const validateEntry = (data: BulkEntryData): { isValid: boolean; error?: string } => {
  if (!data.hasChanges) {
    return { isValid: false };
  }

  if (!data.searchTime || !data.qualification) {
    return { isValid: false, error: 'Time and qualification required' };
  }

  const timePattern = /^(\d{1,2}):([0-5]\d)\.(\d{2})$/;
  if (!timePattern.test(data.searchTime)) {
    return { isValid: false, error: 'Invalid time format (MM:SS.HH)' };
  }

  const match = data.searchTime.match(timePattern);
  if (match) {
    const minutes = parseInt(match[1]);
    const seconds = parseInt(match[2]);
    const hundredths = parseInt(match[3]);

    if (minutes > 59 || seconds > 59 || hundredths > 99) {
      return { isValid: false, error: 'Invalid time values' };
    }
  }

  const faultCount = parseInt(data.faults);
  if (isNaN(faultCount) || faultCount < 0) {
    return { isValid: false, error: 'Invalid fault count' };
  }

  return { isValid: true };
};
