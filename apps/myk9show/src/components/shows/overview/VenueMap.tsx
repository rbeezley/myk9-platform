import { Card } from '@/components/ui/card';
import { ExternalLink, MapPin, Navigation } from 'lucide-react';
import { buildVenueMapsUrls } from '@/utils/venueMaps';

interface VenueMapProps {
  location?: string | null;
  venueName?: string | null;
}

/** Buttons shown in the venue card. */
function MapLinks({
  directionsUrl,
  viewOnMapsUrl,
}: {
  directionsUrl: string;
  viewOnMapsUrl: string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <a
        href={directionsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 h-12 px-4 text-sm font-medium rounded-lg border border-border bg-background hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Navigation className="h-4 w-4" />
        Get Directions
      </a>
      <a
        href={viewOnMapsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 h-12 px-4 text-sm font-medium rounded-lg border border-border bg-background hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ExternalLink className="h-4 w-4" />
        View on Google Maps
      </a>
    </div>
  );
}

export function VenueMap({ location, venueName }: VenueMapProps) {
  if (!location?.trim()) return null;

  const { directionsUrl, viewOnMapsUrl } = buildVenueMapsUrls(location);

  return (
    <Card data-testid="venue-map-fallback">
      <div className="p-4 border-b border-border/30">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Venue</h3>
      </div>
      <div className="p-4 space-y-3">
        <div className="flex items-start gap-2">
          <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
          <div>
            {venueName && <div className="font-semibold text-foreground text-sm">{venueName}</div>}
            <div className="text-sm text-muted-foreground">{location}</div>
          </div>
        </div>
        <MapLinks directionsUrl={directionsUrl} viewOnMapsUrl={viewOnMapsUrl} />
      </div>
    </Card>
  );
}
