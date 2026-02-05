import React from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Calendar,
  MapPin,
  Clock,
  DollarSign,
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
  Plus
} from 'lucide-react';
import { EntryStatusBadge } from '@/components/shows/EntryStatusBadge';
import { getShowActions } from '@/utils/show-actions';
import { getEntryStatus, userHasEntriesForShow } from '@/utils/entryStatusUtils';
import { getTypeBadge, getStatusBadge } from '@/utils/browseShowsUtils';
import type { EnhancedShow } from '@/hooks/useBrowseShowsData';
import type { SyncableShowEntry } from '@/store/entryStore';
import type { UserWithRoles } from '@/types/auth-types';

/**
 * Icon component map for show actions
 */
const ICON_COMPONENTS = {
  Eye, UserPlus, Edit, Trophy, Download, Award, Printer, Settings, Users, FileText, List, ClipboardList, Edit3, FileOutput, Plus
} as const;

interface ShowsGridViewProps {
  shows: EnhancedShow[];
  entries: SyncableShowEntry[];
  selectedTab: string;
  user: UserWithRoles | null;
}

/**
 * Grid view component for displaying shows in a card layout
 * Extracted from BrowseShowsPage.tsx as part of DEBT-002 refactoring
 */
export const ShowsGridView: React.FC<ShowsGridViewProps> = ({
  shows,
  entries,
  selectedTab,
  user
}) => {
  const navigate = useNavigate();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
      {shows.map((show) => {
        const showActions = getShowActions(show, selectedTab, user);
        const hasUserEntries = userHasEntriesForShow(show.id, entries);
        const entryStatus = getEntryStatus(show, hasUserEntries);
        const canEnterShow = entryStatus.status === 'accepting' || entryStatus.status === 'closing_soon';

        return (
          <div
            key={show.id}
            className={cn(
              "apple-browse-card relative",
              entryStatus.status === 'closed' && "opacity-60",
              entryStatus.status === 'closing_soon' && "ring-2 ring-orange-400/50 shadow-orange-200/30",
              entryStatus.status === 'submitted' && "ring-2 ring-green-400/50"
            )}
          >
            {/* Urgency ribbon for closing soon */}
            {entryStatus.status === 'closing_soon' && entryStatus.daysUntilClose !== undefined && (
              <div className="absolute top-3 right-3 z-20 bg-orange-500 text-white px-2.5 py-1 text-xs font-semibold rounded-full shadow-md">
                {entryStatus.daysUntilClose === 0
                  ? 'Closes Today!'
                  : `${entryStatus.daysUntilClose} day${entryStatus.daysUntilClose !== 1 ? 's' : ''} left`}
              </div>
            )}

            {/* Submitted checkmark */}
            {entryStatus.status === 'submitted' && (
              <div className="absolute top-3 right-3 z-20 bg-green-500 text-white p-1.5 rounded-full shadow-md">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            )}

            <div className="apple-browse-card-header">
              <div className="apple-browse-card-badges">
                {getTypeBadge(show.type)}
                <EntryStatusBadge show={show} userHasEntries={hasUserEntries} size="sm" />
              </div>
            </div>

            <div className="apple-browse-card-content">
              <h3 className="apple-browse-card-title">{show.name}</h3>
              <p className="apple-browse-card-description">
                {show.events.join(', ')}
              </p>

              <div className="apple-browse-card-details">
                {/* Date and Location grouped */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pb-2 border-b border-border/30">
                  <div className="apple-browse-card-detail-item">
                    <Calendar className="h-4 w-4" />
                    <span>
                      {new Date(show.startDate).toLocaleDateString()}
                      {show.startDate !== show.endDate &&
                        ` - ${new Date(show.endDate).toLocaleDateString()}`
                      }
                    </span>
                  </div>

                  <div className="apple-browse-card-detail-item">
                    <MapPin className="h-4 w-4" />
                    <span>{show.location}</span>
                  </div>
                </div>

                {/* Fee and Deadline grouped */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                  <div className="apple-browse-card-detail-item">
                    <DollarSign className="h-4 w-4" />
                    <span>{show.preEntryFee} entry fee</span>
                  </div>

                  <div className="apple-browse-card-detail-item">
                    <Clock className="h-4 w-4" />
                    <span>Closes {new Date(show.entryCloseDate).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>

              <div className="apple-browse-card-footer">
                {getStatusBadge(show.status)}
                <div className="flex gap-2 flex-wrap">
                  {canEnterShow && user && (
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => navigate(`/shows/${show.id}/enter`)}
                      className="bg-primary hover:bg-primary/90"
                    >
                      <Ticket className="h-4 w-4 mr-1" />
                      Enter Show
                    </Button>
                  )}
                  {showActions.slice(0, canEnterShow && user ? 1 : 2).map((action) => {
                    const IconComponent = ICON_COMPONENTS[action.icon as keyof typeof ICON_COMPONENTS] || Eye;
                    return (
                      <Button
                        key={action.id}
                        variant={action.variant}
                        size="sm"
                        onClick={() => action.onClick(show)}
                        className="apple-browse-view-details-btn"
                      >
                        <IconComponent className="h-4 w-4 mr-1" />
                        {action.label}
                      </Button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default ShowsGridView;
