/**
 * DogStrip — horizontal scrolling row of dog cards for the My Shows page.
 *
 * Receives entry-derived counts from the parent so the dog badges stay in sync
 * with the grouped My Entries cards on the same page.
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { PawPrint } from 'lucide-react';
import { DogStripCard } from './DogStripCard';
import type { DogCardRegistration } from '@/components/dogs/common/dogRegistryModel';

/**
 * A type alias, not an interface, and exported on purpose. Callers cast the
 * ownership query's raw `Record<string, unknown>[]` rows to this; an interface
 * gets no implicit index signature, so that assertion fails to compile against
 * one and passes against an alias.
 */
export type DogStripDog = {
  id: string;
  call_name?: string;
  name?: string;
  image_url?: string | null;
  date_of_birth?: string | null;
  registrations?: DogCardRegistration[];
};

interface DogStripProps {
  dogs: DogStripDog[];
  upcomingClassCountByDog?: Record<string, number>;
  onAddDog?: () => void;
}

export const DogStrip: React.FC<DogStripProps> = ({
  dogs,
  upcomingClassCountByDog = {},
  onAddDog,
}) => {
  const navigate = useNavigate();

  if (dogs.length === 0) return null;

  return (
    <div>
      {/* INTENT: the add-a-dog action lives in the section header, NOT in the rail below
          (MYK9-124). As the rail's last child its reachability was a function
          of how many dogs someone owns: cards are 320px + 12px gap and the
          content column is ~672px at 150-200% browser zoom, so two items fit
          and any exhibitor with 2+ dogs had the action scrolled out of sight —
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
          {/* "Add Dog", not "New Dog". /dogs already branches on audience —
              exhibitors get "Add Dog", staff get "New Dog" (BrowseDogsPage),
              the same per-audience split as the "My Dogs" / "Dogs" sidebar
              label. This strip renders only on My Shows, an exhibitor surface,
              so it was showing the staff word and giving one action two names
              for the same person (F7). */}
          Add Dog
        </button>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1 hide-scrollbar scroll-shadow-x">
        {dogs.map(dog => (
          <DogStripCard
            key={dog.id}
            dogId={dog.id}
            dogName={dog.call_name ?? dog.name ?? 'Unknown'}
            imageUrl={dog.image_url}
            dateOfBirth={dog.date_of_birth}
            registrations={dog.registrations ?? []}
            upcomingClassCount={upcomingClassCountByDog[dog.id] ?? 0}
          />
        ))}
      </div>
    </div>
  );
};

export default DogStrip;
