import type { ReportEntry } from './types';

/**
 * Report utility functions for myK9Show report generation.
 * Ported from myK9Q's reportUtils, adapted for the ReportEntry type.
 */

export function formatReportDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  return `${month}/${day}/${year}`;
}

export function formatReportTime(time: string | number | null | undefined): string {
  if (time == null || time === '') return '';

  const timeInSeconds = typeof time === 'string' ? parseFloat(time) : time;

  if (isNaN(timeInSeconds)) return '';

  const minutes = Math.floor(timeInSeconds / 60);
  const seconds = Math.floor(timeInSeconds % 60);
  const hundredths = Math.floor((timeInSeconds - Math.floor(timeInSeconds)) * 100);

  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${hundredths.toString().padStart(2, '0')}`;
}

export function formatTimeLimit(seconds: number | null | undefined): string {
  if (seconds == null) return '';

  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `${mins}:${String(secs).padStart(2, '0')}` : `${mins} min`;
}

export function sortByRunOrder(entries: ReportEntry[]): ReportEntry[] {
  return [...entries].sort((a, b) => {
    const aOrder = a.runOrder ?? a.armband;
    const bOrder = b.runOrder ?? b.armband;
    return aOrder - bOrder;
  });
}

export function sortByArmband(entries: ReportEntry[]): ReportEntry[] {
  return [...entries].sort((a, b) => a.armband - b.armband);
}

// Qualified first (by placement #), then absent > excused > NQ, tiebreak by armband
export function sortByPlacement(entries: ReportEntry[]): ReportEntry[] {
  return [...entries].sort((a, b) => {
    const aResultText = a.resultText?.trim().toLowerCase() || '';
    const bResultText = b.resultText?.trim().toLowerCase() || '';

    const aIsQualified = (aResultText === 'q' || aResultText === 'qualified') && a.finalPlacement;
    const bIsQualified = (bResultText === 'q' || bResultText === 'qualified') && b.finalPlacement;

    const aIsAbsent = aResultText === 'absent';
    const bIsAbsent = bResultText === 'absent';
    const aIsExcused = aResultText === 'excused';
    const bIsExcused = bResultText === 'excused';

    // Qualified entries with numbered placements come first
    if (aIsQualified && !bIsQualified) return -1;
    if (!aIsQualified && bIsQualified) return 1;

    // Both qualified - sort by placement number
    if (aIsQualified && bIsQualified) {
      return (a.finalPlacement || 0) - (b.finalPlacement || 0);
    }

    // Neither qualified - sort by status priority: Absent > Excused > NQ
    if (aIsAbsent && !bIsAbsent) return -1;
    if (!aIsAbsent && bIsAbsent) return 1;

    if (aIsExcused && !bIsExcused) return -1;
    if (!aIsExcused && bIsExcused) return 1;

    // Same status - sort by armband
    return a.armband - b.armband;
  });
}

export function getPlacementText(entry: ReportEntry): string {
  const placement = entry.finalPlacement;

  if (!placement) return '';

  if (placement < 9000) {
    return placement.toString();
  }

  // 9995+ are special placement codes from the database scoring function
  if (placement === 9995) return 'EXC';
  if (placement === 9996) return 'NQ';
  if (placement === 9997) return 'ABS';
  if (placement === 9998) return 'EX';
  if (placement === 9999) return 'WD';
  if (placement === 10000) return 'DQ';
  if (placement === 10001) return 'COMP';

  return '';
}

export function getResultStatusText(entry: ReportEntry): string {
  const resultText = entry.resultText?.toLowerCase();

  if (!resultText) return '';

  if (resultText === 'q' || resultText === 'qualified') return 'Qualified';
  if (resultText === 'nq') return 'NQ';
  if (resultText === 'absent') return 'Absent';
  if (resultText === 'excused') return 'Excused';
  if (resultText === 'withdrawn') return 'Withdrawn';

  return entry.resultText || '';
}

export function isQualified(entry: ReportEntry): boolean {
  const resultText = entry.resultText?.toLowerCase();
  return resultText === 'q' || resultText === 'qualified';
}

export function countQualified(entries: ReportEntry[]): number {
  return entries.filter(isQualified).length;
}

/** Build the organization title for report headers */
export function buildReportOrgTitle(
  organization?: string,
  activityType?: string,
  element?: string
): string {
  if (organization && activityType) return `${organization} ${activityType}`;
  if (organization) return `${organization} ${element ?? ''}`;
  return getOrgTitle(element);
}

/** Check if a section value is displayable (not null, empty, or '-') */
export function isValidSection(section?: string | null): boolean {
  return section != null && section !== '-' && section.trim() !== '';
}

export function getOrgTitle(element?: string): string {
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
}

export function sortByHandler(entries: ReportEntry[]): ReportEntry[] {
  return [...entries].sort((a, b) => a.handler.localeCompare(b.handler));
}

export function sortByBreed(entries: ReportEntry[]): ReportEntry[] {
  return [...entries].sort((a, b) => a.breed.localeCompare(b.breed));
}

export function mapDbEntryToReportEntry(
  dbEntry: {
    id: string;
    armband: number | null;
    run_order: number | null;
    check_in_status: string | null;
    section: string | null;
    is_scored: boolean | null;
    result_status: string | null;
    search_time_seconds: number | null;
    total_faults: number | null;
    final_placement: number | null;
  },
  dogName: string,
  breed: string,
  handler: string,
  registrationNumber: string | null
): ReportEntry {
  return {
    id: dbEntry.id,
    armband: dbEntry.armband ?? 0,
    runOrder: dbEntry.run_order,
    callName: dogName,
    breed,
    handler,
    registrationNumber,
    checkInStatus: dbEntry.check_in_status,
    section: dbEntry.section,
    isScored: dbEntry.is_scored ?? false,
    resultText: dbEntry.result_status,
    searchTimeSeconds: dbEntry.search_time_seconds,
    totalFaults: dbEntry.total_faults,
    finalPlacement: dbEntry.final_placement,
  };
}
