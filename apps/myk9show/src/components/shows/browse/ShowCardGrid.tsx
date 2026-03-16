import React from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Calendar,
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
import { EntryStatusBadge } from '@/components/shows/EntryStatusBadge';
import { getShowActions } from '@/utils/show-actions';
import { getEntryStatus, userHasEntriesForShow } from '@/utils/entryStatusUtils';
import { getTypeBadge } from '@/utils/browseShowsUtils';
import type { EnhancedShow } from '@/hooks/useBrowseShowsData';
import type { SyncableShowEntry } from '@/store/entryStore';
import type { UserWithRoles } from '@/types/auth-types';
import { formatFee } from '@/utils/format';
import { formatDateRange } from '@/utils/date-format';
import { StaggeredGrid } from '@/components/layout/StaggeredGrid';

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

function countUserEntries(
  showId: string,
  entries: Array<{ showId?: string; show_id?: string }>
): number {
  return entries.filter(e => e.showId === showId || e.show_id === showId).length;
}

interface ShowCardGridProps {
  shows: EnhancedShow[];
  entries: SyncableShowEntry[];
  selectedTab: string;
  user: UserWithRoles | null;
  isSelected?: (item: EnhancedShow) => boolean;
  onToggleSelect?: (item: EnhancedShow) => void;
}

/**
 * Unified card grid for displaying shows.
 */
export const ShowCardGrid: React.FC<ShowCardGridProps> = ({
  shows,
  entries,
  selectedTab,
  user,
  isSelected,
  onToggleSelect,
}) => {
  const navigate = useNavigate();

  return (
    <StaggeredGrid className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
      {shows.map(show => {
        const showActions = getShowActions(show, selectedTab, user);
        const hasUserEntries = userHasEntriesForShow(show.id, entries);
        const entryCount = countUserEntries(show.id, entries);
        const entryStatus = getEntryStatus(show, hasUserEntries);
        const canEnterShow =
          entryStatus.status === 'accepting' || entryStatus.status === 'closing_soon';
        const checked = isSelected?.(show) ?? false;
        const accentColor = show.accentColor || 'hsl(var(--primary))';
        const hasLocation = !!show.location;
        const hasFee = show.preEntryFee != null;
        const hasCoverImage = !!show.coverImageUrl;

        const secondaryAction = showActions[0];
        const SecondaryIcon = secondaryAction
          ? ICON_COMPONENTS[secondaryAction.icon as keyof typeof ICON_COMPONENTS] || Eye
          : null;

        return (
          <div
            key={show.id}
            className={cn(
              'group relative overflow-hidden rounded-2xl border border-border/50 bg-card cursor-pointer',
              'transition-all duration-300 ease-out',
              'hover:-translate-y-1 hover:shadow-lg hover:border-border',
              entryStatus.status === 'closing_soon' && 'ring-2 ring-orange-400/50',
              checked && 'ring-2 ring-primary/50'
            )}
            onClick={() => navigate(`/shows/${show.id}`)}
          >
            {/* Cover image hero — only when show has a cover image */}
            {hasCoverImage && (
              <div className="relative h-32 overflow-hidden">
                <img
                  src={show.coverImageUrl!}
                  alt=""
                  className="h-full w-full object-cover"
                  loading="lazy"
                  width={400}
                  height={128}
                />
                <div
                  className="absolute inset-0"
                  style={{
                    background: `linear-gradient(to bottom, color-mix(in srgb, ${accentColor} 20%, transparent) 0%, color-mix(in srgb, ${accentColor} 80%, transparent) 100%)`,
                  }}
                />
              </div>
            )}

            {/* Content */}
            <div className="p-5 space-y-3">
              {/* Top row: org badge + status indicators */}
              <div className="flex items-center justify-between gap-2 border-0">
                <div className="flex items-center gap-2 border-0">
                  {/* Selection checkbox */}
                  {onToggleSelect && (
                    <div onClick={e => e.stopPropagation()}>
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => onToggleSelect(show)}
                        aria-label={`Select ${show.name}`}
                      />
                    </div>
                  )}
                  {getTypeBadge(show.organization)}
                  {/* Discipline/event type badges */}
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

                <div className="flex items-center gap-2">
                  {/* Urgency ribbon */}
                  {entryStatus.status === 'closing_soon' &&
                    entryStatus.daysUntilClose !== undefined && (
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
              </div>

              {/* Title + club */}
              <div>
                <h3 className="text-lg font-bold leading-tight group-hover:text-primary transition-colors">
                  {show.name}
                </h3>
                {show.clubName && (
                  <p className="text-sm text-muted-foreground mt-0.5 truncate">{show.clubName}</p>
                )}
              </div>

              {/* Date */}
              <div className="flex items-center gap-2 text-sm font-medium">
                <Calendar className="h-4 w-4 text-primary/70 flex-shrink-0" />
                <span>{formatDateRange(show.startDate, show.endDate, 'short')}</span>
              </div>

              {/* Location + Fee inline */}
              {(hasLocation || hasFee) && (
                <div className="text-sm text-muted-foreground flex items-center gap-1.5 flex-wrap">
                  {hasLocation && (
                    <>
                      <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                      <span className="truncate max-w-[200px]">{show.location}</span>
                    </>
                  )}
                  {hasLocation && hasFee && <span className="text-border">&middot;</span>}
                  {hasFee && <span>{formatFee(show.preEntryFee)} entry</span>}
                </div>
              )}

              {/* Entry close notice */}
              {(entryStatus.status === 'accepting' || entryStatus.status === 'closing_soon') &&
                show.entryCloseDate && (
                  <p className="text-xs text-muted-foreground">
                    Entries close{' '}
                    {new Date(show.entryCloseDate.split('T')[0] + 'T00:00:00').toLocaleDateString()}
                  </p>
                )}

              {/* Footer: entry status + actions */}
              <div className="flex items-center justify-between pt-3 border-t border-border/20">
                {/* Always show the show's entry status (open/closed/closing), not "Entry Submitted" —
                    the entry count badge in the top-right already indicates user has entries */}
                <EntryStatusBadge show={show} userHasEntries={false} size="sm" />
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
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => secondaryAction.onClick(show)}
                    >
                      <SecondaryIcon className="h-4 w-4 mr-1" />
                      {secondaryAction.label}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </StaggeredGrid>
  );
};

export default ShowCardGrid;
