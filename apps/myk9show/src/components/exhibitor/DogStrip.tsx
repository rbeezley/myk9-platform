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
      {/* INTENT: "New Dog" lives in the section header, NOT in the rail below
          (MYK9-124). As the rail's last child its reachability was a function
          of how many dogs someone owns: cards are 208px + 12px gap and the
          content column is ~672px at 150-200% browser zoom, so three items fit
          and any exhibitor with 3+ dogs had the action scrolled out of sight —
          with `hide-scrollbar` there was not even a scrollbar to hint at it.
          Keep it out of the scroller, and keep the 44px target: the exhibitors
          most likely to zoom are the ones least able to hit a small control. */}
      <div className="mb-2 flex items-center gap-2">
        <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          My Dogs
          <span className="inline-flex items-center justify-center rounded-full bg-muted text-muted-foreground text-xs font-medium w-5 h-5">
            {dogs.length}
          </span>
        </h2>
        <button
          type="button"
          onClick={() => (onAddDog ? onAddDog() : navigate('/dogs'))}
          className="ml-auto inline-flex min-h-[44px] flex-shrink-0 items-center gap-1.5 rounded-xl border border-dashed border-border px-3 text-xs font-medium text-muted-foreground hover:bg-accent active:scale-[0.98] transition-all duration-state focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          <PawPrint className="h-4 w-4" />
          New Dog
        </button>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1 hide-scrollbar scroll-shadow-x">
        {dogs.map(dog => (
          <DogStripCard
            key={dog.id}
            dogId={dog.id}
            dogName={dog.call_name ?? dog.name ?? 'Unknown'}
            breed={breedsByDogId.get(dog.id) ?? []}
            upcomingClassCount={upcomingClassCountByDog[dog.id] ?? 0}
          />
        ))}
      </div>
    </div>
  );
};

export default DogStrip;
