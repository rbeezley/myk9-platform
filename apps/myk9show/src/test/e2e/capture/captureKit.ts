import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  expect,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from '@playwright/test';

/**
 * What the landing capture specs share (MYK9-2181, MYK9-2296): measuring a region, holding
 * every WebSocket in the browser, and the proof that the hold works. The start conditions, the
 * output folder rule and the sign-in order stay in each spec, where the tests that pin them can
 * read them.
 */

export type Box = { x: number; y: number; w: number; h: number };

/**
 * The bounding box of an element in page pixels, for a ring. Climbs to the first ancestor at
 * least `minW` by `minH`, so a label can stand for the block it sits in.
 */
export async function box(target: Locator, minW = 0, minH = 0): Promise<Box> {
  return target.first().evaluate(
    (el, [w, h]) => {
      let node = el as HTMLElement;
      while (node.parentElement && (node.offsetWidth < w || node.offsetHeight < h)) {
        node = node.parentElement;
      }
      const rect = node.getBoundingClientRect();
      return {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        w: Math.round(rect.width),
        h: Math.round(rect.height),
      };
    },
    [minW, minH] as const
  );
}

/** Every WebSocket the context's pages open is held in the browser and connected to nothing. */
export async function holdWebSockets(context: BrowserContext): Promise<string[]> {
  const held: string[] = [];
  await context.routeWebSocket(/.*/, ws => {
    held.push(ws.url().split('?')[0] ?? '');
  });
  return held;
}

/**
 * Proves the hold: a socket opened in a context without it reaches a server on this machine
 * (the control), and the same socket in a context with it does not.
 */
export async function proveSocketHold(browser: Browser, baseURL: string | undefined) {
  let upgrades = 0;
  const server = createServer((_req, res) => res.end());
  server.on('upgrade', (_req, socket) => {
    upgrades += 1;
    socket.destroy();
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}/realtime/v1/websocket`;
  const open = (page: Page) =>
    page.evaluate(
      wsUrl =>
        new Promise<void>(resolve => {
          const ws = new WebSocket(wsUrl);
          ws.addEventListener('open', () => ws.send('{"event":"phx_join"}'));
          ws.addEventListener('error', () => resolve());
          ws.addEventListener('close', () => resolve());
          setTimeout(resolve, 1500);
        }),
      url
    );
  // A document from the preview server that runs none of the app's code, so the only socket
  // either context opens is the one this test opens.
  const plainPage = `${baseURL}/manifest.json`;
  try {
    // Control: without the hold, the same socket reaches the server.
    const bare = await browser.newContext();
    const barePage = await bare.newPage();
    await barePage.goto(plainPage);
    await open(barePage);
    await bare.close();
    expect(upgrades, 'control: an unheld socket reaches the server').toBe(1);

    upgrades = 0;
    const guarded = await browser.newContext();
    const held = await holdWebSockets(guarded);
    const page = await guarded.newPage();
    await page.goto(plainPage);
    await open(page);
    await guarded.close();
    expect(upgrades).toBe(0);
    expect(held).toEqual([url]);
  } finally {
    server.close();
  }
}
