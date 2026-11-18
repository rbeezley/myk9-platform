import { describe, expect, it } from 'vitest';
import {
  FONT_HOSTS,
  decideRequest,
  decideSocket,
  devServerOrigin,
  hostResolverRules,
  isFixtureRow,
  isHostedBackendHost,
  isLoopbackHost,
  isProductionHost,
  isReadRequest,
  patchFixtureRows,
  rangeHeaders,
  stopMessage,
  strangerArmbands,
} from '../../../scripts/landing-capture/guardRules';
import type { RequestFacts } from '../../../scripts/landing-capture/guardRules';
import { PRODUCTION_PROJECT_REF } from '../productionFixtureGuard';

// Known answers for the landing capture guard (scripts/landing-capture, MYK9-2181). A capture
// drives the real app, so what it may send, and to where, is pinned here rule by rule. The
// same rules are proved in a real browser by scripts/landing-capture/selfcheck.ts.

const DEV = 'http://localhost:5173';
const STACK = 'http://127.0.0.1:54321';
const PRODUCTION = `https://${PRODUCTION_PROJECT_REF}.supabase.co`;
const FIXTURES = new Set([100, 101, 102, 103, 104, 105]);

const facts = (over: Partial<RequestFacts> & { url: string }): RequestFacts => ({
  method: 'GET',
  devOrigin: DEV,
  cutOff: false,
  stagedRpcs: new Set(),
  ...over,
});

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
    // Named like reads, but not declared read-only in the database.
    ['POST', '/rest/v1/rpc/get_show_access_codes'],
    ['POST', '/rest/v1/rpc/get_judge_day_capacity_live'],
    ['POST', '/rest/v1/rpc/list_retryable_waitlist_notification_events'],
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

describe('hosts', () => {
  it('uses the same production project ref as the Playwright fixture guard', () => {
    expect(isProductionHost(`${PRODUCTION_PROJECT_REF}.supabase.co`)).toBe(true);
    expect(isProductionHost(`${PRODUCTION_PROJECT_REF.toUpperCase()}.SUPABASE.CO`)).toBe(true);
    expect(isProductionHost(`not${PRODUCTION_PROJECT_REF}.supabase.co`)).toBe(false);
  });

  it.each([
    `${PRODUCTION_PROJECT_REF}.supabase.co`,
    `${PRODUCTION_PROJECT_REF}.functions.supabase.co`,
    'someotherproject.supabase.co',
    'someotherproject.supabase.in',
    'someotherproject.supabase.com',
    'someotherproject.supabase.co.',
    `${PRODUCTION_PROJECT_REF}.supabase.co.`,
    'supabase.co',
    `${PRODUCTION_PROJECT_REF}.example.com`,
  ])('%s is a hosted backend', host => {
    expect(isHostedBackendHost(host)).toBe(true);
  });

  it.each(['localhost', '127.0.0.1', '[::1]', 'fonts.gstatic.com', 'notsupabase.co'])(
    '%s is not a hosted backend',
    host => {
      expect(isHostedBackendHost(host)).toBe(false);
    }
  );

  it('knows this machine by its three names and nothing else', () => {
    expect(['localhost', 'LOCALHOST', '127.0.0.1', '[::1]'].map(isLoopbackHost)).toEqual([
      true,
      true,
      true,
      true,
    ]);
    expect(
      ['127.0.0.1.example.com', 'localhost.example.com', '0.0.0.0', '192.168.1.5'].map(
        isLoopbackHost
      )
    ).toEqual([false, false, false, false]);
  });
});

describe('devServerOrigin', () => {
  it.each([
    ['http://localhost:5173', 'http://localhost:5173'],
    ['http://127.0.0.1:4173/', 'http://127.0.0.1:4173'],
    ['http://[::1]:5173/at-show', 'http://[::1]:5173'],
  ])('accepts %s', (base, origin) => {
    expect(devServerOrigin(base)).toBe(origin);
  });

  it.each([
    'https://myk9show.com',
    'https://staging.myk9show.com',
    PRODUCTION,
    'http://localhost.example.com:5173',
    'file:///C:/index.html',
  ])('refuses %s', base => {
    expect(() => devServerOrigin(base)).toThrow(/local dev server only/);
  });
});

describe('hostResolverRules', () => {
  it('resolves nothing but this machine and the font hosts', () => {
    expect(hostResolverRules()).toBe(
      'MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1, EXCLUDE [::1], ' +
        'EXCLUDE fonts.googleapis.com, EXCLUDE fonts.gstatic.com'
    );
  });

  it('never opens a hosted backend', () => {
    expect(FONT_HOSTS.some(isHostedBackendHost)).toBe(false);
    expect(hostResolverRules()).not.toContain('supabase');
  });
});

