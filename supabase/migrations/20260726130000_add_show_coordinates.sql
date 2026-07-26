-- Venue coordinates for the Find Shows map view (openspec change: add-show-map-view).
-- Nullable by design: shows without a secretary-confirmed pin simply don't appear
-- on the map. Coordinates are set via the wizard/Show Settings VenuePinMap.
ALTER TABLE public.shows
  ADD COLUMN latitude double precision
    CONSTRAINT shows_latitude_range CHECK (latitude BETWEEN -90 AND 90),
  ADD COLUMN longitude double precision
    CONSTRAINT shows_longitude_range CHECK (longitude BETWEEN -180 AND 180);

COMMENT ON COLUMN public.shows.latitude IS 'Venue latitude, secretary-confirmed via draggable pin (nullable)';
COMMENT ON COLUMN public.shows.longitude IS 'Venue longitude, secretary-confirmed via draggable pin (nullable)';
