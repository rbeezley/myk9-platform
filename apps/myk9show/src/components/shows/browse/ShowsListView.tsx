import React from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { accentBorderStyle } from '@/lib/branding';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
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
  Plus,
} from 'lucide-react';
import { EntryStatusBadge } from '@/components/shows/EntryStatusBadge';
import { getShowActions } from '@/utils/show-actions';
import { getEntryStatus, userHasEntriesForShow } from '@/utils/entryStatusUtils';
import { getTypeBadge } from '@/utils/browseShowsUtils';
import type { EnhancedShow } from '@/hooks/useBrowseShowsData';
import type { SyncableShowEntry } from '@/store/entryStore';
import type { UserWithRoles } from '@/types/auth-types';
import { formatFee } from '@/utils/format';
import { StaggeredGrid } from '@/components/layout/StaggeredGrid';

/**
 * Icon component map for show actions
 */
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

interface ShowsListViewProps {
  shows: EnhancedShow[];
  entries: SyncableShowEntry[];
  selectedTab: string;
  user: UserWithRoles | null;
  isSelected?: (item: EnhancedShow) => boolean;
  onToggleSelect?: (item: EnhancedShow) => void;
}

/**
 * List view component for displaying shows in a detailed list layout
 * Extracted from BrowseShowsPage.tsx as part of DEBT-002 refactoring
 */
export const ShowsListView: React.FC<ShowsListViewProps> = ({
  shows,
  entries,
  selectedTab,
  user,
  isSelected,
  onToggleSelect,
}) => {
  const navigate = useNavigate();

  return (
    <StaggeredGrid className="space-y-4">
      {shows.map(show => {
        const showActions = getShowActions(show, selectedTab, user);
        const hasUserEntries = userHasEntriesForShow(show.id, entries);
        const entryStatus = getEntryStatus(show, hasUserEntries);
        const canEnterShow =
          entryStatus.status === 'accepting' || entryStatus.status === 'closing_soon';

        const checked = isSelected?.(show) ?? false;

        return (
          <Card
            key={show.id}
            className={cn(
              'group relative overflow-hidden bg-gradient-to-r from-card to-card/80 border border-border rounded-2xl backdrop-blur-xl transition-all duration-500 hover:shadow-xl hover:-translate-y-1 active:scale-[0.99]',
              entryStatus.status === 'closing_soon' &&
                'ring-2 ring-orange-400/50 shadow-orange-200/30',
              entryStatus.status === 'submitted' && 'ring-2 ring-green-400/50',
              checked && 'ring-2 ring-primary/50'
            )}
            style={accentBorderStyle(show.accentColor)}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <CardContent className="relative p-6">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                {/* Selection checkbox */}
                {onToggleSelect && (
                  <div className="flex items-center shrink-0">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => onToggleSelect(show)}
                      aria-label={`Select ${show.name}`}
                    />
                  </div>
                )}
                <div className="flex-1">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div>
                        <h3 className="text-lg font-bold group-hover:text-primary transition-colors duration-300">
                          {show.name}
                        </h3>
                        {show.clubName && (
                          <p className="text-sm text-muted-foreground">{show.clubName}</p>
                        )}
                        <p className="text-sm text-muted-foreground">{show.events.join(', ')}</p>
                      </div>
                      {/* Urgency indicator inline */}
                      {entryStatus.status === 'closing_soon' &&
                        entryStatus.daysUntilClose !== undefined && (
                          <Badge className="bg-orange-500 text-white text-xs">
                            {entryStatus.daysUntilClose === 0
                              ? 'Closes Today!'
                              : `${entryStatus.daysUntilClose}d left`}
                          </Badge>
                        )}
                      {entryStatus.status === 'submitted' && (
                        <Badge className="bg-green-500 text-white text-xs">Entered</Badge>
                      )}
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {getTypeBadge(show.organization)}
                      <EntryStatusBadge show={show} userHasEntries={hasUserEntries} size="sm" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span>
                        {new Date(show.startDate).toLocaleDateString()}
                        {show.startDate !== show.endDate &&
                          ` - ${new Date(show.endDate).toLocaleDateString()}`}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      <span>{show.location}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-muted-foreground" />
                      <span>{formatFee(show.preEntryFee)} entry fee</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span>Closes {new Date(show.entryCloseDate).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {canEnterShow && user && (
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => navigate(`/shows/${show.id}?register=true`)}
                      className="bg-primary hover:bg-primary/90 hover:-translate-y-0.5 transition-all duration-300"
                    >
                      <Ticket className="h-4 w-4 mr-2" />
                      Enter Show
                    </Button>
                  )}
                  {showActions.slice(0, canEnterShow && user ? 2 : 3).map(action => {
                    const IconComponent =
                      ICON_COMPONENTS[action.icon as keyof typeof ICON_COMPONENTS] || Eye;
                    return (
                      <Button
                        key={action.id}
                        variant={action.variant}
                        size="sm"
                        onClick={() => action.onClick(show)}
                        className="hover:-translate-y-0.5 transition-all duration-300"
                      >
                        <IconComponent className="h-4 w-4 mr-2" />
                        {action.label}
                      </Button>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </StaggeredGrid>
  );
};

export default ShowsListView;
