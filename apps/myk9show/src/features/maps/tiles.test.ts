import { describe, expect, it } from 'vitest';
import { MISSING_TILE_URL, OSM_TILE_URL } from './tiles';

function decodeSvg(): string {
  return decodeURIComponent(MISSING_TILE_URL.replace(/^data:image\/svg\+xml;utf8,/, ''));
}

describe('MISSING_TILE_URL', () => {
  it('needs no network, because whatever blocked the tiles would block it too', () => {
    expect(MISSING_TILE_URL.startsWith('data:image/svg+xml')).toBe(true);
    // The failure this exists for is "the tile host is unreachable". A
    // placeholder fetched over the network would fail in the same conditions
    // and paint nothing, which is the state it is meant to replace. The one
    // permitted http(s) string is the SVG namespace, which is never fetched.
    const withoutNamespace = MISSING_TILE_URL.split(encodeURIComponent('http://www.w3.org/2000/svg')).join('');
    expect(withoutNamespace).not.toMatch(/https?(:|%3A)/i);
  });

  it('is a 256px square, matching the tile it stands in for', () => {
    const svg = decodeSvg();
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
    expect(svg).toContain('width="256"');
    expect(svg).toContain('height="256"');
  });

  it('is translucent, so one asset serves both themes', () => {
    const svg = decodeSvg();
    // A solid fill would be right in one theme and wrong in the other; the
    // map container's own themed background is what shows through.
    expect(svg).toMatch(/stroke-opacity="0\.\d+"/);
    expect(svg).not.toMatch(/<rect[^>]*fill="#[0-9a-f]{3,8}"/i);
  });

  it('is a stable value distinct from the tile URL, which Leaflet needs to avoid a reload loop', () => {
    // _tileOnError swaps the src only when it differs from errorTileUrl, so a
    // value that changed per read would re-enter the error handler forever.
    expect(MISSING_TILE_URL).toBe(MISSING_TILE_URL);
    expect(MISSING_TILE_URL).not.toBe(OSM_TILE_URL);
  });
});
