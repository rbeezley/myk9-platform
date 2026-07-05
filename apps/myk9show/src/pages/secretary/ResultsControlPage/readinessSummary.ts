import type { SyncableClassData, SyncableEntryData } from '@/store/classStore';

export interface ResultsReadinessSummary {
  totalClasses: number;
  totalEntries: number;
  unscoredEntries: number;
  unreleasedClasses: number;
  safeToSend: boolean;
}

function hasResult(entry: SyncableEntryData): boolean {
  const status = String(entry.status ?? '')
    .trim()
    .toLowerCase();

  return (
    Boolean(entry.score || entry.time || entry.placement) ||
    (status !== '' && status !== 'pending' && status !== 'no result')
  );
}

export function buildResultsReadinessSummary(
  classes: SyncableClassData[],
  entries: SyncableEntryData[]
): ResultsReadinessSummary {
  const classIds = new Set(classes.map(cls => cls.id));
  const relevantEntries = entries.filter(entry => classIds.has(entry.classId));
  const unscoredEntries = relevantEntries.filter(entry => !hasResult(entry)).length;
  const unreleasedClasses = classes.filter(cls => !cls.results_released_at).length;

  return {
    totalClasses: classes.length,
    totalEntries: relevantEntries.length,
    unscoredEntries,
    unreleasedClasses,
    safeToSend: classes.length > 0 && unscoredEntries === 0 && unreleasedClasses === 0,
  };
}
