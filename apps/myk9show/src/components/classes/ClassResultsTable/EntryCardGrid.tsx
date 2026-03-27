import { useMemo } from 'react';
import type { ScentWorkEntry } from '@/types/scent-work-types';
import { EntryCard, type EntryCardEntry } from './EntryCard';

interface EntryCardGridProps {
  entries: ScentWorkEntry[];
  classId: string;
}

function toCardEntry(entry: ScentWorkEntry): EntryCardEntry {
  return {
    entryId: entry.id,
    armband: entry.displayInfo.armband,
    dogName: entry.displayInfo.dogName,
    dogBreed: entry.displayInfo.dogBreed,
    handlerName: entry.displayInfo.handlerName,
    status: 'no-status',
  };
}

export function EntryCardGrid({ entries, classId }: EntryCardGridProps) {
  const cardEntries = useMemo(() => entries.map(toCardEntry), [entries]);

  if (cardEntries.length === 0) {
    return <div className="py-12 text-center text-muted-foreground">No entries in this class.</div>;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
      {cardEntries.map(entry => (
        <EntryCard
          key={entry.entryId}
          entry={entry}
          scoringRoute={`/scoring/classes/${classId}/entries/${entry.entryId}`}
        />
      ))}
    </div>
  );
}
