import type { EnhancedShow } from '@/hooks/useBrowseShowsData';
import { deriveShowMarkerStatus, type ShowMarkerStatus } from '@/features/maps/markerStatus';

export interface LocatedShow {
  show: EnhancedShow;
  lat: number;
  lng: number;
  status: ShowMarkerStatus;
}

/** Split filtered shows into mappable pins and an omitted count. */
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
