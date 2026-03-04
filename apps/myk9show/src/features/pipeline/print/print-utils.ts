/**
 * Utility functions for print report generation.
 * Adapted from myK9Q's reportUtils.ts to work with PrintReportEntry.
 */

import { formatTimeLimitSeconds } from '@myk9/core';
import type { PrintReportEntry } from './print-types';

/** Format ISO date string as "M/D/YYYY" for reports */
export const formatReportDate = (dateStr: string): string => {
  const [year, month, day] = dateStr.split('T')[0].split('-').map(Number);
  return `${month}/${day}/${year}`;
};

/** Format seconds as "MM:SS.hh" for time display */
export const formatReportTime = (seconds: number | null): string => {
  if (seconds == null || isNaN(seconds)) return '';
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const hundredths = Math.floor((seconds - Math.floor(seconds)) * 100);
  return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${hundredths.toString().padStart(2, '0')}`;
};

/** Sort entries by run order (runOrder, then armband) */
export const sortByRunOrder = (entries: PrintReportEntry[]): PrintReportEntry[] =>
  [...entries].sort((a, b) => (a.runOrder ?? a.armband) - (b.runOrder ?? b.armband));

/** Sort entries by armband number */
export const sortByArmband = (entries: PrintReportEntry[]): PrintReportEntry[] =>
  [...entries].sort((a, b) => a.armband - b.armband);

/** Sort entries by placement: Q first by placement, then ABS/EXC/NQ, then by armband */
export const sortByPlacement = (entries: PrintReportEntry[]): PrintReportEntry[] =>
  [...entries].sort((a, b) => {
    const aQ = isQualified(a.resultText);
    const bQ = isQualified(b.resultText);
    if (aQ && !bQ) return -1;
    if (!aQ && bQ) return 1;
    if (aQ && bQ) return (a.placement ?? 0) - (b.placement ?? 0);

    // Neither qualified — sort by status priority: ABS → EXC → NQ → other
    const priority = (rt: string | null): number => {
      const t = rt?.toLowerCase();
      if (t === 'absent') return 0;
      if (t === 'excused') return 1;
      if (t === 'nq') return 2;
      return 3;
    };
    const diff = priority(a.resultText) - priority(b.resultText);
    return diff !== 0 ? diff : a.armband - b.armband;
  });

/**
 * Decode placement number to display text.
 * Sentinel codes: 9995=EXC, 9996=NQ, 9997=ABS, 9998=EX, 9999=WD, 10000=DQ, 10001=COMP
 */
export const getPlacementText = (placement: number | null): string => {
  if (placement == null) return '';
  if (placement < 9000) return placement.toString();
  const sentinels: Record<number, string> = {
    9995: 'EXC',
    9996: 'NQ',
    9997: 'ABS',
    9998: 'EX',
    9999: 'WD',
    10000: 'DQ',
    10001: 'COMP',
  };
  return sentinels[placement] ?? '';
};

/** Normalize result text to display string */
export const getResultStatusText = (resultText: string | null): string => {
  if (!resultText) return '';
  const map: Record<string, string> = {
    q: 'Qualified',
    qualified: 'Qualified',
    nq: 'NQ',
    absent: 'Absent',
    excused: 'Excused',
    withdrawn: 'Withdrawn',
  };
  return map[resultText.toLowerCase()] ?? resultText;
};

/** Check if result text indicates a qualifying result */
export const isQualified = (resultText: string | null): boolean => {
  const t = resultText?.toLowerCase();
  return t === 'q' || t === 'qualified';
};

/** Count qualified entries */
export const countQualified = (entries: PrintReportEntry[]): number =>
  entries.filter(e => isQualified(e.resultText)).length;

/** Re-export formatTimeLimitSeconds from @myk9/core as formatTimeLimit */
export { formatTimeLimitSeconds as formatTimeLimit };
