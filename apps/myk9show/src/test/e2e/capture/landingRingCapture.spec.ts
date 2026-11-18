import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test';
import {
  ALLOW_PRODUCTION_FIXTURE_SIGN_IN,
  bundleFilesNamingProduction,
} from '../../productionFixtureGuard';
import {
  OUTBOUND_PROBE,
  captureStartProblem,
  probeOutbound,
  serveFontsFrom,
} from '../helpers/landingCapture';
import { supabaseRouteGlob } from '../helpers/offlineBackend';
import { signInAsJudge } from '../uat/shared/auth';

/**
 * Suite category: capture (not a regression test; runs only in the Landing capture workflow).
 *
 * Takes the landing page's "Show day, at the ring" scene from the running app: the judge's
 * phone, from the ring's classes to a score that sends itself when the signal returns
 * (docs/plan-landing-animated-timeline.md § "Capturing the screens", MYK9-2181).
 *
 * It is safe by where it runs, and refuses to start anywhere else:
 *   - the backend is the job's own Supabase stack on this machine, seeded from the repo's
 *     demo seed only and destroyed with the job, so every row is a fixture and the walk
 *     scores for real;
 *   - the job has closed the outbound network for this process, the browser and the preview
 *     server, and the first thing the spec does is prove it.
 *
 * It writes the images to public/landing/scenes/ring/ and the measured regions to
 * src/components/landing/lifecycle/scenes/ringRegions.json; the workflow uploads them.
 */

const SHOW_ID = 'dededede-0000-0000-0000-000000000010';
/** A phone: the page draws the scene about 235px wide on one, and 390 reads at that size. */
const SPACE = { width: 390, height: 844 };
const SCALE = 2;
// On the demo seed, Exterior Excellent is the judge's unscored class with one search area, so
// the scoresheet is the one timer the scene's lines describe: Juniper, called Juni (102).
// Container Novice A is seeded complete with its results released, and Interior Advanced
// times two areas.
const CLASS_NAME = 'Exterior Excellent';
const DOG = 'Juni';

const APP_DIR = process.cwd();
const IMG_DIR = join(APP_DIR, 'public', 'landing', 'scenes', 'ring');
const REGIONS_FILE = join(
  APP_DIR,
  'src',
  'components',
  'landing',
  'lifecycle',
  'scenes',
  'ringRegions.json'
);

type Box = { x: number; y: number; w: number; h: number };

/**
 * The bounding box of an element in page pixels, for a ring. Climbs to the first ancestor at
 * least `minW` by `minH`, so a label can stand for the block it sits in.
 */
