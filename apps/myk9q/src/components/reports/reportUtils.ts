import { Entry } from '../../stores/entryStore';

/**
 * Utility functions for report generation
 */

// Format date for reports (e.g., "10/4/2025" from "2025-10-04")
export const formatReportDate = (dateStr: string): string => {
  const [year, month, day] = dateStr.split('-').map(Number);
  return `${month}/${day}/${year}`;
};

// Format time for reports in mm:ss.hh format (e.g., "00:01.76" from 1.76 seconds)
export const formatReportTime = (time: string | number | null | undefined): string => {
  if (!time) return '';

  // Convert string to number if needed
  const timeInSeconds = typeof time === 'string' ? parseFloat(time) : time;

  if (isNaN(timeInSeconds)) return '';

  // Extract minutes, seconds, and hundredths
  const totalSeconds = timeInSeconds;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const hundredths = Math.floor((totalSeconds - Math.floor(totalSeconds)) * 100);

  // Format as mm:ss.hh with leading zeros
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${hundredths.toString().padStart(2, '0')}`;
};

// Sort entries by run order (exhibitorOrder or armband)
export const sortByRunOrder = (entries: Entry[]): Entry[] => {
  return [...entries].sort((a, b) => {
    const aOrder = a.exhibitorOrder ?? a.armband;
    const bOrder = b.exhibitorOrder ?? b.armband;
    return aOrder - bOrder;
  });
};

// Sort entries by placement for results sheet
// Qualified entries with numbered placements first, then Absent/Excused/NQ
export const sortByPlacement = (entries: Entry[]): Entry[] => {
  return [...entries].sort((a, b) => {
    const aResultText = a.resultText?.toLowerCase() || '';
    const bResultText = b.resultText?.toLowerCase() || '';

    // Check if entry is qualified (has numbered placement and qualified status)
    const aIsQualified = (aResultText === 'q' || aResultText === 'qualified') && a.placement;
    const bIsQualified = (bResultText === 'q' || bResultText === 'qualified') && b.placement;

    // Check for special non-qualifying statuses
    const aIsAbsent = aResultText === 'absent';
    const bIsAbsent = bResultText === 'absent';
    const aIsExcused = aResultText === 'excused';
    const bIsExcused = bResultText === 'excused';

    // Qualified entries with numbered placements come first
    if (aIsQualified && !bIsQualified) return -1;
    if (!aIsQualified && bIsQualified) return 1;

    // Both qualified - sort by placement number
    if (aIsQualified && bIsQualified) {
      return (a.placement || 0) - (b.placement || 0);
    }

    // Neither qualified - sort by status priority: Absent → Excused → NQ
    // Absent comes first
    if (aIsAbsent && !bIsAbsent) return -1;
    if (!aIsAbsent && bIsAbsent) return 1;

    // Excused comes second
    if (aIsExcused && !bIsExcused) return -1;
    if (!aIsExcused && bIsExcused) return 1;

    // NQ comes last (or same status)
    // For same status, sort by armband
    return a.armband - b.armband;
  });
};

// Get placement display text (number for qualified, status for non-qualified)
export const getPlacementText = (entry: Entry): string => {
  const placement = entry.placement;

  // No placement
  if (!placement) return '';

  // Qualified entries have placement 1, 2, 3, 4... (all qualified dogs get a number)
  if (placement < 9000) {
    return placement.toString();
  }

  // Special codes for non-qualifying statuses (from database function)
  if (placement === 9995) return 'EXC'; // Excluded
  if (placement === 9996) return 'NQ';
  if (placement === 9997) return 'ABS'; // Absent
  if (placement === 9998) return 'EX';  // Excused
  if (placement === 9999) return 'WD';  // Withdrawn
  if (placement === 10000) return 'DQ'; // Disqualified
  if (placement === 10001) return 'COMP'; // Completed

  return '';
};

// Get result status text (Qualified/NQ/Absent/etc.)
export const getResultStatusText = (entry: Entry): string => {
  const resultText = entry.resultText?.toLowerCase();

  if (!resultText) return '';

  if (resultText === 'q' || resultText === 'qualified') return 'Qualified';
  if (resultText === 'nq') return 'NQ';
  if (resultText === 'absent') return 'Absent';
  if (resultText === 'excused') return 'Excused';
  if (resultText === 'withdrawn') return 'Withdrawn';

  return entry.resultText || '';
};

// Check if entry is qualified
export const isQualified = (entry: Entry): boolean => {
  const resultText = entry.resultText?.toLowerCase();
  return resultText === 'q' || resultText === 'qualified';
};

// Count qualified entries
export const countQualified = (entries: Entry[]): number => {
  return entries.filter(isQualified).length;
};

// Get organization-specific title prefix
export const getOrgTitle = (element?: string): string => {
  if (!element) return '';

  const elementLower = element.toLowerCase();

  if (elementLower.includes('scent') || elementLower.includes('nose')) {
    return 'AKC Scent Work';
  }
  if (elementLower.includes('rally')) {
    return 'UKC Rally';
  }
  if (elementLower.includes('obedience')) {
    return 'UKC Obedience';
  }
  if (elementLower.includes('agility')) {
    return 'UKC Agility';
  }
  if (elementLower.includes('fastcat')) {
    return 'AKC FastCAT';
  }

  return 'Dog Sport';
};

// Generate show identifier (based on date and trial number)
export const generateShowIdentifier = (trialDate: string, trialNumber: string): string => {
  const date = new Date(trialDate + 'T00:00:00');
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const trial = trialNumber.replace(/\D/g, '').padStart(2, '0');

  return `${year}${month}${day}${trial}`;
};
