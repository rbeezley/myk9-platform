/**
 * DogStrip — horizontal scrolling row of dog cards for the My Shows page.
 *
 * Fetches entries directly so it doesn't need to share types with the parent.
 * React Query deduplicates the fetch — no extra network call.
 */

import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { PawPrint } from 'lucide-react';
import { useEntriesQuery } from '@/hooks/queries/useEntriesDatabase';
import { DogStripCard } from './DogStripCard';

interface Dog {
  id: string;
  call_name?: string;
  name?: string;
  breed?: string;
}

interface DogStripProps {
  dogs: Dog[];
}

export const DogStrip: React.FC<DogStripProps> = ({ dogs }) => {
  const navigate = useNavigate();
  const { data: rawEntries = [] } = useEntriesQuery();

  const upcomingCountByDog = useMemo(() => {
    const now = new Date();
    const counts: Record<string, number> = {};
    for (const entry of rawEntries as Array<{ dog_id: string; show?: { start_date?: string } }>) {
      const showDate = entry.show?.start_date ? new Date(entry.show.start_date) : null;
      if (showDate && showDate > now) {
        counts[entry.dog_id] = (counts[entry.dog_id] ?? 0) + 1;
      }
    }
    return counts;
  }, [rawEntries]);

  if (dogs.length === 0) return null;

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
        My Dogs
      </p>
      <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
        {dogs.map(dog => (
          <DogStripCard
            key={dog.id}
            dogId={dog.id}
            dogName={dog.call_name ?? dog.name ?? 'Unknown'}
            breed={dog.breed ?? ''}
            upcomingCount={upcomingCountByDog[dog.id] ?? 0}
          />
        ))}
        <button
          type="button"
          onClick={() => navigate('/dogs')}
          className="flex-shrink-0 w-40 rounded-xl border border-dashed border-border p-3 flex flex-col items-center justify-center gap-1 text-muted-foreground hover:bg-accent/30 active:scale-[0.98] transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          <PawPrint className="h-5 w-5" />
          <span className="text-xs">Add Dog</span>
        </button>
      </div>
    </div>
  );
};

export default DogStrip;
