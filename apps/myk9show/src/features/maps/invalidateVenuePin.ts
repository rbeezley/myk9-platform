interface VenueLocationUpdate {
  location?: string | undefined;
  latitude?: number | null | undefined;
  longitude?: number | null | undefined;
}

export function invalidateVenuePinIfLocationChanged<T extends VenueLocationUpdate>(
  currentLocation: string | null | undefined,
  updates: T
): T {
  const locationChanged = updates.location !== undefined && updates.location !== currentLocation;
  const includesReplacementPin = 'latitude' in updates && 'longitude' in updates;

  if (!locationChanged || includesReplacementPin) return updates;

  return {
    ...updates,
    latitude: null,
    longitude: null,
  };
}
