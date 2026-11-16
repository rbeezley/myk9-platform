import { dropExportColumns, exportRowsCsv } from '@/utils/downloadCsv';
import type { ScoringRow } from './types';

/** The one results export: the header Actions "Export CSV" and the guest link both run it. */
export const CLASS_RESULTS_EXPORT_HEADERS = [
  'Armband',
  'Dog',
  'Handler',
  'Placement',
  'Qualification',
  'Search Time',
  'Faults',
  'Check-in',
] as const;

/** MYK9-2089: where the UKC element time sits in the export, right after Search Time. */
const ELEMENT_TIME_HEADER = 'Element Time';

export function classResultsExportRows(
  rows: readonly ScoringRow[],
  includeElementTime = false
): (string | number | null)[][] {
  return rows.map(row => [
    row.armband,
    row.dogName,
    row.handlerName,
    row.placement,
    row.qualification,
    row.searchTime,
    ...(includeElementTime ? [row.elementTime ?? ''] : []),
    row.faults,
    row.checkInStatus,
  ]);
}

interface GuestColumnState {
  showPlacement: boolean;
  showQualification: boolean;
  showTime: boolean;
  showFaults: boolean;
  /** The table has no Check-in column on the Completed tab. */
  checkInColumnShown: boolean;
}

/**
 * Export columns the public results table does NOT render for a guest: the fields the class's
 * visibility settings hide (cells show a pending dash) and Check-in where the table drops it. A
 * guest's CSV leaves these out so it carries only what the table shows (MYK9-993).
 */
export function guestResultsOmit(state: GuestColumnState): string[] {
  const omit: string[] = [];
  if (!state.showPlacement) omit.push('Placement');
  if (!state.showQualification) omit.push('Qualification');
  if (!state.showTime) omit.push('Search Time', ELEMENT_TIME_HEADER);
  if (!state.showFaults) omit.push('Faults');
  if (!state.checkInColumnShown) omit.push('Check-in');
  return omit;
}

/** The class has a UKC element time on at least one run, so the table shows the column. */
export function classHasElementTime(rows: readonly ScoringRow[]): boolean {
  return rows.some(row => !!row.elementTime);
}

export function exportClassResults(
  rows: readonly ScoringRow[],
  omit: readonly string[] = [],
  includeElementTime = false
) {
  const headers = includeElementTime
    ? CLASS_RESULTS_EXPORT_HEADERS.flatMap(h =>
        h === 'Search Time' ? [h, ELEMENT_TIME_HEADER] : [h]
      )
    : CLASS_RESULTS_EXPORT_HEADERS;
  const { headers: keptHeaders, rows: cells } = dropExportColumns(
    headers,
    classResultsExportRows(rows, includeElementTime),
    omit
  );
  exportRowsCsv('class-results', keptHeaders, cells);
}
