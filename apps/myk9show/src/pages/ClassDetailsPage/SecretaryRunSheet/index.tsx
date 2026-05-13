import type { ClassData } from '@/components/classes/types/classTypes';
import type { RawEntryRow } from '@/hooks/queries/useClassEntriesRaw';
import { getPaperScoringEntryHref } from '@/pages/scoring/scoringRoutes';
import { useNavigate } from 'react-router-dom';
import { RunOrderBar } from './RunOrderBar';
import { RunSheetRow } from './RunSheetRow';
import { useRunSheetState } from './useRunSheetState';

interface SecretaryRunSheetProps {
  currentClass: ClassData;
  dbRawEntries: RawEntryRow[];
  userId: string;
  myEntryIds?: Set<string>;
}

export function SecretaryRunSheet({
  currentClass,
  dbRawEntries,
  userId,
  myEntryIds = new Set(),
}: SecretaryRunSheetProps) {
  const navigate = useNavigate();
  const { sortMode, onSort, sortedEntries, onCheckIn, onScratch } = useRunSheetState({
    rawEntries: dbRawEntries,
    classId: currentClass.id,
    userId,
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
            onCheckIn={checked => onCheckIn(entry.id, checked)}
            onScratch={scratched => onScratch(entry.id, scratched)}
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
