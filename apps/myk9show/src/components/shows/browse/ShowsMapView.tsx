import { useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPinOff, ArrowRight } from 'lucide-react';
import { EmptyState } from '@/components/common/EmptyState';
import type { EnhancedShow } from '@/hooks/useBrowseShowsData';
import { deriveShowMarkerStatus, type ShowMarkerStatus } from '@/features/maps/markerStatus';
import { OSM_TILE_URL, OSM_ATTRIBUTION, US_CENTER } from '@/features/maps/tiles';
import { formatShowDateRange } from '@/lib/format/dates';

/** Marker/legend colors — fixed palette chosen to read on OSM tiles in both themes. */
const STATUS_META: Record<ShowMarkerStatus, { label: string; color: string }> = {
  open: { label: 'Entries open', color: '#16a34a' },
  'closing-soon': { label: 'Closing soon', color: '#d97706' },
  full: { label: 'Full', color: '#dc2626' },
  waitlist: { label: 'Waitlist', color: '#9333ea' },
  closed: { label: 'Not accepting entries', color: '#6b7280' },
};

/** Teardrop pin as a divIcon so each status gets its own color without icon assets. */
function buildStatusIcon(status: ShowMarkerStatus): L.DivIcon {
  const { color } = STATUS_META[status];
  return L.divIcon({
    className: '',
    html: `<svg width="44" height="44" viewBox="0 0 44 44" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 1px 2px rgb(0 0 0 / 0.4))">
      <path d="M22 3C14.3 3 8 9.3 8 17c0 10.5 14 24 14 24s14-13.5 14-24C36 9.3 29.7 3 22 3z" fill="${color}"/>
      <circle cx="22" cy="17" r="5" fill="white"/>
    </svg>`,
    iconSize: [44, 44],
    iconAnchor: [22, 44],
    popupAnchor: [0, -40],
  });
}

// Built once — a fresh DivIcon per marker per render would re-run setIcon on every pin.
const STATUS_ICONS = Object.fromEntries(
  (Object.keys(STATUS_META) as ShowMarkerStatus[]).map(st => [st, buildStatusIcon(st)])
) as Record<ShowMarkerStatus, L.DivIcon>;

interface LocatedShow {
  show: EnhancedShow;
  lat: number;
  lng: number;
  status: ShowMarkerStatus;
}

/** Split filtered shows into mappable pins and an omitted count. Exported for tests. */
export function partitionMappableShows(shows: EnhancedShow[]): {
  located: LocatedShow[];
  omittedCount: number;
} {
  const located: LocatedShow[] = [];
  let omittedCount = 0;
  for (const show of shows) {
    if (show.latitude != null && show.longitude != null) {
      located.push({
        show,
        lat: show.latitude,
        lng: show.longitude,
        status: deriveShowMarkerStatus(show),
      });
    } else {
      omittedCount += 1;
    }
  }
  return { located, omittedCount };
}

const US_ZOOM = 4;

/** Fits the viewport to the current pins whenever the filtered set changes. */
function FitToPins({ located }: { located: LocatedShow[] }) {
  const map = useMap();
  // Background refetches rebuild `located` with identical content; keying the
  // effect on a content signature stops refits from yanking the user's pan/zoom.
  const pinsKey = located.map(p => `${p.show.id}:${p.lat}:${p.lng}`).join('|');
  const locatedRef = useRef(located);
  useEffect(() => {
    locatedRef.current = located;
  }, [located]);
  useEffect(() => {
    const pins = locatedRef.current;
    if (pins.length === 0) return;
    if (pins.length === 1) {
      map.setView(US_CENTER, US_ZOOM);
      return;
    }
    const bounds = L.latLngBounds(pins.map(p => [p.lat, p.lng] as [number, number]));
    map.fitBounds(bounds.pad(0.2), { maxZoom: 10 });
  }, [map, pinsKey]);
  return null;
}

function StatusDot({ status, className }: { status: ShowMarkerStatus; className: string }) {
  return (
    <span
      className={className}
      style={{ backgroundColor: STATUS_META[status].color }}
      aria-hidden
    />
  );
}

function MapLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {(Object.keys(STATUS_META) as ShowMarkerStatus[]).map(status => (
        <span
          key={status}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
        >
          <StatusDot status={status} className="inline-block h-2.5 w-2.5 rounded-full" />
          {STATUS_META[status].label}
        </span>
      ))}
    </div>
  );
}

interface ShowsMapViewProps {
  shows: EnhancedShow[];
  onSwitchToCards: () => void;
}

/**
 * Map view mode for Find Shows: the current filtered show list rendered as
 * status-colored pins. Pure renderer — all filtering lives upstream in
 * useBrowseShowsFilters, identical to the cards/table/calendar views.
 */
export function ShowsMapView({ shows, onSwitchToCards }: ShowsMapViewProps) {
  const { located, omittedCount } = useMemo(() => partitionMappableShows(shows), [shows]);

  if (located.length === 0) {
    return (
      <EmptyState
        icon={MapPinOff}
        title="No shows on the map yet"
        description="None of the matching shows have a confirmed venue pin. They're still listed in the other views."
        action={{ label: 'View as cards', onClick: onSwitchToCards }}
      />
    );
  }

  return (
    <div className="mt-4 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <MapLegend />
        {omittedCount > 0 && (
          <p className="text-xs text-muted-foreground" data-testid="map-omitted-note">
            {omittedCount} {omittedCount === 1 ? 'show' : 'shows'} without a map pin not shown
          </p>
        )}
      </div>
      <div className="overflow-hidden rounded-lg border border-border">
        <MapContainer
          center={US_CENTER}
          zoom={US_ZOOM}
          style={{ height: 'min(70vh, 640px)', width: '100%' }}
          scrollWheelZoom
        >
          <TileLayer url={OSM_TILE_URL} attribution={OSM_ATTRIBUTION} />
          <FitToPins located={located} />
          {located.map(({ show, lat, lng, status }) => (
            <Marker key={show.id} position={[lat, lng]} icon={STATUS_ICONS[status]}>
              <Popup>
                <div className="min-w-[200px] space-y-1">
                  <p className="font-semibold leading-snug">{show.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatShowDateRange(show.startDate, show.endDate)}
                  </p>
                  {show.location && (
                    <p className="text-xs text-muted-foreground">{show.location}</p>
                  )}
                  <p className="text-xs">
                    <StatusDot
                      status={status}
                      className="mr-1.5 inline-block h-2 w-2 rounded-full"
                    />
                    {STATUS_META[status].label}
                    {show.preEntryFee && Number(show.preEntryFee) > 0 && (
                      <> &middot; entries from ${Number(show.preEntryFee).toFixed(2)}</>
                    )}
                  </p>
                  <Link
                    to={`/shows/${show.id}`}
                    className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                  >
                    View show <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}
