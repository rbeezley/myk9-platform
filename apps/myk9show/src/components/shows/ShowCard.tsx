import React from 'react';
import { Calendar, MapPin } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ShowSyncIndicator } from '@/components/sync/SyncStatusIndicator';
import type { SyncStatus } from '@/components/sync/SyncStatusIndicator';
import { getShowPlaceholder } from './show-card-placeholders';

export interface ShowCardProps {
  id: string | number;
  title: string;
  date: string;
  location: string;
  imageUrl: string;
  organization?: string | undefined;
  className?: string | undefined;
  syncStatus?: SyncStatus | undefined;
  lastSyncAt?: Date | undefined;
  syncErrorMessage?: string | undefined;
  showSyncStatus?: boolean | undefined;
  onViewDetails?: (() => void) | undefined;
  onSyncRetry?: (() => void) | undefined;
}

export const ShowCard: React.FC<ShowCardProps> = ({
  id,
  title,
  date,
  location,
  imageUrl,
  organization,
  className = '',
  syncStatus = 'synced',
  lastSyncAt,
  syncErrorMessage,
  showSyncStatus = false,
  onViewDetails = () => {},
  onSyncRetry,
}) => {
  return (
    <Card
      className={`group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-xl hover:-translate-y-2 ${className}`}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      {/* Type badge and sync indicator in top corners */}
      <div className="absolute top-4 left-0 right-0 flex justify-between items-start px-4 z-10">
        {showSyncStatus && (
          <ShowSyncIndicator
            status={syncStatus}
            entityId={String(id)}
            compact
            lastSyncAt={lastSyncAt}
            errorMessage={syncErrorMessage}
            enableActions={syncStatus === 'error' || syncStatus === 'conflict'}
            onRetry={onSyncRetry}
            className="bg-card/90 backdrop-blur-sm rounded-full p-1.5 shadow-sm border border-border/50"
          />
        )}
        {organization && (
          <div className="bg-primary text-primary-foreground text-xs font-semibold px-3 py-1 rounded-lg shadow-sm">
            {organization}
          </div>
        )}
      </div>
      <CardHeader className="pb-0 relative">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={title}
            className="rounded-xl w-full h-40 object-cover mb-4 group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <ShowPlaceholder organization={organization} title={title} />
        )}
        <h3 className="text-xl font-semibold mb-2 group-hover:text-primary transition-colors duration-300">
          {title}
        </h3>
        <div className="flex items-center text-muted-foreground text-sm mb-2">
          <Calendar className="w-4 h-4 mr-2" />
          <span>{date}</span>
        </div>
        <div className="flex items-center text-muted-foreground text-sm mb-2">
          <MapPin className="w-4 h-4 mr-2" />
          <span>{location}</span>
        </div>
      </CardHeader>
      <CardContent className="relative">
        <Button onClick={onViewDetails} className="w-full mt-2">
          View Details
        </Button>
      </CardContent>
    </Card>
  );
};

const ShowPlaceholder: React.FC<{ organization?: string | undefined; title: string }> = ({
  organization,
  title,
}) => {
  const style = getShowPlaceholder(organization, title);
  return (
    <div
      className={`rounded-xl w-full h-40 mb-4 group-hover:scale-105 transition-transform duration-500 bg-gradient-to-br ${style.gradient} relative overflow-hidden flex items-center justify-center`}
    >
      <div className={`absolute inset-0 ${style.pattern}`} />
      {/* Decorative paw prints */}
      <div className="absolute inset-0 opacity-[0.08]">
        <svg
          className="absolute top-3 left-4 w-8 h-8 rotate-[-15deg]"
          viewBox="0 0 24 24"
          fill="currentColor"
          xmlns="http://www.w3.org/2000/svg"
        >
          <ellipse cx="12" cy="16" rx="5" ry="6" className="text-white" />
          <circle cx="7" cy="8" r="2.5" className="text-white" />
          <circle cx="17" cy="8" r="2.5" className="text-white" />
          <circle cx="4" cy="13" r="2" className="text-white" />
          <circle cx="20" cy="13" r="2" className="text-white" />
        </svg>
        <svg
          className="absolute bottom-4 right-6 w-10 h-10 rotate-[20deg]"
          viewBox="0 0 24 24"
          fill="currentColor"
          xmlns="http://www.w3.org/2000/svg"
        >
          <ellipse cx="12" cy="16" rx="5" ry="6" className="text-white" />
          <circle cx="7" cy="8" r="2.5" className="text-white" />
          <circle cx="17" cy="8" r="2.5" className="text-white" />
          <circle cx="4" cy="13" r="2" className="text-white" />
          <circle cx="20" cy="13" r="2" className="text-white" />
        </svg>
        <svg
          className="absolute top-6 right-12 w-6 h-6 rotate-[45deg]"
          viewBox="0 0 24 24"
          fill="currentColor"
          xmlns="http://www.w3.org/2000/svg"
        >
          <ellipse cx="12" cy="16" rx="5" ry="6" className="text-white" />
          <circle cx="7" cy="8" r="2.5" className="text-white" />
          <circle cx="17" cy="8" r="2.5" className="text-white" />
          <circle cx="4" cy="13" r="2" className="text-white" />
          <circle cx="20" cy="13" r="2" className="text-white" />
        </svg>
      </div>
      <span className="text-4xl relative z-10 drop-shadow-lg">{style.icon}</span>
      {organization && (
        <span className="absolute bottom-2 right-3 text-white/40 text-xs font-bold tracking-wider">
          {organization}
        </span>
      )}
    </div>
  );
};

export default ShowCard;
