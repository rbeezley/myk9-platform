import { test, expect, type Page } from '@playwright/test';
import {
  findChunk,
  startChunkFaultServer,
  type ChunkFaultServer,
} from './helpers/chunkFaultServer';

/**
 * MYK9-1188: a lazy route chunk that fails to load recovers with one guarded reload, in a real
 * browser, with the real service worker controlling the page.
 *
 * The unit suites (chunkLoadRecovery, lazyWithRetry, enhancedLazyLoading.recovery) mock the rejected
 * import, so they prove the recovery LOGIC. They cannot prove the failure is real: that Chromium
 * keeps a failed dynamic import failed for the life of the document, and that a fresh document
 * recovers through the service worker. This does.
 *
 * Reproduction: load the production build so the worker precaches and controls the page, empty the
 * precache (what a worker activation after a deploy or storage eviction does), then have the origin
 * fail the route's chunk. The worker misses its cache, goes to the network and gets a 503 (or, after a
 * deploy, `index.html` served as text/html), and the import rejects with "Failed to fetch dynamically
 * imported module". No database, no sign-in: /fees is a public lazy route.
 */

const ROUTE = '/fees';
const ROUTE_HEADING = 'How our fees work';
const BOUNDARY_HEADING = 'Failed to load component';

let server: ChunkFaultServer;
let chunk: string;

test.beforeAll(async () => {
  chunk = findChunk('FeesPage');
  server = await startChunkFaultServer();
});

test.afterAll(async () => {
  await server.close();
});

/** Loads the app until its service worker controls the page, then empties the precache. */
async function controlledPageWithEmptyPrecache(page: Page): Promise<() => number> {
  await page.goto(`${server.origin}/`, { waitUntil: 'load' });
  await page.evaluate(() => navigator.serviceWorker.ready);
  // The first visit is uncontrolled; the reload hands the page to the worker.
  await page.reload({ waitUntil: 'load' });
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await page.evaluate(async () => {
    for (const name of await caches.keys()) await caches.delete(name);
  });

  let documentLoads = 0;
  page.on('load', () => {
    documentLoads += 1;
  });
  return () => documentLoads;
}

/** A client-side navigation: the route's chunk is imported by the already-running document. */
async function navigateInApp(page: Page, path: string): Promise<void> {
  await page.evaluate(to => {
    window.history.pushState({}, '', to);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
}

test.describe('lazy route chunk failure under the service worker', () => {
  test.beforeEach(() => {
    server.clearFault();
  });

  test('a chunk that fails once recovers with exactly one reload', async ({ page }) => {
    const documentLoads = await controlledPageWithEmptyPrecache(page);
    server.failChunk(chunk, 1);

    await navigateInApp(page, ROUTE);

    await expect(page.getByRole('heading', { name: ROUTE_HEADING })).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(ROUTE);
    expect(server.faultsServed()).toBe(1);
    expect(documentLoads()).toBe(1);
    await expect(page.getByText(BOUNDARY_HEADING)).toHaveCount(0);
  });

  test('a chunk that stays down reloads once, then shows the boundary and stops', async ({
    page,
  }) => {
    const documentLoads = await controlledPageWithEmptyPrecache(page);
    server.failChunk(chunk, Number.POSITIVE_INFINITY);

    await navigateInApp(page, ROUTE);

    await expect(page.getByText(BOUNDARY_HEADING)).toBeVisible({ timeout: 30_000 });
    // Bounded settle: a reload loop would load another document inside this window.
    await page.waitForTimeout(3_000);
    expect(documentLoads()).toBe(1);
    await expect(page.getByRole('heading', { name: ROUTE_HEADING })).toHaveCount(0);
  });
});
