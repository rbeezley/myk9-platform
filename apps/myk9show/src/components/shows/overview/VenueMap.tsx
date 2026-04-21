import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ExternalLink, MapPin, Navigation } from 'lucide-react';

interface VenueMapProps {
  location?: string | null;
  venueName?: string | null;
}

export function VenueMap({ location, venueName }: VenueMapProps) {
  // Defer iframe mount so fast navigation away won't fire an aborted network request.
  const [iframeReady, setIframeReady] = useState(false);
  useEffect(() => {
    if (!location?.trim()) return;
    const id = setTimeout(() => setIframeReady(true), 200);
    return () => clearTimeout(id);
  }, [location]);

  if (!location?.trim()) return null;

  const encodedAddress = encodeURIComponent(location);
  const embedApiKey = import.meta.env.VITE_GOOGLE_MAPS_EMBED_API_KEY as string | undefined;
  // The documented Embed API reliably handles short queries like "Olathe, KS".
  // The keyless `maps.google.com/maps?q=...&output=embed` endpoint often returns
  // a blank iframe for city/state-only locations, so we prefer the Embed API when
  // an API key is configured and fall back to the keyless embed otherwise.
  const mapSrc = embedApiKey
    ? `https://www.google.com/maps/embed/v1/place?key=${embedApiKey}&q=${encodedAddress}`
    : `https://maps.google.com/maps?q=${encodedAddress}&output=embed`;
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodedAddress}`;
  // Documented search URL — always works even when the keyless iframe embed
  // silently fails (no onError fires for content-level failures).
  const viewOnMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`;

  return (
    <Card className="overflow-hidden">
      {iframeReady ? (
        <iframe
          src={mapSrc}
          title={`Map showing ${venueName || location}`}
          className="w-full h-[300px] border-0"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          allowFullScreen
        />
      ) : (
        <Skeleton className="w-full h-[300px] rounded-none" />
      )}
      <div className="p-4 space-y-3">
        <div className="flex items-start gap-2">
          <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
          <div>
            {venueName && <div className="font-semibold text-foreground text-sm">{venueName}</div>}
            <div className="text-sm text-muted-foreground">{location}</div>
          </div>
        </div>
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
      </div>
    </Card>
  );
}
