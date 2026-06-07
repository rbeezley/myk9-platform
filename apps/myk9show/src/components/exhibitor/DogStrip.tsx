/**
 * DogStrip — horizontal scrolling row of dog cards for the My Shows page.
 *
 * Receives entry-derived counts from the parent so the dog badges stay in sync
 * with the grouped My Entries cards on the same page.
 */

import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { PawPrint } from 'lucide-react';
import { DogStripCard } from './DogStripCard';

interface DogRegistration {
  breed?: string;
  organization?: string;
  status?: string;
}

interface Dog {
  id: string;
  call_name?: string;
  name?: string;
  registrations?: DogRegistration[];
}

interface DogStripProps {
  dogs: Dog[];
  upcomingClassCountByDog?: Record<string, number>;
  onAddDog?: () => void;
}

export const DogStrip: React.FC<DogStripProps> = ({
  dogs,
  upcomingClassCountByDog = {},
  onAddDog,
}) => {
  const navigate = useNavigate();

  const breedsByDogId = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const dog of dogs) {
      const seen = new Set<string>();
      const parts: string[] = [];
      for (const r of dog.registrations ?? []) {
        if (!r.breed) continue;
        const orgAbbr = r.organization?.split(' ')[0] ?? '';
        const label = orgAbbr ? `${r.breed} (${orgAbbr})` : r.breed;
        if (!seen.has(label)) {
          seen.add(label);
          parts.push(label);
        }
      }
      map.set(dog.id, parts);
    }
    return map;
  }, [dogs]);

  if (dogs.length === 0) return null;

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-2">
        My Dogs
        <span className="inline-flex items-center justify-center rounded-full bg-muted text-muted-foreground text-xs font-medium w-5 h-5">
          {dogs.length}
        </span>
      </p>
      <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
        {dogs.map(dog => (
          <DogStripCard
            key={dog.id}
            dogId={dog.id}
            dogName={dog.call_name ?? dog.name ?? 'Unknown'}
            breed={breedsByDogId.get(dog.id) ?? []}
            upcomingClassCount={upcomingClassCountByDog[dog.id] ?? 0}
          />
        ))}
        <button
          type="button"
          onClick={() => (onAddDog ? onAddDog() : navigate('/dogs'))}
          className="flex-shrink-0 w-52 rounded-xl border border-dashed border-border p-3 flex flex-col items-center justify-center gap-1 text-muted-foreground hover:bg-accent/30 active:scale-[0.98] transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          <PawPrint className="h-5 w-5" />
          <span className="text-xs">New Dog</span>
        </button>
      </div>
    </div>
  );
};

export default DogStrip;
