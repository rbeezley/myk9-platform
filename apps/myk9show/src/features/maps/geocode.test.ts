import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { geocodeAddress } from './geocode';

describe('geocodeAddress', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns coordinates for a Nominatim hit', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify([{ lat: '41.8781', lon: '-87.6298' }]), { status: 200 })
    );

    const result = await geocodeAddress('123 Main St, Chicago, IL 60601');

    expect(result).toEqual({ lat: 41.8781, lng: -87.6298 });
    const url = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(url).toContain('nominatim.openstreetmap.org/search');
    expect(url).toContain(encodeURIComponent('123 Main St, Chicago, IL 60601'));
    expect(url).toContain('format=jsonv2');
    expect(url).toContain('limit=1');
  });

  it('returns null when Nominatim finds nothing', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('[]', { status: 200 }));

    expect(await geocodeAddress('nowhere at all')).toBeNull();
  });

  it('returns null on a non-OK response', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('error', { status: 503 }));

    expect(await geocodeAddress('123 Main St')).toBeNull();
  });

  it('returns null when fetch rejects (network error / timeout)', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('network down'));

    expect(await geocodeAddress('123 Main St')).toBeNull();
  });

  it('returns null for non-numeric coordinates in the response', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify([{ lat: 'not-a-number', lon: '-87.6298' }]), { status: 200 })
    );

    expect(await geocodeAddress('123 Main St')).toBeNull();
  });

  it('returns null for a blank address without calling the network', async () => {
    expect(await geocodeAddress('   ')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});