describe('decideRequest', () => {
  it.each([
    // The dev server is exempt by exact origin only.
    ['GET', `${DEV}/src/main.tsx`, 'dev-server'],
    ['POST', `${DEV}/api/anything`, 'dev-server'],
    ['GET', 'http://localhost:5174/src/main.tsx', 'pass'],
    ['POST', 'http://localhost:5174/rest/v1/entries', 'refuse-write'],
    ['POST', 'https://localhost:5173/rest/v1/entries', 'refuse-write'],
    // The local stack: reads pass, writes do not.
    ['GET', `${STACK}/rest/v1/classes?select=*`, 'pass'],
    ['POST', `${STACK}/auth/v1/token?grant_type=password`, 'pass'],
    ['POST', `${STACK}/rest/v1/rpc/get_show_summary`, 'pass'],
    ['POST', `${STACK}/rest/v1/rpc/ringside_update_entry`, 'refuse-write'],
    ['PATCH', `${STACK}/rest/v1/entries?id=eq.1`, 'refuse-write'],
    ['POST', `${STACK}/auth/v1/logout`, 'refuse-write'],
    ['POST', `${STACK}/functions/v1/send-email`, 'refuse-write'],
    // A hosted project stops the run, whatever the method.
    ['GET', `${PRODUCTION}/rest/v1/classes`, 'stop-run'],
    ['POST', `${PRODUCTION}/auth/v1/token?grant_type=password`, 'stop-run'],
    ['OPTIONS', `${PRODUCTION}/rest/v1/entries`, 'stop-run'],
    ['GET', 'https://someotherproject.supabase.co/rest/v1/classes', 'stop-run'],
    // Off this machine: only a GET for the fonts.
    ['GET', 'https://fonts.googleapis.com/css2?family=Montserrat', 'pass'],
    ['GET', 'https://fonts.gstatic.com/s/montserrat/v1/a.woff2', 'pass'],
    ['POST', 'https://fonts.googleapis.com/css2', 'block'],
    ['GET', 'https://myk9show.com/og-image.jpg', 'block'],
    ['POST', 'https://o1.ingest.sentry.io/api/1/envelope/', 'block'],
    ['GET', 'not a url', 'block'],
    ['GET', 'ftp://127.0.0.1/file', 'block'],
  ])('%s %s -> %s', (method, url, decision) => {
    expect(decideRequest(facts({ method, url }))).toBe(decision);
  });

  it('checks for a hosted backend before the staged answer, the cut-off and the patch', () => {
    const everythingOn = {
      cutOff: true,
      stagedRpcs: new Set(['ringside_update_entry']),
      patchPaths: /entr/,
    };
    expect(
      decideRequest(
        facts({
          method: 'POST',
          url: `${PRODUCTION}/rest/v1/rpc/ringside_update_entry`,
          ...everythingOn,
        })
      )
    ).toBe('stop-run');
    expect(decideRequest(facts({ url: `${PRODUCTION}/rest/v1/entries`, ...everythingOn }))).toBe(
      'stop-run'
    );
  });

  it('answers a staged write RPC in the browser, cut off or not', () => {
    const staged = { stagedRpcs: new Set(['ringside_update_entry']) };
    const url = `${STACK}/rest/v1/rpc/ringside_update_entry`;
    expect(decideRequest(facts({ method: 'POST', url, ...staged }))).toBe('answer');
    expect(decideRequest(facts({ method: 'POST', url, cutOff: true, ...staged }))).toBe('answer');
    // An unstaged write RPC is still refused, and the preflight of a staged one is not answered.
    expect(
      decideRequest(facts({ method: 'POST', url: `${STACK}/rest/v1/rpc/delete_entry`, ...staged }))
    ).toBe('refuse-write');
    expect(decideRequest(facts({ method: 'OPTIONS', url, ...staged }))).toBe('pass');
  });

  it('cuts everything off but the dev server while the run plays no signal', () => {
    const off = { cutOff: true };
    expect(decideRequest(facts({ url: `${STACK}/rest/v1/classes`, ...off }))).toBe('offline');
    expect(decideRequest(facts({ method: 'POST', url: `${STACK}/rest/v1/entries`, ...off }))).toBe(
      'offline'
    );
    expect(decideRequest(facts({ url: 'https://fonts.gstatic.com/a.woff2', ...off }))).toBe(
      'offline'
    );
    expect(decideRequest(facts({ url: `${DEV}/src/main.tsx`, ...off }))).toBe('dev-server');
  });

  it('patches only reads under /rest/v1/ that the patch names', () => {
    const patch = { patchPaths: /entr|armband/i };
    expect(decideRequest(facts({ url: `${STACK}/rest/v1/entries?select=*`, ...patch }))).toBe(
      'patch'
    );
    expect(
      decideRequest(facts({ method: 'HEAD', url: `${STACK}/rest/v1/armbands`, ...patch }))
    ).toBe('patch');
    expect(decideRequest(facts({ url: `${STACK}/rest/v1/classes`, ...patch }))).toBe('pass');
    expect(decideRequest(facts({ url: `${STACK}/storage/v1/object/entries.pdf`, ...patch }))).toBe(
      'pass'
    );
    expect(
      decideRequest(facts({ method: 'PATCH', url: `${STACK}/rest/v1/entries`, ...patch }))
    ).toBe('refuse-write');
  });
});

