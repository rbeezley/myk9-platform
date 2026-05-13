import type { ClassData } from '@/components/classes/types/classTypes';
import type { RawEntryRow } from '@/hooks/queries/useClassEntriesRaw';
import { getPaperScoringEntryHref } from '@/pages/scoring/scoringRoutes';
import type { Dog } from '@/types/dog-types';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useNavigate } from 'react-router-dom';
import { useMemo } from 'react';
import { RunOrderBar } from './RunOrderBar';
import { RunSheetRow } from './RunSheetRow';
import { useRunSheetState } from './useRunSheetState';
import { useRunOrderDrag } from '@/components/classes/ClassResultsTable/useRunOrderDrag';

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
  const { orderedIds, sensors, onDragEnd } = useRunOrderDrag({ rawEntries: dbRawEntries });
  const entriesById = useMemo(
    () => new Map(sortedEntries.map(entry => [entry.id, entry])),
    [sortedEntries]
  );
  const orderedEntries = useMemo(() => {
    if (sortMode !== 'runOrder') return sortedEntries;
    const entriesFromOrder = orderedIds
      .map(id => entriesById.get(id))
      .filter((entry): entry is (typeof sortedEntries)[number] => Boolean(entry));
    if (entriesFromOrder.length !== sortedEntries.length) return sortedEntries;
    return entriesFromOrder;
  }, [entriesById, orderedIds, sortMode, sortedEntries]);
  const dragEnabled = sortMode === 'runOrder';

  return (
    <div className="mt-6">
      <RunOrderBar sortMode={sortMode} onSort={onSort} />

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext
          items={orderedEntries.map(entry => entry.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2.5">
            {orderedEntries.map((entry, idx) => (
              <RunSheetRow
                key={entry.id}
                entry={entry}
                position={idx + 1}
                onScoreEntry={() => navigate(getPaperScoringEntryHref(currentClass.id, entry.id))}
                onCheckInStatus={status => onCheckInStatus(entry.id, status)}
                isMine={myEntryIds.has(entry.id)}
                draggable={dragEnabled}
              />
            ))}
            {orderedEntries.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">
                No entries in this class.
              </p>
            )}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
