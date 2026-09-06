// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import handler, { geocodePlace, labelFromNominatim, locationFromRequest } from './geo';

function mockRes() {
  const res = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    setHeader(name: string, value: string) {
      this.headers[name] = value;
      return this;
    },
    json(value: unknown) {
      this.body = value;
      return this;
    },
    send(value: unknown) {
      this.body = value;
      return this;
    },
    end() {
      return this;
    },
  };
  return res as unknown as VercelResponse & typeof res;
}

function req(headers: Record<string, string> = {}, query: Record<string, string> = {}) {
  return { method: 'GET', headers, query } as unknown as VercelRequest;
}

describe('locationFromRequest', () => {
  it('reads the Vercel geo headers into an approximate location', () => {
    const result = locationFromRequest(
      req({
        'x-vercel-ip-city': 'San%20Jose',
        'x-vercel-ip-country-region': 'CA',
        'x-vercel-ip-country': 'US',
        'x-vercel-ip-latitude': '37.33',
        'x-vercel-ip-longitude': '-121.89',
      })
    );
    expect(result).toEqual({ label: 'San Jose, CA', lat: 37.33, lng: -121.89, approximate: true });
  });

  it('is null without coordinates, and tolerates a missing city', () => {
    expect(locationFromRequest(req({ 'x-vercel-ip-city': 'Tulsa' }))).toBeNull();
    expect(
      locationFromRequest(req({ 'x-vercel-ip-latitude': '1', 'x-vercel-ip-longitude': '2' }))
    ).toEqual({ label: 'Near you', lat: 1, lng: 2, approximate: true });
  });
});

describe('labelFromNominatim', () => {
  it('prefers city + state, then the first two display-name parts, then the query', () => {
    expect(labelFromNominatim({ address: { city: 'Tulsa', state: 'Oklahoma' } }, 'q')).toBe(
      'Tulsa, Oklahoma'
    );
    expect(labelFromNominatim({ address: { town: 'Grove' } }, 'q')).toBe('Grove');
    expect(labelFromNominatim({ display_name: 'Camp Loughridge, Tulsa, OK, USA' }, 'q')).toBe(
      'Camp Loughridge, Tulsa'
    );
    expect(labelFromNominatim({}, 'typed')).toBe('typed');
  });
});

describe('geocodePlace', () => {
  it('returns the first hit with a label, and null on a miss, an error, or blank input', async () => {
    const ok = vi.fn(async () => ({
      ok: true,
      json: async () => [
        { lat: '36.15', lon: '-95.99', address: { city: 'Tulsa', state: 'Oklahoma' } },
      ],
    })) as unknown as typeof fetch;
    expect(await geocodePlace('Tulsa, OK', ok)).toEqual({
      label: 'Tulsa, Oklahoma',
      lat: 36.15,
      lng: -95.99,
      approximate: false,
    });
    expect(vi.mocked(ok).mock.calls[0]?.[1]?.headers).toMatchObject({
      'User-Agent': expect.stringContaining('myK9Show'),
    });

    const miss = (async () => ({ ok: true, json: async () => [] })) as unknown as typeof fetch;
    expect(await geocodePlace('nowhere at all', miss)).toBeNull();
    const boom = (async () => {
      throw new Error('network');
    }) as unknown as typeof fetch;
    expect(await geocodePlace('Tulsa', boom)).toBeNull();
    expect(await geocodePlace('   ', ok)).toBeNull();
  });
});

describe('handler', () => {
  it('serves the connection location privately, and 204 when unknown', async () => {
    const res = mockRes();
    await handler(
      req({
        'x-vercel-ip-city': 'Tulsa',
        'x-vercel-ip-country-region': 'OK',
        'x-vercel-ip-latitude': '36.1',
        'x-vercel-ip-longitude': '-95.9',
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(res.headers['Cache-Control']).toBe('private, no-store');
    expect(res.body).toMatchObject({ label: 'Tulsa, OK', approximate: true });

    const empty = mockRes();
    await handler(req(), empty);
    expect(empty.statusCode).toBe(204);
  });

  it('rejects anything but GET', async () => {
    const res = mockRes();
    await handler({ method: 'POST', headers: {}, query: {} } as unknown as VercelRequest, res);
    expect(res.statusCode).toBe(405);
  });
});
