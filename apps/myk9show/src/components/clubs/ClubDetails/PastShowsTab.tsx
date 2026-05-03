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
            className="bg-card border border-border rounded-2xl p-5 hover:shadow-lg transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 cursor-pointer"
            style={accentBorderStyle(show.accentColor)}
            onClick={() => onViewShowDetails(show.id)}
            role="button"
            tabIndex={0}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onViewShowDetails(show.id);
              }
            }}
          >
            <div className="flex justify-between items-start mb-3">
              <div className="flex items-center gap-3 flex-1">
                <div className="text-lg font-semibold text-foreground">{show.name}</div>
                <div className="px-3 py-1 rounded-full text-xs font-medium uppercase tracking-wide bg-purple-500/10 text-purple-500 border border-purple-500/20">
                  {showStatus.label}
                </div>
              </div>
              <div className="flex items-start flex-shrink-0" onClick={e => e.stopPropagation()}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
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
