import React from 'react';
import { MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DateCircle } from '@/components/shows/DateCircle';
import { ShowProgressBar } from '@/components/shows/ShowProgressBar';
import { EntryStatusBadge } from '@/components/shows/EntryStatusBadge';
import { getEntryStatus } from '@/utils/entryStatusUtils';
import { getTypeBadge } from '@/utils/browseShowsUtils';
import { getShowCardStatus, computeShowProgress } from '@/utils/showCardUtils';
import type { Show } from '@/types/show-types';

export interface ShowCardVerticalProps {
  show: Show;
  totalEntries?: number;
  scoredTrials?: number;
  onViewDetails?: () => void;
}

/**
 * Vertical show card for landing page carousel and UpcomingShows component.
 * Fixed 280px width. No bulk selection, no action buttons, no user-specific entry count.
 */
export const ShowCardVertical: React.FC<ShowCardVerticalProps> = ({
  show,
  totalEntries = 0,
  scoredTrials = 0,
  onViewDetails,
}) => {
  const entryStatus = getEntryStatus(show, false);
  const showCardStatus = getShowCardStatus(show, entryStatus.status);
  const { totalTrials } = computeShowProgress(show);

  const disciplineTags = show.events.filter(e => e !== show.organization);

  return (
    <div
      data-testid="show-card-vertical"
      className={cn(
        'w-[280px] flex-shrink-0 rounded-xl border border-border/50 bg-card cursor-pointer',
        'transition-all duration-200 ease-out',
        'hover:shadow-md hover:border-border'
      )}
      onClick={onViewDetails}
    >
      <div className="p-4 space-y-3">
        {/* Header: DateCircle + title/club + entry status badge */}
        <div className="flex items-start gap-3">
          <DateCircle
            startDate={show.startDate}
            endDate={show.endDate}
            status={showCardStatus}
            size="md"
          />
          <div className="flex-1 min-w-0 space-y-0.5">
            <div className="flex items-start gap-1.5 flex-wrap">
              <EntryStatusBadge show={show} userHasEntries={false} size="sm" />
            </div>
            <h3 className="text-sm font-bold leading-tight truncate group-hover:text-primary transition-colors">
              {show.name}
            </h3>
            {show.clubName && (
              <p className="text-xs text-muted-foreground truncate">{show.clubName}</p>
            )}
          </div>
        </div>

        {/* Location */}
        {show.location && (
          <div
            data-testid="location-row"
            className="flex items-center gap-1.5 text-xs text-muted-foreground"
          >
            <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="truncate">{show.location}</span>
          </div>
        )}

        {/* Tags: org badge + discipline tags */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {getTypeBadge(show.organization)}
          {disciplineTags.map(tag => (
            <span
              key={tag}
              className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium"
            >
              {tag}
            </span>
          ))}
        </div>

        {/* Divider + progress bar */}
        <div className="border-t border-border/30 pt-2">
          <ShowProgressBar
            scoredTrials={scoredTrials}
            totalTrials={totalTrials}
            totalEntries={totalEntries}
          />
        </div>
      </div>
    </div>
  );
};

/**
 * Skeleton placeholder for loading states. Same 280px width.
 */
export const ShowCardVerticalSkeleton: React.FC = () => (
  <div className="w-[280px] flex-shrink-0 rounded-xl border border-border/50 bg-card p-4 space-y-3">
    {/* Header skeleton */}
    <div className="flex items-start gap-3">
      <div className="w-[60px] h-[60px] rounded-xl bg-muted animate-pulse flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-4 w-20 bg-muted rounded-full animate-pulse" />
        <div className="h-4 w-36 bg-muted rounded animate-pulse" />
        <div className="h-3 w-28 bg-muted rounded animate-pulse" />
      </div>
    </div>

    {/* Location skeleton */}
    <div className="flex items-center gap-1.5">
      <div className="h-3.5 w-3.5 bg-muted rounded animate-pulse flex-shrink-0" />
      <div className="h-3 w-32 bg-muted rounded animate-pulse" />
    </div>

    {/* Tags skeleton */}
    <div className="flex gap-1.5">
      <div className="h-5 w-12 bg-muted rounded-full animate-pulse" />
      <div className="h-5 w-16 bg-muted rounded-full animate-pulse" />
    </div>

    {/* Progress bar skeleton */}
    <div className="border-t border-border/30 pt-2 space-y-1.5">
      <div className="flex justify-between">
        <div className="h-3 w-24 bg-muted rounded animate-pulse" />
      </div>
      <div className="h-[3px] w-full bg-muted rounded-full animate-pulse" />
    </div>
  </div>
);

export default ShowCardVertical;
