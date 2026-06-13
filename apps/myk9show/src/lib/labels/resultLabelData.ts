import type { ReportEntry } from '@/lib/reports/types';
import { sortByPlacement, sortByArmband, formatReportTime } from '@/lib/reports/reportUtils';

// Placements at/above this sentinel are status codes (NQ/Absent/Excused), not
// real placements, so they must not print as a "Place: 9996" on a label.
const NQ_SENTINEL = 9000;

export interface ResultLabelItem {
  id: string;
  armband: number;
  callName: string;
  handler: string;
  clubName?: string;
  showName: string;
  /** e.g. "Trial 1 — Container Novice A" */
  trialClassLine: string;
  /** Real placement as a string, or null when not placed / not scored. */
  placement: string | null;
  /** Formatted search time (e.g. "0:47"), or "" when none. */
  timeStr: string;
  faults: number | null;
  /** Whether the entry has any printable result (place/time/faults). */
  hasResults: boolean;
}

export interface ResultLabelContext {
  showName: string;
  clubName?: string;
  /** Fallbacks used when an entry doesn't carry its own class/trial context. */
  trialNumber?: string;
  classElement?: string;
  classLevel?: string;
  classSection?: string;
}

function formatPlacement(entry: ReportEntry): string | null {
  if (!entry.isScored || entry.finalPlacement == null || entry.finalPlacement >= NQ_SENTINEL) {
    return null;
  }
  return String(entry.finalPlacement);
}

/**
 * Map scored entries to fixed-shape label items for the result-label sheet.
 * Per-entry class/trial context is preferred (works for all-scope printing);
 * the context fallbacks cover single-class scope where entries omit it.
 */
export function prepareResultLabelItems(
  entries: ReportEntry[],
  sortOrder: string,
  ctx: ResultLabelContext
): ResultLabelItem[] {
  const sorted = sortOrder === 'armband' ? sortByArmband(entries) : sortByPlacement(entries);

  return sorted.map(entry => {
    const placement = formatPlacement(entry);
    const timeStr = formatReportTime(entry.searchTimeSeconds);

    // Use the entry's own class context as a UNIT when it carries one, so an
    // entry whose class genuinely has no section doesn't inherit the fallback
    // context's section. Only entries with no class context at all use ctx.
    const hasEntryClass = !!(entry.classElement || entry.classLevel || entry.classSection);
    const element = hasEntryClass ? (entry.classElement ?? '') : (ctx.classElement ?? '');
    const level = hasEntryClass ? (entry.classLevel ?? '') : (ctx.classLevel ?? '');
    const section = hasEntryClass ? (entry.classSection ?? '') : (ctx.classSection ?? '');
    const trialNumber = entry.trialNumber || ctx.trialNumber || '';

    const classLine = [element, level, section].filter(Boolean).join(' ');
    const trialClassLine = [trialNumber ? `Trial ${trialNumber}` : null, classLine]
      .filter(Boolean)
      .join(' — ');

    const hasResults =
      entry.isScored && (placement !== null || timeStr !== '' || entry.totalFaults !== null);

    return {
      id: entry.id,
      armband: entry.armband,
      callName: entry.callName,
      handler: entry.handler,
      ...(ctx.clubName ? { clubName: ctx.clubName } : {}),
      showName: ctx.showName,
      trialClassLine,
      placement,
      timeStr,
      faults: entry.totalFaults,
      hasResults,
    };
  });
}
