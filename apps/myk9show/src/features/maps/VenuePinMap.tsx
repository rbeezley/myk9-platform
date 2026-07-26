import { useCallback, useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import { MapPin, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { geocodeAddress } from './geocode';
import { OSM_TILE_URL, OSM_ATTRIBUTION, US_CENTER } from './tiles';

// Leaflet's default icon URLs break under bundlers; point them at the bundled assets.
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const US_ZOOM = 3;
const PIN_ZOOM = 15;

export interface VenuePinValue {
  lat: number;
  lng: number;
}

interface VenuePinMapProps {
  /** Current pin position; null = no pin placed yet. */
  value: VenuePinValue | null;
  onChange: (value: VenuePinValue) => void;
  /** Full venue address used by the "Locate address" action. */
  address: string;
  className?: string;
}

/** Re-centers the map when the pin moves programmatically (geocode result). */
function RecenterOnValue({ value }: { value: VenuePinValue | null }) {
  const map = useMap();
  const lastRef = useRef<VenuePinValue | null>(value);
  useEffect(() => {
    if (value && (lastRef.current?.lat !== value.lat || lastRef.current?.lng !== value.lng)) {
      map.setView([value.lat, value.lng], Math.max(map.getZoom(), PIN_ZOOM));
    }
    lastRef.current = value;
  }, [map, value]);
  return null;
}

function ClickToPlace({ onChange }: { onChange: (v: VenuePinValue) => void }) {
  useMapEvents({
    click: e => onChange({ lat: e.latlng.lat, lng: e.latlng.lng }),
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
export function VenuePinMap({ value, onChange, address, className }: VenuePinMapProps) {
  const [isLocating, setIsLocating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const handleLocate = useCallback(async () => {
    setNotice(null);
    setIsLocating(true);
    const result = await geocodeAddress(address);
    setIsLocating(false);
    if (result) {
      onChange(result);
    } else {
      setNotice("Couldn't find that address — click the map to place the pin manually.");
    }
  }, [address, onChange]);

  const handleDragEnd = useCallback(
    (event: L.DragEndEvent) => {
      const position = (event.target as L.Marker).getLatLng();
      onChange({ lat: position.lat, lng: position.lng });
    },
    [onChange]
  );

  return (
    <div className={className}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {value
            ? 'Drag the pin to fine-tune the venue location.'
            : 'Locate the address or click the map to place the venue pin.'}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleLocate}
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
      {notice && (
        <p className="mb-2 text-sm text-amber-600 dark:text-amber-500" role="status">
          {notice}
        </p>
      )}
      <div className="overflow-hidden rounded-lg border border-border">
        <MapContainer
          center={value ? [value.lat, value.lng] : US_CENTER}
          zoom={value ? PIN_ZOOM : US_ZOOM}
          style={{ height: 280, width: '100%' }}
          scrollWheelZoom={false}
        >
          <TileLayer url={OSM_TILE_URL} attribution={OSM_ATTRIBUTION} />
          <RecenterOnValue value={value} />
          <ClickToPlace onChange={onChange} />
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