describe('decideSocket', () => {
  it.each([
    [`wss://${PRODUCTION_PROJECT_REF}.supabase.co/realtime/v1/websocket?apikey=x`, 'stop-run'],
    ['wss://someotherproject.supabase.co/realtime/v1/websocket', 'stop-run'],
    ['ws://127.0.0.1:54321/realtime/v1/websocket', 'hold'],
    ['ws://localhost:24678/', 'hold'],
    ['wss://example.com/socket', 'hold'],
    ['not a url', 'hold'],
  ])('%s -> %s', (url, decision) => {
    expect(decideSocket(url)).toBe(decision);
  });
});

describe('stopMessage', () => {
  it('names the request and offers no way to run against a hosted project', () => {
    const message = stopMessage(`POST ${PRODUCTION}/auth/v1/token`);
    expect(message).toContain(`POST ${PRODUCTION}/auth/v1/token`);
    expect(message).toContain('pnpm qa:isolated-e2e:prepare');
    expect(message).not.toMatch(/ALLOW|opt in|override/i);
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

describe('fixture rows', () => {
  it.each([
    [{ id: 'a', armband: 105 }, true],
    [{ id: 'a', armband: '105' }, true],
    [{ id: 'a', armband_number: '100' }, true],
    [{ id: 'a', armband: 106 }, false],
    [{ id: 'a', armband: 2001 }, false],
    [{ id: 'a', armband_number: '2063' }, false],
    [{ id: 'a', armband: null }, false],
    [{ id: 'a', armband: 'x' }, false],
    // Rows with no armband field are not entries: classes, trials, people.
    [{ id: 'a', class_name: 'Container Novice A' }, true],
    ['not a row', true],
  ])('isFixtureRow(%j) is %s', (row, kept) => {
    expect(isFixtureRow(row, FIXTURES)).toBe(kept);
  });

  it('drops rows off the list and lays the staged fields over the row they were sent for', () => {
    const accepted = new Map([['e-105', { result: 'Q', search_time: '0:38.12' }]]);
    expect(
      patchFixtureRows(
        [
          { id: 'e-104', armband: 104, result: null },
          { id: 'e-105', armband: 105, result: null },
          { id: 'e-2001', armband: 2001, result: null },
        ],
        FIXTURES,
        accepted
      )
    ).toEqual([
      { id: 'e-104', armband: 104, result: null },
      { id: 'e-105', armband: 105, result: 'Q', search_time: '0:38.12' },
    ]);
  });

  it('leaves a body that is not a list alone', () => {
    const body = { armband: 2001 };
    expect(patchFixtureRows(body, FIXTURES, new Map())).toBe(body);
  });
});

describe('strangerArmbands', () => {
  it('passes a screen that shows only fixture armbands', () => {
    expect(
      strangerArmbands('Container Novice A | #105 in the ring', ['105', ' 104 '], FIXTURES)
    ).toEqual([]);
    expect(strangerArmbands('Your ring | 2 of 3 scored | Nov 18, 2026', [], FIXTURES)).toEqual([]);
  });

  it('names every armband that is not a fixture, once', () => {
    expect(strangerArmbands('#106 in the ring | #106', ['2001', '105'], FIXTURES)).toEqual([
      '2001',
      '106',
    ]);
  });

  it('never passes an armband element it cannot read', () => {
    expect(strangerArmbands('', ['—'], FIXTURES)).toEqual(['"—"']);
  });
});
