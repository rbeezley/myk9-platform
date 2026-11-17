import type { ReportDbEntry } from '@/lib/reports/types';
import type { DbClass, DbEntry, DbTrial } from '@/types/database-mappings';
import type { PrintedSheetRows } from '@/features/show-map/cockpit/printedSheetDescriptor';

/**
 * The rows the printed sheets read (`usePrintedSheetEntries`), built from the class and entry
 * fixtures a paperwork test already holds (MYK9-2103). One trial is invented per distinct
 * `trial_id`, so a fixture that never named its trials still prints under one.
 */
export function printedSheetRowsOf(
  classes: readonly DbClass[],
  entries: readonly DbEntry[],
  trials?: readonly DbTrial[]
): PrintedSheetRows {
  const trialIds = [...new Set(classes.map(item => item.trial_id).filter(Boolean))] as string[];
  return {
    trials:
      trials ??
      trialIds.map(
        id =>
          ({
            id,
            name: `Trial ${id}`,
            trial_number: id,
            date: '2026-12-07',
            registry_id: 'AKC',
          }) as unknown as DbTrial
      ),
    classes,
    entries: entries as unknown as readonly ReportDbEntry[],
  };
}
