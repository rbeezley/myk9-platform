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
  const includesReplacementPin =
    (updates.latitude === null && updates.longitude === null) ||
    (typeof updates.latitude === 'number' &&
      Number.isFinite(updates.latitude) &&
      updates.latitude >= -90 &&
      updates.latitude <= 90 &&
      typeof updates.longitude === 'number' &&
      Number.isFinite(updates.longitude) &&
      updates.longitude >= -180 &&
      updates.longitude <= 180);

  if (!locationChanged || includesReplacementPin) return updates;

  return {
    ...updates,
    latitude: null,
    longitude: null,
  };
}
