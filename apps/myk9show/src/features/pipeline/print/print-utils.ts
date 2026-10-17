/**
 * Utility functions for print report generation.
 * Adapted from myK9Q's reportUtils.ts to work with PrintReportEntry.
 */

import { formatTimeLimitSeconds } from '@myk9/core';
import { armbandSortKey } from '@myk9/ringside';
import { splitSecondsToCentis } from '@/lib/format/searchTime';
import { placementRank } from '@/lib/reports/reportUtils';
import type { PrintReportEntry } from './print-types';

/** Format ISO date string as "M/D/YYYY" for reports */
export const formatReportDate = (dateStr: string): string => {
  const [year, month, day] = dateStr.split('T')[0].split('-').map(Number);
  return `${month}/${day}/${year}`;
};

/** Format seconds as "MM:SS.hh" for time display */
export const formatReportTime = (seconds: number | null): string => {
  if (seconds == null || isNaN(seconds)) return '';
  const { minutes, seconds: secs, centis } = splitSecondsToCentis(seconds);
  return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${centis.toString().padStart(2, '0')}`;
};

/** Sort entries by run order (runOrder, then armband) */
export const sortByRunOrder = (entries: PrintReportEntry[]): PrintReportEntry[] =>
  [...entries].sort(
    (a, b) => (a.runOrder ?? armbandSortKey(a.armband)) - (b.runOrder ?? armbandSortKey(b.armband))
  );

/** Sort entries by armband number */
export const sortByArmband = (entries: PrintReportEntry[]): PrintReportEntry[] =>
  [...entries].sort((a, b) => armbandSortKey(a.armband) - armbandSortKey(b.armband));

/**
 * Placed entries first, by placement; everyone else (ABS, EXC, NQ, pending) after, by armband.
 * Same rule as the on-screen Results rows and `lib/reports/reportUtils.sortByPlacement` (MYK9-1234).
 */
export const sortByPlacement = (entries: PrintReportEntry[]): PrintReportEntry[] => {
  return [...entries].sort((a, b) => {
    const aRank = placementRank(a.placement);
    const bRank = placementRank(b.placement);
    if (aRank !== null && bRank !== null && aRank !== bRank) return aRank - bRank;
    if ((aRank === null) !== (bRank === null)) return aRank === null ? 1 : -1;
    return armbandSortKey(a.armband) - armbandSortKey(b.armband);
  });
};

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
