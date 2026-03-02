import React from 'react';
import { Calendar, MapPin } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ShowSyncIndicator } from '@/components/sync/SyncStatusIndicator';
import type { SyncStatus } from '@/components/sync/SyncStatusIndicator';

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
        <img
          src={imageUrl}
          alt={title}
          className="rounded-xl w-full h-40 object-cover mb-4 group-hover:scale-105 transition-transform duration-500"
        />
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

export default ShowCard;
