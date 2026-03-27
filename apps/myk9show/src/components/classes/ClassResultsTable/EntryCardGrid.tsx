import { useMemo } from 'react';
import type { ScentWorkEntry } from '@/types/scent-work-types';
import { EntryCard, type EntryCardEntry } from './EntryCard';
import type { EntryStatus } from './entryStatusConfig';

interface EntryCardGridProps {
  entries: ScentWorkEntry[];
  classId: string;
  useSecretaryRoute: boolean;
}

function toCardEntry(entry: ScentWorkEntry): EntryCardEntry {
  return {
    entryId: entry.id,
    armband: entry.displayInfo.armband,
    dogName: entry.displayInfo.dogName,
    dogBreed: entry.displayInfo.dogBreed,
    handlerName: entry.displayInfo.handlerName,
    // Default to no_status until check-in system is built
    status: 'no_status' as EntryStatus,
  };
}

function buildScoringRoute(classId: string, entryId: string, useSecretaryRoute: boolean): string {
  return useSecretaryRoute
    ? `/scoring/secretary/classes/${classId}/entries/${entryId}`
    : `/scoring/classes/${classId}/entries/${entryId}`;
}

export function EntryCardGrid({ entries, classId, useSecretaryRoute }: EntryCardGridProps) {
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
          scoringRoute={buildScoringRoute(classId, entry.entryId, useSecretaryRoute)}
        />
      ))}
    </div>
  );
}