async function box(target: Locator, minW = 0, minH = 0): Promise<Box> {
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
async function holdWebSockets(context: BrowserContext): Promise<string[]> {
  const held: string[] = [];
  await context.routeWebSocket(/.*/, ws => {
    held.push(ws.url().split('?')[0] ?? '');
  });
  return held;
}

test.use({
  viewport: SPACE,
  deviceScaleFactor: SCALE,
  hasTouch: true,
  serviceWorkers: 'block',
  // Words, not pictures: the only images this spec leaves behind are the scene's own.
  screenshot: 'off',
  video: 'off',
  trace: 'off',
});

// Every other Playwright config collects this file too; there it is skipped, not run.
test.skip(
  process.env.PLAYWRIGHT_LANDING_CAPTURE !== 'true',
  'Runs only in the Landing capture workflow (PLAYWRIGHT_LANDING_CAPTURE=true).'
);

test.beforeAll(async () => {
  const problem = captureStartProblem({
    inWorkflow: process.env.GITHUB_ACTIONS === 'true',
    productionOptIn: process.env[ALLOW_PRODUCTION_FIXTURE_SIGN_IN] !== undefined,
    supabaseUrl: process.env.VITE_SUPABASE_URL,
    bundleFound: existsSync(join(APP_DIR, 'dist', 'index.html')),
    bundleFilesNamingProduction: bundleFilesNamingProduction(join(APP_DIR, 'dist')).length,
    outbound: await probeOutbound(OUTBOUND_PROBE.host, OUTBOUND_PROBE.port),
  });
  if (problem) throw new Error(problem);
});

test('no WebSocket the capture opens reaches a server', async ({ browser, baseURL }) => {
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
});

test('captures the ring scene on the judge’s phone', async ({ page, context }) => {
  test.setTimeout(240_000);
  const fontsDir = process.env.CAPTURE_FONTS_DIR;
  if (!fontsDir) throw new Error('CAPTURE_FONTS_DIR is not set');
  await serveFontsFrom(context, fontsDir);
  const heldSockets = await holdWebSockets(context);

  // "No signal" is staged for the backend only, so the page keeps the code it has loaded:
  // navigator.onLine follows a flag, and while it is set every backend request is dropped.
  let offline = false;
  await context.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'onLine', {
      configurable: true,
      get: () => sessionStorage.getItem('capture-offline') !== '1',
    });
  });
  await context.route(supabaseRouteGlob(), route =>
    offline ? route.abort('internetdisconnected') : route.fallback()
  );
  const setSignal = async (on: boolean) => {
    offline = !on;
    await page.evaluate(online => {
      if (online) sessionStorage.removeItem('capture-offline');
      else sessionStorage.setItem('capture-offline', '1');
      window.dispatchEvent(new Event(online ? 'online' : 'offline'));
    }, on);
  };

  mkdirSync(IMG_DIR, { recursive: true });
  const shots: Record<string, { file: string; regions: Record<string, Box> }> = {};
  const shoot = async (
    name: string,
    regions: Record<string, Locator | [Locator, number, number]>
  ) => {
    const measured: Record<string, Box> = {};
    for (const [key, target] of Object.entries(regions)) {
      measured[key] = Array.isArray(target) ? await box(...target) : await box(target);
    }
    const file = `${name}.png`;
    await page.screenshot({ path: join(IMG_DIR, file) });
    shots[name] = { file, regions: measured };
  };
  const button = (name: string) => page.getByRole('button', { name, exact: true });

  await signInAsJudge(page, `/at-show/${SHOW_ID}`);

  // Line 1: the ring's classes, each with how many dogs are scored. `card` is the whole
  // card (the <li> AtShowClassRow renders); `row` is its tap row alone, measured so a test
  // can tell the two apart.
  await expect(page.getByText('Your ring').first()).toBeVisible({ timeout: 30_000 });
  const card = page.locator('li[data-class-id]').filter({ hasText: CLASS_NAME }).first();
  await card.scrollIntoViewIfNeeded();
  await expect(card.getByText('0 of 1 scored')).toBeAttached();
  // The captures are set in the app's own fonts, served from the job's downloaded copy.
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.fonts.check('16px Montserrat'))).toBe(true);
  await page.waitForTimeout(1500);
  await shoot('classes', { card, row: card.getByRole('button').first() });

  // Line 2: the signal drops. At phone width the header shows an amber no-signal icon and a
  // message says the changes are saved on this device. (From 640px up the header
  // prints "Offline · scores saved on this device"; on a phone that sentence is behind a tap
  // on the icon, in a popover that runs off the right edge of a 390px screen.)
  await card.getByRole('button').first().click();
  await expect(page.getByTestId('dog-card').filter({ hasText: DOG }).first()).toBeVisible();
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(2500);
  await setSignal(false);
  await expect(button('Offline').first()).toBeVisible();
  const offlineMessage = page.getByText("You're offline. Changes are saved on this device");
  await expect(offlineMessage.first()).toBeVisible();
  await page.waitForTimeout(800);
  await shoot('offline', { status: [offlineMessage, 300, 60] });
  await button('Close toast')
    .click()
    .catch(() => {});

  // Line 3: Start, Stop, then the result.
  await page.getByTestId('dog-card').filter({ hasText: DOG }).first().click();
  await expect(button('Start')).toBeVisible();
  await page.waitForTimeout(600);
  await shoot('sheet', { start: button('Start') });
  await button('Start').click();
  // The alt text and the evidence doc say 38 seconds, so the walk follows the timer itself,
  // not a fixed wait: the running shot is taken from 0:37.5 on ("about 38 seconds"), and
  // Stop is pressed as soon as the time reads 0:38, with only that click in between.
  const time = page.getByText(/^\d:\d\d\.\d\d$/).first();
  const timeReads = async (seconds: number) => {
    const handle = await time.elementHandle();
    await page.waitForFunction(
      ([el, min]) => Number((el?.textContent ?? '').split(':')[1]) >= min,
      [handle, seconds] as const,
      { timeout: 60_000 }
    );
  };
  await timeReads(37.5);
  await shoot('running', { timer: [button('Stop'), 300, 120], time });
  await timeReads(38);
  await button('Stop').click();
  await expect(page.getByText(/^0:38\.\d\d$/).first()).toBeVisible();
  await button('Qualified').click();
  await page.waitForTimeout(600);
  // `timer` is the stopped time's card, so the frame can hold the time and the result.
  await shoot('result', {
    result: [button('Qualified'), 300, 80],
    timer: [button('Resume'), 300, 120],
  });

  // Line 4: the read-back.
  await button('Save').click();
  const dialog = page.getByRole('dialog').filter({ hasText: 'Score Confirmation' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId('confirmation-armband')).toHaveText('102');
  await page.waitForTimeout(600);
  await shoot('confirm', { dialog });

  // Line 5: saved on the device, then the signal returns and the score sends itself, for
  // real, to the job's own database.
  await button('Confirm & Submit').click();
  const saved = page.getByText('Saved:').first();
  await expect(saved).toBeVisible();
  await expect(page.getByText('on this device, not sent yet')).toBeVisible();
  await page.waitForTimeout(1200);
  await shoot('saved', { text: [saved, 240, 0] });
  await setSignal(true);
  const sent = page.getByText('Scores sent').first();
  await expect(sent).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText('on this device, not sent yet')).toHaveCount(0);
  await page.waitForTimeout(500);
  await shoot('sent', { toast: [sent, 200, 40], text: [saved, 240, 0] });

  writeFileSync(
    REGIONS_FILE,
    `${JSON.stringify({ space: SPACE, scale: SCALE, shots }, null, 2)}\n`
  );
  // The app opened its realtime socket and this context held it: the hold was installed on
  // the capture's own pages, not only proved in the test above.
  expect(heldSockets.length).toBeGreaterThan(0);
  expect(heldSockets.every(url => url.endsWith('/realtime/v1/websocket'))).toBe(true);
  console.log('sockets held in the browser ::', [...new Set(heldSockets)].join(', '));
});
