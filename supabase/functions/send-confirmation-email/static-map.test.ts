import { describe, expect, it } from 'vitest';
import { buildVenueMapAssets, renderVenueMapBlock } from './static-map';

describe('buildVenueMapAssets', () => {
  it('builds a marker-centered static map URL and a directions link', () => {
    const assets = buildVenueMapAssets(38.49, -90.82, 'test-key');

    expect(assets).not.toBeNull();
    expect(assets!.imageUrl).toBe(
      'https://maps.googleapis.com/maps/api/staticmap?center=38.49%2C-90.82&zoom=15&size=600x300&scale=2&markers=color%3Ared%7C38.49%2C-90.82&key=test-key'
    );
    expect(assets!.linkUrl).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=38.49%2C-90.82'
    );
  });

  it('returns null without a key — the email renders exactly as before', () => {
    expect(buildVenueMapAssets(38.49, -90.82, undefined)).toBeNull();
    expect(buildVenueMapAssets(38.49, -90.82, '   ')).toBeNull();
  });

  it('returns null for missing or out-of-range coordinates', () => {
    expect(buildVenueMapAssets(null, -90.82, 'k')).toBeNull();
    expect(buildVenueMapAssets(38.49, null, 'k')).toBeNull();
    expect(buildVenueMapAssets(Number.NaN, -90.82, 'k')).toBeNull();
    expect(buildVenueMapAssets(91, 0, 'k')).toBeNull();
    expect(buildVenueMapAssets(0, 181, 'k')).toBeNull();
  });
});

describe('renderVenueMapBlock', () => {
  const assets = buildVenueMapAssets(38.49, -90.82, 'test-key')!;

  it('renders a linked image whose alt names the venue first line only', () => {
    const html = renderVenueMapBlock(assets, 'Purina Farms\n200 Checkerboard Loop');

    // href passes through esc(), so the query ampersand is entity-encoded.
    expect(html).toContain(
      'href="https://www.google.com/maps/dir/?api=1&amp;destination=38.49%2C-90.82"'
    );
    expect(html).toContain('alt="Map to Purina Farms"');
    expect(html).toContain('maps.googleapis.com/maps/api/staticmap');
  });

  it('escapes venue text destined for the alt attribute', () => {
    const html = renderVenueMapBlock(assets, 'Smith & "Sons" <Arena>');

    expect(html).toContain('alt="Map to Smith &amp; &quot;Sons&quot; &lt;Arena&gt;"');
  });

  it('renders the empty string when assets are absent', () => {
    expect(renderVenueMapBlock(null, 'Somewhere')).toBe('');
    expect(renderVenueMapBlock(undefined, 'Somewhere')).toBe('');
  });
});
