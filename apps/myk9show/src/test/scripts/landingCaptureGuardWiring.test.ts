import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { installGuard } from '../../../scripts/landing-capture/guard';
import type {
  GuardContext,
  GuardRoute,
  GuardSocket,
  JsonPatch,
} from '../../../scripts/landing-capture/guard';
import { patchFixtureRows } from '../../../scripts/landing-capture/guardRules';
import { PRODUCTION_PROJECT_REF } from '../productionFixtureGuard';

const DEV = 'http://localhost:5173';
const STACK = 'http://127.0.0.1:54321';
const PRODUCTION = `https://${PRODUCTION_PROJECT_REF}.supabase.co`;
const FIXTURES = new Set([100, 101, 102, 103, 104, 105]);

// The wiring, driven by fakes: installGuard must send every request and every WebSocket
// through the rules above, and must have no way to connect a WebSocket to a server.
describe('installGuard', () => {
  type RouteHandler = (route: GuardRoute) => Promise<void>;
  type SocketHandler = (ws: GuardSocket) => void;

  async function install(patch?: JsonPatch) {
    let onRoute: RouteHandler | undefined;
    let onSocket: SocketHandler | undefined;
    let routeMatch: ((url: URL) => boolean) | undefined;
    let socketMatch: ((url: URL) => boolean) | undefined;
    const ctx: GuardContext = {
      route: async (match, handler) => {
        routeMatch = match;
        onRoute = handler;
      },
      routeWebSocket: async (match, handler) => {
        socketMatch = match;
        onSocket = handler;
      },
    };
    const guard = await installGuard(ctx, { devOrigin: DEV, patch });
    if (!onRoute || !onSocket || !routeMatch || !socketMatch) throw new Error('guard not wired');
    return { guard, onRoute, onSocket, routeMatch, socketMatch };
  }

  function fakeRoute(method: string, url: string, body: unknown = {}, upstream: unknown = []) {
    const response = {
      headers: () => ({ 'content-range': '0-2/3' }),
      json: async () => upstream,
    };
    return {
      request: () => ({ url: () => url, method: () => method, postDataJSON: () => body }),
      abort: vi.fn(async () => {}),
      fallback: vi.fn(async () => {}),
      fetch: vi.fn(async () => response),
      fulfill: vi.fn(async () => {}),
    };
  }

  it('routes every URL and every WebSocket, with no exemption in the matcher', async () => {
    const { routeMatch, socketMatch } = await install();
    for (const url of [DEV, STACK, PRODUCTION, 'ws://localhost:24678/']) {
      expect(routeMatch(new URL(url))).toBe(true);
      expect(socketMatch(new URL(url))).toBe(true);
    }
  });

  it('lets the dev server and local reads through untouched', async () => {
    const { guard, onRoute } = await install();
    const page = fakeRoute('GET', `${DEV}/src/main.tsx`);
    const read = fakeRoute('GET', `${STACK}/rest/v1/classes`);
    await onRoute(page);
    await onRoute(read);
    expect(page.fallback).toHaveBeenCalledTimes(1);
    expect(read.fallback).toHaveBeenCalledTimes(1);
    expect(() => guard.assertIsolated()).not.toThrow();
  });

  it('refuses a local write, sends nothing, and logs it', async () => {
    const { guard, onRoute } = await install();
    const write = fakeRoute('POST', `${STACK}/rest/v1/rpc/ringside_update_entry?x=1`);
    await onRoute(write);
    expect(write.abort).toHaveBeenCalledWith('failed');
    expect(write.fallback).not.toHaveBeenCalled();
    expect(write.fetch).not.toHaveBeenCalled();
    expect(guard.refused).toEqual(['POST /rest/v1/rpc/ringside_update_entry']);
  });

  it('stops the run on a request to the production project and sends nothing', async () => {
    const { guard, onRoute } = await install();
    const signIn = fakeRoute('POST', `${PRODUCTION}/auth/v1/token?grant_type=password`);
    await onRoute(signIn);
    expect(signIn.abort).toHaveBeenCalledWith('blockedbyclient');
    expect(signIn.fallback).not.toHaveBeenCalled();
    expect(signIn.fetch).not.toHaveBeenCalled();
    expect(signIn.fulfill).not.toHaveBeenCalled();
    expect(() => guard.assertIsolated()).toThrow(`POST ${PRODUCTION}/auth/v1/token`);
    // It stays stopped: a later local read does not clear it.
    await onRoute(fakeRoute('GET', `${STACK}/rest/v1/classes`));
    expect(() => guard.assertIsolated()).toThrow(/Capture stopped/);
  });

  it('blocks a host off this machine without stopping the run', async () => {
    const { guard, onRoute } = await install();
    const beacon = fakeRoute('POST', 'https://o1.ingest.sentry.io/api/1/envelope/?k=1');
    await onRoute(beacon);
    expect(beacon.abort).toHaveBeenCalledWith('blockedbyclient');
    expect(beacon.fallback).not.toHaveBeenCalled();
    expect(guard.blocked).toEqual(['POST https://o1.ingest.sentry.io/api/1/envelope/']);
    expect(() => guard.assertIsolated()).not.toThrow();
  });

  it('answers a staged write in the browser with what the app sent', async () => {
    const { guard, onRoute } = await install();
    guard.stageRpcAnswer('ringside_update_entry', args => ({ echoed: args }));
    const write = fakeRoute('POST', `${STACK}/rest/v1/rpc/ringside_update_entry`, { p: 1 });
    await onRoute(write);
    expect(write.fulfill).toHaveBeenCalledWith({ status: 200, json: { echoed: { p: 1 } } });
    expect(write.fetch).not.toHaveBeenCalled();
    expect(write.fallback).not.toHaveBeenCalled();
  });

  it('cuts reads off while offline and lets them back after', async () => {
    const { guard, onRoute } = await install();
    guard.setCutOff(true);
    const during = fakeRoute('GET', `${STACK}/rest/v1/classes`);
    await onRoute(during);
    expect(during.abort).toHaveBeenCalledWith('internetdisconnected');
    guard.setCutOff(false);
    const after = fakeRoute('GET', `${STACK}/rest/v1/classes`);
    await onRoute(after);
    expect(after.fallback).toHaveBeenCalledTimes(1);
  });

  it('rewrites a patched read and shrinks its Content-Range', async () => {
    const { onRoute } = await install({
      paths: /entr/,
      rows: body => patchFixtureRows(body, FIXTURES, new Map()),
    });
    const upstream = [{ armband: 104 }, { armband: 105 }, { armband: 2001 }];
    const read = fakeRoute('GET', `${STACK}/rest/v1/entries?select=*`, {}, upstream);
    await onRoute(read);
    expect(read.fulfill).toHaveBeenCalledWith(
      expect.objectContaining({
        json: [{ armband: 104 }, { armband: 105 }],
        headers: { 'content-range': '0-1/2' },
      })
    );
  });

  it('holds every WebSocket in the browser and stops the run on a hosted one', async () => {
    const { guard, onSocket } = await install();
    onSocket({ url: () => 'ws://127.0.0.1:54321/realtime/v1/websocket?apikey=secret' });
    onSocket({ url: () => 'ws://localhost:24678/' });
    expect(guard.heldSockets).toEqual([
      'ws://127.0.0.1:54321/realtime/v1/websocket',
      'ws://localhost:24678/',
    ]);
    expect(() => guard.assertIsolated()).not.toThrow();
    onSocket({ url: () => `wss://${PRODUCTION_PROJECT_REF}.supabase.co/realtime/v1/websocket` });
    expect(() => guard.assertIsolated()).toThrow(/a WebSocket to wss:/);
  });
});

