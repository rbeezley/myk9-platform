/**
 * MYK9-686: "Locate address" fetches Nominatim from the browser, but the
 * production CSP's `connect-src` did not list it, so every deployed geocode was
 * blocked before it left the page and surfaced as "Couldn't find that address".
 *
 * Checked by MATCHING the geocoder's real request URL against the parsed
 * directive (wildcards included), not by looking for a string, so a new
 * provider URL or a narrowed directive fails here.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateCSPPolicy } from '@/config/security';
import { NOMINATIM_SEARCH_URL } from '@/features/maps/geocode';
import { OSM_TILE_URL } from '@/features/maps/tiles';

const appRoot = resolve(__dirname, '../../..');
const vercelConfig = JSON.parse(readFileSync(resolve(appRoot, 'vercel.json'), 'utf8')) as {
  headers: Array<{ headers: Array<{ key: string; value: string }> }>;
};
const productionCsp =
  vercelConfig.headers
    .flatMap(entry => entry.headers)
    .find(header => header.key === 'Content-Security-Policy')?.value ?? '';

function directive(csp: string, name: string): string[] {
  const found = csp
    .split(';')
    .map(part => part.trim().split(/\s+/))
    .find(([directiveName]) => directiveName === name);
  return found ? found.slice(1) : [];
}

/** CSP host-source matching for the forms this policy uses: scheme://host and scheme://*.host. */
function allows(sources: string[], requestUrl: string): boolean {
  const url = new URL(requestUrl);
  return sources.some(source => {
    const match = /^(https?|wss?):\/\/(\*\.)?([^/:]+)/.exec(source);
    if (!match) return false;
    const [, scheme, wildcard, host] = match;
    if (`${scheme}:` !== url.protocol) return false;
    return wildcard ? url.hostname.endsWith(`.${host}`) : url.hostname === host;
  });
}

describe('geocoder CSP contract (MYK9-686)', () => {
  it('the matcher refuses a host the policy does not list (positive control)', () => {
    expect(allows(directive(productionCsp, 'connect-src'), 'https://evil.example.com/x')).toBe(
      false
    );
    expect(allows(directive(productionCsp, 'connect-src'), 'https://abc.supabase.co/rest')).toBe(
      true
    );
  });

  it('lets the deployed app reach the geocoder', () => {
    expect(allows(directive(productionCsp, 'connect-src'), `${NOMINATIM_SEARCH_URL}?q=x`)).toBe(
      true
    );
  });

  it('keeps the runtime CSP definition in step with the deployed one', () => {
    for (const env of ['production', 'development']) {
      const connectSrc = directive(generateCSPPolicy(env), 'connect-src');
      expect(allows(connectSrc, `${NOMINATIM_SEARCH_URL}?q=x`)).toBe(true);
    }
  });

  it('still lets the map tiles load', () => {
    const tile = OSM_TILE_URL.replace('{s}', 'a').replace(/\{[xyz]\}/g, '1');
    expect(allows(directive(productionCsp, 'img-src'), tile)).toBe(true);
  });
});
