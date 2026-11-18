import { describe, expect, it } from 'vitest';
import {
  isProductionHost,
  isReadRequest,
  rangeHeaders,
} from '../../../scripts/landing-capture/guardRules';
import { PRODUCTION_PROJECT_REF } from '../productionFixtureGuard';

// Known answers for the capture write guard (scripts/landing-capture). A capture drives the
// real app against a shared database, so what the guard lets leave the machine is pinned here.
describe('isReadRequest', () => {
  it.each([
    ['GET', '/rest/v1/entries'],
    ['HEAD', '/rest/v1/classes'],
    ['OPTIONS', '/rest/v1/rpc/ringside_update_entry'],
    ['POST', '/auth/v1/token'],
    ['POST', '/rest/v1/rpc/get_show_summary'],
    ['POST', '/rest/v1/rpc/is_show_staff'],
    ['POST', '/rest/v1/rpc/entry_results_changed_since'],
    ['POST', '/rest/v1/rpc/ringside_claim_generation_current'],
  ])('lets %s %s through', (method, path) => {
    expect(isReadRequest(method, path)).toBe(true);
  });

  it.each([
    ['POST', '/rest/v1/rpc/ringside_update_entry'],
    ['POST', '/rest/v1/rpc/update_get_things'],
    ['POST', '/rest/v1/entries'],
    ['POST', '/rest/v1/analytics_events'],
    ['PATCH', '/rest/v1/entries'],
    ['PUT', '/rest/v1/entries'],
    ['DELETE', '/rest/v1/entries'],
    ['POST', '/functions/v1/send-email'],
    ['POST', '/storage/v1/object/premiums/a.pdf'],
    ['POST', '/auth/v1/logout'],
    ['POST', '/auth/v1/signup'],
    ['POST', '/auth/v1/recover'],
    ['POST', '/auth/v1/otp'],
    ['POST', '/auth/v1/token/extra'],
  ])('refuses %s %s', (method, path) => {
    expect(isReadRequest(method, path)).toBe(false);
  });
});

describe('isProductionHost', () => {
  it('uses the same project ref as the Playwright fixture guard', () => {
    expect(isProductionHost(`${PRODUCTION_PROJECT_REF}.supabase.co`)).toBe(true);
  });

  it('is false for a local or isolated stack', () => {
    expect(isProductionHost('127.0.0.1')).toBe(false);
    expect(isProductionHost('localhost')).toBe(false);
    expect(isProductionHost(`not${PRODUCTION_PROJECT_REF}.supabase.co`)).toBe(false);
  });
});

describe('rangeHeaders', () => {
  const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i }));

  it('shrinks the range and the total by the rows a patch dropped', () => {
    expect(rangeHeaders({ 'content-range': '0-48/49' }, rows(49), rows(43))).toEqual({
      'content-range': '0-42/43',
    });
  });

  it('shrinks a count probe, which has no row range', () => {
    expect(rangeHeaders({ 'content-range': '*/49' }, rows(49), rows(43))).toEqual({
      'content-range': '*/43',
    });
  });

  it('reports no rows when the patch dropped them all', () => {
    expect(rangeHeaders({ 'content-range': '0-1/2' }, rows(2), rows(0))).toEqual({
      'content-range': '*/0',
    });
  });

  it('leaves the headers alone when nothing was dropped or the body is not a list', () => {
    const headers = { 'content-range': '0-4/5', etag: 'x' };
    expect(rangeHeaders(headers, rows(5), rows(5))).toBe(headers);
    expect(rangeHeaders(headers, { a: 1 }, { a: 1 })).toBe(headers);
    expect(rangeHeaders({ etag: 'x' }, rows(5), rows(2))).toEqual({ etag: 'x' });
  });
});
