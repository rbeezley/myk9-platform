import React from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { MapPin, DollarSign } from 'lucide-react';
import { DateCircle } from '@/components/shows/DateCircle';
import { EntryStatusBadge } from '@/components/shows/EntryStatusBadge';
import { getEntryStatus } from '@/utils/entryStatusUtils';
import { getTypeBadge } from '@/utils/browseShowsUtils';
import { getShowCardStatus } from '@/utils/showCardUtils';
import { formatDateRange } from '@/utils/date-format';
import type { Show } from '@/types/show-types';

export interface ShowCardHorizontalProps {
  show: Show;
  isSelected?: boolean;
  onToggleSelect?: () => void;
}

/**
 * Horizontal show card for BrowseShowsPage.
 * Clickable — navigates to show details.
 */
export const ShowCardHorizontal: React.FC<ShowCardHorizontalProps> = ({
  show,
  isSelected = false,
  onToggleSelect,
}) => {
  const navigate = useNavigate();

  const entryStatus = getEntryStatus(show, false);
  const showCardStatus = getShowCardStatus(show, entryStatus.status);

  return (
    <div
      data-testid="show-card"
      className={cn(
        'group relative overflow-hidden rounded-xl bg-card shadow-card cursor-pointer',
        'transition-all duration-200 ease-out',
        'hover:shadow-card-hover',
        entryStatus.status === 'closing_soon' && 'ring-2 ring-orange-400/50',
        isSelected && 'ring-2 ring-primary/50'
      )}
      onClick={() => navigate(`/shows/${show.id}`)}
    >
      <div className="flex flex-col md:flex-row md:items-center gap-3 p-4">
        {/* Left: checkbox + DateCircle */}
        <div className="flex items-center gap-3 flex-shrink-0">
          {onToggleSelect && (
            <div onClick={e => e.stopPropagation()}>
              <Checkbox
                checked={isSelected}
                onCheckedChange={() => onToggleSelect()}
                aria-label={`Select ${show.name}`}
              />
            </div>
          )}
          <DateCircle startDate={show.startDate} endDate={show.endDate} status={showCardStatus} />
        </div>

        {/* Right: title + meta + tags */}
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-start gap-2 flex-wrap">
            <h3 className="text-base font-bold leading-tight group-hover:text-primary transition-colors truncate">
              {show.name}
            </h3>
            <EntryStatusBadge show={show} userHasEntries={false} size="sm" />
          </div>

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {show.clubName && <span className="truncate">{show.clubName}</span>}
            {show.clubName && show.startDate && <span className="text-border">|</span>}
            {show.startDate && (
              <span className="flex-shrink-0">
                {formatDateRange(show.startDate, show.endDate, 'short', false)}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            {show.location && (
              <div className="flex items-center gap-1.5 min-w-0">
                <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="truncate">{show.location}</span>
              </div>
            )}
            {show.preEntryFee && (
              <div className="flex items-center gap-1 flex-shrink-0">
                <DollarSign className="h-3.5 w-3.5" />
                <span>{show.preEntryFee}</span>
              </div>
            )}
          </div>

          {/* Tags: org badge + trial type badges */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {getTypeBadge(show.organization)}
            {show.events
              .filter(e => e !== show.organization)
              .map(event => (
                <React.Fragment key={event}>{getTypeBadge(event)}</React.Fragment>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * Skeleton placeholder for loading states.
 */
export const ShowCardHorizontalSkeleton: React.FC = () => (
  <div className="rounded-xl bg-card shadow-card p-4">
    <div className="flex flex-col md:flex-row md:items-center gap-3">
      <div className="flex-shrink-0">
        <div className="w-14 h-14 rounded-xl bg-muted animate-pulse" />
      </div>
      <div className="flex-1 space-y-2">
        <div className="h-5 w-48 bg-muted rounded animate-pulse" />
        <div className="h-4 w-32 bg-muted rounded animate-pulse" />
        <div className="flex gap-2">
          <div className="h-5 w-16 bg-muted rounded-full animate-pulse" />
          <div className="h-5 w-16 bg-muted rounded-full animate-pulse" />
        </div>
      </div>
    </div>
  </div>
);

export default ShowCardHorizontal;
