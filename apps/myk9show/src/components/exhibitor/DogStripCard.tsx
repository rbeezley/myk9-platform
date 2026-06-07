/**
 * DogStripCard — compact dog card for the My Shows page dog strip.
 *
 * Shows dog name, breed, upcoming class count (green) or "Not entered" (amber),
 * and earned title abbreviations. Clicking navigates to the dog's detail page.
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTitleProgress } from '@/hooks/useTitleProgress';

interface DogStripCardProps {
  dogId: string;
  dogName: string;
  breed: string[];
  upcomingClassCount: number;
}

export const DogStripCard: React.FC<DogStripCardProps> = ({
  dogId,
  dogName,
  breed,
  upcomingClassCount,
}) => {
  const navigate = useNavigate();
  const { earnedAbbreviations, isLoading: titlesLoading } = useTitleProgress(dogId);

  return (
    <button
      type="button"
      onClick={() => navigate(`/dogs/${dogId}`)}
      className="flex-shrink-0 w-52 rounded-xl border border-border bg-card p-3 text-left hover:bg-accent/50 hover:shadow-sm active:scale-[0.98] transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
    >
      <p className="font-semibold text-sm text-foreground truncate">{dogName}</p>
      {breed.length > 0 && (
        <div className="mb-2">
          {breed.map(b => (
            <p key={b} className="text-xs text-muted-foreground truncate">
              {b}
            </p>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-1">
        {upcomingClassCount > 0 ? (
          <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
            {upcomingClassCount} upcoming{' '}
            {upcomingClassCount === 1 ? 'class' : 'classes'}
          </span>
        ) : (
          <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
            Not entered
          </span>
        )}
        {!titlesLoading && earnedAbbreviations.length > 0 && (
          <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {earnedAbbreviations.slice(0, 3).join(', ')}
            {earnedAbbreviations.length > 3 && ' …'}
          </span>
        )}
      </div>
    </button>
  );
};

export default DogStripCard;
