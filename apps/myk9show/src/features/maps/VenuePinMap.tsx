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

/**
 * Clicks and drags on Leaflet's repeated world copies yield longitudes outside
 * ±180, which the DB's shows_longitude_range CHECK rejects — wrap them back.
 */
export function normalizePinValue(lat: number, lng: number): VenuePinValue {
  const clampedLat = Math.min(90, Math.max(-90, lat));
  // Only wrap out-of-range longitudes — .wrap() adds float error to in-range ones.
  const wrappedLng = lng >= -180 && lng <= 180 ? lng : L.latLng(clampedLat, lng).wrap().lng;
  return { lat: clampedLat, lng: wrappedLng };
}

interface VenuePinMapProps {
  /** Current pin position; null = no pin placed yet. */
  value: VenuePinValue | null;
  onChange: (value: VenuePinValue) => void;
  /** Full venue address used by the "Locate address" action. */
  address: string;
  className?: string;
}

interface FlyTarget extends VenuePinValue {
  /** Distinguishes successive geocodes to the same coordinates. */
  nonce: number;
}

/** Re-centers only on geocode results — drags and clicks must not yank the view. */
function FlyToTarget({ target }: { target: FlyTarget | null }) {
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
export function VenuePinMap({ value, onChange, address, className }: VenuePinMapProps) {
  const [isLocating, setIsLocating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [flyTarget, setFlyTarget] = useState<FlyTarget | null>(null);

  // Mirror the latest pin and address so a slow geocode can detect it was
  // superseded — by a manual click/drag, or by an address edit — mid-flight.
  const latestValueRef = useRef<VenuePinValue | null>(value);
  const latestAddressRef = useRef(address);
  useEffect(() => {
    latestValueRef.current = value;
  }, [value]);
  useEffect(() => {
    latestAddressRef.current = address;
  }, [address]);

  const handleLocate = useCallback(async () => {
    setNotice(null);
    setIsLocating(true);
    const valueAtRequest = latestValueRef.current;
    const addressAtRequest = address;
    const result = await geocodeAddress(address);
    setIsLocating(false);
    if (latestValueRef.current !== valueAtRequest) return;
    if (latestAddressRef.current !== addressAtRequest) return;
    if (result) {
      const normalized = normalizePinValue(result.lat, result.lng);
      onChange(normalized);
      setFlyTarget({ ...normalized, nonce: Date.now() });
    } else {
      setNotice("Couldn't find that address — click the map to place the pin manually.");
    }
  }, [address, onChange]);

  const handleDragEnd = useCallback(
    (event: L.DragEndEvent) => {
      const position = (event.target as L.Marker).getLatLng();
      onChange(normalizePinValue(position.lat, position.lng));
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
        <p className="mb-2 text-sm text-warning" role="status">
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
          <FlyToTarget target={flyTarget} />
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
