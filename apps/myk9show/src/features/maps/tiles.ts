/** OpenStreetMap raster tiles — free, attribution required. Swap this URL for a paid tile host if OSM policy ever becomes a constraint. */
export const OSM_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

export const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/** Continental-US fallback view when no pins exist to frame. */
export const US_CENTER: [number, number] = [39.8, -98.5];
