import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const appRoot = resolve(__dirname, '../../..');
const vercelConfig = JSON.parse(readFileSync(resolve(appRoot, 'vercel.json'), 'utf8')) as {
  headers: Array<{ headers: Array<{ key: string; value: string }> }>;
};
const productionCsp = vercelConfig.headers
  .flatMap(entry => entry.headers)
  .find(header => header.key === 'Content-Security-Policy')?.value;

describe('map tile deployment contract', () => {
  it('allows OpenStreetMap raster tiles in the production image policy', () => {
    expect(productionCsp).toContain(
      "img-src 'self' data: blob: https://*.supabase.co https://*.tile.openstreetmap.org"
    );
  });
});
