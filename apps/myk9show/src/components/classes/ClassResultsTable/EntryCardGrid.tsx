import { useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { ScentWorkEntry } from '@/types/scent-work-types';
import { EntryCard, type EntryCardEntry } from './EntryCard';
import { REORDER_TRANSITION, reorderLayoutMode } from './reorderLayoutMode';

interface EntryCardGridProps {
  entries: ScentWorkEntry[];
  classId: string;
  onStatusClick?: ((entry: EntryCardEntry) => void) | undefined;
}

function toCardEntry(entry: ScentWorkEntry): EntryCardEntry {
  return {
    entryId: entry.id,
    armband: entry.displayInfo.armband,
    dogName: entry.displayInfo.dogName,
    dogBreed: entry.displayInfo.dogBreed,
    handlerName: entry.displayInfo.handlerName,
    status: entry.checkInStatus ?? 'no-status',
  };
}

export function EntryCardGrid({ entries, classId, onStatusClick }: EntryCardGridProps) {
  const cardEntries = useMemo(() => entries.map(toCardEntry), [entries]);
  const prefersReducedMotion = useReducedMotion();
  const layout = reorderLayoutMode(prefersReducedMotion);

  if (cardEntries.length === 0) {
    return <div className="py-12 text-center text-muted-foreground">No entries in this class.</div>;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
      {cardEntries.map(entry => (
        <motion.div key={entry.entryId} layout={layout} transition={REORDER_TRANSITION}>
          <EntryCard
            entry={entry}
            scoringRoute={`/scoring/classes/${classId}/entries/${entry.entryId}`}
            {...(onStatusClick != null && { onStatusClick })}
          />
        </motion.div>
      ))}
    </div>
  );
}