// A WebSocket reaches a server only through WebSocketRoute.connectToServer, and a run can be
// pointed at a hosted project only through an opt-in. Neither may exist in the scripts.
describe('the capture scripts', () => {
  const dir = resolve(__dirname, '../../../scripts/landing-capture');
  const source = (name: string) => readFileSync(resolve(dir, name), 'utf8');
  const code = (name: string) =>
    source(name)
      .split('\n')
      .filter(line => !['//', '/*', '*'].some(mark => line.trim().startsWith(mark)))
      .join('\n');

  it.each(['guardRules.ts', 'guard.ts', 'lib.ts', 'ring.ts', 'selfcheck.ts'])(
    '%s has no way to connect a WebSocket and no production opt-in',
    name => {
      expect(code(name)).not.toMatch(/connectToServer/);
      expect(source(name)).not.toMatch(/MYK9_ALLOW_PROD_E2E|ALLOW_PROD/);
    }
  );

  it('creates contexts and writes images only through the guarded paths', () => {
    expect(code('ring.ts')).not.toMatch(/newContext|\.route\(|routeWebSocket/);
    expect(code('ring.ts').match(/\.screenshot\(/g)).toHaveLength(1);
    expect(code('ring.ts')).toMatch(/writeCheckedShot\(/);
    expect(code('lib.ts')).toMatch(/serviceWorkers: 'block'/);
    expect(code('lib.ts')).toMatch(/--host-resolver-rules=\$\{hostResolverRules\(\)\}/);
  });
});
