import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { logger } from '@/services/LoggingService';
import { fetchApproximateLocation, geocodePlaceQuery } from './geoClient';
import {
  profileAddressQuery,
  readRememberedLocation,
  resolveViewerLocation,
  writeRememberedLocation,
  type RememberedLocation,
  type ViewerLocation,
} from './viewerLocation';

export interface UseViewerLocationResult {
  location: ViewerLocation | null;
  /** True while the profile or connection guess is still being looked up. */
  isResolving: boolean;
  /** Geocode a typed place and remember it; resolves false on a miss. */
  chooseTyped: (query: string) => Promise<boolean>;
  /** Ask the browser for a precise position — only ever from a click. */
  useDeviceLocation: () => Promise<boolean>;
  /** Clear to Anywhere and remember that choice on this device. */
  chooseAnywhere: () => void;
}

/**
 * Where the visitor is, for the Find Shows Near field (MYK9-427 PR 2).
 *
 * Precedence lives in `resolveViewerLocation`: a choice made on this device,
 * then the signed-in profile's city/state/zip, then the approximate city from
 * the connection, then nothing. Nothing here prompts for device location on
 * load — `useDeviceLocation` runs only from the visitor's click.
 */
export function useViewerLocation(databaseUserId: string | undefined): UseViewerLocationResult {
  const [remembered, setRemembered] = useState<RememberedLocation | null>(() =>
    readRememberedLocation()
  );

  const profileQuery = useQuery({
    queryKey: ['viewerLocation', 'profile', databaseUserId],
    queryFn: async (): Promise<ViewerLocation | null> => {
      if (!databaseUserId) return null;
      const { data, error } = await supabase
        .from('people')
        .select('city, state, zip_code')
        .eq('id', databaseUserId)
        .maybeSingle();
      if (error) {
        logger.warn('Could not read profile location', 'shows', { code: error.code });
        return null;
      }
      const address = data ? profileAddressQuery(data) : null;
      return address ? geocodePlaceQuery(address, 'profile') : null;
    },
    enabled: Boolean(databaseUserId),
    staleTime: 24 * 60 * 60 * 1000,
  });

  // The connection guess is only worth asking for when nothing better exists.
  const needsIp = !databaseUserId && remembered === null;
  const ipQuery = useQuery({
    queryKey: ['viewerLocation', 'ip'],
    queryFn: () => fetchApproximateLocation(),
    enabled: needsIp,
    staleTime: 24 * 60 * 60 * 1000,
  });

  useEffect(() => {
    writeRememberedLocation(remembered);
  }, [remembered]);

  const location = useMemo(
    () =>
      resolveViewerLocation({
        profile: profileQuery.data ?? null,
        remembered,
        ip: ipQuery.data ?? null,
      }),
    [ipQuery.data, profileQuery.data, remembered]
  );

  const chooseTyped = useCallback(async (query: string) => {
    const found = await geocodePlaceQuery(query, 'remembered');
    if (!found) return false;
    setRemembered({ kind: 'location', label: found.label, lat: found.lat, lng: found.lng });
    return true;
  }, []);

  const useDeviceLocation = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return false;
    return new Promise<boolean>(resolve => {
      navigator.geolocation.getCurrentPosition(
        position => {
          setRemembered({
            kind: 'location',
            label: 'Your location',
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
          resolve(true);
        },
        () => resolve(false),
        { maximumAge: 10 * 60 * 1000, timeout: 10_000 }
      );
    });
  }, []);

  const chooseAnywhere = useCallback(() => setRemembered({ kind: 'anywhere' }), []);

  const isResolving =
    (Boolean(databaseUserId) && profileQuery.isPending) || (needsIp && ipQuery.isPending);

  return { location, isResolving, chooseTyped, useDeviceLocation, chooseAnywhere };
}
