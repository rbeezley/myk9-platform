import { useCallback, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
// Must follow leaflet.css: contains Leaflet's z-indexes so app overlays win.
import './leaflet-stacking.css';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import { MapPin, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  useVenuePinLocator,
  type VenueFlyTarget,
  type VenuePinLocator,
} from './useVenuePinLocator';
import { VenueLocateNotice } from './VenueLocateNotice';
import { normalizePinValue, type VenuePinValue } from './normalizePinValue';
import { OSM_TILE_URL, OSM_ATTRIBUTION, US_CENTER } from './tiles';

export type { VenuePinValue } from './normalizePinValue';

// Leaflet's default icon URLs break under bundlers; point them at the bundled assets.
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const US_ZOOM = 3;
const PIN_ZOOM = 15;

interface VenuePinMapProps {
  /** Current pin position; null = no pin placed yet. */
  value: VenuePinValue | null;
  onChange: (value: VenuePinValue) => void;
  /** Full venue address used by the "Locate address" action. */
  address: string;
  /**
   * The locate state, when the form owns it (the show wizard auto-locates on
   * address blur through the same hook). Omitted, the map owns its own.
   */
  locator?: VenuePinLocator | undefined;
  className?: string;
}

/** Re-centers only on geocode results — drags and clicks must not yank the view. */
function FlyToTarget({ target }: { target: VenueFlyTarget | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) {
      map.setView([target.lat, target.lng], Math.max(map.getZoom(), PIN_ZOOM));
    }
  }, [map, target]);
  return null;
}

function ClickToPlace({ onChange }: { onChange: (v: VenuePinValue) => void }) {
  useMapEvents({
    click: e => onChange(normalizePinValue(e.latlng.lat, e.latlng.lng)),
  });
  return null;
}

/**
 * Draggable venue pin on an OpenStreetMap base layer.
 *
 * The secretary confirms the geocoded location by eye and drags (or clicks)
 * to correct it — the saved coordinates are always the pin's final position.
 * Geocoding failures are non-blocking: a notice appears and the pin can be
 * placed manually, or skipped entirely.
 */
export function VenuePinMap({ value, onChange, address, locator, className }: VenuePinMapProps) {
  const ownLocator = useVenuePinLocator({ address, value, onChange });
  const { isLocating, notice, locate, flyTarget, placeManually } = locator ?? ownLocator;

  const handleDragEnd = useCallback(
    (event: L.DragEndEvent) => {
      const position = (event.target as L.Marker).getLatLng();
      placeManually(normalizePinValue(position.lat, position.lng));
    },
    [placeManually]
  );

  return (
    <div className={className}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        {/* MYK9-686: a missing pin is stated, never silent — exhibitors see no map without it. */}
        <p
          className={
            value || !address.trim() ? 'text-sm text-muted-foreground' : 'text-sm text-warning'
          }
        >
          {value
            ? 'Drag the pin to fine-tune the venue location.'
            : 'No map pin yet — locate the address or click the map to place it.'}
        </p>
        <Button
          type="button"
          variant="outline"
          size="touch"
          className="max-w-full whitespace-normal"
          onClick={locate}
          disabled={isLocating || !address.trim()}
        >
          {isLocating ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <MapPin className="mr-1.5 h-3.5 w-3.5" />
          )}
          Locate address
        </Button>
      </div>
      {notice && <VenueLocateNotice notice={notice} onRetry={locate} />}
      <div className="overflow-hidden rounded-lg border border-border">
        <MapContainer
          center={value ? [value.lat, value.lng] : US_CENTER}
          zoom={value ? PIN_ZOOM : US_ZOOM}
          style={{ height: 280, width: '100%' }}
          scrollWheelZoom={false}
        >
          <TileLayer url={OSM_TILE_URL} attribution={OSM_ATTRIBUTION} />
          <FlyToTarget target={flyTarget} />
          <ClickToPlace onChange={placeManually} />
          {value && (
            <Marker
              position={[value.lat, value.lng]}
              draggable
              eventHandlers={{ dragend: handleDragEnd }}
            />
          )}
        </MapContainer>
      </div>
    </div>
  );
}
