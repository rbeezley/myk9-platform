/** OpenStreetMap raster tiles — free, attribution required. Swap this URL for a paid tile host if OSM policy ever becomes a constraint. */
export const OSM_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

export const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/** Continental-US fallback view when no pins exist to frame. */
export const US_CENTER: [number, number] = [39.8, -98.5];

/**
 * Painted in place of a tile that failed to load.
 *
 * Leaflet does not throw when a tile 404s or is blocked — `_tileOnError`
 * handles the image error event and swaps in `errorTileUrl` if one is set
 * (leaflet 1.9.4). Without one the tile keeps its `alt=""` and renders as
 * nothing, so a blocked tile host leaves a blank rectangle with pins floating
 * on it, indistinguishable from genuinely empty map.
 *
 * Two constraints shape this asset. It is a `data:` URI because whatever
 * blocked the tile host — an ad blocker, a proxy, an offline device — would
 * block a hosted placeholder too, and because the CSP's `img-src` admits
 * `data:`. And it is semi-transparent hatch rather than a solid fill, so one
 * asset works in both themes: the map container's own background shows
 * through, and the hatch reads as "no imagery here" rather than as a legitimate
 * empty area of the map.
 */
const MISSING_TILE_SVG = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">',
  '<defs>',
  '<pattern id="d" width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">',
  '<line x1="0" y1="0" x2="0" y2="18" stroke="#8a8378" stroke-opacity="0.22" stroke-width="1.5"/>',
  '</pattern>',
  '</defs>',
  '<rect width="256" height="256" fill="url(#d)"/>',
  '</svg>',
].join('');

export const MISSING_TILE_URL = `data:image/svg+xml;utf8,${encodeURIComponent(MISSING_TILE_SVG)}`;
