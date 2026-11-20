import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Locator, type Page } from '@playwright/test';
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
import { signIn } from '../helpers/testUsers';
import { signInAsSecretary } from '../uat/shared/auth';
import { holdWebSockets, proveSocketHold } from './captureKit';

/**
 * Suite category: capture (not a regression test; runs only in the Landing capture workflow).
 *
 * Takes the landing page's four stills from the running app (docs/plan-landing-animated-timeline.md
 * § Phase 2, MYK9-2309): the steps that are not scenes keep one picture each.
 *   - the club's "Set up the show": the Add Show wizard, first step (the secretary's desktop);
 *   - the exhibitor's "Find a show": Find Shows with the entry status (the exhibitor's desktop);
 *   - the exhibitor's "Know where to be": Willow's card on My Entries (a phone);
 *   - the exhibitor's "Every Q on your dog's record": Willow's Past Results (a phone).
 * It is the Results capture's sibling and keeps all of its guarantees:
 *   - the backend is the job's own Supabase stack on this machine, seeded from the repo's demo seed
 *     only and destroyed with the job, so every row is a fixture;
 *   - the job has closed the outbound network for this process, the browser and the preview
 *     server, and the spec proves it before it signs in.
 * It writes the four images (public/landing/stills/) under CAPTURE_OUT_DIR, laid out as they sit in
 * the repository; the workflow checks all of them are there and uploads them. It runs last (the
 * files sort so): its own setup SQL starts the demo show over, whatever the three before it left.
 * It takes no walk of its own: nothing is written, nothing is released, nothing is paid.
 */

const WILLOW_ID = 'dededede-0000-0000-0000-000000000041';
/** A phone: the page draws these about 220px wide, and 390 reads at that size. */
const PHONE = { width: 390, height: 844 };
const DESK = { width: 1440, height: 900 };
const SCALE = 2;
/**
 * The page draws a desktop still about 440px wide (about 330 on a phone), so a whole 1440px screen
 * would print at a quarter size. Each desktop still is a window of this size cut from the screen,
 * the shape the page already draws (8:5), set in CSS pixels (the image is twice that).
 */
type Clip = { x: number; y: number; width: number; height: number };
const SETUP_SQL = join(dirname(fileURLToPath(import.meta.url)), 'landingStillsSetup.sql');

const APP_DIR = process.cwd();
// The capture is written under CAPTURE_OUT_DIR, an empty folder the job makes, laid out as
// the files sit in the repository, never over the checked-in copies: what the job uploads
// can then only be what this run took.
const OUT_APP_DIR = join(process.env.CAPTURE_OUT_DIR ?? '', 'apps', 'myk9show');
const IMG_DIR = join(OUT_APP_DIR, 'public', 'landing', 'stills');

test.use({
  viewport: PHONE,
  deviceScaleFactor: SCALE,
  hasTouch: true,
  serviceWorkers: 'block',
  // Words, not pictures: the only images this spec leaves behind are the stills.
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
  await proveSocketHold(browser, baseURL);
});

/** The page's words and address, logged when a step fails, so a failed run can be read. */
async function stage<T>(label: string, page: Page, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    const text = await page
      .locator('body')
      .innerText()
      .catch(() => '');
    console.log(`STAGE FAILED :: ${label} :: ${page.url()}\n${text.slice(0, 3000)}`);
    throw error;
  }
}

/**
 * Data arrives after the page renders, so a state that is not there yet is waited for by
 * reloading, a few times, rather than by a longer wait.
 */
async function reloadUntilVisible(page: Page, target: Locator, tries = 8) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await expect(target).toBeVisible({ timeout: 12_000 });
      return;
    } catch (error) {
      if (attempt >= tries) throw error;
      await page.reload();
    }
  }
}

/** The captures are set in the app's own fonts, served from the job's downloaded copy. */
async function expectAppFont(page: Page) {
  // `document.fonts.check` is true when no face is registered at all, so ask for a face of
  // the app's body font that has really loaded.
  await page.evaluate(() => document.fonts.ready);
  const loadedFaces = await page.evaluate(() =>
    [...document.fonts]
      .filter(face => face.status === 'loaded')
      .map(face => face.family.replaceAll('"', ''))
  );
  expect(loadedFaces).toContain('Montserrat');
}

