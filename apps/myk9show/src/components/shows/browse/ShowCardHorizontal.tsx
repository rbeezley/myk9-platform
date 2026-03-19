import React from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  MapPin,
  Ticket,
  Eye,
  UserPlus,
  Edit,
  Trophy,
  Download,
  Award,
  Printer,
  Settings,
  Users,
  FileText,
  List,
  ClipboardList,
  Edit3,
  FileOutput,
  Plus,
  CheckCircle2,
} from 'lucide-react';
import { DateCircle } from '@/components/shows/DateCircle';
import { ShowProgressBar } from '@/components/shows/ShowProgressBar';
import { EntryStatusBadge } from '@/components/shows/EntryStatusBadge';
import { getShowActions } from '@/utils/show-actions';
import { getEntryStatus, userHasEntriesForShow } from '@/utils/entryStatusUtils';
import { getTypeBadge } from '@/utils/browseShowsUtils';
import { getShowCardStatus, computeShowProgress, countUserEntries } from '@/utils/showCardUtils';
import type { EnhancedShow } from '@/hooks/useBrowseShowsData';
import type { SyncableShowEntry } from '@/store/entryStore';
import type { UserWithRoles } from '@/types/auth-types';

const ICON_COMPONENTS = {
  Eye,
  UserPlus,
  Edit,
  Trophy,
  Download,
  Award,
  Printer,
  Settings,
  Users,
  FileText,
  List,
  ClipboardList,
  Edit3,
  FileOutput,
  Plus,
} as const;

export interface ShowCardHorizontalProps {
  show: EnhancedShow;
  entries: SyncableShowEntry[];
  selectedTab: string;
  user: UserWithRoles | null;
  isSelected?: boolean;
  onToggleSelect?: () => void;
}

/**
 * Horizontal show card for BrowseShowsPage.
 *
 * Desktop (>= md): three-column flex — [DateCircle] [title+meta+tags] [counts+progress+action]
 * Mobile (< md): stacks vertically — date circle + title as header, rest below.
 */
export const ShowCardHorizontal: React.FC<ShowCardHorizontalProps> = ({
  show,
  entries,
  selectedTab,
  user,
  isSelected = false,
  onToggleSelect,
}) => {
  const navigate = useNavigate();

  const hasUserEntries = userHasEntriesForShow(show.id, entries);
  const entryCount = countUserEntries(show.id, entries);
  const entryStatus = getEntryStatus(show, hasUserEntries);
  const showCardStatus = getShowCardStatus(show, entryStatus.status);
  const { totalTrials, scoredTrials } = computeShowProgress(show);
  const canEnterShow = entryStatus.status === 'accepting' || entryStatus.status === 'closing_soon';

  const showActions = getShowActions(show, selectedTab, user);
  const secondaryAction = showActions[0];
  const SecondaryIcon = secondaryAction
    ? ICON_COMPONENTS[secondaryAction.icon as keyof typeof ICON_COMPONENTS] || Eye
    : null;

  return (
    <div
      data-testid="show-card"
      className={cn(
        'group relative overflow-hidden rounded-xl border border-border/50 bg-card cursor-pointer',
        'transition-all duration-200 ease-out',
        'hover:shadow-md hover:border-border',
        entryStatus.status === 'closing_soon' && 'ring-2 ring-orange-400/50',
        isSelected && 'ring-2 ring-primary/50'
      )}
      onClick={() => navigate(`/shows/${show.id}`)}
    >
      {/* Main layout: flex row on md+, column on mobile */}
      <div className="flex flex-col md:flex-row md:items-center gap-3 p-4">
        {/* Left column: checkbox + DateCircle */}
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

        {/* Middle column: title + meta + tags */}
        <div className="flex-1 min-w-0 space-y-1.5">
          {/* Title row with entry status badge */}
          <div className="flex items-start gap-2 flex-wrap">
            <h3 className="text-base font-bold leading-tight group-hover:text-primary transition-colors truncate">
              {show.name}
            </h3>
            <EntryStatusBadge show={show} userHasEntries={false} size="sm" />
          </div>

          {/* Club name */}
          {show.clubName && (
            <p className="text-sm text-muted-foreground truncate">{show.clubName}</p>
          )}

          {/* Location */}
          {show.location && (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="truncate">{show.location}</span>
            </div>
          )}

          {/* Tags: org badge + discipline tags */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {getTypeBadge(show.organization)}
            {show.events
              .filter(e => e !== show.organization)
              .map(event => (
                <span
                  key={event}
                  className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium"
                >
                  {event}
                </span>
              ))}
          </div>
        </div>

        {/* Right column: counts + progress + actions */}
        <div className="flex flex-col items-end gap-2 flex-shrink-0 md:min-w-[180px]">
          {/* Status indicators row */}
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {/* Urgency ribbon */}
            {entryStatus.status === 'closing_soon' && entryStatus.daysUntilClose !== undefined && (
              <span className="bg-orange-500 text-white px-2 py-0.5 text-xs font-semibold rounded-full">
                {entryStatus.daysUntilClose === 0
                  ? 'Closes Today!'
                  : `${entryStatus.daysUntilClose}d left`}
              </span>
            )}

            {/* Entry count badge */}
            {entryCount > 0 && (
              <span className="inline-flex items-center gap-1 bg-green-500/15 text-green-500 px-2 py-0.5 text-xs font-semibold rounded-full">
                <CheckCircle2 className="h-3 w-3" />
                {entryCount} {entryCount === 1 ? 'entry' : 'entries'}
              </span>
            )}
          </div>

          {/* Progress bar */}
          <div className="w-full md:w-[180px]">
            <ShowProgressBar
              scoredTrials={scoredTrials}
              totalTrials={totalTrials}
              totalEntries={entryCount}
            />
          </div>

          {/* Action buttons */}
          <div className="flex gap-2" onClick={e => e.stopPropagation()}>
            {canEnterShow && user && (
              <Button
                variant="default"
                size="sm"
                onClick={() => navigate(`/shows/${show.id}?register=true`)}
              >
                <Ticket className="h-4 w-4 mr-1" />
                Enter
              </Button>
            )}
            {secondaryAction && SecondaryIcon && (
              <Button variant="outline" size="sm" onClick={() => secondaryAction.onClick(show)}>
                <SecondaryIcon className="h-4 w-4 mr-1" />
                {secondaryAction.label}
              </Button>
            )}
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
  <div className="rounded-xl border border-border/50 bg-card p-4">
    <div className="flex flex-col md:flex-row md:items-center gap-3">
      {/* Date circle skeleton */}
      <div className="flex-shrink-0">
        <div className="w-14 h-14 rounded-xl bg-muted animate-pulse" />
      </div>

      {/* Middle skeleton */}
      <div className="flex-1 space-y-2">
        <div className="h-5 w-48 bg-muted rounded animate-pulse" />
        <div className="h-4 w-32 bg-muted rounded animate-pulse" />
        <div className="flex gap-2">
          <div className="h-5 w-16 bg-muted rounded-full animate-pulse" />
          <div className="h-5 w-16 bg-muted rounded-full animate-pulse" />
        </div>
      </div>

      {/* Right skeleton */}
      <div className="flex flex-col items-end gap-2 md:min-w-[180px]">
        <div className="h-4 w-24 bg-muted rounded animate-pulse" />
        <div className="h-[3px] w-full bg-muted rounded-full animate-pulse" />
        <div className="h-8 w-20 bg-muted rounded animate-pulse" />
      </div>
    </div>
  </div>
);

export default ShowCardHorizontal;
