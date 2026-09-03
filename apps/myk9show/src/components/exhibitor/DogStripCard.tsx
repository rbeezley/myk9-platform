/**
 * DogStripCard — "registry card" for the My Shows page dog strip.
 *
 * Avatar, call name, breed (once when every registry agrees), date of birth
 * with age, and a small table of registry → number. Upcoming-class count
 * (green) or "Not entered" (amber) sits beside the name, with earned title
 * abbreviations beneath the table. Clicking navigates to the dog's detail page.
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTitleProgress } from '@/hooks/useTitleProgress';
import { BrowseCardAvatar } from '@/components/common/BrowseCard';
import { formatDateMMDDYYYY } from '@/utils/dateFormat';
import { formatDogAge } from '@/types/dog-types';
import { DogRegistryTable } from '@/components/dogs/common/DogRegistryTable';
import {
  buildDogCardRegistryModel,
  type DogCardRegistration,
} from '@/components/dogs/common/dogRegistryModel';

interface DogStripCardProps {
  dogId: string;
  dogName: string;
  imageUrl?: string | null | undefined;
  dateOfBirth?: string | null | undefined;
  registrations: DogCardRegistration[];
  upcomingClassCount: number;
}

export const DogStripCard: React.FC<DogStripCardProps> = ({
  dogId,
  dogName,
  imageUrl,
  dateOfBirth,
  registrations,
  upcomingClassCount,
}) => {
  const navigate = useNavigate();
  const { earnedAbbreviations, isLoading: titlesLoading } = useTitleProgress(dogId);
  const registry = buildDogCardRegistryModel(registrations);
  const age = formatDogAge({ dateOfBirth });
  const bornLine = dateOfBirth
    ? `Born ${formatDateMMDDYYYY(dateOfBirth)}${age ? ` · ${age}` : ''}`
    : null;

  return (
    <button
      type="button"
      onClick={() => navigate(`/dogs/${dogId}`)}
      className="flex w-80 flex-shrink-0 flex-col gap-2.5 rounded-xl border border-border bg-card p-3 text-left hover:bg-accent hover:shadow-sm active:scale-[0.98] transition-all duration-state focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
    >
      <div className="flex items-start gap-3">
        <BrowseCardAvatar src={imageUrl} fallback={dogName.charAt(0).toUpperCase()} alt="" />
        <div className="flex min-w-0 flex-grow flex-col gap-0.5">
          <p className="truncate text-sm font-semibold text-foreground">{dogName}</p>
          {registry.breed && (
            <p className="truncate text-xs text-muted-foreground">{registry.breed}</p>
          )}
          {registry.breedVaries && (
            <p className="text-xs text-muted-foreground">Breed varies by registry</p>
          )}
          {bornLine && <p className="text-xs text-muted-foreground">{bornLine}</p>}
          <div className="mt-1 flex flex-wrap gap-1">
            {upcomingClassCount > 0 ? (
              <span className="inline-flex flex-shrink-0 items-center whitespace-nowrap rounded-md bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
                {upcomingClassCount} upcoming {upcomingClassCount === 1 ? 'class' : 'classes'}
              </span>
            ) : (
              <span className="inline-flex flex-shrink-0 items-center whitespace-nowrap rounded-md bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">
                Not entered
              </span>
            )}
          </div>
        </div>
      </div>

      <DogRegistryTable registry={registry} />

      {!titlesLoading && earnedAbbreviations.length > 0 && (
        <div className="flex flex-wrap gap-1">
          <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {earnedAbbreviations.slice(0, 3).join(', ')}
            {earnedAbbreviations.length > 3 && ' …'}
          </span>
        </div>
      )}
    </button>
  );
};

export default DogStripCard;