/** Nothing on a still's screen may read as a fixture, a test account or a walk. */
async function expectNothingMisleading(page: Page, scope?: Locator) {
  const text = await (scope ?? page.locator('body')).innerText();
  expect(text).not.toMatch(/fixture|\bZZ|E2E|\bwalk\b|myk9t|\.example/i);
  expect(text).not.toContain('Show your results publicly?');
}

/** Scrolls the element to just under the sticky header, at once (the app scrolls smoothly). */
const scrollToTop = (target: Locator, offset = 72) =>
  target.first().evaluate((el, margin) => {
    (el as HTMLElement).style.scrollMarginTop = `${margin}px`;
    el.scrollIntoView({ block: 'start', behavior: 'instant' });
  }, offset);

test('captures the four stills from the secretary’s desktop, the exhibitor’s desktop and phone', async ({
  page,
  context,
  browser,
  baseURL,
}) => {
  test.setTimeout(420_000);
  const fontsDir = process.env.CAPTURE_FONTS_DIR;
  if (!fontsDir) throw new Error('CAPTURE_FONTS_DIR is not set');
  if (!process.env.CAPTURE_OUT_DIR) throw new Error('CAPTURE_OUT_DIR is not set');
  if (existsSync(IMG_DIR)) {
    throw new Error(`${IMG_DIR} already exists; the capture writes to an empty folder`);
  }
  mkdirSync(IMG_DIR, { recursive: true });

  // The job's own database, set up for the walk. psql is given the stack's own URL, and only
  // when that is this machine; the start conditions above already refused anything else.
  const dbUrl = process.env.SUPABASE_DB_URL ?? '';
  expect(['127.0.0.1', 'localhost']).toContain(new URL(dbUrl).hostname);
  execFileSync('psql', [dbUrl, '-v', 'ON_ERROR_STOP=1', '-q', '-f', SETUP_SQL], {
    stdio: ['ignore', 'ignore', 'inherit'],
  });

  await serveFontsFrom(context, fontsDir);
  const heldPhoneSockets = await holdWebSockets(context);
  // The secretary's desktop is a second browser context, so everything the first one is
  // given is given to it as well, before it opens a page.
  const deskContext = await browser.newContext({
    ...(baseURL ? { baseURL } : {}),
    viewport: DESK,
    deviceScaleFactor: SCALE,
    serviceWorkers: 'block',
  });
  await serveFontsFrom(deskContext, fontsDir);
  const heldDeskSockets = await holdWebSockets(deskContext);
  const desk = await deskContext.newPage();

  const still = async (target: Page, file: string, clip?: Clip) => {
    await target.screenshot({ path: join(IMG_DIR, file), ...(clip ? { clip } : {}) });
  };
  const logBox = async (label: string, target: Locator) => {
    const found = await target.first().boundingBox();
    console.log(`box :: ${label} ::`, JSON.stringify(found));
  };

  try {
    // The club's "Set up the show": the Add Show wizard on its first step, as a new secretary meets it.
    await signInAsSecretary(desk, '/secretary/create-show/wizard');
    await stage('the Add Show wizard', desk, async () => {
      const first = desk.getByText('Step 1 of 4');
      await reloadUntilVisible(desk, first);
      await expectAppFont(desk);
      await expect(desk.getByRole('heading', { name: 'Basics' })).toBeVisible();
      // A fresh browser holds no draft from any earlier walk.
      await expect(desk.getByText(/draft/i)).toHaveCount(0);
      await expect(desk.getByPlaceholder('Enter show name')).toHaveValue('');
      await expectNothingMisleading(desk);
      await desk.mouse.move(0, 0);
      await desk.waitForTimeout(1200);
      await logBox('step card', desk.getByText('Step 1 of 4'));
      await logBox('clone card', desk.getByText('Clone from a previous show'));
      await logBox('basics', desk.getByRole('heading', { name: 'Basics' }));
      await still(desk, 'club-create-show.png');
    });

    // The exhibitor's phone: My Entries, then Willow's Past Results.
    const exhibitorPassword = process.env.E2E_DEMO_EXHIBITOR_PASSWORD ?? '';
    await signIn(page, 'exhibitor@myk9t.com', exhibitorPassword, '/exhibitor/entries');
    // Willow's card at the demo show (her past show's card is in the same page, further down).
    const dogCard = page
      .locator('.myk9-entries-dog-card')
      .filter({ has: page.locator('.myk9-entries-dog-card-name', { hasText: 'Willow' }) })
      .filter({ hasText: 'Interior Advanced' });
    await stage('My Entries', page, async () => {
      await reloadUntilVisible(page, dogCard.first());
      await expectAppFont(page);
      await expect(dogCard.locator('.myk9-entries-class-row')).toHaveCount(2);
      await expect(dogCard.first()).toContainText('100');
      await expectNothingMisleading(page);
      await expect(page.getByText('Show day is here')).toHaveCount(0);
      await scrollToTop(dogCard);
      await page.mouse.move(0, 0);
      await page.waitForTimeout(1200);
      console.log('Willow card reads ::', (await dogCard.first().innerText()).replace(/\s+/g, ' '));
      await logBox('Willow card', dogCard);
      await still(page, 'exhibitor-my-entries.png');
    });

    await stage('Past Results', page, async () => {
      await page.goto(`/dogs/${WILLOW_ID}?section=career&view=competitions`);
      const tab = page.getByRole('tab', { name: 'Past Results' });
      await expect(tab).toBeVisible({ timeout: 30_000 });
      await tab.click();
      const cards = page.locator('.myk9-record-card');
      await reloadUntilVisibleAfterTab(page, cards);
      await expect(cards).toHaveCount(3);
      await expectAppFont(page);
      // The dog's Overview, above the picture and out of it, names its owner by account address.
      const heading = page.getByRole('heading', { name: 'Competitions' });
      await expectNothingMisleading(
        page,
        page.locator('.myk9-section-card').filter({ has: heading })
      );
      await scrollToTop(heading);
      await page.mouse.move(0, 0);
      await page.waitForTimeout(1200);
      console.log(
        'past results read ::',
        (await cards.allInnerTexts()).join(' | ').replace(/\s+/g, ' ')
      );
      await still(page, 'exhibitor-past-results.png');
    });

    // The exhibitor's desktop: the same page, resized, on Find Shows.
    await stage('Find Shows', page, async () => {
      await page.setViewportSize(DESK);
      await page.goto('/shows');
      const classic = page.getByRole('link', { name: /Heartland Scent Work Classic/ });
      await reloadUntilVisible(page, classic.first());
      await expectAppFont(page);
      await expectNothingMisleading(page);
      await page.mouse.move(0, 0);
      await page.waitForTimeout(1200);
      await logBox('first card', classic);
      console.log(
        'Find Shows reads ::',
        (await page.locator('main').innerText()).replace(/\s+/g, ' ')
      );
      await still(page, 'exhibitor-find-a-show.png');
    });

    // The app opened its realtime socket in these contexts and they held it: the hold was
    // installed on the capture's own pages, not only proved in the test above.
    const held = [...heldPhoneSockets, ...heldDeskSockets];
    expect(held.length).toBeGreaterThan(0);
    expect(held.every(url => url.endsWith('/realtime/v1/websocket'))).toBe(true);
    console.log('sockets held in the browser ::', [...new Set(held)].join(', '));
  } finally {
    await deskContext.close();
  }
});

/** The Past Results tab fills after the dog page loads; reload the page, then the tab, until it does. */
async function reloadUntilVisibleAfterTab(page: Page, target: Locator, tries = 8) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await expect(target.first()).toBeVisible({ timeout: 12_000 });
      return;
    } catch (error) {
      if (attempt >= tries) throw error;
      await page.reload();
      await page.getByRole('tab', { name: 'Past Results' }).click();
    }
  }
}
