// Proves the capture guard in the real browser, with known answers, before a capture runs.
//
//   pnpm --filter @myk9/show capture:landing:selfcheck
//
// It starts two servers on this machine: a blank page standing in for the dev server, and a
// stand-in backend that only counts what reaches it. A page under the same launch and context
// the captures use (lib.ts) then tries a read, two writes, a WebSocket, a host off this
// machine and a hosted Supabase host. The check passes only when the backend saw the read and
// nothing else, no WebSocket upgrade, and the run was stopped by the hosted host.
//
// Controls run first: the same writes and WebSocket from a page with no guard must reach
// the stand-in backend, and a browser launched without the resolver lock must reach it by a
// name the lock refuses, or the check would pass whether or not the guard works.
//
// The hosted host is a project ref that does not exist; the production ref is never used.
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { chromium } from '@playwright/test';

const seen: string[] = [];
let upgrades = 0;

const backend = createServer((req, res) => {
  seen.push(`${req.method} ${req.url}`);
  res.writeHead(200, {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': '*',
    'access-control-allow-headers': '*',
    'content-type': 'application/json',
  });
  res.end('[]');
});
backend.on('upgrade', (_req, socket) => {
  upgrades += 1;
  socket.destroy();
});
const devServer = createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end('<!doctype html><title>capture selfcheck</title>');
});

const listen = (server: typeof backend) =>
  new Promise<number>(resolve => {
    server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port));
  });

const backendPort = await listen(backend);
const devPort = await listen(devServer);
// lib.ts reads the dev server's address when it is first imported.
process.env.CAPTURE_BASE_URL = `http://127.0.0.1:${devPort}`;
const { BASE, guardedContext, launch } = await import('./lib.ts');

const api = `http://127.0.0.1:${backendPort}`;
const wsUrl = `ws://127.0.0.1:${backendPort}/realtime/v1/websocket`;

const failures: string[] = [];
const expect = (ok: boolean, what: string) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failures.push(what);
};

const browser = await launch();
try {
  // Control: no guard. Local stand-in backend only; no other host is tried.
  const bare = await browser.newContext();
  const barePage = await bare.newPage();
  await barePage.goto(BASE);
  await barePage.evaluate(
    async ({ api, wsUrl }) => {
      await fetch(`${api}/rest/v1/entries`, { method: 'POST', body: '{}' }).catch(() => {});
      await new Promise<void>(resolve => {
        const ws = new WebSocket(wsUrl);
        ws.addEventListener('error', () => resolve());
        ws.addEventListener('close', () => resolve());
        setTimeout(resolve, 1500);
      });
    },
    { api, wsUrl }
  );
  await bare.close();
  console.log('control (no guard) backend saw ::', JSON.stringify(seen), 'upgrades', upgrades);
  expect(
    seen.includes('POST /rest/v1/entries') && upgrades === 1,
    'control: without the guard the write and the WebSocket reach the backend'
  );
  seen.length = 0;
  upgrades = 0;

  // The resolver lock, on its own: no route is installed in either context. Chromium maps
  // any *.localhost name to this machine, so the name below reaches the stand-in backend
  // from a browser launched without the lock, and must not resolve at all with it. This is
  // the only defense for what a route never sees (a redirect hop, a preconnect, a worker's
  // socket), so it gets a known answer of its own.
  const lockProbe = `http://capture-selfcheck.localhost:${backendPort}/resolver-lock`;
  const reaches = async (from: typeof browser) => {
    const context = await from.newContext();
    const probePage = await context.newPage();
    await probePage.goto(BASE);
    const reached = await probePage.evaluate(
      url =>
        fetch(url, { mode: 'no-cors' }).then(
          () => true,
          () => false
        ),
      lockProbe
    );
    await context.close();
    return reached;
  };
  const unlocked = await chromium.launch({
    channel: process.env.CAPTURE_CHANNEL || undefined,
    headless: true,
  });
  let reachedUnlocked = false;
  try {
    reachedUnlocked = await reaches(unlocked);
  } finally {
    await unlocked.close();
  }
  expect(
    reachedUnlocked && seen.includes('GET /resolver-lock'),
    'control: a browser without the resolver lock reaches the stand-in by a *.localhost name'
  );
  seen.length = 0;
  const reachedLocked = await reaches(browser);
  expect(
    !reachedLocked && seen.length === 0,
    'the resolver lock refuses a name that is not on its list, with no route installed'
  );
  seen.length = 0;

  const { ctx, guard } = await guardedContext(browser, {
    viewport: { width: 390, height: 844 },
    scale: 1,
  });
  const page = await ctx.newPage();
  await page.goto(BASE);

  const results = await page.evaluate(
    async ({ api, wsUrl }) => {
      const attempt = (url: string, init?: RequestInit) =>
        fetch(url, init).then(
          r => `status ${r.status}`,
          () => 'refused'
        );
      const socket = await new Promise<string>(resolve => {
        const ws = new WebSocket(wsUrl);
        ws.addEventListener('open', () =>
          ws.send('{"topic":"realtime:presence","event":"phx_join"}')
        );
        ws.addEventListener('error', () => resolve('error'));
        setTimeout(() => resolve(`readyState ${ws.readyState}`), 1500);
      });
      return {
        read: await attempt(`${api}/rest/v1/classes?select=id`),
        rpcWrite: await attempt(`${api}/rest/v1/rpc/ringside_update_entry`, {
          method: 'POST',
          body: '{}',
        }),
        rowWrite: await attempt(`${api}/rest/v1/entries`, { method: 'POST', body: '{}' }),
        signOut: await attempt(`${api}/auth/v1/logout`, { method: 'POST', body: '{}' }),
        offMachine: await attempt('http://capture-selfcheck.invalid/'),
        hosted: await attempt('https://capture-selfcheck-no-such-project.supabase.co/rest/v1/'),
        socket,
      };
    },
    { api, wsUrl: `${wsUrl}?apikey=x` }
  );
  console.log('page saw ::', JSON.stringify(results));
  console.log('backend saw ::', JSON.stringify(seen), 'upgrades', upgrades);

  expect(results.read === 'status 200', 'a read reaches the local backend');
  expect(results.rpcWrite === 'refused', 'a write RPC is refused');
  expect(results.rowWrite === 'refused', 'a row write is refused');
  expect(results.signOut === 'refused', 'a sign-out is refused');
  expect(results.offMachine === 'refused', 'a host off this machine is refused');
  expect(results.hosted === 'refused', 'a hosted Supabase host is refused');
  expect(
    seen.length === 1 && seen[0] === 'GET /rest/v1/classes?select=id',
    'the backend saw the read and nothing else'
  );
  expect(upgrades === 0, 'no WebSocket upgrade reached the backend');
  expect(
    guard.heldSockets.length === 1 && guard.heldSockets[0] === wsUrl,
    'the WebSocket was held in the browser'
  );
  expect(guard.refused.length === 3, 'three writes are in the refused log');
  let stopped = '';
  try {
    guard.assertIsolated();
  } catch (err) {
    stopped = err instanceof Error ? err.message : String(err);
  }
  expect(
    stopped.includes('capture-selfcheck-no-such-project.supabase.co'),
    'the hosted host stopped the run'
  );
  await ctx.close();
} finally {
  await browser.close();
  backend.close();
  devServer.close();
}

if (failures.length > 0) {
  console.error(`Capture guard self-check failed: ${failures.join('; ')}`);
  process.exit(1);
}
console.log('Capture guard self-check passed');
