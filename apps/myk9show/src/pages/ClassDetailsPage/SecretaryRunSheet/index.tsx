import type { ClassData } from '@/components/classes/types/classTypes';
import type { ClassInput } from '@/store/classStore.types';
import type { RawEntryRow } from '@/hooks/queries/useClassEntriesRaw';
import { ClassHeaderCard } from './ClassHeaderCard';
import { RunOrderBar } from './RunOrderBar';
import { RunSheetRow } from './RunSheetRow';
import { useRunSheetState } from './useRunSheetState';

interface SecretaryRunSheetProps {
  currentClass: ClassData;
  dbRawEntries: RawEntryRow[];
  updateClass: (id: string, updates: Partial<ClassInput>) => Promise<unknown>;
  userId: string;
}

export function SecretaryRunSheet({
  currentClass,
  dbRawEntries,
  updateClass,
  userId,
}: SecretaryRunSheetProps) {
  const {
    sortMode,
    onSort,
    expandedId,
    setExpandedId,
    classPhase,
    sortedEntries,
    onCheckIn,
    onScratch,
    onSaveResult,
    onStartClass,
    onCloseClass,
  } = useRunSheetState({ rawEntries: dbRawEntries, currentClass, updateClass, userId });

  const timeLimit = currentClass.timeLimit1 ?? '–';

  return (
    <>
      <ClassHeaderCard
        element={currentClass.element ?? 'Container'}
        level={currentClass.level ?? ''}
        judge={currentClass.judge}
        startTime={currentClass.startTime ?? '–'}
        timeLimit={timeLimit}
        entries={sortedEntries}
        classPhase={classPhase}
        onStartClass={onStartClass}
        onCloseClass={onCloseClass}
      />

      <RunOrderBar sortMode={sortMode} onSort={onSort} />

      <div className="space-y-2.5">
        {sortedEntries.map((entry, idx) => (
          <RunSheetRow
            key={entry.id}
            entry={entry}
            position={idx + 1}
            expanded={expandedId === entry.id}
            timeLimit={timeLimit}
            onToggleExpand={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
            onCheckIn={checked => onCheckIn(entry.id, checked)}
            onScratch={scratched => onScratch(entry.id, scratched)}
            onSaveResult={result => onSaveResult(entry.id, result)}
          />
        ))}
        {sortedEntries.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">
            No entries in this class.
          </p>
        )}
      </div>
    </>
  );
}
