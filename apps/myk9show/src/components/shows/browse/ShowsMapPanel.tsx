import { Suspense } from 'react';
import { MapPinOff, RefreshCw } from 'lucide-react';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { EmptyState } from '@/components/common/EmptyState';
import { ShowCalendarSkeleton } from '@/components/common/SkeletonLoaders';
import { ShowsMapView } from '@/components/common/LazyComponents';
import type { EnhancedShow } from '@/hooks/useBrowseShowsData';

interface ShowsMapPanelProps {
  shows: EnhancedShow[];
  onSwitchToCards: () => void;
}

/**
 * The map view plus its own failure boundary.
 *
 * The map arrives as a lazily-imported chunk carrying Leaflet. If that import
 * fails — an ad blocker, a corporate proxy, a bad deploy — React re-throws the
 * rejection on render, and without a boundary here the nearest one is the
 * route's, which replaces the whole page: a visitor loses the show list
 * because the decoration beside it failed. This boundary keeps the failure
 * inside the panel.
 *
 * It does NOT cover blocked map TILES, which are the more common outage and a
 * different mechanism entirely: Leaflet's `_tileOnError` handles the image
 * error event and calls `done()` (leaflet 1.9.4), so a tile that 404s paints
 * blank rather than throwing. Nothing here can see that. Covering it needs
 * `errorTileUrl` or a `tileerror` listener on the TileLayer, which is a
 * separate change.
 *
 * The recovery offered is deliberately not "Try again". React's `lazy` caches a
 * rejected import (`payload._status = 2`, re-thrown on every later render —
 * react 19.2.8 `lazyInitializer`), so resetting the boundary re-renders
 * straight back into the same error for the most likely failure. Switching to
 * cards always works; reloading is the only thing that re-attempts the chunk.
 */
export function ShowsMapPanel({ shows, onSwitchToCards }: ShowsMapPanelProps) {
  return (
    <ErrorBoundary
      level="section"
      context="find shows map"
      fallback={() => (
        <EmptyState
          icon={MapPinOff}
          title="The map didn't load"
          description="This device could not load the map. Every show is still listed in the other views."
          action={{ label: 'View as cards', onClick: onSwitchToCards }}
          secondaryAction={{
            label: 'Reload the page',
            onClick: () => window.location.reload(),
            icon: RefreshCw,
          }}
        />
      )}
    >
      <Suspense fallback={<ShowCalendarSkeleton />}>
        <ShowsMapView shows={shows} onSwitchToCards={onSwitchToCards} />
      </Suspense>
    </ErrorBoundary>
  );
}

export default ShowsMapPanel;
