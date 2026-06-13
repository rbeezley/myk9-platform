import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ExternalLink, MapPin, Navigation } from 'lucide-react';
import { buildVenueMapsUrls } from '@/utils/venueMaps';

// Fast navigation away within this window avoids firing an aborted map request.
export const IFRAME_DEFER_MS = 200;

interface VenueMapProps {
  location?: string | null;
  venueName?: string | null;
}

/** Buttons shown in both the full card and the no-key fallback card. */
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
        className="inline-flex items-center gap-2 h-12 px-4 text-sm font-medium rounded-lg border border-border bg-background hover:bg-accent transition-colors"
      >
        <Navigation className="h-4 w-4" />
        Get Directions
      </a>
      <a
        href={viewOnMapsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 h-12 px-4 text-sm font-medium rounded-lg border border-border bg-background hover:bg-accent transition-colors"
      >
        <ExternalLink className="h-4 w-4" />
        View on Google Maps
      </a>
    </div>
  );
}

export function VenueMap({ location, venueName }: VenueMapProps) {
  const [iframeReady, setIframeReady] = useState(false);
  const [iframeError, setIframeError] = useState(false);
  // Reset error state when location changes — derived-state pattern avoids an extra effect.
  const [prevLocation, setPrevLocation] = useState(location);
  if (prevLocation !== location) {
    setPrevLocation(location);
    setIframeError(false);
  }

  const embedApiKey = import.meta.env.VITE_GOOGLE_MAPS_EMBED_API_KEY as string | undefined;
  const hasApiKey = Boolean(embedApiKey);

  useEffect(() => {
    if (!location?.trim() || !hasApiKey) return;
    const id = setTimeout(() => setIframeReady(true), IFRAME_DEFER_MS);
    return () => clearTimeout(id);
  }, [location, hasApiKey]);

  if (!location?.trim()) return null;

  const encodedAddress = encodeURIComponent(location);
  const { directionsUrl, viewOnMapsUrl } = buildVenueMapsUrls(location);

  if (!hasApiKey || iframeError) {
    return (
      <Card data-testid="venue-map-fallback">
        <div className="p-4 border-b border-border/30">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Venue</h3>
        </div>
        <div className="p-4 space-y-3">
          <div className="flex items-start gap-2">
            <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div>
              {venueName && (
                <div className="font-semibold text-foreground text-sm">{venueName}</div>
              )}
              <div className="text-sm text-muted-foreground">{location}</div>
            </div>
          </div>
          <MapLinks directionsUrl={directionsUrl} viewOnMapsUrl={viewOnMapsUrl} />
          <p className="text-xs text-muted-foreground">
            {hasApiKey ? 'Map unavailable' : 'Interactive map not configured'}
          </p>
        </div>
      </Card>
    );
  }

  const mapSrc = `https://www.google.com/maps/embed/v1/place?key=${embedApiKey}&q=${encodedAddress}`;

  return (
    <Card className="overflow-hidden">
      <div className="p-4 border-b border-border/30">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Venue</h3>
      </div>
      {iframeReady ? (
        <iframe
          src={mapSrc}
          title={`Map showing ${venueName || location}`}
          className="w-full h-[300px] border-0"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          allowFullScreen
          onError={() => setIframeError(true)}
        />
      ) : (
        <Skeleton data-testid="map-skeleton" className="w-full h-[300px] rounded-none" />
      )}
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
