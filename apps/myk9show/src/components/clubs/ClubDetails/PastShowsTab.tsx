import React from 'react';
import { Calendar, MapPin, Eye, CheckCircle, MoreVertical } from 'lucide-react';
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
import { formatShortDate } from '@/lib/format/dates';

interface PastShowsTabProps {
  shows: ClubShow[];
  onViewShowDetails: (showId: string) => void;
}

export const PastShowsTab: React.FC<PastShowsTabProps> = ({ shows, onViewShowDetails }) => {
  if (shows.length === 0) {
    return (
      <div className="text-center py-16 px-8 bg-muted/50 rounded-2xl border border-dashed border-border">
        <CheckCircle className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-60" />
        <div className="text-lg font-medium mb-2 text-foreground">No Past Shows</div>
        <div className="text-sm text-muted-foreground leading-relaxed">
          This club hasn't hosted any shows yet. Once they organize their first event, the results
          will appear here.
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {shows.map(show => {
        const showStatus = getShowStatus(show.date, false);

        return (
          <div
            key={show.id}
            className="relative bg-card border border-border rounded-2xl p-5 hover:shadow-lg transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 cursor-pointer"
            style={accentBorderStyle(show.accentColor)}
          >
            <button
              type="button"
              aria-label={`View ${show.name}`}
              className="absolute inset-0 z-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              onClick={() => onViewShowDetails(show.id)}
            />
            <div className="pointer-events-none relative z-[1]">
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-3 flex-1">
                  <div className="text-lg font-semibold text-foreground">{show.name}</div>
                  <div className="px-3 py-1 rounded-full text-xs font-medium uppercase tracking-wide bg-purple-500/10 text-purple-500 border border-purple-500/20">
                    {showStatus.label}
                  </div>
                </div>
                <div className="pointer-events-auto flex items-start flex-shrink-0">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-11 w-11 p-0"
                        aria-label={`Actions for ${show.name}`}
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onViewShowDetails(show.id)}>
                        <Eye className="mr-2 h-4 w-4" />
                        View Results
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              <div className="flex items-center gap-3 text-sm text-muted-foreground mb-3">
                <div className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {formatShortDate(show.date)}
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
          </div>
        );
      })}
    </div>
  );
};
