import type { ClassData } from '@/components/classes/types/classTypes';
import type { RawEntryRow } from '@/hooks/queries/useClassEntriesRaw';
import { getPaperScoringEntryHref } from '@/pages/scoring/scoringRoutes';
import type { Dog } from '@/types/dog-types';
import { useNavigate } from 'react-router-dom';
import { RunOrderBar } from './RunOrderBar';
import { RunSheetRow } from './RunSheetRow';
import { useRunSheetState } from './useRunSheetState';

interface SecretaryRunSheetProps {
  currentClass: ClassData;
  dbRawEntries: RawEntryRow[];
  userId: string;
  myEntryIds?: Set<string>;
  dogs: Dog[];
  organization?: string | null;
}

export function SecretaryRunSheet({
  currentClass,
  dbRawEntries,
  userId,
  myEntryIds = new Set(),
  dogs,
  organization,
}: SecretaryRunSheetProps) {
  const navigate = useNavigate();
  const { sortMode, onSort, sortedEntries, onCheckInStatus } = useRunSheetState({
    rawEntries: dbRawEntries,
    classId: currentClass.id,
    userId,
    dogs,
    organization,
  });

  return (
    <div className="mt-6">
      <RunOrderBar sortMode={sortMode} onSort={onSort} />

      <div className="space-y-2.5">
        {sortedEntries.map((entry, idx) => (
          <RunSheetRow
            key={entry.id}
            entry={entry}
            position={idx + 1}
            onScoreEntry={() => navigate(getPaperScoringEntryHref(currentClass.id, entry.id))}
            onCheckInStatus={status => onCheckInStatus(entry.id, status)}
            isMine={myEntryIds.has(entry.id)}
          />
        ))}
        {sortedEntries.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">
            No entries in this class.
          </p>
        )}
      </div>
    </div>
  );
}
