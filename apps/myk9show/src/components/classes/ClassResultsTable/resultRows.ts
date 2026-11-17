/**
 * Read-only display rows for the class page's results table. Raw DB rows are the source of truth;
 * nothing here writes. A class is run on Show Desk, never from this page.
 */
import type { ScentWorkEntry } from '@/types/scent-work-types';
import type { RawEntryRow } from '@/hooks/queries/useClassEntriesRaw';
import { mapResultStatusToQualification, dbSecondsToInputFormat } from '@/utils/scoringMappings';
import type { ScoringRow } from './types';

export function buildResultRows(
  entries: readonly ScentWorkEntry[],
  rawEntries: readonly RawEntryRow[]
): ScoringRow[] {
  const rawMap = new Map(rawEntries.map(r => [r.id, r]));
  return entries.map(entry => {
    const raw = rawMap.get(entry.id);
    // MYK9-969: a private result's faults arrive NULL because they are withheld, not because
    // they are zero. Never show a fabricated 0.
    const faults =
      raw?.total_faults != null
        ? String(raw.total_faults)
        : raw?.results_private === true
          ? ''
          : '0';
    return {
      entryId: entry.id,
      armband: (raw?.armband as string) || entry.displayInfo?.armband || '',
      dogName: raw?.dog?.call_name || raw?.dog?.name || entry.displayInfo?.dogName || 'Unknown Dog',
      dogBreed: raw?.dog?.breed || entry.displayInfo?.dogBreed || '',
      handlerName: (raw?.handler as string) || entry.displayInfo?.handlerName || '',
      qualification: mapResultStatusToQualification(raw?.result_status),
      qualificationReason: raw?.disqualification_reason ?? '',
      searchTime: dbSecondsToInputFormat(raw?.search_time_seconds),
      faults,
      placement: raw?.final_placement ?? null,
      isScored:
        raw?.is_scored === true || (!!raw?.result_status && raw.result_status !== 'pending'),
      resultsPrivate: raw?.results_private === true,
    };
  });
}
