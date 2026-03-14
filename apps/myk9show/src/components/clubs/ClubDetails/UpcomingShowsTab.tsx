import React from 'react';
import { Calendar, MapPin, Eye, ExternalLink, Plus, MoreVertical } from 'lucide-react';
import { accentBorderStyle } from '@/lib/branding';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ClubShow } from './types';
import { getShowStatus } from './utils';

interface UpcomingShowsTabProps {
  shows: ClubShow[];
  onViewShowDetails: (showId: string) => void;
  onRegisterForShow: (showId: string) => void;
  onAddShow: () => void;
}

export const UpcomingShowsTab: React.FC<UpcomingShowsTabProps> = ({
  shows,
  onViewShowDetails,
  onRegisterForShow,
  onAddShow,
}) => {
  if (shows.length === 0) {
    return (
      <div className="text-center py-16 px-8 bg-muted/50 rounded-2xl border border-dashed border-border">
        <Calendar className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-60" />
        <div className="text-lg font-medium mb-2 text-foreground">No Upcoming Shows</div>
        <div className="text-sm text-muted-foreground leading-relaxed mb-5">
          This club doesn't have any shows scheduled yet. Add your first show to get started
          organizing events.
        </div>
        <Button onClick={onAddShow} className="inline-flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Add First Show
        </Button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {shows.map(show => {
        const showStatus = getShowStatus(show.date, true);

        return (
          <div
            key={show.id}
            className="bg-card border border-border rounded-2xl p-5 hover:shadow-lg transition-all duration-300 hover:-translate-y-1 hover:border-primary/30"
            style={accentBorderStyle(show.accentColor)}
          >
            <div className="flex justify-between items-start mb-3">
              <div className="flex items-center gap-3 flex-1">
                <div className="text-lg font-semibold text-foreground">{show.name}</div>
                <div
                  className={`px-3 py-1 rounded-full text-xs font-medium uppercase tracking-wide ${
                    showStatus.status === 'upcoming'
                      ? 'bg-green-500/10 text-green-500 border border-green-500/20'
                      : showStatus.status === 'registration'
                        ? 'bg-blue-500/10 text-blue-500 border border-blue-500/20'
                        : 'bg-purple-500/10 text-purple-500 border border-purple-500/20'
                  }`}
                >
                  {showStatus.label}
                </div>
              </div>
              <div className="flex items-start flex-shrink-0">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onViewShowDetails(String(show.id))}>
                      <Eye className="mr-2 h-4 w-4" />
                      View Details
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onRegisterForShow(show.id)}>
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Register
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            <div className="flex items-center gap-3 text-sm text-muted-foreground mb-3">
              <div className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {new Date(show.date).toLocaleDateString()}
              </div>
              <div className="flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {show.location}
              </div>
            </div>

            {show.description && (
              <div className="text-sm text-foreground leading-relaxed">{show.description}</div>
            )}
          </div>
        );
      })}
    </div>
  );
};
